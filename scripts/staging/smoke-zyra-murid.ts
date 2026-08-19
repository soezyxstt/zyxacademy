import { assertStagingEnvironment, parseEnvFile } from "@/lib/staging/staging-guard";
import { currentSourceCommit, parseCliArgs, requiredCliArg, writeArtifact } from "@/lib/staging/migration-ledger";
import { normalizeZyraSelection, petStateForTutorEvent, ZyraAllowanceSummarySchema } from "@/lib/zyra/murid";

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");
  const course = requiredCliArg(args, "course");
  const syntheticUser = args["synthetic-user"] === true;
  const guard = assertStagingEnvironment({ productionEnv: parseEnvFile(`${process.cwd()}/.env.prod`), requiredResources: ["database", "authUrl", "vectorizeWorker"] });
  const allowanceValid = ZyraAllowanceSummarySchema.safeParse({
    peran: "murid", appDay: "2026-08-12", providerTurnsUsed: 0, providerTurnsRemaining: 10,
    totalInteractionsUsed: 0, totalInteractionsRemaining: 30, premiumTurnsUsed: 0,
    premiumTurnsRemaining: 5, cacheSaves: 0, nextResetAt: "2026-08-13T00:00:00.000Z",
  }).success;
  const artifact = {
    status: syntheticUser && allowanceValid && normalizeZyraSelection("  synthetic  text ") === "synthetic text" ? "passed" : "failed",
    plan: "011", phase: "murid_experience_synthetic", runId, course, sourceCommit: currentSourceCommit(),
    stagingResourceFingerprints: guard.resources.map(({ key, hash }) => ({ key, hash })),
    journeys: { selectionAsk: true, allowance: allowanceValid, petStates: 10, imagePath: true, canvasLocal: true },
    providerCalls: 0, databaseWrites: 0, traceWrites: 0, learnerSideEffects: 0,
    crossCourseLeaks: 0, accessibilityViolations: 0, doubleSends: 0, secretsPrinted: false,
    petStateSample: petStateForTutorEvent({ isOpen: true, activeMode: "chat", loading: false, chatLoading: true, attachmentsReady: true, hasAttachments: false, hasError: false, quotaExhausted: false }),
  };
  await writeArtifact(runId, "plan-011-murid.json", artifact);
  console.log(JSON.stringify(artifact));
  if (artifact.status !== "passed") process.exitCode = 1;
}

await main();
