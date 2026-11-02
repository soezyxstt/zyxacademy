import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql, eq, getTableName, is, Table } from "drizzle-orm";
import { db } from "../../lib/db";
import * as schema from "../../db/schema";
import * as extras from "../../db/schedule-extras";
import { assertTarget } from "./import-core";

assertTarget(process.env.DATABASE_URL || "", process.env.NEON_EXPECTED_HOST || "", process.env.NEON_EXPECTED_DATABASE || "");
assert.equal(process.env.NEON_BRANCH_ID, "br-cool-water-az2xxbul");
const id = `migration-smoke-${randomUUID()}`;
try {
  const scalar = await db.execute(sql`SELECT count(*) AS count, sum(v)::numeric AS total, round(avg(v)::numeric, 3) AS average FROM (VALUES (1::bigint), (2::bigint)) t(v)`);
  assert.equal(scalar.rows[0].count, 2);
  assert.equal(scalar.rows[0].total, 3);
  assert.equal(scalar.rows[0].average, 1.5);
  assert.equal((await db.execute(sql`SELECT 'Zyx' ILIKE '%zyx%' AS matches`)).rows[0].matches, true);
  const tables = Object.values({ ...schema, ...extras }).filter((value): value is Table => is(value, Table));
  for (let start = 0; start < tables.length; start += 10) {
    await Promise.all(tables.slice(start, start + 10).map((table) => db.select().from(table).limit(1)));
  }
  await assert.rejects(db.transaction(async (tx) => {
    await tx.insert(schema.user).values({ id, email: `${id}@example.invalid`, name: "Migration smoke" });
    const [row] = await tx.select().from(schema.user).where(eq(schema.user.id, id));
    assert.equal(row.emailVerified, false);
    assert.ok(row.createdAt instanceof Date);
    const changed = await tx.update(schema.user).set({ name: "Updated smoke" }).where(eq(schema.user.id, id));
    assert.equal(changed.rowCount, 1);
    throw new Error("EXPECTED_ROLLBACK");
  }), /EXPECTED_ROLLBACK/);
  assert.equal((await db.select().from(schema.user).where(eq(schema.user.id, id))).length, 0);
  const first = await db.$client.connect();
  const second = await db.$client.connect();
  try {
    await first.query("BEGIN");
    await second.query("BEGIN");
    await first.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [id]);
    assert.equal((await second.query("SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS locked", [id])).rows[0].locked, false);
    await first.query("ROLLBACK");
    assert.equal((await second.query("SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS locked", [id])).rows[0].locked, true);
  } finally {
    await first.query("ROLLBACK");
    await second.query("ROLLBACK");
    first.release();
    second.release();
  }
  console.log(JSON.stringify({status:"passed", tableQueries: tables.length, numericResults:true, dateAndBooleanMapping:true, transactionRollback:true, affectedRowCount:true, advisoryLockIsolation:true}));
} catch (error: any) {
  console.error(JSON.stringify({status:"failed", code:error?.code, causeCode:error?.cause?.code, assertion:error?.name === "AssertionError" ? error.message : undefined}));
  process.exitCode=1;
} finally { await db.$client.end(); }
