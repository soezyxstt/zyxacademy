import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { and, eq } from "drizzle-orm";
import { join } from "node:path";
import * as schema from "@/db/schema";
import { PERAN_IDS, membershipIdFor } from "@/lib/auth/peran";
import {
 appendMigrationCheckpoint,
 currentSourceCommit,
 hmacText,
 parseCliArgs,
 requiredCliArg,
 requireManifestKey,
 writeArtifact,
} from "@/lib/staging/migration-ledger";
import {
 assertStagingEnvironment,
 parseEnvFile,
 resolveDatabaseConnection,
 safeGuardError,
} from "@/lib/staging/staging-guard";

type Row = Record<string, unknown>;

function rows(result: { rows: unknown[] }): Row[] {
 return result.rows as Row[];
}

function activeExpiryArgs(): [number, number] {
 const nowMs = Date.now();
 return [nowMs, Math.floor(nowMs / 1000)];
}

async function main(): Promise<void> {
 const args = parseCliArgs();
 const runId = requiredCliArg(args, "run-id");

 try {
  const manifestKey = requireManifestKey();
  const staging = assertStagingEnvironment({
   productionEnv: parseEnvFile(join(process.cwd(), ".env.prod")),
   requireMutation: true,
   requiredResources: ["database", "authUrl"],
  });
  const client = createClient(resolveDatabaseConnection(process.env));
  const database = drizzle(client, { schema });

  try {
   const configuredUserId = (typeof args["user-id"] === "string"
    ? args["user-id"]
    : process.env.STAGING_SMOKE_MULTI_USER_ID)?.trim();
   if (!configuredUserId) {
    throw new Error("An explicit --user-id or STAGING_SMOKE_MULTI_USER_ID is required for the staging smoke seed");
   }
   const expiry = activeExpiryArgs();
   const candidate = await client.execute({
    sql: `SELECT u.id AS user_id, u.role AS legacy_role
     FROM user u
     INNER JOIN pengguna p ON p.id = u.id
     INNER JOIN session s ON s.user_id = u.id
     WHERE u.id = ? AND u.role = 'admin' AND p.status = 'active'
       AND (s.expires_at > ? OR s.expires_at > ?)
     ORDER BY s.updated_at DESC, s.expires_at DESC
     LIMIT 1`,
    args: [configuredUserId, ...expiry],
   });
   const selected = rows(candidate)[0];
   if (!selected?.user_id) throw new Error("No active staging admin is available for the smoke seed");

   const userId = String(selected.user_id);
   const membershipId = membershipIdFor(userId, "tutor");
   const existing = await database
    .select({ id: schema.penggunaPeran.id })
    .from(schema.penggunaPeran)
    .where(and(
     eq(schema.penggunaPeran.penggunaId, userId),
     eq(schema.penggunaPeran.peranId, PERAN_IDS.tutor),
    ))
    .limit(1);
   const inserted = existing.length === 0;
   if (inserted) {
    await database.insert(schema.penggunaPeran).values({
     id: membershipId,
     penggunaId: userId,
     peranId: PERAN_IDS.tutor,
     source: "staging_smoke_seed",
     auditActorPenggunaId: null,
    });
   } else if (existing[0].id !== membershipId) {
    throw new Error("Existing staging tutor membership has an unexpected deterministic id");
   }

   const verified = await database
    .select({ id: schema.penggunaPeran.id })
    .from(schema.penggunaPeran)
    .where(and(
     eq(schema.penggunaPeran.penggunaId, userId),
     eq(schema.penggunaPeran.peranId, PERAN_IDS.tutor),
    ))
    .limit(1);
   if (verified.length !== 1 || verified[0].id !== membershipId) {
    throw new Error("Staging smoke tutor membership verification failed");
   }

   await appendMigrationCheckpoint(database, {
    runId,
    phase: "seed-peran-smoke",
    checkpoint: "tutor-membership",
    status: "passed",
    rowCount: inserted ? 1 : 0,
    details: { source: "staging_smoke_seed", role: "tutor" },
   });
   const report = {
    status: "passed",
    runId,
    sourceCommit: currentSourceCommit(),
    databaseFingerprint: staging.resources.find((item) => item.key === "database")?.hash ?? "unknown",
    selectedUserFingerprint: hmacText(manifestKey, userId),
    selectedLegacyRole: String(selected.legacy_role ?? "unknown"),
    role: "tutor",
    source: "staging_smoke_seed",
    inserted,
    changedRows: inserted ? 1 : 0,
    rollback: {
     attempted: false,
     passed: false,
     detail: "The staging-only membership may remain for Plan 002 smoke; FEATURE_PERAN_V2 remains off until reconciliation passes.",
    },
    operatorTimestamp: new Date().toISOString(),
   };
   await writeArtifact(runId, "seed-peran-smoke.json", report);
   console.log(JSON.stringify({
    status: report.status,
    runId,
    source: report.source,
    role: report.role,
    inserted: report.inserted,
   }));
  } finally {
   client.close();
  }
 } catch (error) {
  const safe = safeGuardError(error);
  console.error(JSON.stringify({ status: "blocked", ...safe }));
  process.exitCode = 1;
 }
}

void main();
