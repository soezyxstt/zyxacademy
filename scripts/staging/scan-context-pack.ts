import { join } from "node:path";
import { buildAuthoringContextPack, scanAuthoringContextPack } from "@/lib/authoring/context-pack";
import { loadAuthoringContextInput } from "@/lib/authoring/snapshot";
import { currentSourceCommit, parseCliArgs, readArtifact, requiredCliArg, writeArtifact } from "@/lib/staging/migration-ledger";
import { assertStagingEnvironment, parseEnvFile } from "@/lib/staging/staging-guard";

type PlanResult = { courseId?: string; snapshot?: { snapshotId?: string; createdAt?: string; retentionUntil?: string } };

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");
  try {
    assertStagingEnvironment({ productionEnv: parseEnvFile(join(process.cwd(), ".env.prod")), requiredResources: ["database", "authUrl"] });
    process.env.FEATURE_AUTHORING_CONTEXT_V1 = "1";
    const result = await readArtifact<PlanResult>(runId, "plan-007-result.json");
    const courseId = result.courseId ?? "tutorial-pka";
    const snapshot = result.snapshot;
    if (!snapshot?.snapshotId || !snapshot.createdAt || !snapshot.retentionUntil) throw new Error("AUTHORING_CONTEXT_SNAPSHOT_METADATA_MISSING");
    const input = await loadAuthoringContextInput({ courseId, snapshotId: snapshot.snapshotId, createdAt: snapshot.createdAt, retentionUntil: snapshot.retentionUntil });
    const pack = buildAuthoringContextPack(input);
    const findings = scanAuthoringContextPack(pack);
    const forbiddenOutput = findings.length;
    const holdoutInputCount = (input.benchmarks ?? []).filter((benchmark) => benchmark.authoringVisibility === "holdout").length;
    const report = {
      planNumber: "007",
      runId,
      status: forbiddenOutput === 0 && pack.holdoutExcludedCount === holdoutInputCount ? "passed" : "blocked",
      sourceCommit: currentSourceCommit(),
      courseId,
      snapshotId: snapshot.snapshotId,
      findings,
      forbiddenOutput,
      holdoutInputCount,
      holdoutExcludedCount: pack.holdoutExcludedCount,
      operatorTimestamp: new Date().toISOString(),
    };
    await writeArtifact(runId, "plan-007-scan.json", report);
    console.log(JSON.stringify({ status: report.status, runId, forbiddenOutput, holdoutInputCount, holdoutExcludedCount: pack.holdoutExcludedCount }));
    if (report.status !== "passed") process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ status: "blocked", runId, error: error instanceof Error ? error.message : String(error) }));
    process.exitCode = 1;
  }
}

void main();
