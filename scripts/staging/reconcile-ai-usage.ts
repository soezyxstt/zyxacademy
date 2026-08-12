import { createClient } from "@libsql/client";
import { join } from "node:path";
import {
  assertStagingEnvironment,
  parseEnvFile,
  resolveDatabaseConnection,
  safeGuardError,
} from "@/lib/staging/staging-guard";
import {
  currentSourceCommit,
  parseCliArgs,
  readArtifact,
  requiredCliArg,
  writeArtifact,
} from "@/lib/staging/migration-ledger";

type QueryRow = Record<string, string | number | null>;

function rows(result: { rows: unknown[] }): QueryRow[] {
  return result.rows as QueryRow[];
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");
  const strict = args.strict === true;

  try {
    const guard = assertStagingEnvironment({
      productionEnv: parseEnvFile(join(process.cwd(), ".env.prod")),
      requiredResources: ["database", "authUrl"],
    });
    const before = await readArtifact<{ legacy?: unknown }>(runId, "plan-004-usage-manifest-before.json");
    const after = await readArtifact<{ legacy?: unknown }>(runId, "plan-004-usage-manifest-after.json");
    const legacyPreserved = JSON.stringify(before.legacy) === JSON.stringify(after.legacy);
    const client = createClient(resolveDatabaseConnection(process.env));
    const summary = rows(await client.execute(`
      SELECT
        COUNT(*) AS committed_leases,
        COALESCE(SUM(CASE WHEN units > 0 THEN units ELSE 0 END), 0) AS provider_units,
        COALESCE(SUM(CASE WHEN units = 0 THEN 1 ELSE 0 END), 0) AS cache_interactions
      FROM ai_allowance_leases
      WHERE status = 'committed'
    `))[0] ?? {};
    const missing = rows(await client.execute(`
      SELECT COUNT(*) AS missing_events
      FROM ai_allowance_leases leases
      LEFT JOIN ai_usage_events events ON events.id = leases.id
      WHERE leases.status = 'committed' AND events.id IS NULL
    `))[0] ?? {};
    const invalid = rows(await client.execute(`
      SELECT COUNT(*) AS invalid_leases
      FROM ai_allowance_leases
      WHERE status NOT IN ('reserved', 'dispatched', 'committed', 'refunded')
    `))[0] ?? {};
    const report = {
      planNumber: "004",
      runId,
      status: strict && (
        Number(missing.missing_events ?? 0) > 0
        || Number(invalid.invalid_leases ?? 0) > 0
        || !legacyPreserved
      )
        ? "blocked"
        : "passed",
      sourceCommit: currentSourceCommit(),
      stagingResourceFingerprints: guard.resources,
      committedLeases: Number(summary.committed_leases ?? 0),
      providerUnits: Number(summary.provider_units ?? 0),
      cacheInteractions: Number(summary.cache_interactions ?? 0),
      missingCompatibilityEvents: Number(missing.missing_events ?? 0),
      invalidLeases: Number(invalid.invalid_leases ?? 0),
      legacyPreserved,
      strict,
      privacy: "No user IDs, secrets, tokens, or authenticated URLs are recorded.",
      operatorTimestamp: new Date().toISOString(),
    };
    await writeArtifact(runId, "plan-004-reconcile.json", report);
    await writeArtifact(runId, "plan-004-result.json", report);
    console.log(JSON.stringify({
      status: report.status,
      planNumber: report.planNumber,
      committedLeases: report.committedLeases,
      missingCompatibilityEvents: report.missingCompatibilityEvents,
      invalidLeases: report.invalidLeases,
    }));
    if (report.status !== "passed") process.exitCode = 1;
  } catch (error) {
    const safe = safeGuardError(error);
    console.error(JSON.stringify({ status: "blocked", planNumber: "004", runId, ...safe }));
    process.exitCode = 1;
  }
}

void main();
