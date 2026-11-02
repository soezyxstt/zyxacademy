import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertOutputPath, assertSource, decodeValue, exportSourceSnapshot, planTables, signManifest, snapshotSql, verifySnapshot, type Table } from "./source-snapshot";
import { parseSourceSchema } from "./source-schema";

const schema = parseSourceSchema([`sqliteTable("item", { id: integer("id"), payload: blob("payload"), label: text("label") }); sqliteTable("account", { id: text("id") });`]);
const meta = [ { type: "table", name: "item", tbl_name: "item", sql: 'CREATE TABLE item (id INTEGER, payload BLOB, label TEXT)' }, { type: "table", name: "account", tbl_name: "account", sql: 'CREATE TABLE account (id TEXT)' } ];
const infos = new Map([ ["item", [{name:"id",type:"INTEGER",pk:0,hidden:0},{name:"payload",type:"BLOB",pk:0,hidden:0},{name:"label",type:"TEXT",pk:0,hidden:0}]], ["account", [{name:"id",type:"TEXT",pk:0,hidden:0}]] ]);

test("schema classification and rowid selection", () => {
  expect(planTables(meta, infos, schema)[0].rowid).toBe("rowid");
  expect(() => planTables(meta, infos, new Map())).toThrow("SOURCE_TABLE_NOT_DECLARED");
  expect(() => planTables(meta, new Map(), schema)).toThrow("SOURCE_COLUMN_MISMATCH");
  const t = { ...meta[0], sql: 'CREATE TABLE item (rowid TEXT, _rowid_ TEXT, oid TEXT)' };
  expect(() => planTables([t], new Map([["item", ["rowid", "_rowid_", "oid"].map(name => ({ name, type:"TEXT", pk:0, hidden:0 }))]]), parseSourceSchema([`sqliteTable("item", {a:text("rowid"),b:text("_rowid_"),c:text("oid")})`]))).toThrow("UNORDERABLE_SOURCE_TABLE");
});

test("single statement excludes auth and preserves 64-bit integer, blob, and rowid", () => {
  const db = new Database(":memory:");
  db.exec(meta[0].sql); db.exec(meta[1].sql);
  db.exec("INSERT INTO item(rowid,id,payload,label) VALUES (123,9223372036854775807,X'00FF','ok')");
  db.exec("INSERT INTO account VALUES ('private')");
  const tables = planTables(meta, infos, schema);
  const sql = snapshotSql(tables);
  expect(sql).not.toContain('FROM "account"');
  const result = db.query(sql).all() as { name: string; data: string }[];
  expect(result).toHaveLength(2);
  const row = JSON.parse(result.find(x => x.name === "item")!.data)[0].map(decodeValue);
  expect(row).toEqual([9223372036854775807n, new Uint8Array([0,255]), "ok", 123n]);
  const copy = new Database(":memory:"); copy.exec(meta[0].sql);
  copy.prepare("INSERT INTO item(id,payload,label,rowid) VALUES (?,?,?,?)").run(...row);
  expect(copy.query("SELECT CAST(id AS TEXT) id, rowid FROM item").get()).toEqual({ id:"9223372036854775807", rowid:123 });
  copy.close(); db.close();
});

test("without rowid and snapshot table bound", () => {
  const table: Table = { name:"item", sql:"CREATE TABLE item (id INTEGER PRIMARY KEY) WITHOUT ROWID", columns:[{name:"id",type:"INTEGER",pk:1,hidden:0}], rowid:null };
  expect(snapshotSql([table])).not.toContain('"rowid"');
  expect(() => snapshotSql(Array.from({length:500}, (_, i) => ({...table,name:`t${i}`})))).toThrow("TOO_MANY_SNAPSHOT_TABLES");
});

test("one VALUES statement snapshots more than 100 tables without a compound SELECT", () => {
  const db = new Database(":memory:");
  try {
    const tables: Table[] = Array.from({ length: 190 }, (_, index) => ({ name: `t${index}`, sql: `CREATE TABLE t${index} (id INTEGER)`, columns: [{ name: "id", type: "INTEGER", pk: 0, hidden: 0 }], rowid: "rowid" }));
    for (const table of tables) db.exec(table.sql);
    const sql = snapshotSql(tables);
    expect(sql).not.toContain("UNION ALL");
    expect(db.query(sql).all()).toHaveLength(191);
  } finally { db.close(); }
});

test("unsafe paths and wrong source are rejected", () => {
  const root = mkdtempSync(join(process.cwd(), ".tmp-test-"));
  try {
    expect(assertOutputPath(join(root,"new.db"), root)).toBe(join(root,"new.db"));
    expect(() => assertOutputPath(join(root,"..","outside.db"), root)).toThrow();
    writeFileSync(join(root,"used.db"), "x");
    expect(() => assertOutputPath(join(root,"used.db"), root)).toThrow();
    expect(() => assertSource("libsql://wrong.example", "wrong.example")).toThrow("SOURCE_IDENTITY_MISMATCH");
  } finally { rmSync(root, {recursive:true, force:true}); }
});

test("missing freeze acknowledgement stops before source access", async () => {
  const prior = process.env.NEON_SOURCE_FREEZE_ACK;
  delete process.env.NEON_SOURCE_FREEZE_ACK;
  try { await expect(exportSourceSnapshot("unused.db")).rejects.toThrow("SOURCE_FREEZE_ACK_REQUIRED"); }
  finally { if (prior === undefined) delete process.env.NEON_SOURCE_FREEZE_ACK; else process.env.NEON_SOURCE_FREEZE_ACK = prior; }
});

test("manifest detects changed file, MAC and source", () => {
  const root = mkdtempSync(join(process.cwd(), ".tmp-test-"));
  try {
    const file = join(root,"data.db"); writeFileSync(file,"content");
    const sourceHostnameHash = "12dd1a4c11dc" + "0".repeat(52);
    const manifest = {sourceHostnameHash,schemaRevision:"a".repeat(40),dbFileSha256:new Bun.CryptoHasher("sha256").update(readFileSync(file)).digest("hex"),rowCounts:{item:1},excludedAuthTables:["account"],snapshotTimestamp:new Date().toISOString(),consistentSingleStatement:true as const};
    const signed = signManifest(manifest, "k".repeat(32));
    expect(verifySnapshot(file,signed,"k".repeat(32),sourceHostnameHash,manifest.schemaRevision)).toBe(true);
    expect(verifySnapshot(file,signed,"x".repeat(32),sourceHostnameHash,manifest.schemaRevision)).toBe(false);
    expect(verifySnapshot(file,signed,"k".repeat(32),"0".repeat(64),manifest.schemaRevision)).toBe(false);
    writeFileSync(file,"changed"); expect(verifySnapshot(file,signed,"k".repeat(32),sourceHostnameHash,manifest.schemaRevision)).toBe(false);
  } finally { rmSync(root, {recursive:true, force:true}); }
});

test("reconstructed SQLite is readable by the real libsql file client", () => {
  const root = mkdtempSync(join(process.cwd(), ".tmp-test-"));
  try {
    const file = join(root,"snapshot.db");
    const db = new Database(file);
    db.exec('CREATE TABLE item (id INTEGER, payload BLOB, label TEXT)');
    db.exec('CREATE INDEX item_label_idx ON item(label)');
    db.prepare('INSERT INTO item(rowid,id,payload,label) VALUES (?,?,?,?)').run(123n,9223372036854775807n,new Uint8Array([0,255]),"ok");
    db.close();
    execFileSync(process.execPath, ["-e", `
      const { createClient } = require("@libsql/client");
      (async () => {
        const client = createClient({ url: "file:" + process.argv[1].replaceAll("\\\\", "/"), intMode: "bigint" });
        const result = await client.execute("SELECT rowid, id, hex(payload) AS payload FROM item");
        if (result.rows[0].id !== 9223372036854775807n || result.rows[0].rowid !== 123n || result.rows[0].payload !== "00FF") process.exitCode = 1;
        client.close();
      })().catch(() => { process.exitCode = 1; });
    `, file]);
  } finally { rmSync(root,{recursive:true,force:true}); }
});
