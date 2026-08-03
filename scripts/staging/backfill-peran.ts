import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { and, eq } from "drizzle-orm";
import { join } from "node:path";
import * as schema from "@/db/schema";
import {
 assertStagingEnvironment,
 parseEnvFile,
 resolveDatabaseConnection,
 safeGuardError,
} from "@/lib/staging/staging-guard";
import {
 appendMigrationCheckpoint,
 currentSourceCommit,
 hmacText,
 parseCliArgs,
 requiredCliArg,
 requireManifestKey,
 stableStringify,
 writeArtifact,
} from "@/lib/staging/migration-ledger";
import {
 mapLegacyRole,
 membershipIdFor,
 PERAN_SEEDS,
 peranIdFor,
 type PeranCode,
} from "@/lib/auth/peran";

type LegacyUser = {
 id: string;
 role: unknown;
 createdAt: unknown;
 updatedAt: unknown;
};

type Row = Record<string, unknown>;

const BATCH_SIZE = 100;

function rows(result: { rows: unknown[] }): Row[] {
 return result.rows as Row[];
}

function toDate(value: unknown): Date | undefined {
 if (value instanceof Date) return value;
 if (typeof value === "number" && Number.isFinite(value)) {
  return new Date(value < 100000000000 ? value * 1000 : value);
 }
 if (typeof value === "string" && value.trim()) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return new Date(numeric < 100000000000 ? numeric * 1000 : numeric);
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed;
 }
 return undefined;
}

async function tableExists(client: ReturnType<typeof createClient>, name: string): Promise<boolean> {
 const result = await client.execute({
  sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
  args: [name],
 });
 return result.rows.length > 0;
}

async function loadLegacyUsers(client: ReturnType<typeof createClient>): Promise<LegacyUser[]> {
 const result = await client.execute(
  "SELECT id, role, created_at, updated_at FROM user ORDER BY id",
 );
 return rows(result).map((row) => ({
  id: String(row.id),
  role: row.role,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
 }));
}

async function main(): Promise<void> {
 const args = parseCliArgs();
 const runId = requiredCliArg(args, "run-id");
 const rerun = args.rerun === true;

 try {
  const manifestKey = requireManifestKey();
  const staging = assertStagingEnvironment({
   productionEnv: parseEnvFile(join(process.cwd(), ".env.prod")),
   requireMutation: true,
   requiredResources: ["database", "authUrl"],
  });
  const connection = resolveDatabaseConnection(process.env);
  const client = createClient(connection);
  const database = drizzle(client, { schema });

  try {
   for (const tableName of ["user", "pengguna", "peran", "pengguna_peran"]) {
    if (!(await tableExists(client, tableName))) throw new Error(`Missing required table: ${tableName}`);
   }

   const users = await loadLegacyUsers(client);
   const unsupported = new Map<string, number>();
   for (const user of users) {
    const value = user.role === null || user.role === undefined || user.role === ""
     ? "<null>"
     : String(user.role);
    if (!mapLegacyRole(user.role)) unsupported.set(value, (unsupported.get(value) ?? 0) + 1);
   }
   if (unsupported.size > 0) {
    const report = {
     status: "blocked",
     runId,
     pass: rerun ? "rerun" : "initial",
     legacyUserCount: users.length,
     unsupportedLegacyRoles: Object.fromEntries([...unsupported.entries()].sort(([left], [right]) => left.localeCompare(right))),
     sourceCommit: currentSourceCommit(),
    };
    await writeArtifact(runId, rerun ? "backfill-peran-rerun.json" : "backfill-peran.json", report);
    console.log(JSON.stringify(report));
    process.exitCode = 1;
    return;
   }

   let insertedPengguna = 0;
   let existingPengguna = 0;
   let insertedMemberships = 0;
   let existingMemberships = 0;
   let insertedPeran = 0;
   let existingPeran = 0;

   await database.transaction(async (tx) => {
    for (const seed of PERAN_SEEDS) {
     const existing = await tx.select({ id: schema.peran.id, code: schema.peran.code })
      .from(schema.peran)
      .where(eq(schema.peran.code, seed.code))
      .limit(1);
     if (existing.length === 0) {
      await tx.insert(schema.peran).values(seed);
      insertedPeran += 1;
     } else {
      if (existing[0].id !== seed.id) throw new Error(`Peran id mismatch for ${seed.code}`);
      existingPeran += 1;
     }
    }
   });

   for (let offset = 0; offset < users.length; offset += BATCH_SIZE) {
    const batch = users.slice(offset, offset + BATCH_SIZE);
    await database.transaction(async (tx) => {
     for (const legacyUser of batch) {
      const mapped = mapLegacyRole(legacyUser.role) as PeranCode;
      const existingIdentity = await tx.select({
       id: schema.pengguna.id,
       status: schema.pengguna.status,
      })
       .from(schema.pengguna)
       .where(eq(schema.pengguna.id, legacyUser.id))
       .limit(1);
      if (existingIdentity.length === 0) {
       await tx.insert(schema.pengguna).values({
        id: legacyUser.id,
        status: "active",
        createdAt: toDate(legacyUser.createdAt) ?? new Date(),
        updatedAt: toDate(legacyUser.updatedAt) ?? new Date(),
       });
       insertedPengguna += 1;
      } else {
       existingPengguna += 1;
      }

      const membershipId = membershipIdFor(legacyUser.id, mapped);
      const roleId = peranIdFor(mapped);
      const existingMembership = await tx.select({
       id: schema.penggunaPeran.id,
       penggunaId: schema.penggunaPeran.penggunaId,
       peranId: schema.penggunaPeran.peranId,
      })
       .from(schema.penggunaPeran)
       .where(and(
        eq(schema.penggunaPeran.penggunaId, legacyUser.id),
        eq(schema.penggunaPeran.peranId, roleId),
       ))
       .limit(1);
      if (existingMembership.length === 0) {
       await tx.insert(schema.penggunaPeran).values({
        id: membershipId,
        penggunaId: legacyUser.id,
        peranId: roleId,
        source: "legacy_user_role",
        auditActorPenggunaId: null,
       });
       insertedMemberships += 1;
      } else {
       if (existingMembership[0].id !== membershipId) throw new Error(`Membership id mismatch for ${legacyUser.id}`);
       existingMemberships += 1;
      }
     }
    });
   }

   const counts = await Promise.all([
    client.execute("SELECT COUNT(*) AS count FROM user"),
    client.execute("SELECT COUNT(*) AS count FROM pengguna"),
    client.execute("SELECT COUNT(*) AS count FROM peran"),
    client.execute("SELECT COUNT(*) AS count FROM pengguna_peran"),
   ]);
   const report = {
    status: "passed",
    runId,
    pass: rerun ? "rerun" : "initial",
    sourceCommit: currentSourceCommit(),
    databaseFingerprint: staging.resources.find((item) => item.key === "database")?.hash ?? "unknown",
    legacyUserCount: Number(rows(counts[0])[0]?.count ?? 0),
    penggunaCount: Number(rows(counts[1])[0]?.count ?? 0),
    peranCount: Number(rows(counts[2])[0]?.count ?? 0),
    membershipCount: Number(rows(counts[3])[0]?.count ?? 0),
    insertedPeran,
    existingPeran,
    insertedPengguna,
    existingPengguna,
    insertedMemberships,
    existingMemberships,
    changedRows: insertedPeran + insertedPengguna + insertedMemberships,
    rowCountManifestHash: hmacText(manifestKey, stableStringify({
     legacyUserCount: users.length,
     penggunaCount: Number(rows(counts[1])[0]?.count ?? 0),
     membershipCount: Number(rows(counts[3])[0]?.count ?? 0),
    })),
   };
   const runExists = await tableExists(client, "migration_runs");
   if (runExists) {
    await appendMigrationCheckpoint(database, {
     runId,
     phase: "backfill-peran",
     checkpoint: rerun ? "rerun" : "initial",
     status: "passed",
     manifestHash: report.rowCountManifestHash,
     rowCount: report.changedRows,
     details: {
      insertedPengguna,
      insertedMemberships,
      insertedPeran,
     },
    });
   }
   await writeArtifact(runId, rerun ? "backfill-peran-rerun.json" : "backfill-peran.json", report);
   console.log(JSON.stringify({
    status: "passed",
    runId,
    pass: report.pass,
    legacyUserCount: report.legacyUserCount,
    penggunaCount: report.penggunaCount,
    membershipCount: report.membershipCount,
    changedRows: report.changedRows,
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
