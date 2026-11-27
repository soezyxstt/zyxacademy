import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { fixtureCookie } from "./cookie.mjs";

const collection = "http://127.0.0.1:3314/api/native/academic-administration/users";
const origin = "http://localhost:3314";
const pool = new pg.Pool({ connectionString: "postgres://postgres:academic-local-only@127.0.0.1:55434/academic" });
const runId = randomUUID();
const legacyId = `native-status-legacy-${runId}`;
const rolelessId = `native-status-roleless-${runId}`;
const firstAdmin = `native-status-admin-one-${runId}`;
const secondAdmin = `native-status-admin-two-${runId}`;
const ids = [legacyId, rolelessId, firstAdmin, secondAdmin];
const adminId = "academic-admin";
const admin = fixtureCookie("admin");
const otherSession = fixtureCookie(`status-${runId}`);

function patch(id, draft, requestId = randomUUID(), cookie = admin, requestOrigin = origin) {
  return fetch(`${collection}/${encodeURIComponent(id)}/status`, {
    method: "PATCH", redirect: "manual",
    headers: { ...(cookie ? { cookie } : {}), Origin: requestOrigin,
      "Content-Type": "application/json", "Idempotency-Key": requestId },
    body: JSON.stringify(draft),
  });
}

async function readRow(id, search = id) {
  const response = await fetch(`${collection}?search=${encodeURIComponent(search)}`, { headers: { cookie: admin }, redirect: "manual" });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  const { rows } = await response.json();
  return rows.find((entry) => entry.id === id);
}

async function roles(id) {
  const result = await pool.query(`select p.code from pengguna_peran m join peran p on p.id = m.peran_id where m.pengguna_id = $1`, [id]);
  return result.rows.map(({ code }) => code);
}

let disposableDatabase = false;
try {
  const fixture = await pool.query("select id from session where id = 'session-academic-admin' and user_id = 'academic-admin'");
  assert.equal(fixture.rowCount, 1);
  const ownRow = await readRow(adminId, "admin@academic.test");
  assert.equal(ownRow.id, adminId);
  assert.equal(ownRow.userStatusEdit, undefined);
  disposableDatabase = true;

  await pool.query(`insert into "user" (id, name, email, role) values
    ($1, $1, $1 || '@example.test', 'teacher'), ($2, $2, $2 || '@example.test', 'teacher'),
    ($3, $3, $3 || '@example.test', 'admin'), ($4, $4, $4 || '@example.test', 'admin')`, ids);
  await pool.query("insert into pengguna (id) select unnest($1::text[])", [[rolelessId, firstAdmin, secondAdmin]]);
  await pool.query("insert into pengguna_peran (id, pengguna_id, peran_id, source) select id, id, (select id from peran where code = 'admin'), 'fixture' from unnest($1::text[]) as id", [[firstAdmin, secondAdmin]]);
  for (const [id, actorId, cookieSuffix] of [[`status-session-${runId}`, adminId, `status-${runId}`], [firstAdmin, firstAdmin, firstAdmin], [secondAdmin, secondAdmin, secondAdmin]]) {
    await pool.query("insert into session (id, token, user_id, expires_at) values ($1, $2, $3, now() + interval '1 hour')",
      [id, `fixture-academic-${cookieSuffix}`, actorId]);
  }

  const before = (await readRow(legacyId)).userStatusEdit;
  assert.equal(before.status, "active");
  const draft = { accountId: adminId, status: "suspended", expectedRevision: before.revision };
  assert.equal((await patch(legacyId, draft, randomUUID(), null)).status, 401);
  assert.equal((await patch(legacyId, draft, randomUUID(), fixtureCookie("tutor"))).status, 403);
  assert.equal((await patch(legacyId, draft, randomUUID(), admin, "https://foreign.invalid")).status, 403);
  assert.equal((await patch(legacyId, { ...draft, accountId: firstAdmin })).status, 403);
  assert.equal((await patch(legacyId, { ...draft, status: "disabled" })).status, 422);
  assert.equal((await patch(legacyId, { ...draft, role: "admin" })).status, 422);
  const self = await patch(adminId, draft);
  assert.equal(self.status, 422);
  assert.equal((await self.json()).error, "SELF_SUSPENSION");

  const requestId = randomUUID();
  const duplicates = await Promise.all([patch(legacyId, draft, requestId), patch(legacyId, draft, requestId)]);
  const receipts = [];
  for (const response of duplicates) {
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    receipts.push(await response.json());
  }
  assert.deepEqual(receipts[0], receipts[1]);
  const suspended = (await readRow(legacyId)).userStatusEdit;
  assert.equal(suspended.status, "suspended");
  assert.notEqual(suspended.revision, before.revision);
  assert.deepEqual(await roles(legacyId), ["tutor"]);

  const scoped = await patch(legacyId, draft, requestId, otherSession);
  assert.equal(scoped.status, 409);
  assert.equal((await scoped.json()).status, "conflict");
  const crossTarget = await patch(rolelessId, draft, requestId);
  assert.equal(crossTarget.status, 409);
  assert.equal((await crossTarget.json()).error, "REQUEST_CONFLICT");
  assert.equal((await patch(legacyId, { ...draft, status: "active" }, requestId)).status, 409);

  const resumed = await patch(legacyId, { ...draft, status: "active", expectedRevision: suspended.revision });
  assert.equal(resumed.status, 200, await resumed.clone().text());
  const active = (await readRow(legacyId)).userStatusEdit;
  assert.equal(active.status, "active");
  assert.notEqual(active.revision, before.revision);
  assert.deepEqual(await roles(legacyId), ["tutor"]);
  assert.deepEqual(await (await patch(legacyId, draft, requestId)).json(), receipts[0]);
  assert.deepEqual((await readRow(legacyId)).userStatusEdit, active);

  const roleless = (await readRow(rolelessId)).userStatusEdit;
  assert.equal((await patch(rolelessId, { ...draft, expectedRevision: roleless.revision })).status, 200);
  assert.deepEqual(await roles(rolelessId), []);
  const [firstRevision, secondRevision] = await Promise.all([readRow(firstAdmin), readRow(secondAdmin)]);
  const race = await Promise.all([
    patch(firstAdmin, { ...draft, accountId: secondAdmin, expectedRevision: firstRevision.userStatusEdit.revision }, randomUUID(), fixtureCookie(secondAdmin)),
    patch(secondAdmin, { ...draft, accountId: firstAdmin, expectedRevision: secondRevision.userStatusEdit.revision }, randomUUID(), fixtureCookie(firstAdmin)),
  ]);
  assert.deepEqual(race.map((response) => response.status).sort(), [200, 403]);
  const activeActors = await pool.query("select id from pengguna where id = any($1) and status = 'active'", [[firstAdmin, secondAdmin]]);
  assert.equal(activeActors.rowCount, 1);

  const effects = await pool.query(`select
    (select count(*)::int from audit_mutasi where entity_type = 'native_user_status' and entity_id = $1) as receipts,
    (select count(*)::int from offline_content_changes where user_id = $1 and kind = 'access' and action = 'invalidate') as invalidations`, [legacyId]);
  assert.deepEqual(effects.rows, [{ receipts: 2, invalidations: 2 }]);
  console.log("Admin user status live PATCH: authorization, concurrent suspension protection, validation, scoped replay, revision conflict, legacy role preservation and reactivation passed");
} finally {
  try {
    if (disposableDatabase) {
      await pool.query("delete from session where id = $1 or user_id = any($2)", [`status-session-${runId}`, ids]);
      await pool.query("delete from audit_mutasi where entity_type = 'native_user_status' and entity_id = any($1)", [ids]);
      await pool.query("delete from offline_content_changes where user_id = any($1)", [ids]);
      await pool.query("delete from pengguna where id = any($1)", [ids]);
      await pool.query('delete from "user" where id = any($1)', [ids]);
    }
  } finally {
    await pool.end();
  }
}
