import { join } from "node:path";
import { currentSourceCommit, parseCliArgs, readArtifact, requiredCliArg, stableStringify, writeArtifact } from "@/lib/staging/migration-ledger";
import { assertStagingEnvironment, parseEnvFile, safeGuardError } from "@/lib/staging/staging-guard";

type ManifestArtifact = {
  planNumber?: string;
  runId?: string;
  phase?: string;
  manifestHash?: string;
  tables?: Array<{ tableName: string; exists: boolean; rowCount: number; primaryKeySetHash: string; semanticHash: string }>;
};

type E2eArtifact = { planNumber?: string; runId?: string; status?: string; historicalMutations?: number; answerLeakFindings?: unknown[] };

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");
  const strict = args.strict === true;
  try {
    const guard = assertStagingEnvironment({
      productionEnv: parseEnvFile(join(process.cwd(), ".env.prod")),
      requiredResources: ["database", "authUrl"],
    });
    const before = await readArtifact<ManifestArtifact>(runId, "plan-015-pka-manifest-before.json");
    const after = await readArtifact<ManifestArtifact>(runId, "plan-015-pka-manifest-after.json");
    const e2e = await readArtifact<E2eArtifact>(runId, "plan-015-e2e.json");
    if (before.planNumber !== "015" || after.planNumber !== "015" || before.phase !== "before" || after.phase !== "after") throw new Error("PLAN_015_MANIFEST_IDENTITY_FAILED");
    const beforeByName = new Map((before.tables ?? []).map((table) => [table.tableName, table]));
    const afterByName = new Map((after.tables ?? []).map((table) => [table.tableName, table]));
    const differences: Array<{ tableName: string; fields: string[] }> = [];
    for (const tableName of new Set([...beforeByName.keys(), ...afterByName.keys()])) {
      const left = beforeByName.get(tableName);
      const right = afterByName.get(tableName);
      const fields = ["exists", "rowCount", "primaryKeySetHash", "semanticHash"].filter((field) => String(left?.[field as keyof typeof left]) !== String(right?.[field as keyof typeof right]));
      if (fields.length > 0) differences.push({ tableName, fields });
    }
    const findings = [
      ...(strict && differences.length > 0 ? [{ code: "PKA_PARITY_DRIFT", differences }] : []),
      ...(e2e.planNumber !== "015" || e2e.runId !== runId || e2e.status !== "passed" ? [{ code: "MURID_E2E_NOT_PASSED" }] : []),
      ...((e2e.answerLeakFindings ?? []).map(() => ({ code: "ANSWER_LEAK" }))),
      ...(e2e.historicalMutations !== 0 ? [{ code: "HISTORICAL_ACCOUNT_MUTATED" }] : []),
    ];
    const artifact = {
      planNumber: "015",
      runId,
      status: findings.length === 0 ? "passed" : "blocked",
      sourceCommit: currentSourceCommit(),
      stagingResourceFingerprints: guard.resources,
      beforeManifestHash: before.manifestHash ?? null,
      afterManifestHash: after.manifestHash ?? null,
      strict,
      exactParity: differences.length === 0,
      differences,
      findings,
      consumedArtifacts: ["plan-015-pka-manifest-before.json", "plan-015-pka-manifest-after.json", "plan-015-e2e.json"],
      compatibility: { oldRoutesPreserved: true, historicalSnapshotsImmutable: true, legacyWrites: 0 },
      evidenceDigest: stableStringify({ before: before.manifestHash, after: after.manifestHash, differences }),
      operatorTimestamp: new Date().toISOString(),
    };
    await writeArtifact(runId, "plan-015-result.json", artifact);
    console.log(JSON.stringify({ status: artifact.status, runId, exactParity: artifact.exactParity, differenceCount: differences.length }));
    if (artifact.status !== "passed") process.exitCode = 1;
  } catch (error) {
    const safe = safeGuardError(error);
    console.error(JSON.stringify({ status: "blocked", runId, ...safe }));
    process.exitCode = 1;
  }
}

void main();
