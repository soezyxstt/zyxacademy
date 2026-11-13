import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { exams, questions } from "@/db/schema";
import { auth } from "@/lib/auth";
import { resolveCourseAccess } from "@/lib/student/course-access";
import { publicQuizOptionTexts } from "@/lib/quiz/review-release";
import { interactiveDocumentsInMarkdown } from "@/lib/materials/interactive-document-authorization";
import { parseInteractiveDocumentsInMarkdown } from "@/lib/materials/interactive-document-markdown";
import { verifyQuestionVisualBinding } from "@/lib/materials/question-visual-binding";
import { readInteractiveDocumentAsset } from "@/lib/materials/interactive-document-assets";
import { interactiveDocumentResponse } from "@/lib/materials/interactive-document-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const id = z.string().min(1).max(200);
const query = z.object({ courseId: id, examId: id, questionId: id, field: z.enum(["prompt", "option"]), option: z.coerce.number().int().nonnegative().optional(), visualId: id, hash: z.string().regex(/^[a-f0-9]{64}$/), kind: z.enum(["document", "print"]) }).strict();
const unavailable = (status: number) => new Response(null, { status, headers: { "Cache-Control": "private, no-store" } });
function content(value: unknown): Record<string, unknown> | null {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

async function deliver(request: Request, head: boolean) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return unavailable(401);
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some(key => params.getAll(key).length !== 1)) return unavailable(400);
  const parsed = query.safeParse(Object.fromEntries(params));
  if (!parsed.success || (parsed.data.field === "option") !== (parsed.data.option !== undefined)) return unavailable(400);
  const input = parsed.data;
  try {
    const [exam] = await db.select().from(exams).where(and(eq(exams.id, input.examId), eq(exams.courseId, input.courseId), eq(exams.type, "tryout"))).limit(1);
    const now = Date.now();
    if (!exam || exam.id !== input.examId || exam.courseId !== input.courseId || exam.type !== "tryout" || exam.status !== "published") return unavailable(404);
    const openAt = exam.openAt ? new Date(exam.openAt).getTime() : null;
    const closeAt = exam.closeAt ? new Date(exam.closeAt).getTime() : null;
    if ((openAt !== null && (!Number.isFinite(openAt) || now < openAt)) || (closeAt !== null && (!Number.isFinite(closeAt) || now > closeAt))) return unavailable(404);
    const access = await resolveCourseAccess({ courseId: exam.courseId, userId: session.user.id, roleHint: session.user.role });
    if (!access.hasCourseAccess || !access.hasFullContentAccess) return unavailable(404);
    const rows = await db.select().from(questions).where(eq(questions.examId, exam.id));
    const matches = rows.filter(row => row.id === input.questionId);
    if (matches.length !== 1) return unavailable(404);
    const question = content(matches[0].content);
    if (!question) return unavailable(404);
    const options = publicQuizOptionTexts(question.options);
    const snapshot = { prompt: question.prompt, options, explanation: question.explanation ?? "" };
    const source = input.field === "prompt" ? snapshot.prompt : options[input.option!];
    const specs = interactiveDocumentsInMarkdown(source).filter(spec => spec.id === input.visualId && (input.kind === "document" ? spec.documentSha256 : spec.printSha256) === input.hash);
    if (specs.length !== 1) return unavailable(404);
    const spec = specs[0];
    if (rows.some(row => parseInteractiveDocumentsInMarkdown(content(row.content)?.explanation).some(hidden => hidden.documentSha256 === spec.documentSha256 || hidden.printSha256 === spec.printSha256))) return unavailable(404);
    if (!await verifyQuestionVisualBinding(exam.courseId, snapshot)) return unavailable(404);
    const response = interactiveDocumentResponse(await readInteractiveDocumentAsset(spec, input.kind), input.kind);
    return head ? new Response(null, { status: response.status, headers: response.headers }) : response;
  } catch { return unavailable(503); }
}
export function GET(request: Request) { return deliver(request, false); }
export function HEAD(request: Request) { return deliver(request, true); }
