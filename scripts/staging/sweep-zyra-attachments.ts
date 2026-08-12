import { parseCliArgs, requiredCliArg, writeArtifact, currentSourceCommit } from "@/lib/staging/migration-ledger";
import { assertStagingEnvironment, parseEnvFile } from "@/lib/staging/staging-guard";
import { sweepExpiredZyraAttachments } from "@/lib/zyra/images";

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");
  const limit = args.limit === undefined ? 100 : Number(args.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("INVALID_SWEEP_LIMIT");
  const guard = assertStagingEnvironment({
    productionEnv: parseEnvFile(`${process.cwd()}/.env.prod`),
    requiredResources: ["database", "r2Bucket"],
  });
  const result = await sweepExpiredZyraAttachments(limit);
  const artifact = {
    status: result.failed === 0 ? "passed" : "partial",
    plan: "010",
    phase: "expired_attachment_sweep",
    runId,
    sourceCommit: currentSourceCommit(),
    stagingResourceFingerprints: guard.resources.map(({ key, hash }) => ({ key, hash })),
    ...result,
    providerCalls: 0,
    learnerSideEffects: 0,
    publicUrlsPrinted: false,
    secretsPrinted: false,
  };
  await writeArtifact(runId, "plan-010-attachment-sweep.json", artifact);
  console.log(JSON.stringify(artifact));
  if (result.failed > 0) process.exitCode = 1;
}

await main();
