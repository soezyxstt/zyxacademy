import { join } from "node:path";
import { currentSourceCommit, parseCliArgs, requiredCliArg, readArtifact, writeArtifact } from "@/lib/staging/migration-ledger";
import { assertStagingEnvironment, parseEnvFile, safeGuardError } from "@/lib/staging/staging-guard";

type SmokeArtifact = {
  planNumber?: string;
  runId?: string;
  status?: string;
  result?: { answerLeakFindings?: unknown[] };
};

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");
  try {
    const guard = assertStagingEnvironment({
      productionEnv: parseEnvFile(join(process.cwd(), ".env.prod")),
      requiredResources: ["database", "authUrl", "vectorizeWorker"],
    });
    const artifacts = await Promise.all([
      readArtifact<SmokeArtifact>(runId, "plan-013-smoke-canonical.json"),
      readArtifact<SmokeArtifact>(runId, "plan-013-smoke-active-attempt.json"),
    ]);
    const failures = artifacts.flatMap((artifact) => [
      ...(artifact.planNumber !== "013" ? [{ code: "PLAN_IDENTITY" }] : []),
      ...(artifact.runId !== runId ? [{ code: "RUN_IDENTITY" }] : []),
      ...(artifact.status !== "passed" ? [{ code: "SMOKE_NOT_PASSED" }] : []),
      ...(artifact.result?.answerLeakFindings ?? []).map(() => ({ code: "ANSWER_LEAK" })),
    ]);
    const report = {
      planNumber: "013",
      runId,
      status: failures.length === 0 ? "passed" : "blocked",
      sourceCommit: currentSourceCommit(),
      stagingResourceFingerprints: guard.resources,
      consumedArtifacts: ["plan-013-smoke-canonical.json", "plan-013-smoke-active-attempt.json"],
      failures,
      privacyRules: {
        sharedCache: "student-free",
        activeAttempt: "no answer-bearing content",
        sourceAttribution: "hydrated canonical ID and version only",
      },
      operatorTimestamp: new Date().toISOString(),
    };
    await writeArtifact(runId, "plan-013-privacy.json", report);
    await writeArtifact(runId, "plan-013-result.json", report);
    console.log(JSON.stringify({ status: report.status, runId, failureCount: failures.length }));
    if (report.status !== "passed") process.exitCode = 1;
  } catch (error) {
    const safe = safeGuardError(error);
    console.error(JSON.stringify({ status: "blocked", runId, ...safe }));
    process.exitCode = 1;
  }
}

void main();
