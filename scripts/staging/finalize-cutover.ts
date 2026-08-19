import { join } from "node:path";
import { currentSourceCommit, parseCliArgs, requiredCliArg, readArtifact, writeArtifact } from "@/lib/staging/migration-ledger";
import { assertStagingEnvironment, parseEnvFile, safeGuardError } from "@/lib/staging/staging-guard";

type Artifact = {
  planNumber?: string;
  runId?: string;
  status?: string;
  externalDeletion?: string;
  exactTarget?: boolean;
  productionTarget?: boolean;
  preservedVectorizeResources?: string[];
  stagingOnly?: boolean;
  zeroLossCounters?: Record<string, number>;
  counts?: { runtime?: number; runtimeWriteCallers?: number };
  requiredPredecessorArtifacts?: Array<{ plan?: string; path?: string; status?: string }>;
};

function runIdFrom(args: Record<string, string | boolean>, key: string, envName: string): string {
  const value = args[key] ?? process.env[envName];
  if (typeof value !== "string" || value.length === 0) throw new Error(`${key.toUpperCase().replaceAll("-", "_")}_REQUIRED`);
  return value;
}

async function readOrMissing(runId: string, file: string): Promise<Artifact> {
  return readArtifact<Artifact>(runId, file).catch(() => ({ status: "missing", runId }));
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");
  try {
    const guard = assertStagingEnvironment({
      productionEnv: parseEnvFile(join(process.cwd(), ".env.prod")),
      requiredResources: ["database", "authUrl", "vectorizeWorker"],
    });
    const rehearsalA = runIdFrom(args, "run-a", "PLAN016_REHEARSAL_A_RUN_ID");
    const rehearsalB = runIdFrom(args, "run-b", "PLAN016_REHEARSAL_B_RUN_ID");
    const inventoryRunId = runIdFrom(args, "inventory-run-id", "PLAN016_INVENTORY_RUN_ID");
    const decommissionRunId = runIdFrom(args, "decommission-run-id", "PLAN016_DECOMMISSION_RUN_ID");
    const predecessorRuns = [
      { plan: "012", runId: runIdFrom(args, "plan-012-run-id", "PLAN012_RUN_ID"), file: "plan-012-result.json" },
      { plan: "013", runId: runIdFrom(args, "plan-013-run-id", "PLAN013_RUN_ID"), file: "plan-013-result.json" },
      { plan: "014", runId: runIdFrom(args, "plan-014-run-id", "PLAN014_RUN_ID"), file: "plan-014-result.json" },
      { plan: "015", runId: runIdFrom(args, "plan-015-run-id", "PLAN015_RUN_ID"), file: "plan-015-result.json" },
    ];
    const [rehearsalAArtifact, rehearsalBArtifact, inventory, decommission, ...predecessors] = await Promise.all([
      readOrMissing(rehearsalA, "plan-016-rehearsal.json"),
      readOrMissing(rehearsalB, "plan-016-rehearsal.json"),
      readOrMissing(inventoryRunId, "plan-016-legacy-caller-inventory.json"),
      readOrMissing(decommissionRunId, "plan-016-pinecone-decommission.json"),
      ...predecessorRuns.map((predecessor) => readOrMissing(predecessor.runId, predecessor.file)),
    ]);
    const findings: Array<{ code: string; detail?: string }> = [];
    for (const [label, artifact] of [["REHEARSAL_A", rehearsalAArtifact], ["REHEARSAL_B", rehearsalBArtifact]] as const) {
      if (artifact.planNumber !== "016" || artifact.runId !== (label === "REHEARSAL_A" ? rehearsalA : rehearsalB) || artifact.status !== "passed") {
        findings.push({ code: `${label}_NOT_PASSED` });
      }
      if (artifact.stagingOnly !== true || !artifact.zeroLossCounters || Object.values(artifact.zeroLossCounters).some((value) => value !== 0)) {
        findings.push({ code: `${label}_COUNTERS_NOT_ZERO` });
      }
    }
    predecessorRuns.forEach((predecessor, index) => {
      const artifact = predecessors[index];
      if (artifact.planNumber !== predecessor.plan || artifact.runId !== predecessor.runId || artifact.status !== "passed") {
        findings.push({ code: `PLAN_${predecessor.plan}_RESULT_NOT_PASSED`, detail: `${predecessor.runId}/${predecessor.file}` });
      }
    });
    if (inventory.planNumber !== "016" || inventory.status !== "passed" || inventory.counts?.runtime !== 0 || inventory.counts?.runtimeWriteCallers !== 0) {
      findings.push({ code: "LEGACY_RUNTIME_CALLERS_REMAIN" });
    }
    const decommissionAccepted = decommission.externalDeletion === "executed" || decommission.externalDeletion === "not_provisioned";
    if (decommission.planNumber !== "016" || decommission.status !== "passed" || !decommissionAccepted || decommission.exactTarget !== true || decommission.productionTarget !== false) {
      findings.push({ code: "PINECONE_DECOMMISSION_NOT_CONFIRMED" });
    }
    if (decommission.preservedVectorizeResources?.join(",") !== "zyx-vectors-staging,zyx-edu") {
      findings.push({ code: "PRESERVED_VECTORIZES_NOT_CONFIRMED" });
    }
    const artifact = {
      planNumber: "016",
      runId,
      status: findings.length === 0 ? "passed" : "blocked",
      sourceCommit: currentSourceCommit(),
      stagingResourceFingerprints: guard.resources,
      stagingOnly: true,
      rehearsals: [rehearsalA, rehearsalB],
      predecessorResults: predecessorRuns.map((predecessor) => `${predecessor.runId}/${predecessor.file}`),
      inventoryArtifact: `${inventoryRunId}/plan-016-legacy-caller-inventory.json`,
      decommissionArtifact: `${decommissionRunId}/plan-016-pinecone-decommission.json`,
      legacyRuntimeCallers: inventory.counts?.runtime ?? null,
      legacyRuntimeWriteCallers: inventory.counts?.runtimeWriteCallers ?? null,
      externalDeletion: decommission.externalDeletion ?? "unknown",
      preservedVectorizeResources: decommission.preservedVectorizeResources ?? [],
      findings,
      operatorTimestamp: new Date().toISOString(),
    };
    await writeArtifact(runId, "plan-016-result.json", artifact);
    console.log(JSON.stringify({ status: artifact.status, runId, findingCount: findings.length, stagingOnly: true }));
    if (artifact.status !== "passed") process.exitCode = 1;
  } catch (error) {
    const safe = safeGuardError(error);
    console.error(JSON.stringify({ status: "blocked", runId, ...safe }));
    process.exitCode = 1;
  }
}

void main();
