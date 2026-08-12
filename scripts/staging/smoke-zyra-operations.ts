import { assertStagingEnvironment, parseEnvFile } from "@/lib/staging/staging-guard";
import { currentSourceCommit, parseCliArgs, requiredCliArg, writeArtifact } from "@/lib/staging/migration-ledger";
import { ZyraOpsMetricsSchema } from "@/lib/zyra/ops";

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");
  const guard = assertStagingEnvironment({ productionEnv: parseEnvFile(`${process.cwd()}/.env.prod`), requiredResources: ["database", "authUrl", "vectorizeWorker"] });
  const valid = ZyraOpsMetricsSchema.safeParse({ checkedAt: new Date().toISOString(), externalUsageUnknown: true, projectSlotCount: 4, projectSlots: [1, 2, 3, 4].map((slot) => ({ slot, alias: "masked", health: "unknown" })), ledger: { committedProviderTurns: 0, activeReservations: 0, refundedReservations: 0, cacheSavedTurns: 0 }, image: { uploaded: 0, dispatched: 0, expired: 0, failed: 0 }, traces: { success: 0, failure: 0, validationViolations: 0 }, events: [], configuredModels: [] }).success;
  const artifact = { status: valid ? "passed" : "failed", plan: "013", phase: "ops_synthetic_only", runId, sourceCommit: currentSourceCommit(), stagingResourceFingerprints: guard.resources.map(({ key, hash }) => ({ key, hash })), providerCalls: 0, databaseWrites: 0, telemetryWrites: 0, rawPromptFields: 0, rawIdentityFields: 0, externalUsageUnknown: true };
  await writeArtifact(runId, "plan-013-operations.json", artifact);
  console.log(JSON.stringify(artifact));
  if (artifact.status !== "passed") process.exitCode = 1;
}

await main();
