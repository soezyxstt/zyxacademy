import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { fixtureCookie } from "./cookie.mjs";

const local = "http://127.0.0.1:3314";
const origin = "http://localhost:3314";
const collection = `${local}/api/native/academic-administration/announcements`;
const id = `fixture-native-pka-${randomUUID()}`;
const admin = { cookie: fixtureCookie("admin") };
const pool = new pg.Pool({ connectionString: "postgres://postgres:academic-local-only@127.0.0.1:55434/academic" });
function patch(draft, requestId, role = "admin", requestOrigin = origin) {
  return fetch(`${collection}/${id}`, {
    method: "PATCH", redirect: "manual",
    headers: { ...(role ? { cookie: fixtureCookie(role) } : {}), Origin: requestOrigin,
      "Content-Type": "application/json", "Idempotency-Key": requestId },
    body: JSON.stringify(draft),
  });
}

async function readAnnouncement() {
  const response = await fetch(collection, { headers: admin, redirect: "manual" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  const list = await response.json();
  return list.rows.find((row) => row.id === id)?.announcementEdit;
}

let seeded = false;
try {
  const session = await pool.query("select id from session where id = 'session-academic-admin' and user_id = 'academic-admin'");
  assert.equal(session.rowCount, 1);
  await fetch(collection, { headers: admin, redirect: "manual" }).then((response) => assert.equal(response.status, 200));
  await pool.query("insert into pka_announcements(id,title,body,created_by) values ($1,$2,$3,'academic-admin')",
    [id, "Pengumuman PKA uji", "Isi awal"]);
  seeded = true;
  const initial = await readAnnouncement();
  assert.equal(initial.title, "Pengumuman PKA uji");
  const draft = { title: "Pengumuman tersimpan", body: "Isi tersimpan", expectedRevision: initial.revision };
  const requestId = randomUUID();
  assert.equal((await patch(draft, requestId, "tutor")).status, 403);
  assert.equal((await patch(draft, requestId, null)).status, 401);
  assert.equal((await patch(draft, requestId, "admin", "https://foreign.invalid")).status, 403);
  assert.equal((await patch({ ...draft, body: "" }, requestId)).status, 422);
  const duplicates = await Promise.all([patch(draft, requestId), patch(draft, requestId)]);
  for (const response of duplicates) {
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    const result = await response.json();
    assert.equal(result.requestId, requestId);
    assert.equal(result.announcement.title, draft.title);
  }
  const saved = await readAnnouncement();
  assert.equal(saved.body, draft.body);
  assert.notEqual(saved.revision, initial.revision);
  assert.equal((await patch({ ...draft, body: "Isi berbeda" }, requestId)).status, 409);

  const race = await Promise.all(["Teks A", "Teks B"].map((title) => patch({ ...draft, title, expectedRevision: saved.revision }, randomUUID())));
  assert.deepEqual(race.map((response) => response.status).sort(), [200, 409]);
  const lost = await race.find((response) => response.status === 409).json();
  assert.equal(lost.status, "conflict");
  assert.equal(lost.announcement.revision, (await readAnnouncement()).revision);
  const reapplied = await patch({ ...draft, title: "Disimpan setelah review", expectedRevision: lost.announcement.revision }, randomUUID());
  assert.equal(reapplied.status, 200);
  assert.equal((await readAnnouncement()).title, "Disimpan setelah review");
  assert.equal((await patch(draft, requestId)).status, 200);
  assert.equal((await readAnnouncement()).title, "Disimpan setelah review");
  const receipts = await pool.query("select count(*)::int as count from audit_mutasi where entity_type = 'native_pka_announcement' and entity_id = $1", [id]);
  assert.equal(receipts.rows[0].count, 3);
  console.log("PKA announcement live PATCH: role and origin rejection, validation, durable replay, revision conflict, retry and saved readback passed");
} finally {
  try {
    if (seeded) {
      await pool.query("delete from audit_mutasi where entity_type = 'native_pka_announcement' and entity_id = $1", [id]);
      await pool.query("delete from pka_announcements where id = $1", [id]);
    }
  } finally {
    await pool.end();
  }
}
