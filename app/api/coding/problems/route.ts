import { z } from "zod";
import { db } from "@/db";
import { codingProblems } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { requireCodingAccess, assertCodingSameOrigin, codingErrorResponse } from "@/lib/coding/server-access";
import { codingProblemPrivateSchema, toPublicCodingProblem } from "@/lib/coding/contracts";
import { resolveTutorCourseAccess } from "@/lib/auth/tutor-access";
import { resolveActorRoles, recordTutorMutationAuditSafe } from "@/lib/tutor/assessment-policy";
import { createTrustedPythonRuntime } from "@/lib/coding/server-runtime";
import { evaluateCodingSubmission } from "@/lib/coding/evaluation";

export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const { courseId } = await requireCodingAccess(request, new URL(request.url).searchParams.get("courseId") ?? "");
    const rows = await db.select().from(codingProblems).where(and(eq(codingProblems.courseId, courseId), eq(codingProblems.status, "published"))).orderBy(desc(codingProblems.version)).limit(100);
    return Response.json({ problems: rows.map((row) => toPublicCodingProblem(row.snapshot)) });
  } catch (error) { return codingErrorResponse(error); }
}
const authorRequest = z.object({ problem: codingProblemPrivateSchema, status: z.enum(["draft", "published"]) }).strict();
export async function POST(request: Request) {
  try {
    assertCodingSameOrigin(request);
    const body = authorRequest.safeParse(await request.json().catch(() => null));
    if (!body.success) return Response.json({ error: "Format masalah coding tidak valid." }, { status: 400 });
    const actor = await requireCodingAccess(request, body.data.problem.courseId);
    const { isAdmin, isTutor, roles } = await resolveActorRoles(actor.userId, null);
    if (!isAdmin && !isTutor) throw new Error("CODING_FORBIDDEN");
    const access = await resolveTutorCourseAccess({ penggunaId: actor.userId, courseId: actor.courseId, allowAdmin: isAdmin });
    if (!access.hasAccess || body.data.problem.courseId !== actor.courseId) throw new Error("CODING_FORBIDDEN");
    const problem = body.data.problem;
    if (body.data.status === "published") {
      const runtime = await createTrustedPythonRuntime();
      try {
        const result = await evaluateCodingSubmission(problem, { requestId: "reference-preflight", problem: { problemId: problem.problemId, version: problem.version }, code: problem.referenceSolution, stdin: "" }, runtime, AbortSignal.timeout(45_000));
        if (result.verdict !== "correct") return Response.json({ error: "Solusi acuan belum lolos seluruh kasus uji." }, { status: 422 });
      } finally { await runtime.close().catch(() => {}); }
    }
    // Published snapshots are immutable; revisions require a new version.
    await db.insert(codingProblems).values({ id: problem.problemId, version: problem.version, courseId: actor.courseId, status: body.data.status, snapshot: problem, creatorId: actor.userId });
    await recordTutorMutationAuditSafe({ actorId: actor.userId, actorRoles: roles, courseId: actor.courseId, entityType: "coding_problem", entityId: problem.problemId, entityVersion: problem.version, action: "coding_problem.create", outcome: "success", reason: body.data.status, before: null, after: { status: body.data.status, version: problem.version } });
    return Response.json({ problem: toPublicCodingProblem(problem), status: body.data.status }, { status: 201 });
  } catch (error) { return codingErrorResponse(error); }
}
