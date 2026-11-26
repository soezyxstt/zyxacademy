import { NextRequest } from "next/server";
import { z } from "zod";
import { GET as getAnalytics, POST as regenerateAnalytics } from "@/app/api/quiz/attempts/[id]/analytics/route";
import { POST as submitQuiz } from "@/app/api/quiz/attempts/[id]/route";
import { POST as startQuiz } from "@/app/api/quiz/attempts/route";
import { POST as uploadExamFile } from "@/app/api/exams/attachments/route";
import { POST as uploadQuizFile, DELETE as removeQuizFile } from "@/app/api/quiz/attachments/route";
import { completeGamificationExplanation } from "@/lib/gamification/receipts";
import { quizAnalyticsSchema } from "@/lib/quiz/analytics-client";
import {
  findQuiz, findQuizAttempt, loadAssessmentCourse, readQuizDetail, readQuizList, readResultReview, readResults,
  readSolutionCollection, readSummary, readTryoutDetail, readTryoutList,
} from "@/lib/student/assessment-read";
import { objectRecord, projectQuestion, records, validTryoutAnswer } from "@/lib/student/assessment-projection";
import { canAccessStudentQuizTemplate } from "@/lib/quiz/student-access";
import { submitStudentTryout, TryoutSubmissionError } from "@/lib/student/tryout-submit";
import { signTryoutAttachment, verifyTryoutAttachment } from "@/lib/student/tryout-attachment-receipt";
import { requireNativeStudent } from "@/app/api/native/student/_session";
import type { AssessmentPage } from "@/packages/native-parity/student/assessment/contract";

const headers = { "Cache-Control": "private, no-store" };
const valueId = z.string().min(1).max(240).regex(/^[^/\\\x00-\x1f\x7f]+$/);
const pathSchema = z.object({ courseId: valueId, segments: z.array(valueId).min(1).max(4) });
const requestIdSchema = z.uuid();
const startSchema = z.object({ requestId: requestIdSchema });
const quizAnswerSchema = z.union([
  z.number().int().nonnegative(), z.string().max(20_000),
  z.array(z.number().int().nonnegative()).max(100), z.array(z.string().max(240)).max(100),
  z.object({ text: z.string().max(20_000).default(""), fileName: z.string().max(512).nullable().optional(), fileKey: z.string().max(512).nullable().optional(), fileSize: z.string().max(64).optional() }),
]);
const submitQuizSchema = z.object({ answers: z.record(valueId, quizAnswerSchema), durationSeconds: z.number().int().nonnegative().optional() });
const index = z.number().int().nonnegative();
const fileFields = {
  text: z.string().max(20_000), fileKey: z.string().min(1).max(512).optional(), fileName: z.string().min(1).max(512).optional(),
  fileSize: z.string().max(64).optional(), receipt: z.string().length(64).optional(),
};
const tryoutAnswer = z.discriminatedUnion("type", [
  z.object({ type: z.literal("multiple_choice"), index: index.nullable() }),
  z.object({ type: z.literal("multiple_choices"), indices: z.array(index).max(100) }),
  z.object({ type: z.literal("short_answer"), ...fileFields }),
  z.object({ type: z.literal("essay"), ...fileFields }),
]);
const submitTryoutSchema = z.object({ requestId: requestIdSchema, answers: z.record(valueId, tryoutAnswer) });
const completeSchema = z.object({ version: z.number().int().positive(), itemIds: z.array(valueId).min(1).max(500) });
const attachmentParams = z.object({ questionId: valueId, requestId: requestIdSchema.optional(), attemptId: valueId.optional() });
const uploadResultSchema = z.object({ key: z.string(), fileName: z.string(), fileSize: z.string().optional() });
const removalSchema = z.object({ fileKey: z.string().min(1).max(512) });

type Route = { params: Promise<{ courseId: string; segments: string[] }> };
type Context = NonNullable<Awaited<ReturnType<typeof loadAssessmentCourse>>>;
const json = (data: unknown, status = 200) => Response.json(data, { status, headers });
const invalid = () => json({ error: "Data asesmen tidak valid." }, 400);
const missing = () => json({ error: "Asesmen tidak tersedia." }, 404);
const forbidden = () => json({ error: "Akses asesmen tidak tersedia." }, 403);
const page = (data: AssessmentPage | null) => data ? json(data) : missing();
const legacyParams = (id: string) => ({ params: Promise.resolve({ id }) });

function withoutCache(response: Response) {
  const responseHeaders = new Headers(response.headers);
  responseHeaders.set("Cache-Control", "private, no-store");
  return new Response(response.body, { status: response.status, headers: responseHeaders });
}

function legacyJson(request: Request, body: unknown, method = "POST") {
  return new NextRequest(request.url, { method, body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
}

async function getContext(request: Request, route: Route) {
  const identity = await requireNativeStudent(request);
  if (identity instanceof Response) return identity;
  const parsed = pathSchema.safeParse(await route.params);
  if (!parsed.success) return invalid();
  const context = await loadAssessmentCourse(parsed.data.courseId, identity.userId);
  return context ? { context, segments: parsed.data.segments } : missing();
}

async function read(request: Request, route: Route) {
  const resolved = await getContext(request, route);
  if (resolved instanceof Response) return resolved;
  const { context, segments } = resolved;
  const [section, id, tail, attemptId] = segments;
  const query = new URL(request.url).searchParams;
  if (section === "quiz" && segments.length === 1) return page(await readQuizList(context, query.get("access")));
  if (section === "quiz" && segments.length === 2) {
    const selected = valueId.nullable().safeParse(query.get("attemptId"));
    return selected.success ? page(await readQuizDetail(context, id, selected.data, query.get("viewDiscussion") === "true")) : invalid();
  }
  if (section === "tryout" && segments.length === 1) return page(await readTryoutList(context));
  if (section === "tryout" && segments.length === 2) return page(await readTryoutDetail(context, id));
  if (section === "my-results" && segments.length === 1) return page(await readResults(context));
  if (section === "my-results" && segments.length === 2) return page(await readResultReview(context, id));
  if (section === "solutions" && segments.length === 2) return page(await readSolutionCollection(context, id));
  const quizSummary = section === "quiz" && tail === "summary" && segments.length === 4;
  if (quizSummary || (section === "my-results" && tail === "summary" && segments.length === 3)) {
    const selectedId = quizSummary ? attemptId : id;
    const summary = await readSummary(context, selectedId, quizSummary ? id : undefined);
    if (!summary) return missing();
    if (!summary.discussionAvailable || summary.result.status === "pending_review") return page({ kind: "summary", courseTitle: context.courseTitle, ...summary, analytics: { status: "not_available", aiDiagnosis: null, computedMetrics: null } });
    const response = await getAnalytics(new NextRequest(request), legacyParams(selectedId));
    if (!response.ok) return withoutCache(response);
    const analytics = quizAnalyticsSchema.safeParse(await response.json());
    if (!analytics.success || (analytics.data.attemptId && analytics.data.attemptId !== selectedId) ||
      (analytics.data.computedMetrics && analytics.data.computedMetrics.attemptId !== selectedId)) throw new Error("Unexpected quiz analytics identity");
    return page({ kind: "summary", courseTitle: context.courseTitle, ...summary,
      analytics: { ...analytics.data, aiDiagnosis: analytics.data.aiDiagnosis ?? null, computedMetrics: analytics.data.computedMetrics ?? null } });
  }
  return missing();
}

class PayloadLimitError extends Error {}

async function boundedBody(request: Request, limit: number) {
  if (Number(request.headers.get("Content-Length") ?? 0) > limit) throw new PayloadLimitError();
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) {
        await reader.cancel().catch(() => {});
        throw new PayloadLimitError();
      }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

async function boundedJson(request: Request): Promise<unknown> {
  const raw = await boundedBody(request, 512 * 1024);
  if (!raw) return null;
  try { return JSON.parse(new TextDecoder().decode(raw)); } catch { return null; }
}

async function upload(request: Request, ctx: Context, section: "quiz" | "tryout", id: string) {
  const query = Object.fromEntries(new URL(request.url).searchParams);
  const params = attachmentParams.safeParse(query);
  if (!params.success) return invalid();
  const { questionId, attemptId, requestId } = params.data;
  let imageOnly = false;
  if (section === "quiz") {
    if (!attemptId) return invalid();
    const entry = await findQuizAttempt(ctx, attemptId, id);
    if (!entry || entry.attempt.status !== "in_progress") return forbidden();
    if (!records(entry.attempt.questionsSnapshot).some((raw) => raw.id === questionId && projectQuestion(raw).type === "essay")) return invalid();
  } else {
    if (!requestId) return invalid();
    const detail = await readTryoutDetail(ctx, id);
    const question = detail?.kind === "tryout-detail" ? detail.player?.questions.find((item) => item.id === questionId) : undefined;
    if (!question || (question.type !== "essay" && question.type !== "short_answer") || (!question.acceptsFile && !question.acceptsImage)) return forbidden();
    imageOnly = !question.acceptsFile;
  }
  const limit = (section === "quiz" ? 4 : 10) * 1024 * 1024;
  const bytes = await boundedBody(request, limit + 64 * 1024);
  const contentType = request.headers.get("Content-Type");
  if (!bytes || !contentType?.startsWith("multipart/form-data;")) return invalid();
  const data = await new Response(bytes, { headers: { "Content-Type": contentType } }).formData().catch(() => null);
  const file = data?.get("file");
  if (!(file instanceof File)) return invalid();
  if (file.size > limit) throw new PayloadLimitError();
  if (imageOnly && !file.type.startsWith("image/")) return json({ error: "Gunakan berkas gambar." }, 415);
  const form = new FormData();
  form.set("file", file);
  if (section === "quiz" && attemptId) {
    form.set("attemptId", attemptId);
    return withoutCache(await uploadQuizFile(new Request(request.url, { method: "POST", body: form })));
  }
  if (!requestId) return invalid();
  form.set("examId", id);
  const response = await uploadExamFile(new Request(request.url, { method: "POST", body: form }));
  if (!response.ok) return withoutCache(response);
  const result = uploadResultSchema.parse(await response.json());
  return json({ ...result, receipt: signTryoutAttachment({ ...result, fileKey: result.key, userId: ctx.userId, examId: id, questionId, requestId }) });
}

async function write(request: Request, route: Route) {
  const resolved = await getContext(request, route);
  if (resolved instanceof Response) return resolved;
  const { context, segments } = resolved;
  const [section, id, operation, attemptId] = segments;
  if (segments.length === 3 && operation === "attachment" && (section === "quiz" || section === "tryout")) return upload(request, context, section, id);
  const quizSummary = section === "quiz" && operation === "summary" && segments.length === 4;
  if (quizSummary || (section === "my-results" && operation === "summary" && segments.length === 3)) {
    const selectedId = quizSummary ? attemptId : id;
    const summary = await readSummary(context, selectedId, quizSummary ? id : undefined);
    if (!summary) return missing();
    if (!summary.discussionAvailable) return forbidden();
    if (summary.result.status === "pending_review") return json({ error: "Jawaban esai belum dinilai." }, 409);
    return withoutCache(await regenerateAnalytics(new NextRequest(request), legacyParams(selectedId)));
  }
  const body = await boundedJson(request);
  if (section === "quiz" && segments.length === 2) {
    const value = startSchema.safeParse(body);
    if (!value.success) return invalid();
    const quiz = await findQuiz(context, id);
    if (!quiz) return missing();
    if (!canAccessStudentQuizTemplate(context.access, quiz)) return forbidden();
    return withoutCache(await startQuiz(legacyJson(request, { courseId: context.courseId, templateId: id, requestId: value.data.requestId })));
  }
  if (section === "quiz" && operation === "attempt" && segments.length === 4) {
    const value = submitQuizSchema.safeParse(body);
    if (!value.success) return invalid();
    const entry = await findQuizAttempt(context, attemptId, id);
    if (!entry || entry.attempt.status === "abandoned") return missing();
    const completed = () => json({ attemptId, status: "completed" });
    if (entry.attempt.status === "completed") return completed();
    const known = new Set(records(entry.attempt.questionsSnapshot).map((item) => item.id));
    if (Object.keys(value.data.answers).some((key) => !known.has(key))) return invalid();
    const response = await submitQuiz(legacyJson(request, value.data), legacyParams(attemptId));
    if (response.ok) return completed();
    if (response.status === 404) {
      const current = await findQuizAttempt(context, attemptId, id);
      if (current?.attempt.status === "completed") return completed();
      if (current?.attempt.status === "in_progress") return json({ error: "Sesi kuis berubah. Coba kirim lagi." }, 409);
    }
    return withoutCache(response);
  }
  if (section === "tryout" && segments.length === 2) {
    const value = submitTryoutSchema.safeParse(body);
    if (!value.success) return invalid();
    const { answers, requestId } = value.data;
    try {
      return json(await submitStudentTryout({ courseId: context.courseId, examId: id, userId: context.userId, answers, requestId,
        validateAnswers: (rows) => {
          const available = new Map(rows.map((row) => [row.id, projectQuestion({ ...objectRecord(row.content), id: row.id, type: row.type })]));
          if (!available.size) throw new TryoutSubmissionError("Soal tryout tidak tersedia.", 409);
          return Object.fromEntries(Object.entries(answers).map(([questionId, answer]) => {
            const question = available.get(questionId);
            if (!question || !validTryoutAnswer(answer, question)) throw new TryoutSubmissionError("Jawaban tryout tidak valid.", 422);
            if ("fileKey" in answer && answer.fileKey) {
              const { receipt, fileKey, fileName, fileSize, ...rest } = answer;
              if (!fileName || !receipt || !verifyTryoutAttachment({ userId: context.userId, examId: id, questionId, requestId, fileKey, fileName, fileSize }, receipt)) {
                throw new TryoutSubmissionError("Lampiran tryout tidak valid.", 422);
              }
              return [questionId, { ...rest, fileKey, fileName, fileSize }];
            }
            if ("text" in answer) return [questionId, { type: answer.type, text: answer.text }];
            return [questionId, answer];
          }));
        },
      }), 201);
    } catch (error) {
      if (error instanceof TryoutSubmissionError) return json({ error: error.message }, error.status);
      throw error;
    }
  }
  if (section === "solutions" && segments.length === 2) {
    const value = completeSchema.safeParse(body);
    if (!value.success) return invalid();
    const solution = await readSolutionCollection(context, id);
    if (!solution || solution.kind !== "solutions") return missing();
    if (!solution.canComplete) return forbidden();
    if (solution.version !== value.data.version) return json({ error: "Pembahasan sudah diperbarui. Muat ulang untuk melanjutkan." }, 409);
    try {
      await completeGamificationExplanation(context.userId, id, value.data.itemIds, value.data.version);
      return json({ success: true });
    } catch (error) {
      if (error instanceof Error && error.message === "EXPLANATION_INCOMPLETE") return invalid();
      if (error instanceof Error && error.message === "EXPLANATION_UNAVAILABLE") return missing();
      throw error;
    }
  }
  return missing();
}

async function remove(request: Request, route: Route) {
  const resolved = await getContext(request, route);
  if (resolved instanceof Response) return resolved;
  const { context, segments } = resolved;
  const [section, id, operation] = segments;
  if (section !== "quiz" || operation !== "attachment" || segments.length !== 3) return missing();
  const body = removalSchema.safeParse(await boundedJson(request));
  const attemptId = valueId.safeParse(new URL(request.url).searchParams.get("attemptId"));
  if (!body.success || !attemptId.success) return invalid();
  const entry = await findQuizAttempt(context, attemptId.data, id);
  if (!entry || entry.attempt.status !== "in_progress") return forbidden();
  return withoutCache(await removeQuizFile(legacyJson(request, { ...body.data, attemptId: attemptId.data }, "DELETE")));
}

async function respond(action: () => Promise<Response>) {
  try { return await action(); }
  catch (error) {
    if (error instanceof PayloadLimitError) return json({ error: "Ukuran data melebihi batas." }, 413);
    console.error("Native student assessment request failed", error instanceof Error ? error.name : "Unknown error");
    return json({ error: "Asesmen belum tersedia. Coba lagi." }, 503);
  }
}

export function GET(request: Request, route: Route) { return respond(() => read(request, route)); }
export function POST(request: Request, route: Route) { return respond(() => write(request, route)); }
export function DELETE(request: Request, route: Route) { return respond(() => remove(request, route)); }
