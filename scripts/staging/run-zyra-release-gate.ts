import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { assertStagingEnvironment, parseEnvFile } from "@/lib/staging/staging-guard";
import { currentSourceCommit, parseCliArgs, requiredCliArg, writeArtifact } from "@/lib/staging/migration-ledger";

const evidencePaths = [
  "artifacts/zyra-ai/20260805-plan001-preflight/plan-001-preflight.json",
  "artifacts/zyra-ai/20260805-plan002-real/plan-002-model-probe.json",
  "artifacts/zyra-ai/20260807-plan003-final/plan-003-result.json",
  "artifacts/staging-overhaul/20260807-plan004-app-canary-v3/plan-004-application-canary.json",
  "artifacts/zyra-ai/20260807-plan005-provider-router-paced-v1/plan-005-provider-router.json",
  "artifacts/zyra-ai/20260807-plan006-cache-smoke-v10/plan-006-cache-smoke.json",
  "artifacts/staging-overhaul/20260812-plan007-startup-current-escalated/plan-007-pedagogy-startup-diagnostics.json",
  "artifacts/staging-overhaul/20260812-plan008-final-current/plan-008-personalization.json",
  "artifacts/staging-overhaul/20260812-plan009-final-current/plan-009-canvas.json",
  "artifacts/staging-overhaul/20260812-plan010-final-current/plan-010-images.json",
  "artifacts/staging-overhaul/20260812-plan011-final-current/plan-011-murid.json",
  "artifacts/staging-overhaul/20260812-plan012-final-current/plan-012-copilots.json",
  "artifacts/staging-overhaul/20260812-plan013-final-current/plan-013-operations.json",
];

const flags = [
  "FEATURE_ZYRA_ALLOWANCE_V2",
  "FEATURE_ZYRA_PROVIDER_ROUTER_V2",
  "FEATURE_ZYRA_SEMANTIC_CACHE_V1",
  "FEATURE_ZYRA_PERSONALIZATION_V1",
  "FEATURE_ZYRA_LEARNING_CANVAS_V1",
  "FEATURE_ZYRA_IMAGE_INPUT_V1",
  "FEATURE_ZYRA_PET_V1",
  "FEATURE_ZYRA_TUTOR_COPILOT_V1",
  "FEATURE_ZYRA_ADMIN_COPILOT_V1",
  "FEATURE_ZYRA_AI_OPS_V1",
];

function worktreeDirty(): boolean {
  return execFileSync("git", ["status", "--short"], { encoding: "utf8" }).trim().length > 0;
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");
  const cap = Number(args["max-provider-requests"] ?? 0);
  const syntheticOnly = args["synthetic-users-only"] === true;
  const guard = assertStagingEnvironment({
    productionEnv: parseEnvFile(`${process.cwd()}/.env.prod`),
    requiredResources: ["database", "authUrl", "r2Bucket", "vectorizeWorker"],
  });
  const missingEvidence = evidencePaths.filter((path) => !existsSync(path));
  const reasons = [
    ...(worktreeDirty() ? ["ENTRY_WORKTREE_NOT_CLEAN"] : []),
    ...(missingEvidence.length > 0 ? ["PREDECESSOR_EVIDENCE_MISSING"] : []),
    "PLAN007_REMOTE_SHADOW_AND_MAINTAINER_REVIEW_PENDING",
    ...(syntheticOnly ? ["LIVE_STAGING_MATRIX_NOT_RUN"] : ["REMOTE_RUN_REQUIRES_EXPLICIT_APPROVAL"]),
  ];
  if (!Number.isInteger(cap) || cap < 0 || cap > 40) reasons.push("PROVIDER_CAP_INVALID");
  const artifact = {
    status: reasons.length === 0 ? "passed" : "blocked",
    plan: "014",
    runId,
    sourceCommit: currentSourceCommit(),
    stagingResourceFingerprints: guard.resources.map(({ key, hash }) => ({ key, hash })),
    syntheticUsersOnly: syntheticOnly,
    liveProviderRun: false,
    maxProviderRequests: Number.isInteger(cap) ? cap : null,
    predecessorEvidencePresent: missingEvidence.length === 0,
    missingEvidence,
    reasons,
    flags: Object.fromEntries(flags.map((name) => [name, process.env[name] === "1" ? "on" : "off"])),
    zeroTolerance: {
      unauthorizedAttachmentReads: 0,
      metadataLeaks: 0,
      sharedImageCacheReads: 0,
      sharedImageCacheWrites: 0,
      assessmentLeaks: 0,
      quotaOversubscription: 0,
    },
    secretsPrinted: false,
    authenticatedUrlsPrinted: false,
  };
  await writeArtifact(runId, "plan-014-result.json", artifact);
  console.log(JSON.stringify(artifact));
  if (artifact.status !== "passed") process.exitCode = 2;
}

await main();
