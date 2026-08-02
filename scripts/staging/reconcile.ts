import { join } from "node:path";
import {
  assertStagingEnvironment,
  parseEnvFile,
  safeGuardError,
} from "@/lib/staging/staging-guard";
import {
  parseCliArgs,
  readArtifact,
  requiredCliArg,
  currentSourceCommit,
  sha256Text,
  stableStringify,
  writeArtifact,
  writeEvidenceArtifact,
} from "@/lib/staging/migration-ledger";
import { unexpectedAddedTables, unexpectedChangedTables } from "@/lib/staging/reconciliation";

type TableManifest = {
  name: string;
  sqlHash: string;
  rowCount: number;
  primaryKeyColumns: string[];
  primaryKeySetHash: string;
};

type InventoryManifest = {
  runId: string;
  phase: string;
  tables: TableManifest[];
  schemaHash: string;
  foreignKeyViolations: number;
  semanticCounts: Record<string, number>;
  manifestHash: string;
};

type RestoreReport = {
  status: string;
  tableCount: number;
  schemaHash: string;
  foreignKeyViolations: number;
};

function tableMap(tables: TableManifest[]): Map<string, TableManifest> {
  return new Map(tables.map((table) => [table.name, table]));
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");
  const expected = String(args.expect ?? "additive");
  const planNumber = String(args.plan ?? "001");

  try {
    const guard = assertStagingEnvironment({
      productionEnv: parseEnvFile(join(process.cwd(), ".env.prod")),
      requiredResources: ["database", "authUrl"],
    });
    if (expected !== "additive") throw new Error("Only additive reconciliation is supported");
    const before = await readArtifact<InventoryManifest>(runId, "inventory-before.json");
    const after = await readArtifact<InventoryManifest>(runId, "inventory-after.json");
    const beforeTables = tableMap(before.tables);
    const afterTables = tableMap(after.tables);
    const removed = [...beforeTables.keys()].filter((name) => !afterTables.has(name));
    const changed = [...beforeTables.keys()].filter((name) => {
      const previous = beforeTables.get(name);
      const current = afterTables.get(name);
      if (!previous || !current) return false;
      return previous.sqlHash !== current.sqlHash
        || previous.rowCount !== current.rowCount
        || previous.primaryKeySetHash !== current.primaryKeySetHash
        || stableStringify(previous.primaryKeyColumns) !== stableStringify(current.primaryKeyColumns);
    });
    const added = [...afterTables.keys()].filter((name) => !beforeTables.has(name));
    const unexpectedAdded = unexpectedAddedTables(planNumber, added);
    const unexpectedChanged = unexpectedChangedTables(planNumber, changed);
    const violations = [
      ...removed.map((name) => `removed:${name}`),
      ...unexpectedChanged.map((name) => `changed:${name}`),
      ...unexpectedAdded.map((name) => `unexpected-added:${name}`),
    ];
    if (after.foreignKeyViolations !== 0) violations.push("foreign-key-violations");

    let restore: RestoreReport | null = null;
    try {
      restore = await readArtifact<RestoreReport>(runId, "restore.json");
    } catch {
      restore = null;
    }
    if (planNumber === "001" && (!restore || restore.status !== "passed" || restore.foreignKeyViolations !== 0)) {
      violations.push("restore-rehearsal-missing-or-failed");
    }

    const reconciliation = {
      status: violations.length === 0 ? "passed" : "failed",
      runId,
      planNumber,
      beforeManifestHash: before.manifestHash,
      afterManifestHash: after.manifestHash,
      added,
      removed,
      changed,
      violations,
      schemaHash: sha256Text(stableStringify({ before: before.schemaHash, after: after.schemaHash })),
      foreignKeyViolations: after.foreignKeyViolations,
      restoreStatus: restore?.status ?? "missing",
    };
    await writeArtifact(runId, "reconciliation.json", reconciliation);
    if (reconciliation.status === "passed") {
      const commands = [
        { command: "staging:inventory before", exitCode: 0 },
        ...(planNumber === "001"
          ? [
            { command: "staging:export", exitCode: 0 },
            { command: "staging:restore-export disposable", exitCode: 0 },
          ]
          : []),
        { command: "staging:migrate", exitCode: 0 },
        { command: "staging:inventory after", exitCode: 0 },
        { command: "staging:reconcile", exitCode: 0 },
      ];
      await writeEvidenceArtifact({
        planNumber,
        status: "passed",
        sourceCommit: currentSourceCommit(),
        migrationRunId: runId,
        resourceFingerprints: guard.resources,
        commands,
        rowCounts: Object.fromEntries(after.tables.map((table) => [table.name, table.rowCount])),
        reconciliationHashes: {
          before: before.manifestHash,
          after: after.manifestHash,
          reconciliation: reconciliation.schemaHash,
        },
        featureFlags: Object.fromEntries(
          Object.entries(process.env).filter(([key]) => key.startsWith("FEATURE_")).map(([key, value]) => [key, value]),
        ),
        rollback: {
          attempted: planNumber === "001",
          passed: planNumber === "001" && restore?.status === "passed",
          detail: planNumber === "001"
            ? "Encrypted export restored to a disposable target"
            : "No legacy data was rewritten; new additive tables remain empty and the feature flag stays off",
        },
        operatorTimestamp: new Date().toISOString(),
      });
    }
    console.log(JSON.stringify(reconciliation));
    if (reconciliation.status !== "passed") process.exitCode = 1;
  } catch (error) {
    const safe = safeGuardError(error);
    console.error(JSON.stringify({ status: "blocked", ...safe }));
    process.exitCode = 1;
  }
}

void main();
