import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { quizTemplates, studentQuizAttempts } from "@/db/schema";
import { auth } from "@/lib/auth";
import { resolveCourseAccess } from "@/lib/student/course-access";
import { canAccessStudentQuizTemplate } from "@/lib/quiz/student-access";
import { authorizeAttemptDocument } from "@/lib/materials/interactive-document-authorization";
import { verifyQuestionVisualBinding } from "@/lib/materials/question-visual-binding";
import { readInteractiveDocumentAsset } from "@/lib/materials/interactive-document-assets";
import { interactiveDocumentResponse } from "@/lib/materials/interactive-document-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const id = z.string().min(1).max(200);
const query = z.object({ courseId: id, attemptId: id, questionId: id, field: z.enum(["prompt", "option", "explanation"]), option: z.coerce.number().int().nonnegative().optional(), visualId: id, hash: z.string().regex(/^[a-f0-9]{64}$/), kind: z.enum(["document", "print"]) }).strict();
const unavailable = (status: number) => new Response(null, { status, headers: { "Cache-Control": "private, no-store" } });

async function deliver(request: Request, head: boolean) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return unavailable(401);
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some(key => params.getAll(key).length !== 1)) return unavailable(400);
  const parsed = query.safeParse(Object.fromEntries(params));
  if (!parsed.success || (parsed.data.field === "option") !== (parsed.data.option !== undefined)) return unavailable(400);
  const input = parsed.data;
  try {
    const rows = await db.select({ attempt: studentQuizAttempts, template: quizTemplates }).from(studentQuizAttempts)
      .innerJoin(quizTemplates, eq(studentQuizAttempts.templateId, quizTemplates.id))
      .where(and(eq(studentQuizAttempts.id, input.attemptId), eq(studentQuizAttempts.studentId, session.user.id), eq(quizTemplates.courseId, input.courseId))).limit(1);
    const row = rows[0];
    if (!row) return unavailable(404);
    const access = await resolveCourseAccess({ courseId: row.template.courseId, userId: session.user.id, roleHint: session.user.role });
    if (!canAccessStudentQuizTemplate(access, row.template)) return unavailable(404);
    const spec = authorizeAttemptDocument({ ...input, userId: session.user.id, attempt: row.attempt, template: row.template });
    if (!spec || !Array.isArray(row.attempt.questionsSnapshot)) return unavailable(404);
    const question = row.attempt.questionsSnapshot.find((item: unknown) => !!item && typeof item === "object" && !Array.isArray(item) && (item as Record<string, unknown>).id === input.questionId) as { prompt: unknown; options: unknown; explanation?: unknown } | undefined;
    if (!question || !await verifyQuestionVisualBinding(row.template.courseId, question)) return unavailable(404);
    const response = interactiveDocumentResponse(await readInteractiveDocumentAsset(spec, input.kind), input.kind);
    return head ? new Response(null, { status: response.status, headers: response.headers }) : response;
  } catch {
    return unavailable(503);
  }
}

export function GET(request: Request) { return deliver(request, false); }
export function HEAD(request: Request) { return deliver(request, true); }
