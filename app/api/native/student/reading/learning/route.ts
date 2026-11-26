import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";
import { updateMaterialProgress } from "@/app/(student)/dashboard/actions";
import { POST as evaluateCheck } from "@/app/api/materials/formative-check/evaluate/route";
import { POST as revealCheck } from "@/app/api/materials/formative-check/reveal/route";
import { GET as readArticleProgress, PUT as writeArticleProgress } from "@/app/api/student/articles/[articleId]/progress/route";
import { db } from "@/db";
import { progress } from "@/db/schema";
import { articleProgressUpdateSchema } from "@/lib/articles/progress-contract";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { formativeCodingAccessForReveal } from "@/lib/coding/native-formative-coding-grant";
import { formativeLearnerResponseSchema } from "@/lib/materials/formative-evaluation";
import { OfflineHttpError } from "@/lib/offline/server-auth";
import { loadNativePublishedReading } from "@/lib/student/native-published-reading";
import { requireNativeStudent } from "../../_session";

const id = z.string().min(1).max(160).regex(/^[^/?#\\\s\u0000-\u001f\u007f]+$/u);
const identity = z.object({ courseId: id, materialId: id, revision: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const locator = { sectionId: id, blockId: id };
const command = z.discriminatedUnion("action", [
  identity.extend({ action: z.literal("article-progress"), progress: articleProgressUpdateSchema }),
  identity.extend({ action: z.literal("status"), status: z.enum(["in_progress", "completed"]) }),
  identity.extend({ action: z.literal("evaluate"), ...locator, response: formativeLearnerResponseSchema }),
  identity.extend({ action: z.literal("reveal"), ...locator }),
]);

const privateHeaders = { "Cache-Control": "private, no-store" };
function result(value: unknown, status = 200) { return Response.json(value, { status, headers: privateHeaders }); }
function failure(status: number) { return result({ error: "LEARNING_UNAVAILABLE" }, status); }
function privateResponse(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", privateHeaders["Cache-Control"]);
  return new Response(response.body, { status: response.status, headers });
}

function upstream(request: Request, path: string, body?: object, method = "POST") {
  const headers = new Headers(request.headers);
  headers.delete("Content-Length");
  return new NextRequest(new URL(path, request.url), body ? { method, headers, body: JSON.stringify(body), signal: request.signal }
    : { headers, signal: request.signal });
}

async function readTarget(userId: string, target: z.infer<typeof identity>) {
  const reading = await loadNativePublishedReading(userId, target, new URL(resolveAuthBaseUrl()).origin);
  if (reading.revision !== target.revision) throw new OfflineHttpError(409, "READING_CHANGED");
  return reading;
}

export async function GET(request: Request) {
  const actor = await requireNativeStudent(request);
  if (actor instanceof Response) return actor;
  const params = new URL(request.url).searchParams;
  const parsed = identity.safeParse(Object.fromEntries(params));
  if (!parsed.success || params.size !== 3) return failure(400);
  try {
    const reading = await readTarget(actor.userId, parsed.data);
    if (reading.structured && "sections" in reading.data) {
      const articleId = reading.id;
      const path = `/api/student/articles/${encodeURIComponent(articleId)}/progress?version=${reading.data.version}`;
      return privateResponse(await readArticleProgress(upstream(request, path), { params: Promise.resolve({ articleId }) }));
    }
    const rows = await db.select({ status: progress.status }).from(progress).where(and(eq(progress.userId, actor.userId), eq(progress.materialId, reading.id)));
    return result({ materialId: reading.id, status: rows.some(row => row.status === "completed") ? "completed" : rows.length ? "in_progress" : "unopened" });
  } catch (error) {
    return failure(error instanceof OfflineHttpError ? error.status : 503);
  }
}

async function readCommand(request: Request) {
  if (!request.body || Number(request.headers.get("Content-Length")) > 32_768) return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) return JSON.parse(body + decoder.decode()) as unknown;
      bytes += next.value.byteLength;
      if (bytes > 32_768) { await reader.cancel(); return null; }
      body += decoder.decode(next.value, { stream: true });
    }
  } catch { return null; }
  finally { reader.releaseLock(); }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(resolveAuthBaseUrl()).origin) return failure(403);
  if (request.headers.get("Content-Type")?.split(";", 1)[0].toLowerCase() !== "application/json") return failure(415);
  const actor = await requireNativeStudent(request);
  if (actor instanceof Response) return actor;
  const parsed = command.safeParse(await readCommand(request));
  if (!parsed.success) return failure(400);
  const input = parsed.data;
  try {
    const reading = await readTarget(actor.userId, input);
    const structured = reading.structured && "sections" in reading.data ? reading.data : null;
    if (input.action === "status") {
      if (structured) return failure(422);
      return result(await updateMaterialProgress(reading.id, input.status, actor.userId));
    }
    if (!structured) return failure(404);
    const articleId = reading.id;
    if (input.action === "article-progress") {
      if (!structured.sections.some(section => section.id === input.progress.sectionId)) return failure(404);
      if (input.progress.articleVersion !== undefined && input.progress.articleVersion !== structured.version) return failure(409);
      return privateResponse(await writeArticleProgress(upstream(request, `/api/student/articles/${encodeURIComponent(articleId)}/progress`,
        { ...input.progress, articleVersion: structured.version }, "PUT"), { params: Promise.resolve({ articleId }) }));
    }
    const section = structured.sections.find(value => value.id === input.sectionId);
    if (!section?.blocks.some(block => block.id === input.blockId)) return failure(404);
    const fields = { articleId, articleVersion: structured.version, sectionId: section.id, blockId: input.blockId };
    if (input.action === "evaluate") {
      return privateResponse(await evaluateCheck(upstream(request, "/api/materials/formative-check/evaluate", { ...fields, response: input.response })));
    }
    const revealed = await revealCheck(upstream(request, "/api/materials/formative-check/reveal", fields));
    if (!revealed.ok || reading.codingMode !== "native") return privateResponse(revealed);
    const contents = await revealed.json();
    const { answer, explanation } = z.object({ answer: z.string(), explanation: z.string() }).parse(contents);
    const current = await requireNativeStudent(request);
    if (current instanceof Response) return current;
    if (current.userId !== actor.userId) return failure(409);
    const codingAccess = formativeCodingAccessForReveal({
      userId: actor.userId, courseId: input.courseId, revision: reading.revision, ...fields,
    }, { answer, explanation }, process.env.BETTER_AUTH_SECRET ?? "");
    return result({ ...contents, codingAccess });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    return failure(error instanceof OfflineHttpError ? error.status : code.startsWith("MATERIAL_") ? 403 : 503);
  }
}
