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
  requiredCliArg,
  sha256Text,
  writeArtifact,
} from "@/lib/staging/migration-ledger";

type QueryRow = Record<string, string | number | null>;

function rows(result: { rows: unknown[] }): QueryRow[] {
  return result.rows as QueryRow[];
}

function mask(value: string): string {
  return sha256Text(value).slice(0, 16);
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const phase = args.phase === "after" ? "after" : "before";
  const runId = requiredCliArg(args, "run-id");

  try {
    const guard = assertStagingEnvironment({
      productionEnv: parseEnvFile(join(process.cwd(), ".env.prod")),
      requiredResources: ["database", "authUrl"],
    });
    const client = createClient(resolveDatabaseConnection(process.env));
    const usage = rows(await client.execute(`
      SELECT COUNT(*) AS row_count,
             COUNT(DISTINCT user_id) AS user_count,
             MIN(created_at) AS min_created_at,
             MAX(created_at) AS max_created_at
      FROM ai_usage_events
    `))[0] ?? {};
    const traces = rows(await client.execute(`
      SELECT COUNT(*) AS row_count,
             COUNT(DISTINCT user_id) AS user_count,
             MIN(created_at) AS min_created_at,
             MAX(created_at) AS max_created_at
      FROM ai_generation_traces
    `))[0] ?? {};
    const requestTypes = rows(await client.execute(`
      SELECT request_type, COUNT(*) AS row_count
      FROM ai_usage_events
      GROUP BY request_type
      ORDER BY request_type
    `)).map((row) => ({ requestType: row.request_type, rowCount: Number(row.row_count ?? 0) }));
    const usageKeys = rows(await client.execute("SELECT id FROM ai_usage_events ORDER BY id"));
    const traceKeys = rows(await client.execute("SELECT id FROM ai_generation_traces ORDER BY id"));
    const primaryKeyDigest = mask([
      usageKeys.map((row) => String(row.id ?? "")).join("\n"),
      traceKeys.map((row) => String(row.id ?? "")).join("\n"),
    ].join("\n"));
    const report = {
      planNumber: "004",
      runId,
      phase,
      status: "passed",
      sourceCommit: currentSourceCommit(),
      stagingResourceFingerprints: guard.resources,
      legacy: {
        usageEvents: {
          rowCount: Number(usage.row_count ?? 0),
          maskedUserCount: Number(usage.user_count ?? 0),
          minCreatedAt: usage.min_created_at,
          maxCreatedAt: usage.max_created_at,
        },
        generationTraces: {
          rowCount: Number(traces.row_count ?? 0),
          maskedUserCount: Number(traces.user_count ?? 0),
          minCreatedAt: traces.min_created_at,
          maxCreatedAt: traces.max_created_at,
        },
        requestTypes,
        primaryKeyDigest,
      },
      writes: 0,
      privacy: "No user IDs, secrets, tokens, or authenticated URLs are recorded.",
      operatorTimestamp: new Date().toISOString(),
    };
    await writeArtifact(runId, `plan-004-usage-manifest-${phase}.json`, report);
    console.log(JSON.stringify({ status: report.status, planNumber: report.planNumber, phase, writes: 0 }));
  } catch (error) {
    const safe = safeGuardError(error);
    console.error(JSON.stringify({ status: "blocked", planNumber: "004", phase, ...safe }));
    process.exitCode = 1;
  }
}

void main();
