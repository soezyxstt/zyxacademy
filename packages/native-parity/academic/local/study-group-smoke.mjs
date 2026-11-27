import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { fixtureCookie } from "./cookie.mjs";

const api = "http://127.0.0.1:3314/api/native/academic-administration";
const origin = "http://localhost:3314";
const pool = new pg.Pool({ connectionString: "postgres://postgres:academic-local-only@127.0.0.1:55434/academic" });
const marker = randomUUID();
const prefix = `Kelompok uji ${marker}`;
const admin = { cookie: fixtureCookie("admin") };
const draft = {
  name: prefix, packageType: "reguler_15", totalQuotaSessions: 15, weeklyQuotaSessions: 15,
  academicYear: "2026/2027", semester: "Ganjil", startDate: "2026-11-23T00:00:00+07:00",
  endDate: "2027-01-31T23:59:00+07:00", status: "active", notes: "", courseIds: ["academic-course-1"],
};

function command(method, id, body, requestId, role = "admin", expectedOrigin = origin) {
  return fetch(`${api}/groups${id ? "/" + encodeURIComponent(id) : ""}`, {
    method, redirect: "manual", body: JSON.stringify(body),
    headers: { ...(role ? { cookie: fixtureCookie(role) } : {}), Origin: expectedOrigin,
      "Content-Type": "application/json", "Idempotency-Key": requestId },
  });
}
async function read(path) {
  const response = await fetch(api + path, { headers: admin, redirect: "manual" });
  assert.equal(response.status, 200, path);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  return response.json();
}
async function success(response) {
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  const data = await response.json();
  assert.equal(data.status, "saved");
  return data;
}

let verifiedLocal = false;
let groupId;
try {
  const courses = await read("/group-editor");
  assert.ok(courses.courses.some(({ id }) => id === "academic-course-1"));
  const database = await pool.query("select id from mata_kuliah where id = 'academic-course-1' and legacy_course_id = 'biologi-dasar'");
  assert.equal(database.rowCount, 1);
  verifiedLocal = true;

  assert.equal((await command("POST", null, draft, randomUUID(), null)).status, 401);
  assert.equal((await command("POST", null, draft, randomUUID(), "tutor")).status, 403);
  assert.equal((await command("POST", null, draft, randomUUID(), "admin", "https://foreign.invalid")).status, 403);
  assert.equal((await command("POST", null, { ...draft, courseIds: ["missing-course"] }, randomUUID())).status, 422);
  assert.equal((await command("POST", null, { ...draft, courseIds: ["academic-course-1", "biologi-dasar"] }, randomUUID())).status, 422);
  assert.equal((await command("POST", null, { ...draft, totalQuotaSessions: 0 }, randomUUID())).status, 422);
  const createKey = randomUUID();
  const duplicate = await Promise.all([command("POST", null, draft, createKey), command("POST", null, draft, createKey)]);
  const [one, two] = await Promise.all(duplicate.map(success));
  assert.equal(one.requestId, createKey);
  assert.equal(one.id, two.id);
  groupId = one.id;
  const linked = await pool.query("select course_id from group_courses where group_id = $1", [one.id]);
  assert.deepEqual(linked.rows, [{ course_id: "biologi-dasar" }]);
  assert.equal((await command("POST", null, { ...draft, notes: "Payload berbeda" }, createKey)).status, 409);

  const recordPath = `/group-editor/${one.id}`;
  const current = (await read(recordPath)).record;
  const edit = { ...current.fields, notes: "Catatan tersimpan", expectedRevision: current.revision };
  assert.equal((await command("PATCH", one.id, { ...edit, courseIds: ["unknown-group-course"] }, randomUUID())).status, 422);
  const editKey = randomUUID();
  await success(await command("PATCH", one.id, edit, editKey));
  const updated = (await read(recordPath)).record;
  assert.equal(updated.fields.notes, edit.notes);
  assert.notEqual(updated.revision, current.revision);
  const race = await Promise.all(["A", "B"].map((suffix) =>
    command("PATCH", one.id, { ...edit, name: `${prefix} ${suffix}`, expectedRevision: updated.revision }, randomUUID())));
  assert.deepEqual(race.map((response) => response.status).sort(), [200, 409]);
  const conflict = await race.find((response) => response.status === 409).json();
  assert.equal(conflict.status, "conflict");
  const reapplied = { ...edit, name: `${prefix} terbaru`, expectedRevision: conflict.record.revision };
  await success(await command("PATCH", one.id, reapplied, randomUUID()));
  await success(await command("PATCH", one.id, edit, editKey));
  assert.equal((await read(recordPath)).record.fields.name, reapplied.name);
  assert.deepEqual((await pool.query("select course_id from group_courses where group_id = $1", [one.id])).rows, linked.rows);
  const receipts = await pool.query("select count(*)::int as count from audit_mutasi where entity_type = 'native_study_group' and entity_id = $1", [one.id]);
  assert.equal(receipts.rows[0].count, 4);

  await pool.query("insert into enrollment_tokens(id,token,group_id,expires_at) values ($1,$2,$3,now()+interval '1 month')",
    [`fixture-group-token-${marker}`, `fixture-token-${marker}`, one.id]);
  const tokenRecord = (await read(recordPath)).record;
  assert.equal((await command("POST", null, draft, createKey)).status, 200);
  assert.equal((await command("PATCH", one.id, edit, editKey)).status, 200);
  const tokenEdit = { ...tokenRecord.fields, notes: "Catatan kelompok bertoken", courseIds: [], expectedRevision: tokenRecord.revision };
  assert.equal((await command("PATCH", one.id, tokenEdit, randomUUID())).status, 200);
  assert.deepEqual((await read(recordPath)).record.courses, []);
  async function verifyDeniedReplays() {
    const attempts = await Promise.all([
      command("POST", null, draft, createKey),
      command("PATCH", one.id, edit, editKey),
    ]);
    for (const response of attempts) {
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: "NOT_FOUND" });
    }
    assert.equal((await command("POST", null, { ...draft, notes: "Payload berbeda" }, createKey)).status, 409);
    assert.equal((await command("PATCH", one.id, { ...edit, notes: "Payload berbeda" }, editKey)).status, 409);
    const after = await pool.query("select count(*)::int as count from audit_mutasi where entity_type = 'native_study_group' and entity_id = $1", [one.id]);
    assert.equal(after.rows[0].count, receipts.rows[0].count + 1);
  }

  const tokenLinked = await pool.query("select name, notes from groups where id = $1", [one.id]);
  assert.deepEqual(tokenLinked.rows, [{ name: reapplied.name, notes: tokenEdit.notes }]);
  await pool.query("delete from groups where id = $1", [one.id]);
  await verifyDeniedReplays();
  assert.equal((await pool.query("select id from groups where name like $1", [prefix + "%"])).rowCount, 0);
  console.log("Study group local HTTP/PG: authorized assignments, token-linked edits, revision conflicts, and replay checks passed");
} finally {
  try {
    if (verifiedLocal) {
      await pool.query("delete from audit_mutasi where entity_type = 'native_study_group' and (entity_id = $1 or entity_id in (select id from groups where name like $2))",
        [groupId ?? null, prefix + "%"]);
      await pool.query("delete from groups where name like $1", [prefix + "%"]);
    }
  } finally {
    await pool.end();
  }
}
