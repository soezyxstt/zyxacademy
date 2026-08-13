import { join } from "node:path";
import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import { mataKuliah, user } from "@/db/schema";
import { getPeranCodes } from "@/lib/auth/authorization";
import { currentSourceCommit, parseCliArgs, requiredCliArg, sha256Text, writeArtifact } from "@/lib/staging/migration-ledger";
import { assertStagingEnvironment, parseEnvFile, safeGuardError } from "@/lib/staging/staging-guard";
import { transitionContentWorkflow, type ContentWorkflowState } from "@/lib/workflow/content-workflow";

function safeSegment(value: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(value)) throw new Error("INVALID_RUN_ID");
  return value.slice(0, 48);
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");
  const requestedCourseId = requiredCliArg(args, "course");
  try {
    const guard = assertStagingEnvironment({
      productionEnv: parseEnvFile(join(process.cwd(), ".env.prod")),
      requireMutation: true,
      requiredResources: ["database", "authUrl"],
    });
    const [actor] = await db.select({ id: user.id }).from(user).where(eq(user.role, "admin")).limit(1);
    if (!actor) throw new Error("STAGING_WORKFLOW_ADMIN_PREREQUISITE_MISSING");
    const roles = await getPeranCodes(actor.id);
    if (!roles.includes("admin")) throw new Error("STAGING_WORKFLOW_CANONICAL_ADMIN_ROLE_MISSING");
    const [course] = await db.select({ id: mataKuliah.id }).from(mataKuliah).where(or(
      eq(mataKuliah.id, requestedCourseId),
      eq(mataKuliah.legacyCourseId, requestedCourseId),
      eq(mataKuliah.code, requestedCourseId),
    )).limit(1);
    if (!course) throw new Error("STAGING_WORKFLOW_COURSE_PREREQUISITE_MISSING");

    const entityId = `p014-${safeSegment(runId)}-article`;
    const contentHash = sha256Text(`${runId}:${course.id}:canonical-workflow-fixture`);
    const transitions: Array<[ContentWorkflowState, ContentWorkflowState]> = [
      ["uploaded", "validated"],
      ["validated", "staged"],
      ["staged", "tutor_review"],
      ["tutor_review", "admin_review"],
      ["admin_review", "approved"],
      ["approved", "published"],
    ];
    const results = [];
    for (const [from, to] of transitions) {
      results.push(await transitionContentWorkflow({
        actor: { id: actor.id, roles, courseIds: [course.id] },
        courseId: course.id,
        entityType: "artikel",
        entityId,
        version: 1,
        contentHash,
        from,
        to,
        reason: `Plan 014 dedicated staging transition ${from} to ${to}`,
        requestId: `${runId}:${from}:${to}`,
      }));
    }

    const artifact = {
      planNumber: "014",
      runId,
      status: results.at(-1)?.state === "published" ? "passed" : "blocked",
      sourceCommit: currentSourceCommit(),
      stagingResourceFingerprints: guard.resources,
      actorRoleCodes: roles,
      courseId: course.id,
      fixture: { entityType: "artikel", entityId, version: 1, contentHash },
      transitions: results.map((result) => ({ state: result.state, requestId: result.requestId })),
      legacyWrites: 0,
      operatorTimestamp: new Date().toISOString(),
    };
    await writeArtifact(runId, "plan-014-e2e.json", artifact);
    console.log(JSON.stringify({ status: artifact.status, runId, transitionCount: results.length, legacyWrites: 0 }));
    if (artifact.status !== "passed") process.exitCode = 1;
  } catch (error) {
    const safe = safeGuardError(error);
    console.error(JSON.stringify({ status: "blocked", runId, ...safe }));
    process.exitCode = 1;
  }
}

void main();
