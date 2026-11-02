import { execFileSync } from "node:child_process";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { closeSync, existsSync, openSync, readFileSync, realpathSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { createClient } from "@libsql/client/web";
import { AUTH_TABLES } from "./import-core";
import { parseSourceSchema, type SourceSchema } from "./source-schema";

const MAX_BYTES = 256 * 1024 * 1024;
const FINGERPRINT = "12dd1a4c11dc";
const q = (s: string) => `"${s.replaceAll('"', '""')}"`;
type Column = { name: string; type: string; pk: number; hidden: number };
export type Table = { name: string; sql: string; columns: Column[]; rowid: string | null };
type MetadataRow = { name: string; sql: string; type: string; tbl_name: string };
export type SnapshotManifest = { sourceHostnameHash: string; schemaRevision: string; dbFileSha256: string; rowCounts: Record<string, number>; excludedAuthTables: string[]; snapshotTimestamp: string; consistentSingleStatement: true };
export type SignedManifest = { manifest: SnapshotManifest; hmac: string };
const hash = (s: string | Uint8Array) => createHash("sha256").update(s).digest("hex");
const mac = (manifest: SnapshotManifest, key: string) => createHmac("sha256", key).update(JSON.stringify(manifest)).digest("hex");

export function assertSource(url: string, expectedHost: string): string {
  const u = new URL(url);
  if (u.protocol !== "libsql:" || u.hostname !== expectedHost.toLowerCase() || !expectedHost || u.username || u.password || u.port || u.pathname !== "" && u.pathname !== "/" || u.search || u.hash || hash(u.hostname).slice(0, 12) !== FINGERPRINT) throw new Error("SOURCE_IDENTITY_MISMATCH");
  return hash(u.hostname);
}
export function assertOutputPath(path: string, root = resolve(".tmp")): string {
  const realRoot = realpathSync(root);
  if (realRoot.toLowerCase() !== resolve(root).toLowerCase()) throw new Error("UNSAFE_OUTPUT_PATH");
  const target = resolve(path);
  const parent = realpathSync(dirname(target));
  const rel = relative(realRoot, parent);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel) || target !== resolve(parent, target.slice(dirname(target).length + 1)) || existsSync(target) || existsSync(`${target}.manifest.json`)) throw new Error("UNSAFE_OUTPUT_PATH");
  return target;
}
export function signManifest(manifest: SnapshotManifest, key: string): SignedManifest {
  if (key.length < 32) throw new Error("MANIFEST_KEY_TOO_SHORT");
  return { manifest, hmac: mac(manifest, key) };
}
export function verifySnapshot(file: string, signed: SignedManifest, key: string, sourceHostnameHash: string, schemaRevision: string): boolean {
  if (key.length < 32 || !/^[a-f0-9]{64}$/.test(signed.hmac) || !/^[a-f0-9]{64}$/.test(sourceHostnameHash)) return false;
  const expected = Buffer.from(mac(signed.manifest, key), "hex");
  return timingSafeEqual(expected, Buffer.from(signed.hmac, "hex")) && signed.manifest.sourceHostnameHash === sourceHostnameHash && sourceHostnameHash.startsWith(FINGERPRINT) && signed.manifest.schemaRevision === schemaRevision && signed.manifest.consistentSingleStatement === true && statSync(file).size <= MAX_BYTES && hash(readFileSync(file)) === signed.manifest.dbFileSha256;
}
export function planTables(metadata: MetadataRow[], infos: Map<string, Column[]>, declared: SourceSchema): Table[] {
  const tables = metadata.filter((m) => m.type === "table");
  const names = new Set(tables.map((t) => t.name));
  if (names.size !== tables.length || [...declared.keys()].some((name) => !names.has(name))) throw new Error("SOURCE_TABLE_SET_MISMATCH");
  return tables.map(({ name, sql }) => {
    const schema = declared.get(name);
    if (!schema && name !== "__drizzle_migrations") throw new Error("SOURCE_TABLE_NOT_DECLARED");
    const columns = infos.get(name);
    if (!sql || !columns?.length || columns.some((c) => c.hidden !== 0) || (schema && (columns.length !== schema.size || columns.some((c) => !schema.has(c.name) || c.type.toLowerCase() !== schema.get(c.name)!.storage)))) throw new Error("SOURCE_COLUMN_MISMATCH");
    const without = /\bWITHOUT\s+ROWID\b/i.test(sql);
    const rowid = without ? null : ["rowid", "_rowid_", "oid"].find((candidate) => !columns.some((c) => c.name.toLowerCase() === candidate)) ?? null;
    if (without ? !columns.some((c) => c.pk > 0) : !rowid) throw new Error("UNORDERABLE_SOURCE_TABLE");
    return { name, sql, columns, rowid };
  });
}
// JSON's default number formatting loses precision, so numeric values travel as text.
const encoded = (expr: string) => `json_array(typeof(${expr}),CASE typeof(${expr}) WHEN 'integer' THEN CAST(${expr} AS TEXT) WHEN 'real' THEN printf('%!.17g',${expr}) WHEN 'blob' THEN hex(${expr}) ELSE ${expr} END)`;
export function snapshotSql(tables: Table[]): string {
  const selected = tables.filter((t) => !AUTH_TABLES.has(t.name) && t.name !== "__drizzle_migrations");
  if (selected.length + 1 > 500) throw new Error("TOO_MANY_SNAPSHOT_TABLES");
  const rows = selected.map((t) => `('${t.name.replaceAll("'", "''")}', (SELECT COALESCE(json_group_array(json_array(${[...t.columns.map((c) => encoded(q(c.name))), ...(t.rowid ? [encoded(q(t.rowid))] : [])].join(",")})), '[]') FROM ${q(t.name)}))`);
  rows.push("('__foreign_key_check__', (SELECT CAST(count(*) AS TEXT) FROM pragma_foreign_key_check))");
  return `WITH snapshot_rows(name, data) AS (VALUES ${rows.join(",")}) SELECT name, data FROM snapshot_rows`;
}
export function decodeValue(value: unknown): string | number | bigint | Uint8Array | null {
  if (!Array.isArray(value) || value.length !== 2) throw new Error("INVALID_SNAPSHOT_VALUE");
  const [type, v] = value;
  if (type === "null" && v === null) return null;
  if (type === "integer" && typeof v === "string" && /^-?(0|[1-9][0-9]*)$/.test(v)) { const n = BigInt(v); if (n >= -(1n << 63n) && n < (1n << 63n)) return n; }
  if (type === "blob" && typeof v === "string" && /^(?:[0-9A-F]{2})*$/.test(v)) return Buffer.from(v, "hex");
  if (type === "text" && typeof v === "string") return v;
  if (type === "real" && typeof v === "string" && /^-?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:e[+-]?[0-9]+)?$/i.test(v) && Number.isFinite(Number(v))) return Number(v);
  throw new Error("INVALID_SNAPSHOT_VALUE");
}

// Parent calls this only after independently verifying the staging freeze.
export async function exportSourceSnapshot(outputPath: string): Promise<SignedManifest> {
  if (process.env.NEON_SOURCE_FREEZE_ACK !== "staging-writes-frozen") throw new Error("SOURCE_FREEZE_ACK_REQUIRED");
  const { parse } = await import("dotenv");
  const sourceEnv = parse(readFileSync(resolve(".env.neon-staging-cutover-source")));
  const required = (name: string) => { const value = sourceEnv[name]?.trim(); if (!value) throw new Error(`MISSING_ENV:${name}`); return value; };
  const sourceUrl = required("TURSO_DATABASE_URL");
  const sourceHostnameHash = assertSource(sourceUrl, required("TURSO_EXPECTED_HOST"));
  const authToken = required("TURSO_AUTH_TOKEN");
  const key = required("NEON_MANIFEST_KEY");
  if (key.length < 32) throw new Error("MANIFEST_KEY_TOO_SHORT");
  const revision = required("NEON_SQLITE_SCHEMA_REVISION");
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error("INVALID_SCHEMA_REVISION");
  const declared = parseSourceSchema(["db/schema.ts", "db/schedule-extras.ts"].map((p) => execFileSync("git", ["show", `${revision}:${p}`], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 })));
  const output = assertOutputPath(outputPath);
  // Exclusive creation avoids overwriting a prior snapshot.
  closeSync(openSync(output, "wx", 0o600));
  let manifestCreated = false;
  let source: ReturnType<typeof createClient> | undefined;
  let db: import("bun:sqlite").Database | undefined;
  try {
  const { Database } = await import("bun:sqlite");
  source = createClient({ url: sourceUrl, authToken, intMode: "bigint", fetch: async (input, init) => {
    const response = await fetch(input, { ...init, signal: AbortSignal.timeout(120000) });
    if (!response.body) return response;
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_BYTES) { await reader.cancel(); throw new Error("SNAPSHOT_TOO_LARGE"); } chunks.push(value); }
    return new Response(Buffer.concat(chunks), { status: response.status, statusText: response.statusText, headers: response.headers });
  } });
    const metadata = (await source.execute("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY type, name")).rows as unknown as MetadataRow[];
    const infos = new Map<string, Column[]>();
    const tableMetadata = metadata.filter((m) => m.type === "table");
    const descriptions = await source.batch(tableMetadata.map((item) => `PRAGMA table_xinfo(${q(item.name)})`), "read");
    for (const [index, item] of tableMetadata.entries()) {
      const result = descriptions[index];
      infos.set(item.name, result.rows.map((r) => ({ name: String(r.name), type: String(r.type), pk: Number(r.pk), hidden: Number(r.hidden) })));
    }
    const tables = planTables(metadata, infos, declared);
    const result = await source.execute(snapshotSql(tables));
    const snapshotTimestamp = new Date().toISOString();
    const data = new Map(result.rows.map((r) => [String(r.name), String(r.data)]));
    if (data.size !== result.rows.length || data.get("__foreign_key_check__") !== "0") throw new Error("SOURCE_FOREIGN_KEY_VIOLATIONS");
    db = new Database(output); db.exec("PRAGMA foreign_keys=OFF"); db.exec(`PRAGMA max_page_count=${Math.floor(MAX_BYTES / 4096)}`);
    db.exec("BEGIN");
    for (const t of tables) db.exec(t.sql);
    for (const index of metadata.filter((m) => m.type === "index")) { if (!tables.some((t) => t.name === index.tbl_name)) throw new Error("UNCLASSIFIED_INDEX"); db.exec(index.sql); }
    const rowCounts: Record<string, number> = {};
    for (const t of tables) {
      if (AUTH_TABLES.has(t.name) || t.name === "__drizzle_migrations") { rowCounts[t.name] = 0; continue; }
      const raw = data.get(t.name); if (raw === undefined) throw new Error("MISSING_SNAPSHOT_TABLE");
      const rows: unknown = JSON.parse(raw); if (!Array.isArray(rows)) throw new Error("INVALID_SNAPSHOT_ROWS");
      const cols = [...t.columns.map((c) => q(c.name)), ...(t.rowid ? [q(t.rowid)] : [])];
      const insert = db.prepare(`INSERT INTO ${q(t.name)} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`);
      try {
        for (const row of rows) { if (!Array.isArray(row) || row.length !== cols.length) throw new Error("INVALID_SNAPSHOT_ROW"); insert.run(...row.map(decodeValue)); }
      } finally { insert.finalize(); }
      rowCounts[t.name] = rows.length;
    }
    db.exec("COMMIT"); db.close(); db = undefined;
    if (statSync(output).size > MAX_BYTES) throw new Error("SNAPSHOT_TOO_LARGE");
    const signed = signManifest({ sourceHostnameHash, schemaRevision: revision, dbFileSha256: hash(readFileSync(output)), rowCounts, excludedAuthTables: [...AUTH_TABLES].sort(), snapshotTimestamp, consistentSingleStatement: true }, key);
    writeFileSync(`${output}.manifest.json`, JSON.stringify(signed), { flag: "wx", mode: 0o600 }); manifestCreated = true;
    return signed;
  } catch (error) { if (db) db.close(); if (!manifestCreated) unlinkSync(output); throw error; }
  finally { source?.close(); }
}
