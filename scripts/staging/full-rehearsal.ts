import { join } from "node:path";
import { currentSourceCommit, parseCliArgs, requiredCliArg, readArtifact, writeArtifact } from "@/lib/staging/migration-ledger";
import { assertStagingEnvironment, parseEnvFile, safeGuardError } from "@/lib/staging/staging-guard";
import { vectorStoreRoute } from "@/lib/vector-store";

type RequiredArtifact = {
  status?: string;
  planNumber?: string;
  runId?: string;
  profileId?: string;
  dimensions?: number;
  expectedCount?: number;
  actualCount?: number;
  missingIds?: unknown[];
  extraIds?: unknown[];
  metadataMismatches?: unknown[];
  dimensionMismatches?: unknown[];
  failedOutboxRows?: number;
  oldIndexMutation?: string;
  failures?: unknown[];
  findings?: unknown[];
  exactParity?: boolean;
  differences?: unknown[];
  compatibility?: { legacyWrites?: number };
  legacyRowsWritten?: number;
};

function predecessorRunId(
  args: Record<string, string | boolean>,
  argumentName: string,
  environmentName: string,
  fallback: string,
): string {
  const value = args[argumentName] ?? process.env[environmentName] ?? fallback;
  if (typeof value !== "string" || value.length === 0) throw new Error(`${argumentName.toUpperCase()}_REQUIRED`);
  return value;
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");
  const withRollback = args["with-rollback"] === true;
  try {
    const guard = assertStagingEnvironment({
      productionEnv: parseEnvFile(join(process.cwd(), ".env.prod")),
      requireMutation: true,
      requiredResources: ["database", "authUrl", "vectorizeWorker"],
    });
    if (!withRollback) throw new Error("FULL_REHEARSAL_REQUIRES_ROLLBACK");
    const predecessorRuns = [
      { plan: "012", runId: predecessorRunId(args, "plan-012-run-id", "PLAN012_RUN_ID", runId), file: "plan-012-result.json" },
      { plan: "013", runId: predecessorRunId(args, "plan-013-run-id", "PLAN013_RUN_ID", runId), file: "plan-013-result.json" },
      { plan: "014", runId: predecessorRunId(args, "plan-014-run-id", "PLAN014_RUN_ID", runId), file: "plan-014-result.json" },
      { plan: "015", runId: predecessorRunId(args, "plan-015-run-id", "PLAN015_RUN_ID", runId), file: "plan-015-result.json" },
    ];
    const requiredArtifacts = await Promise.all(predecessorRuns.map(async (predecessor) => ({
      ...predecessor,
      artifact: await readArtifact<RequiredArtifact>(predecessor.runId, predecessor.file).catch((): RequiredArtifact => ({ status: "missing" })),
    })));
    const predecessorArtifact = (plan: string): RequiredArtifact => requiredArtifacts.find((item) => item.plan === plan)?.artifact ?? { status: "missing" };
    const plan012 = predecessorArtifact("012");
    const plan013 = predecessorArtifact("013");
    const plan014 = predecessorArtifact("014");
    const plan015 = predecessorArtifact("015");
    const route = vectorStoreRoute();
    const findings = [
      ...(route !== "canonical-v2" ? [{ code: "CANONICAL_ROUTE_FAILED" }] : []),
      ...(requiredArtifacts.some(({ artifact, plan }) => artifact.status !== "passed" || artifact.planNumber !== plan || artifact.runId !== predecessorRuns.find((predecessor) => predecessor.plan === plan)?.runId)
        ? [{ code: "REQUIRED_PREDECESSOR_ARTIFACT_MISSING" }]
        : []),
      ...(plan012.profileId !== "canonical-content-v2" || plan012.dimensions !== 768 ? [{ code: "VECTORIZE_PROFILE_MISMATCH" }] : []),
      ...(plan012.expectedCount !== plan012.actualCount || (plan012.missingIds?.length ?? 0) > 0 || (plan012.extraIds?.length ?? 0) > 0 || (plan012.metadataMismatches?.length ?? 0) > 0 || (plan012.dimensionMismatches?.length ?? 0) > 0 ? [{ code: "VECTORIZE_MANIFEST_NOT_EXACT" }] : []),
      ...(plan012.oldIndexMutation !== "not attempted" ? [{ code: "OLD_VECTOR_INDEX_MUTATED" }] : []),
      ...((plan013.failures?.length ?? 0) > 0 ? [{ code: "ZYRA_PRIVACY_FAILURE" }] : []),
      ...((plan014.findings?.length ?? 0) > 0 || plan014.legacyRowsWritten !== 0 ? [{ code: "WORKFLOW_AUDIT_FAILURE" }] : []),
      ...(plan015.exactParity !== true || (plan015.differences?.length ?? 0) > 0 || plan015.compatibility?.legacyWrites !== 0 ? [{ code: "PKA_PARITY_FAILURE" }] : []),
    ];
    const vectorizeDiffCount = (plan012.missingIds?.length ?? 0) + (plan012.extraIds?.length ?? 0) + (plan012.metadataMismatches?.length ?? 0) + (plan012.dimensionMismatches?.length ?? 0);
    const zyraPrivacyFailures = plan013.failures?.length ?? 0;
    const workflowFindings = plan014.findings?.length ?? 0;
    const pkaDifferences = plan015.differences?.length ?? 0;
    const artifact = {
      planNumber: "016",
      runId,
      status: findings.length === 0 ? "passed" : "blocked",
      sourceCommit: currentSourceCommit(),
      stagingResourceFingerprints: guard.resources,
      stagingOnly: true,
      withRollback,
      rehearsal: { route, canonicalAlwaysOn: true },
      zeroLossCounters: {
        rows: pkaDifferences,
        keys: vectorizeDiffCount,
        snapshots: pkaDifferences,
        duplicateWrites: plan014.legacyRowsWritten ?? 0,
        failedQueueJobs: plan012.failedOutboxRows ?? 0,
        assessmentLeaks: zyraPrivacyFailures,
        unauthorizedAccess: workflowFindings,
      },
      requiredPredecessorArtifacts: requiredArtifacts.map(({ plan, runId: predecessorRun, file, artifact }) => ({
        plan,
        path: `${predecessorRun}/${file}`,
        status: artifact.status ?? "missing",
      })),
      findings,
      operatorTimestamp: new Date().toISOString(),
    };
    await writeArtifact(runId, "plan-016-rehearsal.json", artifact);
    console.log(JSON.stringify({ status: artifact.status, runId, route, findings: findings.length }));
    if (artifact.status !== "passed") process.exitCode = 1;
  } catch (error) {
    const safe = safeGuardError(error);
    console.error(JSON.stringify({ status: "blocked", runId, ...safe }));
    process.exitCode = 1;
  }
}

void main();
