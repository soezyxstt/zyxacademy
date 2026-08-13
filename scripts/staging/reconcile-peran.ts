import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { join } from "node:path";
import * as schema from "@/db/schema";
import {
 appendMigrationCheckpoint,
 currentSourceCommit,
 parseCliArgs,
 readArtifact,
 requiredCliArg,
 sha256Text,
 stableStringify,
 writeArtifact,
 writeEvidenceArtifact,
} from "@/lib/staging/migration-ledger";
import {
 assertStagingEnvironment,
 parseEnvFile,
 resolveDatabaseConnection,
 safeGuardError,
} from "@/lib/staging/staging-guard";
import { PERAN_CODES, PERAN_IDS } from "@/lib/auth/peran";

type Row = Record<string, unknown>;
type BackfillReport = {
 status: string;
 legacyUserCount: number;
 penggunaCount: number;
 changedRows: number;
 unsupportedLegacyRoles?: Record<string, number>;
 rowCountManifestHash?: string;
};
type LiteralReport = { status: string; counts: Record<string, number> };
type SmokeReport = { status: string; cases: Array<{ name: string; status: string }> };
type SmokeSeedReport = { status: string; source?: string; changedRows?: number };

function rows(result: { rows: unknown[] }): Row[] {
 return result.rows as Row[];
}

async function count(client: ReturnType<typeof createClient>, sql: string, args: Array<string | number> = []): Promise<number> {
 const result = await client.execute({ sql, args });
 return Number(rows(result)[0]?.count ?? 0);
}

async function main(): Promise<void> {
 const args = parseCliArgs();
 const runId = requiredCliArg(args, "run-id");

 try {
  const guard = assertStagingEnvironment({
   productionEnv: parseEnvFile(join(process.cwd(), ".env.prod")),
   requiredResources: ["database", "authUrl"],
  });
  const initial = await readArtifact<BackfillReport>(runId, "backfill-peran.json");
  const rerun = await readArtifact<BackfillReport>(runId, "backfill-peran-rerun.json");
  const literalReport = await readArtifact<LiteralReport>(runId, "role-literals.json");
  const smokeSeed = await readArtifact<SmokeSeedReport>(runId, "seed-peran-smoke.json");
  const smoke = await readArtifact<SmokeReport>(runId, "smoke-auth.json");
  const connection = resolveDatabaseConnection(process.env);
  const client = createClient(connection);
  const database = drizzle(client, { schema });

  try {
   const legacyUserCount = await count(client, "SELECT COUNT(*) AS count FROM user");
   const penggunaCount = await count(client, "SELECT COUNT(*) AS count FROM pengguna");
   const peranCount = await count(client, "SELECT COUNT(*) AS count FROM peran");
   const membershipCount = await count(client, "SELECT COUNT(*) AS count FROM pengguna_peran");
   const missingPenggunaCount = await count(client, `
    SELECT COUNT(*) AS count
    FROM user u
    LEFT JOIN pengguna p ON p.id = u.id
    WHERE p.id IS NULL
   `);
   const extraPenggunaCount = await count(client, `
    SELECT COUNT(*) AS count
    FROM pengguna p
    LEFT JOIN user u ON u.id = p.id
    WHERE u.id IS NULL
   `);
   const unsupportedRoleCount = await count(client, `
    SELECT COUNT(*) AS count
    FROM user
    WHERE role IS NULL OR role NOT IN ('admin', 'teacher', 'student')
   `);
   const roleMismatchCount = await count(client, `
    SELECT COUNT(*) AS count
    FROM user u
    WHERE u.role IN ('admin', 'teacher', 'student')
      AND NOT EXISTS (
       SELECT 1
       FROM pengguna_peran pp
       INNER JOIN peran r ON r.id = pp.peran_id
       WHERE pp.pengguna_id = u.id
         AND r.code = CASE u.role
          WHEN 'admin' THEN 'admin'
          WHEN 'teacher' THEN 'tutor'
          WHEN 'student' THEN 'murid'
         END
      )
   `);
   const duplicateMembershipCount = await count(client, `
    SELECT COUNT(*) AS count
    FROM (
     SELECT pengguna_id, peran_id
     FROM pengguna_peran
     GROUP BY pengguna_id, peran_id
     HAVING COUNT(*) > 1
    ) duplicates
   `);
   const missingRoleCatalogCount = await count(client, `
    SELECT COUNT(*) AS count
    FROM (SELECT 'admin' AS code UNION ALL SELECT 'tutor' UNION ALL SELECT 'murid') expected
    LEFT JOIN peran p ON p.code = expected.code
    WHERE p.id IS NULL
   `);
   const wrongRoleCatalogIdCount = await count(client, `
    SELECT COUNT(*) AS count
    FROM peran
    WHERE (code = 'admin' AND id <> ?)
       OR (code = 'tutor' AND id <> ?)
       OR (code = 'murid' AND id <> ?)
   `, [PERAN_IDS.admin, PERAN_IDS.tutor, PERAN_IDS.murid]);
   const expectedRoleMembershipCount = await count(client, `
    SELECT COUNT(*) AS count
    FROM pengguna_peran pp
    INNER JOIN peran p ON p.id = pp.peran_id
    WHERE p.code IN ('admin', 'tutor', 'murid')
   `);

   const violations: string[] = [];
   if (initial.status !== "passed") violations.push("initial-backfill-failed");
   if (rerun.status !== "passed") violations.push("rerun-backfill-failed");
   if (initial.legacyUserCount !== legacyUserCount) violations.push("legacy-user-count-drift");
   if (initial.penggunaCount !== penggunaCount && initial.penggunaCount !== legacyUserCount) violations.push("initial-pengguna-count-mismatch");
   if (rerun.changedRows !== 0) violations.push("rerun-changed-rows");
   if (missingPenggunaCount !== 0) violations.push("missing-pengguna");
   if (extraPenggunaCount !== 0) violations.push("orphan-pengguna");
   if (unsupportedRoleCount !== 0) violations.push("unsupported-legacy-role");
   if (roleMismatchCount !== 0) violations.push("role-membership-mismatch");
   if (duplicateMembershipCount !== 0) violations.push("duplicate-membership");
   if (missingRoleCatalogCount !== 0 || wrongRoleCatalogIdCount !== 0 || peranCount !== PERAN_CODES.length) violations.push("role-catalog-mismatch");
   if (expectedRoleMembershipCount < legacyUserCount) violations.push("membership-count-loss");
   if (literalReport.status !== "passed" || (literalReport.counts.unclassified ?? 0) !== 0) violations.push("role-literal-inventory-failed");
   if (smokeSeed.status !== "passed" || smokeSeed.source !== "staging_smoke_seed") violations.push("smoke-role-seed-failed");
   if (smoke.status !== "passed" || smoke.cases.some((item) => item.status !== "passed")) violations.push("auth-smoke-failed");

   const reconciliation = {
    status: violations.length === 0 ? "passed" : "failed",
    runId,
    planNumber: "002",
    sourceCommit: currentSourceCommit(),
    legacyUserCount,
    penggunaCount,
    peranCount,
    membershipCount,
    expectedRoleMembershipCount,
    missingPenggunaCount,
    extraPenggunaCount,
    unsupportedRoleCount,
    roleMismatchCount,
    duplicateMembershipCount,
    missingRoleCatalogCount,
    wrongRoleCatalogIdCount,
    initialChangedRows: initial.changedRows,
    rerunChangedRows: rerun.changedRows,
    smokeSeedStatus: smokeSeed.status,
    smokeSeedChangedRows: smokeSeed.changedRows ?? 0,
    literalInventoryStatus: literalReport.status,
    smokeStatus: smoke.status,
    violations,
    reconciliationHash: sha256Text(stableStringify({
     legacyUserCount,
     penggunaCount,
     peranCount,
     membershipCount,
     missingPenggunaCount,
     extraPenggunaCount,
     unsupportedRoleCount,
     roleMismatchCount,
     duplicateMembershipCount,
    })),
   };
   await writeArtifact(runId, "reconciliation-peran.json", reconciliation);
   await writeEvidenceArtifact({
    planNumber: "002",
    status: reconciliation.status === "passed" ? "passed" : "blocked",
    sourceCommit: currentSourceCommit(),
    migrationRunId: runId,
    resourceFingerprints: guard.resources,
    commands: [
     { command: "staging:migrate --plan 002", exitCode: 0 },
     { command: "staging:backfill-peran", exitCode: initial.status === "passed" ? 0 : 1 },
     { command: "staging:backfill-peran --rerun", exitCode: rerun.status === "passed" && rerun.changedRows === 0 ? 0 : 1 },
     { command: "staging:seed-peran-smoke", exitCode: smokeSeed.status === "passed" ? 0 : 1 },
     { command: "staging:classify-role-literals", exitCode: literalReport.status === "passed" ? 0 : 1 },
     { command: "staging:smoke-auth", exitCode: smoke.status === "passed" ? 0 : 1 },
     { command: "staging:reconcile-peran", exitCode: reconciliation.status === "passed" ? 0 : 1 },
    ],
    rowCounts: {
     user: legacyUserCount,
     pengguna: penggunaCount,
     peran: peranCount,
     pengguna_peran: membershipCount,
    },
    reconciliationHashes: {
     reconciliation: reconciliation.reconciliationHash,
     initial: initial.rowCountManifestHash ?? "missing",
     rerun: rerun.rowCountManifestHash ?? "missing",
    },
    featureFlags: Object.fromEntries(
     Object.entries(process.env).filter(([key]) => key.startsWith("FEATURE_")).map(([key, value]) => [key, value]),
    ),
    rollback: {
     attempted: false,
     passed: false,
     detail: reconciliation.status === "passed"
      ? "Legacy user.role projection remains intact; FEATURE_PERAN_V2=0 preserves the legacy authorization path."
     : "Not attempted because staging auth smoke did not pass every required role and multi-role session case.",
    },
    knownLimitations: reconciliation.status === "passed" ? undefined : reconciliation.violations,
    operatorTimestamp: new Date().toISOString(),
   });
   if (reconciliation.status === "passed") {
    await appendMigrationCheckpoint(database, {
     runId,
     phase: "reconcile-peran",
     checkpoint: "parity",
     status: "passed",
     manifestHash: reconciliation.reconciliationHash,
     rowCount: legacyUserCount,
     details: {
      penggunaCount,
      membershipCount,
      rerunChangedRows: rerun.changedRows,
     },
    });
   }
   console.log(JSON.stringify(reconciliation));
   if (reconciliation.status !== "passed") process.exitCode = 1;
  } finally {
   client.close();
  }
 } catch (error) {
  const safe = safeGuardError(error);
  const detail = error instanceof Error
   ? error.message.replace(/https?:\/\/[^\s"'`]+/gi, "[URL]").replace(/file:[^\s"'`]+/gi, "[FILE]").slice(0, 240)
   : "unknown reconcile error";
  console.error(JSON.stringify({ status: "blocked", ...safe, detail }));
  process.exitCode = 1;
 }
}

void main();
