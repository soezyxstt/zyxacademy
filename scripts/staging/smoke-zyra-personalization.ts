import { assertStagingEnvironment, parseEnvFile } from "@/lib/staging/staging-guard";
import {
  currentSourceCommit,
  parseCliArgs,
  requiredCliArg,
  writeArtifact,
} from "@/lib/staging/migration-ledger";
import {
  aggregateZyraEvidence,
  assertProfileFreeSharedPayload,
  type ZyraEvidenceRow,
} from "@/lib/zyra/personalization";

function event(overrides: Partial<ZyraEvidenceRow> = {}): ZyraEvidenceRow {
  return {
    eventKind: "checkpoint_answered",
    sourceType: "tutor",
    evidenceRef: null,
    outcome: "success",
    correctness: 1,
    responseLatencyBucket: "standard",
    hintLevel: "none",
    representation: "stepwise",
    weight: 1,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    expiresAt: null,
    ...overrides,
  };
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");
  const course = requiredCliArg(args, "course");
  const guard = assertStagingEnvironment({
    productionEnv: parseEnvFile(joinProcessPath(".env.prod")),
    requiredResources: ["database", "authUrl", "vectorizeWorker"],
  });

  const cases = [
    aggregateZyraEvidence({ events: [event({ outcome: "failure" })] }),
    aggregateZyraEvidence({
      events: [
        event({ outcome: "failure", hintLevel: "hint_2" }),
        event({ outcome: "failure", hintLevel: "hint_3" }),
        event({ outcome: "success", hintLevel: "hint_1" }),
      ],
    }),
    aggregateZyraEvidence({
      events: [event(), event(), event()],
      explicitPreferences: { pace: "slow", representation: "visual" },
    }),
  ];
  const sharedScaffold = {
    explanation: "Synthetic profile-free scaffold",
    claims: [{ ideaId: "synthetic-source", ideaVersion: 1, claimHash: "synthetic" }],
    validation: { status: "grounded", evidenceVersion: "synthetic", claimCount: 1 },
  };
  assertProfileFreeSharedPayload(sharedScaffold);

  const passed = cases.every((decision) => decision.profileVersion === "zyra-personalization-v1")
    && cases[0].supportIntensity === "unknown"
    && cases[1].supportIntensity === "high"
    && cases[2].pace === "slow";
  const artifact = {
    status: passed ? "passed" : "failed",
    plan: "008",
    phase: "personalization_synthetic_contract",
    runId,
    course,
    sourceCommit: currentSourceCommit(),
    stagingResourceFingerprints: guard.resources.map(({ key, hash }) => ({ key, hash })),
    syntheticCaseCount: cases.length,
    providerCalls: 0,
    databaseWrites: 0,
    traceWrites: 0,
    learnerSideEffects: 0,
    sharedScaffoldProfileFree: true,
    secretsPrinted: false,
    authenticatedUrlsPrinted: false,
  };
  await writeArtifact(runId, "plan-008-personalization.json", artifact);
  console.log(JSON.stringify(artifact));
  if (!passed) process.exitCode = 1;
}

function joinProcessPath(fileName: string): string {
  return `${process.cwd()}/${fileName}`;
}

await main();
