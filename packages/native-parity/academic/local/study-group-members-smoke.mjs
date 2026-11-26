import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { fixtureCookie } from "./cookie.mjs";

const origin = "http://localhost:3314";
const api = "http://127.0.0.1:3314/api/native/academic-administration";
const pool = new pg.Pool({ connectionString: "postgres://postgres:academic-local-only@127.0.0.1:55434/academic" });
const marker = randomUUID();
const id = `group-members-${marker}`;
const first = `group-member-a-${marker}`;
const second = `group-member-b-${marker}`;
const suspended = `group-member-suspended-${marker}`;
const users = [first, second, suspended];
const accountId = "academic-admin";
const headers = { cookie: fixtureCookie("admin") };
const path = `${api}/groups/${id}/members`;

function patch(body, requestId = randomUUID(), role = "admin", requestOrigin = origin) {
  return fetch(path, { method: "PATCH", redirect: "manual", headers: {
    ...(role ? { cookie: fixtureCookie(role) } : {}), Origin: requestOrigin,
    "Content-Type": "application/json", "Idempotency-Key": requestId,
  }, body: JSON.stringify(body) });
}

async function read(search = "") {
  const response = await fetch(`${path}?search=${encodeURIComponent(search)}`, { headers });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  return response.json();
}

function recover(draft, requestId, role = "admin") {
  const query = new URLSearchParams({ retryUserId: draft.userId, retryAction: draft.action,
    retryRevision: draft.expectedRevision, retryRequestId: requestId });
  return fetch(`${path}?${query}`, { headers: { cookie: fixtureCookie(role) } });
}

async function grants(userId) {
  const result = await pool.query(`select e.course_id, e.expires_at, p.mata_kuliah_id from enrollments e
    left join pendaftaran_murid p on p.legacy_enrollment_id = e.id where e.user_id = $1 order by e.course_id`, [userId]);
  return result.rows;
}

let fixtureVerified = false;
try {
  const fixture = await pool.query("select id from session where id = 'session-academic-admin' and user_id = 'academic-admin'");
  assert.equal(fixture.rowCount, 1);
  const preflight = await fetch(`${api}/groups`, { headers });
  assert.equal(preflight.status, 200, await preflight.clone().text());
  fixtureVerified = true;

  await pool.query('insert into "user" (id, name, email) select id, id, id || \'@example.test\' from unnest($1::text[]) as id', [users]);
  await pool.query("insert into pengguna (id, status) values ($1, 'active'), ($2, 'active'), ($3, 'suspended')", users);
  const endDate = new Date(Date.now() + 86400_000 * 30);
  await pool.query("insert into groups (id, name, end_date) values ($1, $1, $2)", [id, endDate]);
  await pool.query("insert into group_courses (id, group_id, course_id) values ($1, $2, 'biologi-dasar'), ($3, $2, 'fisika-dasar')",
    [`${id}-a`, id, `${id}-b`]);
  const priorExpiry = new Date(Date.now() + 86400_000 * 60);
  await pool.query("insert into enrollments (id, user_id, course_id, expires_at) values ($1, $2, 'fisika-dasar', $3)", [`${id}-existing`, first, priorExpiry]);

  const search = await read(marker);
  assert.deepEqual(search.members, []);
  assert.deepEqual(search.candidates.map((candidate) => candidate.id), [first, second]);
  assert.deepEqual((await read(`%${marker}`)).candidates, []);
  assert.equal((await fetch(path)).status, 401);
  assert.equal((await fetch(path, { headers: { cookie: fixtureCookie("tutor") } })).status, 403);

  const add = { accountId, action: "add", userId: first, expectedRevision: search.revision };
  const addKey = randomUUID();
  assert.equal((await patch(add, addKey, null)).status, 401);
  assert.equal((await patch(add, addKey, "tutor")).status, 403);
  assert.equal((await patch(add, addKey, "admin", "https://foreign.invalid")).status, 403);
  assert.equal((await patch({ ...add, accountId: first }, addKey)).status, 403);
  assert.equal((await patch({ ...add, role: "leader" }, addKey)).status, 422);
  assert.equal((await patch({ ...add, userId: suspended }, addKey)).status, 422);
  assert.equal((await recover(add, addKey, "tutor")).status, 403);
  assert.equal((await (await recover(add, addKey)).json()).recoveryTarget.id, first);
  assert.equal((await (await recover({ ...add, userId: suspended }, addKey)).json()).recoveryTarget, undefined);
  const duplicates = await Promise.all([patch(add, addKey), patch(add, addKey)]);
  for (const response of duplicates) assert.equal(response.status, 200, await response.clone().text());
  const [receipt, duplicate] = await Promise.all(duplicates.map((response) => response.json()));
  assert.deepEqual(receipt, { status: "saved", id, userId: first, action: "add", requestId: addKey });
  assert.deepEqual(receipt, duplicate);
  const added = await read(marker);
  assert.deepEqual(added.members.map(({ id: memberId, role }) => [memberId, role]), [[first, "member"]]);
  assert.deepEqual(added.candidates.map((candidate) => candidate.id), [second]);
  assert.notEqual(added.revision, search.revision);
  assert.equal((await patch({ ...add, userId: second }, addKey)).status, 409);
  assert.equal((await patch({ ...add, userId: second })).status, 409);
  assert.equal((await (await recover({ ...add, userId: second }, addKey)).json()).recoveryTarget, undefined);
  assert.deepEqual(await grants(first), [
    { course_id: "biologi-dasar", expires_at: endDate, mata_kuliah_id: "academic-course-1" },
    { course_id: "fisika-dasar", expires_at: priorExpiry, mata_kuliah_id: null },
  ]);

  const remove = { ...add, action: "remove", expectedRevision: added.revision };
  const removeKey = randomUUID();
  const concurrent = await Promise.all([patch(remove, removeKey), patch({ ...add, userId: second, expectedRevision: added.revision })]);
  assert.deepEqual(concurrent.map((response) => response.status).sort(), [200, 409]);
  if (concurrent[0].status !== 200) {
    remove.expectedRevision = (await read()).revision;
    assert.equal((await patch(remove, removeKey)).status, 200);
  }
  assert.equal((await patch(remove, removeKey)).status, 200);
  const later = await read();
  assert.ok(later.members.every((member) => member.id !== first));
  assert.equal((await (await recover(remove, removeKey)).json()).recoveryTarget.id, first);
  assert.equal((await (await recover(remove, randomUUID())).json()).recoveryTarget, undefined);
  assert.equal((await patch(add, addKey)).status, 200);
  assert.deepEqual((await read()).members, later.members);
  assert.equal((await grants(first)).length, 2);
  await pool.query("update groups set status = 'inactive' where id = $1", [id]);
  const inactive = await read(marker);
  assert.equal(inactive.canAdd, false);
  assert.deepEqual(inactive.candidates, []);
  assert.equal((await patch({ ...add, expectedRevision: inactive.revision })).status, 422);
  await pool.query("insert into enrollment_tokens (id, token, group_id, expires_at) values ($1,$1,$2,$3)", [`token-${id}`, id, endDate]);
  assert.equal((await fetch(path, { headers })).status, 404);
  assert.equal((await recover(remove, removeKey)).status, 404);
  assert.equal((await patch(add, addKey)).status, 404);
  console.log("Study group members local HTTP/PG: authorized search, add/remove, enrollment preservation, conflicts and token-linked replay denial passed");
} finally {
  try {
    if (fixtureVerified) {
      await pool.query("delete from audit_mutasi where (entity_type = 'native_group_membership' and entity_id = $1) or (entity_type = 'enrollment' and entity_id in (select id from enrollments where user_id = any($2)))", [id, users]);
      await pool.query("delete from offline_content_changes where user_id = any($1)", [users]);
      await pool.query("delete from pendaftaran_murid where pengguna_id = any($1)", [users]);
      await pool.query("delete from enrollments where user_id = any($1)", [users]);
      await pool.query("delete from groups where id = $1", [id]);
      await pool.query("delete from pengguna where id = any($1)", [users]);
      await pool.query('delete from "user" where id = any($1)', [users]);
    }
  } finally {
    await pool.end();
  }
}
