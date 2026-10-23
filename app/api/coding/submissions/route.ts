import { db } from "@/db";
import { codingSubmitHttpSchema, codingSurfaceSchema, codingSurfaceIdentity } from "@/lib/coding/http-contracts";
import { requireCodingAccess, assertCodingSameOrigin, loadPublishedCodingProblem, codingErrorResponse } from "@/lib/coding/server-access";
import { resolveCodingSurface } from "@/lib/coding/surface-access";
import { createCodingAttemptRepository, loadCodingHistory } from "@/lib/coding/repository";
import { submitCodingAttempt } from "@/lib/coding/submissions";
import { createTrustedPythonRuntime } from "@/lib/coding/server-runtime";
import { evaluateCodingSubmission, publicCodingFeedback } from "@/lib/coding/evaluation";
import { toPublicCodingProblem } from "@/lib/coding/contracts";
import { deliverLiveCodingResult, reserveLiveCodingExecution } from "@/lib/coding/live-server";

export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const actor = await requireCodingAccess(request, url.searchParams.get("courseId") ?? "");
    const problem = await loadPublishedCodingProblem(actor.courseId, url.searchParams.get("problemId") ?? "", Number(url.searchParams.get("version")));
    const rows = await loadCodingHistory(db, actor.userId, problem.problemId, problem.version);
    const surfaceValue = url.searchParams.get("surface");
    const surfaceId = surfaceValue ? codingSurfaceIdentity(codingSurfaceSchema.parse(JSON.parse(surfaceValue))) : null;
    return Response.json({ attempts: rows.filter((row) => !surfaceId || row.surfaceId === surfaceId).map((row) => ({ id: row.id, ordinal: row.ordinal, status: row.status, code: row.request.code, feedback: row.evaluation ? publicCodingFeedback(toPublicCodingProblem(problem), row.evaluation) : null })) });
  } catch (error) { return codingErrorResponse(error); }
}
export async function POST(request: Request) {
  try {
    assertCodingSameOrigin(request);
    const parsed = codingSubmitHttpSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Format percobaan tidak valid." }, { status: 400 });
    const { surface, submission } = parsed.data;
    const actor = await requireCodingAccess(request, parsed.data.courseId);
    const problem = await loadPublishedCodingProblem(actor.courseId, submission.problem.problemId, submission.problem.version);
    const policy = await resolveCodingSurface(surface, problem, actor.userId);
    const attempt = await submitCodingAttempt(createCodingAttemptRepository(db), {
      learnerId: actor.userId, courseId: actor.courseId, surface: surface.kind, surfaceId: policy.surfaceId,
      request: submission, maxAttempts: policy.maxAttempts, deadlineMs: policy.deadlineMs,
    }, async (input) => {
      let runtime: Awaited<ReturnType<typeof createTrustedPythonRuntime>> | undefined;
      try {
        if (surface.kind === "live_quiz") await reserveLiveCodingExecution(surface, actor.userId, input.requestId);
        runtime = await createTrustedPythonRuntime();
        return await evaluateCodingSubmission(problem, input, runtime, AbortSignal.timeout(45_000));
      } catch {
        return { problem: input.problem, authority: "trusted_server", verdict: "ungradable", cases: [] };
      } finally { await runtime?.close().catch(() => {}); }
    });
    if (surface.kind === "live_quiz" && attempt.evaluation) await deliverLiveCodingResult(surface, problem, actor.userId, submission.requestId);
    return Response.json({ attemptId: attempt.id, ordinal: attempt.ordinal, feedback: attempt.evaluation ? publicCodingFeedback(toPublicCodingProblem(problem), attempt.evaluation) : null }, { status: attempt.evaluation ? 200 : 202 });
  } catch (error) { return codingErrorResponse(error); }
}
