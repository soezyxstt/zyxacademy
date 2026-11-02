import { execFileSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client/web";
import { Client } from "pg";
import { AUTH_TABLES, SECRET_COLUMN, assertTarget, convert, type Conversion } from "./import-core";
import { parseSourceSchema, type SourceColumn } from "./source-schema";

type Row = Record<string, unknown>;
type Column = { name: string; type: string; conversion: Conversion };
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
const table = (name: string) => `public.${quote(name)}`;
const required = (name: string) => { const value = process.env[name]?.trim(); if (!value) throw new Error(`MISSING_ENV:${name}`); return value; };
const valueRows = (result: { rows: unknown[] }) => result.rows as Row[];

function conversion(column: SourceColumn, target: string): Conversion {
  if (column.storage === "integer" && column.mode === "boolean" && target === "boolean") return "boolean";
  if (column.storage === "integer" && column.mode === "timestamp" && target === "timestamp with time zone") return "timestamp-mixed";
  if (column.storage === "integer" && column.mode === "timestamp_ms" && target === "timestamp with time zone") return "timestamp-milliseconds";
  if (column.storage === "integer" && column.mode === "default" && ["integer", "bigint"].includes(target)) return "integer";
  if (column.storage === "real" && column.mode === "default" && ["real", "double precision"].includes(target)) return "real";
  if (column.storage === "text" && column.mode === "json" && ["json", "jsonb"].includes(target)) return "json";
  if (column.storage === "text" && column.mode === "default" && ["text", "character varying"].includes(target)) return "text";
  if (column.storage === "blob" && column.mode === "default" && target === "bytea") return "blob";
  throw new Error("UNSUPPORTED_SCHEMA_CONVERSION");
}

async function main() {
  const flags = new Set(process.argv.slice(2));
  for (const flag of flags) if (!["--apply", "--verify", "--include-sensitive-auth"].includes(flag)) throw new Error("UNKNOWN_ARGUMENT");
  const apply = flags.has("--apply");
  const verify = flags.has("--verify");
  if (apply && verify) throw new Error("CONFLICTING_IMPORT_MODES");
  const includeAuth = flags.has("--include-sensitive-auth");
  if (apply && required("NEON_TIMESTAMP_POLICY") !== "zyx-2000-2100-mixed-unit") throw new Error("TIMESTAMP_POLICY_ACK_REQUIRED");
  if (includeAuth && required("NEON_PRIVATE_TARGET_ACK") !== "private-isolated") throw new Error("PRIVATE_TARGET_ACK_REQUIRED");
  const url = required("NEON_DATABASE_URL");
  assertTarget(url, required("NEON_EXPECTED_HOST"), required("NEON_EXPECTED_DATABASE"));
  const key = required("NEON_MANIFEST_KEY");
  if (key.length < 32) throw new Error("MANIFEST_KEY_TOO_SHORT");
  const revision = required("NEON_SQLITE_SCHEMA_REVISION");
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error("INVALID_SCHEMA_REVISION");
  const sourceSchema = parseSourceSchema(["db/schema.ts", "db/schedule-extras.ts"].map((path) => execFileSync("git", ["show", `${revision}:${path}`], { encoding: "utf8" })));
  const sourceUrl = required("TURSO_DATABASE_URL");
  const sourceAddress = new URL(sourceUrl);
  if (sourceAddress.protocol !== "libsql:" || sourceAddress.hostname !== required("TURSO_EXPECTED_HOST").toLowerCase()) throw new Error("SOURCE_IDENTITY_MISMATCH");
  const snapshot = process.env.NEON_SOURCE_SNAPSHOT;
  let sourceSnapshotSha256: string | undefined;
  let source: ReturnType<typeof createClient>;
  if (snapshot) {
    const { assertSnapshotMode } = await import("./source-snapshot");
    assertSnapshotMode(createHash("sha256").update(sourceAddress.hostname).digest("hex"), process.env.NEON_SOURCE_FREEZE_ACK, includeAuth);
    const path = realpathSync(snapshot);
    const inside = relative(realpathSync(resolve(".tmp")), path);
    if (!inside || inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)) throw new Error("UNSAFE_SNAPSHOT_PATH");
    const signed = JSON.parse(readFileSync(`${path}.manifest.json`, "utf8"));
    const { verifySnapshot, assertSnapshotAuthPolicy } = await import("./source-snapshot");
    if (!verifySnapshot(path, signed, key, createHash("sha256").update(sourceAddress.hostname).digest("hex"), revision)) throw new Error("SNAPSHOT_PROVENANCE_MISMATCH");
    assertSnapshotAuthPolicy(signed.manifest, includeAuth, process.env.NEON_SOURCE_FREEZE_ACK);
    sourceSnapshotSha256 = signed.manifest.dbFileSha256;
    const { createClient: createLocalClient } = await import("@libsql/client/sqlite3");
    source = createLocalClient({ url: pathToFileURL(path).href, intMode: "bigint" });
    await source.execute("PRAGMA query_only=ON");
    for (const name of includeAuth ? [] : AUTH_TABLES) {
      if (Number(valueRows(await source.execute(`SELECT count(*) AS count FROM ${quote(name)}`))[0].count) !== 0) throw new Error("SNAPSHOT_CONTAINS_AUTH_ROWS");
    }
  } else source = createClient({
    url: sourceUrl, authToken: required("TURSO_AUTH_TOKEN"), intMode: "bigint",
    fetch: (input: RequestInfo | URL, init: RequestInit = {}) => fetch(input, { ...init, signal: AbortSignal.timeout(30000) }),
  });
  const dest = new Client({ connectionString: url, ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 30000, statement_timeout: 120000 });
  let destinationConnectionLost = false;
  dest.on("error", () => { destinationConnectionLost = true; });
  let sourceTx: Awaited<ReturnType<typeof source.transaction>> | undefined;
  let destinationOpen = false;
  try {
    console.error("Inspecting guarded read-only source snapshot");
    sourceTx = await source.transaction("read");
    if (valueRows(await sourceTx.execute("PRAGMA foreign_key_check")).length) throw new Error("SOURCE_FOREIGN_KEY_VIOLATIONS");
    const sourceMetadata = valueRows(await sourceTx.execute("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"));
    const sourceNames = sourceMetadata.map((row) => String(row.name));
    const ignored = new Set(["__drizzle_migrations"]);
    const sourceTables = sourceNames.filter((name) => !ignored.has(name));
    for (const name of sourceTables) if (!sourceSchema.has(name)) throw new Error(`SOURCE_TABLE_NOT_DECLARED:${name}`);
    console.error("Comparing isolated destination schema");
    await dest.connect();
    await dest.query(apply ? "BEGIN ISOLATION LEVEL SERIALIZABLE" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    destinationOpen = true;
    await dest.query("SET LOCAL TIME ZONE 'UTC'");
    await dest.query("SET LOCAL search_path = pg_catalog");
    const targetNames = (await dest.query("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' ORDER BY tablename")).rows.map((row) => String(row.tablename));
    if (!targetNames.length || sourceTables.some((name) => !targetNames.includes(name)) || targetNames.some((name) => !sourceTables.includes(name))) throw new Error("TABLE_SET_MISMATCH");
    if (apply) await dest.query(`LOCK TABLE ${targetNames.map(table).join(", ")} IN ACCESS EXCLUSIVE MODE`);
    for (const name of targetNames) {
      const result = await dest.query(`SELECT EXISTS (SELECT 1 FROM ${table(name)} LIMIT 1) AS present`);
      if (result.rows[0].present && !verify) throw new Error(`TARGET_NOT_EMPTY:${name}`);
    }
    const targetColumns = (await dest.query("SELECT table_name, column_name, data_type, is_identity, is_generated FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position")).rows;
    const plans = new Map<string, Column[]>();
    const sourceOrder = new Map<string, string>();
    const sourceOrdinal = new Map<string, string>();
    for (const name of sourceTables) {
      const declared = sourceSchema.get(name)!;
      const sourceInfo = valueRows(await sourceTx.execute(`PRAGMA table_info(${quote(name)})`));
      // Turso metadata scans can exceed Neon's transaction idle timeout.
      if (destinationConnectionLost) throw new Error("DESTINATION_CONNECTION_LOST");
      await dest.query("SELECT 1");
      const sourceColumns = sourceInfo.map((row) => String(row.name));
      const primary = sourceInfo.filter((row) => Number(row.pk) > 0).sort((a, b) => Number(a.pk) - Number(b.pk)).map((row) => quote(String(row.name)));
      const withoutRowid = /\bWITHOUT\s+ROWID\b/i.test(String(sourceMetadata.find((row) => row.name === name)?.sql ?? ""));
      const rowid = ["rowid", "_rowid_", "oid"].find((candidate) => !sourceColumns.some((column) => column.toLowerCase() === candidate));
      if ((withoutRowid && !primary.length) || (!withoutRowid && !rowid)) throw new Error(`UNORDERABLE_SOURCE_TABLE:${name}`);
      sourceOrder.set(name, [...primary, ...(!withoutRowid ? [rowid!] : [])].join(", "));
      const tableColumns = targetColumns.filter((row) => row.table_name === name);
      const ordinal = name === "impor_bundle" ? tableColumns.find((column) => column.column_name === "insertion_order") : undefined;
      const targets = tableColumns.filter((column) => column !== ordinal);
      if (sourceColumns.length !== declared.size || sourceColumns.some((column) => !declared.has(column)) || targets.length !== sourceColumns.length || targets.some((column) => !declared.has(column.column_name) || column.is_identity !== "NO" || column.is_generated !== "NEVER")) throw new Error(`COLUMN_SET_MISMATCH:${name}`);
      plans.set(name, targets.map((column) => ({ name: column.column_name, type: column.data_type, conversion: conversion(declared.get(column.column_name)!, column.data_type) })));
      if (name === "impor_bundle") {
        if (!ordinal || ordinal.data_type !== "bigint" || ordinal.is_identity !== "YES" || ordinal.is_generated !== "NEVER" || withoutRowid || !rowid) throw new Error("SOURCE_IMPORT_ORDINAL_REQUIRED");
        sourceOrdinal.set(name, rowid);
        plans.get(name)!.push({ name: "insertion_order", type: "bigint", conversion: "integer" });
      }
    }
    const reviewedTokens = new Set(["enrollment_tokens.token", "enrollment_token_courses.token_id", "ai_generation_jobs.token_usage", "ai_usage_events.tokens", "ai_usage_events.input_tokens", "ai_usage_events.output_tokens", "ai_generation_traces.input_tokens", "ai_generation_traces.output_tokens", "ai_allowance_leases.input_tokens", "ai_allowance_leases.output_tokens", "live_quiz_sessions.delivery_claim_token", "coding_attempts.lease_token"]);
    for (const name of sourceTables) for (const column of plans.get(name)!) {
      if (SECRET_COLUMN.test(column.name) && !AUTH_TABLES.has(name) && !reviewedTokens.has(`${name}.${column.name}`)) throw new Error(`UNCLASSIFIED_SENSITIVE_COLUMN:${name}`);
    }
    const triggers = await dest.query("SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal LIMIT 1");
    if (triggers.rowCount) throw new Error("USER_TRIGGERS_REQUIRE_REVIEW");
    const fks = (await dest.query("SELECT conrelid::regclass::text AS relation, conname, condeferrable, convalidated, confrelid::regclass::text AS referenced FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace")).rows;
    if (fks.some((fk) => !fk.convalidated || !String(fk.referenced).startsWith("public."))) throw new Error("UNVALIDATED_OR_EXTERNAL_FOREIGN_KEY");
    if (apply) {
      for (const fk of fks.filter((item) => !item.condeferrable)) await dest.query(`ALTER TABLE ${fk.relation} ALTER CONSTRAINT ${quote(fk.conname)} DEFERRABLE INITIALLY IMMEDIATE`);
      await dest.query("SET CONSTRAINTS ALL DEFERRED");
    }
    const summary: Record<string, { count: number; digest: string }> = {};
    const timestamps: Record<string, { seconds: number; milliseconds: number }> = {};
    const selected = sourceTables.filter((name) => includeAuth || !AUTH_TABLES.has(name));
    for (const name of selected) {
      const columns = plans.get(name)!;
      const sourceHashes: string[] = [];
      let offset = 0;
      for (;;) {
        const ordinal = sourceOrdinal.get(name);
        const projection = ordinal ? `*, ${quote(ordinal)} AS insertion_order` : "*";
        const batch = valueRows(await sourceTx.execute({ sql: `SELECT ${projection} FROM ${quote(name)} ORDER BY ${sourceOrder.get(name)} LIMIT ? OFFSET ?`, args: [500, offset] }));
        if (!batch.length) break;
        for (const row of batch) {
          if (name === "coding_attempts" && row.status === "pending") throw new Error("ACTIVE_CODING_ATTEMPT_REQUIRES_REVIEW");
          if (!includeAuth && name === "live_quiz_sessions" && row.delivery_claim_token !== null) throw new Error("ACTIVE_DELIVERY_CLAIM_REQUIRES_REVIEW");
          for (const column of columns.filter((item) => item.conversion === "timestamp-mixed" && row[item.name] !== null)) {
            const nameKey = `${name}.${column.name}`;
            const count = timestamps[nameKey] ??= { seconds: 0, milliseconds: 0 };
            if (Number(row[column.name]) < 100000000000) count.seconds++; else count.milliseconds++;
          }
        }
        const batchSize = Math.max(1, Math.min(200, Math.floor(60000 / columns.length)));
        for (let start = 0; start < batch.length; start += batchSize) {
          const chunk = batch.slice(start, start + batchSize);
          const values: unknown[] = [];
          const tuples = chunk.map((row) => `(${columns.map((column) => { values.push(convert(row[column.name], column.conversion)); return `$${values.length}::${column.type}`; }).join(", ")})`).join(", ");
          const aliases = columns.map((column) => quote(column.name)).join(", ");
          const rowExpression = `to_jsonb(ARRAY[${columns.map((column) => `${quote(column.name)}::text`).join(", ")}]::text[])::text`;
          const canonical = await dest.query(`SELECT ${rowExpression} AS row FROM (VALUES ${tuples}) AS v(${aliases})`, values);
          for (const row of canonical.rows) sourceHashes.push(createHmac("sha256", key).update(row.row).digest("hex"));
          if (apply) await dest.query(`INSERT INTO ${table(name)} (${aliases}) VALUES ${tuples}`, values);
        }
        offset += batch.length;
      }
      sourceHashes.sort();
      const digest = createHmac("sha256", key).update(JSON.stringify(sourceHashes)).digest("hex");
      if (apply || verify) {
        const targetHashes: string[] = [];
        for (let start = 0;; start += 500) {
          const result = await dest.query(`SELECT to_jsonb(ARRAY[${columns.map((column) => `${quote(column.name)}::text`).join(", ")}]::text[])::text AS canonical_row FROM ${table(name)} ORDER BY canonical_row LIMIT 500 OFFSET $1`, [start]);
          for (const row of result.rows) targetHashes.push(createHmac("sha256", key).update(row.canonical_row).digest("hex"));
          if (result.rows.length < 500) break;
        }
        targetHashes.sort();
        if (targetHashes.length !== sourceHashes.length || createHmac("sha256", key).update(JSON.stringify(targetHashes)).digest("hex") !== digest) throw new Error(`RECONCILIATION_FAILED:${name}`);
      }
      summary[name] = { count: sourceHashes.length, digest };
    }
    if (apply) {
      await dest.query("SELECT setval(pg_get_serial_sequence('public.impor_bundle', 'insertion_order'), COALESCE((SELECT max(insertion_order) FROM public.impor_bundle), 1), EXISTS(SELECT 1 FROM public.impor_bundle))");
      await dest.query("SET CONSTRAINTS ALL IMMEDIATE");
      for (const fk of fks.filter((item) => !item.condeferrable)) await dest.query(`ALTER TABLE ${fk.relation} ALTER CONSTRAINT ${quote(fk.conname)} NOT DEFERRABLE`);
      await dest.query("COMMIT");
    } else await dest.query("ROLLBACK");
    destinationOpen = false;
    console.log(JSON.stringify({ status: "ok", mode: apply ? "applied" : verify ? "verified" : "dry-run", source: snapshot ? "signed-local-snapshot" : "Turso-read-transaction", sourceSnapshotSha256, timestampPolicy: "zyx-2000-2100-mixed-unit", timestampUnits: timestamps, schemaRevision: revision, excludedTables: sourceNames.filter((name) => ignored.has(name) || (!includeAuth && AUTH_TABLES.has(name))), tables: summary }));
  } finally {
    if (destinationOpen) await dest.query("ROLLBACK").catch(() => {});
    if (sourceTx) await sourceTx.rollback().catch(() => {});
    source.close();
    await dest.end().catch(() => {});
  }
}

main().catch((error) => {
  const diagnostic = Object.fromEntries(["name", "code", "table", "column", "constraint"].flatMap((key) => {
    const value = error?.[key];
    return typeof value === "string" && /^[A-Za-z0-9_]{1,160}$/.test(value) ? [[key, value]] : [];
  }));
  console.error(JSON.stringify({ error: "IMPORT_DIAGNOSTIC", ...diagnostic }));
  const message = error instanceof Error && /^[A-Z_]+(?::[A-Za-z0-9_]+)?$/.test(error.message) ? error.message : "IMPORT_FAILED_REVIEW_CONFIGURATION_OR_SCHEMA";
  console.error(message);
  process.exitCode = 1;
});
