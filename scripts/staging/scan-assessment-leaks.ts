import { join } from "node:path";
import { findAssessmentLeakKeys } from "@/lib/assessment-serialization";
import { scanForHoldoutLeaks } from "@/lib/asesmen/benchmark-policy";
import { currentSourceCommit, parseCliArgs, readArtifact, requiredCliArg, writeArtifact } from "@/lib/staging/migration-ledger";
import { assertStagingEnvironment, parseEnvFile } from "@/lib/staging/staging-guard";

type Plan010Result = {
  planNumber?: string;
  runId?: string;
  status?: string;
  holdout?: { leakFindings?: unknown[]; leakedCount?: number };
  redaction?: { leakFindings?: unknown[]; leakedCount?: number };
};

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");
  try {
    assertStagingEnvironment({ productionEnv: parseEnvFile(join(process.cwd(), ".env.prod")), requiredResources: ["database", "authUrl"] });
    const result = await readArtifact<Plan010Result>(runId, "plan-010-result.json");
    if (result.planNumber !== "010" || result.runId !== runId) throw new Error("PLAN_010_RESULT_IDENTITY_FAILED");
    if (result.status !== "passed") throw new Error("PLAN_010_SMOKE_RESULT_NOT_PASSED");

    const protectedKeyFindings = findAssessmentLeakKeys(result);
    const holdoutFindings = scanForHoldoutLeaks(result, ["HOLDOUT_CANARY"]);
    const recordedHoldoutFindings = Array.isArray(result.holdout?.leakFindings) ? result.holdout.leakFindings : [];
    const recordedRedactionFindings = Array.isArray(result.redaction?.leakFindings) ? result.redaction.leakFindings : [];
    const leaks = [...protectedKeyFindings, ...holdoutFindings, ...recordedHoldoutFindings, ...recordedRedactionFindings];
    const report = {
      planNumber: "010",
      runId,
      status: leaks.length === 0 ? "passed" : "blocked",
      sourceCommit: currentSourceCommit(),
      consumedArtifact: "plan-010-result.json",
      holdoutLeakFindings: [...holdoutFindings, ...recordedHoldoutFindings],
      protectedKeyFindings,
      redactionLeakFindings: recordedRedactionFindings,
      totalLeakFindings: leaks.length,
      operatorTimestamp: new Date().toISOString(),
    };
    await writeArtifact(runId, "plan-010-leak-scan.json", report);
    console.log(JSON.stringify({ status: report.status, runId, totalLeakFindings: report.totalLeakFindings }));
    if (report.status !== "passed") process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ status: "blocked", runId, error: error instanceof Error ? error.message : String(error) }));
    process.exitCode = 1;
  }
}

void main();
