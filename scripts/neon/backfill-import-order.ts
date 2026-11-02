import assert from "node:assert/strict";
import { createClient } from "@libsql/client/web";
import { Client } from "pg";
import { assertTarget } from "./import-core";

async function main() {
  const destination = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
  assertTarget(destination, process.env.NEON_EXPECTED_HOST ?? "", process.env.NEON_EXPECTED_DATABASE ?? "");
  assert.equal(process.env.NEON_BRANCH_ID, "br-cool-water-az2xxbul");
  const sourceUrl = new URL(process.env.TURSO_DATABASE_URL ?? "");
  assert.equal(sourceUrl.protocol, "libsql:");
  assert.equal(sourceUrl.hostname, process.env.TURSO_EXPECTED_HOST);
  const source = createClient({ url: sourceUrl.href, authToken: process.env.TURSO_AUTH_TOKEN, intMode: "bigint" });
  const target = new Client({ connectionString: destination });
  const snapshot = await source.transaction("read");
  let transaction = false;
  try {
    const rows = await snapshot.execute('SELECT id, rowid AS insertion_order FROM "impor_bundle"');
    const ordinals = new Map(rows.rows.map(row => {
      const value = Number(row.insertion_order);
      assert.ok(Number.isSafeInteger(value) && value > 0);
      return [String(row.id), value] as const;
    }));
    await target.connect();
    assert.equal((await target.query("SELECT current_database() AS name")).rows[0].name, process.env.NEON_EXPECTED_DATABASE);
    await target.query("BEGIN"); transaction = true;
    await target.query("LOCK TABLE public.impor_bundle IN EXCLUSIVE MODE");
    const before = await target.query("SELECT id, insertion_order FROM public.impor_bundle ORDER BY id");
    assert.ok(before.rows.every(row => ordinals.has(row.id)), "SOURCE_IMPORT_ID_MISSING");
    for (const row of before.rows) await target.query("UPDATE public.impor_bundle SET insertion_order = $1 WHERE id = $2", [ordinals.get(row.id), row.id]);
    await target.query("SELECT setval(pg_get_serial_sequence('public.impor_bundle', 'insertion_order'), COALESCE((SELECT max(insertion_order) FROM public.impor_bundle), 1), EXISTS(SELECT 1 FROM public.impor_bundle))");
    const after = await target.query("SELECT id, insertion_order FROM public.impor_bundle ORDER BY id");
    assert.equal(after.rowCount, before.rowCount);
    assert.ok(after.rows.every(row => Number(row.insertion_order) === ordinals.get(row.id)));
    await target.query("COMMIT"); transaction = false;
    console.log(JSON.stringify({ status: "passed", environment: "neon-migration", sourceMode: "read-only", before: before.rowCount, after: after.rowCount, insertionOrderVerified: true }));
  } finally {
    if (transaction) await target.query("ROLLBACK").catch(() => {});
    await snapshot.rollback().catch(() => {}); source.close(); await target.end();
  }
}
main().catch(() => { console.error("ISOLATED_IMPORT_ORDER_BACKFILL_FAILED"); process.exitCode = 1; });
