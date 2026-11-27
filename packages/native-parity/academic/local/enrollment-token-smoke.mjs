import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { fixtureCookie } from "./cookie.mjs";

const api = "http://127.0.0.1:3314/api/native/academic-administration";
const origin = "http://localhost:3314";
const pool = new pg.Pool({ connectionString: "postgres://postgres:academic-local-only@127.0.0.1:55434/academic" });
const admin = { cookie: fixtureCookie("admin") };
const issueKey = randomUUID();
const revokeKey = randomUUID();
const draft = { courseIds: ["academic-course-1"], capacity: 17, totalQuotaSessions: 0, weeklyQuotaSessions: 7 };

function command(method, id, body, requestId, role = "admin", expectedOrigin = origin) {
  return fetch(`${api}/tokens${id ? "/" + encodeURIComponent(id) : ""}`, {
    method, redirect: "manual", body: JSON.stringify(body),
    headers: { ...(role ? { cookie: fixtureCookie(role) } : {}), Origin: expectedOrigin,
      "Content-Type": "application/json", "Idempotency-Key": requestId },
  });
}
async function read(path) {
  const response = await fetch(api + path, { headers: admin, redirect: "manual" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  return response.json();
}
async function saved(response, requestId) {
  assert.equal(response.status, 200);
  const value = await response.json();
  assert.equal(value.status, "saved");
  assert.equal(value.requestId, requestId);
  assert.ok(typeof value.id === "string" && !("token" in value));
  return value.id;
}

let verifiedLocal = false;
let groupId;
try {
  assert.ok((await read("/token-editor")).courses.some(({ id }) => id === "academic-course-1"));
  const database = await pool.query("select id from mata_kuliah where id = 'academic-course-1' and legacy_course_id = 'biologi-dasar'");
  assert.equal(database.rowCount, 1);
  verifiedLocal = true;

  assert.equal((await command("POST", null, draft, randomUUID(), null)).status, 401);
  assert.equal((await command("POST", null, draft, randomUUID(), "tutor")).status, 403);
  assert.equal((await command("POST", null, draft, randomUUID(), "admin", "https://foreign.invalid")).status, 403);
  assert.equal((await command("POST", null, { ...draft, courseIds: ["missing-course"] }, randomUUID())).status, 422);
  assert.equal((await command("POST", null, { ...draft, courseIds: ["academic-course-1", "biologi-dasar"] }, randomUUID())).status, 422);
  assert.equal((await command("POST", null, { ...draft, capacity: 1001 }, randomUUID())).status, 422);

  const requests = await Promise.all([command("POST", null, draft, issueKey), command("POST", null, draft, issueKey)]);
  const [id, replay] = await Promise.all(requests.map((response) => saved(response, issueKey)));
  assert.equal(id, replay);
  const issued = await pool.query(`select t.group_id, t.token ~ '^Zyx-[A-F0-9]{8}-17-1$' as format_valid,
      g.total_quota_sessions = 0 and g.weekly_quota_sessions = 0 and g.end_date = t.expires_at as group_valid
    from enrollment_tokens t join groups g on g.id = t.group_id where t.id = $1`, [id]);
  assert.equal(issued.rowCount, 1);
  groupId = issued.rows[0].group_id;
  assert.equal(issued.rows[0].format_valid, true);
  assert.equal(issued.rows[0].group_valid, true);
  const assignments = await pool.query(`select
      exists(select 1 from enrollment_token_courses where token_id = $1 and course_id = 'biologi-dasar') as token_link,
      exists(select 1 from group_courses where group_id = $2 and course_id = 'biologi-dasar') as group_link`, [id, groupId]);
  assert.deepEqual(assignments.rows[0], { token_link: true, group_link: true });
  assert.equal((await command("POST", null, { ...draft, capacity: 18 }, issueKey)).status, 409);

  const path = `/token-editor/${id}`;
  const initial = (await read(path)).token;
  assert.ok(initial.status === "active" && !("token" in initial));
  await pool.query("insert into group_members(id,group_id,user_id) values ($1,$2,'academic-student')", [randomUUID(), groupId]);
  await pool.query("update enrollment_tokens set capacity = capacity + 1 where id = $1", [id]);
  const stale = await command("PATCH", id, { expectedRevision: initial.revision }, revokeKey);
  assert.equal(stale.status, 409);
  const conflict = await stale.json();
  assert.ok(conflict.status === "conflict" && conflict.token.capacity === 18 && !("code" in conflict.token));
  const revoke = { expectedRevision: conflict.token.revision };
  const revoked = await Promise.all([command("PATCH", id, revoke, revokeKey), command("PATCH", id, revoke, revokeKey)]);
  for (const response of revoked) assert.equal(await saved(response, revokeKey), id);
  const visibility = (await read(path)).token;
  assert.equal(visibility.status, "expired");
  assert.equal(visibility.used, 1);
  await saved(await command("PATCH", id, revoke, revokeKey), revokeKey);
  assert.equal((await read(path)).token.expiresAt, visibility.expiresAt);
  assert.equal((await command("POST", null, draft, issueKey)).status, 404);

  const linked = await pool.query(`select
      exists(select 1 from groups where id = $1) as owner,
      exists(select 1 from group_members where group_id = $1 and user_id = 'academic-student') as member,
      exists(select 1 from enrollments where user_id = 'academic-student' and course_id = 'biologi-dasar') as enrollment,
      exists(select 1 from enrollment_tokens where id = $2 and expires_at < now()) as expired`, [groupId, id]);
  assert.deepEqual(linked.rows[0], { owner: true, member: true, enrollment: true, expired: true });
  const receipts = await pool.query(`select count(*)::int as count,
      bool_and(not (after_snapshot ? 'token') and not (after_snapshot ? 'code')) as sanitized
    from audit_mutasi where entity_type = 'native_enrollment_token' and entity_id = $1`, [id]);
  assert.deepEqual(receipts.rows[0], { count: 2, sanitized: true });
  await pool.query("delete from groups where id = $1", [groupId]);
  assert.equal((await command("PATCH", id, revoke, revokeKey)).status, 404);
  console.log("Enrollment token HTTP/PG: roles, course aliases, issuance, stale revisions, replay, revocation and preserved enrollments passed");
} finally {
  try {
    if (verifiedLocal) {
      const fixture = await pool.query(`select after_snapshot->>'groupId' as group_id from audit_mutasi
        where entity_type = 'native_enrollment_token' and correlation_id = $1 limit 1`, [issueKey]);
      const target = groupId ?? fixture.rows[0]?.group_id;
      if (target) await pool.query("delete from groups where id = $1", [target]);
      await pool.query("delete from audit_mutasi where entity_type = 'native_enrollment_token' and correlation_id in ($1, $2)", [issueKey, revokeKey]);
    }
  } finally {
    await pool.end();
  }
}
