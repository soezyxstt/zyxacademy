import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { fixtureCookie } from "./cookie.mjs";

const port = 3314;
const server = `http://127.0.0.1:${port}`;
const trustedOrigin = `http://localhost:${port}`;
const pool = new pg.Pool({ connectionString: "postgres://postgres:academic-local-only@127.0.0.1:55434/academic" });
const suffix = randomUUID();
const courseId = `fixture-course-atomic-${suffix}`;
const canonicalId = `fixture-course-canonical-${suffix}`;
const collection = `${server}/api/native/academic/admin/courses`;
const resource = `${collection}/${courseId}`;
const settings = `${resource}/settings`;
const quizId = `fixture-native-analytics-${suffix}`;
const materialId = `fixture-native-material-${suffix}`;
const admin = { cookie: fixtureCookie("admin") };

async function readSettings() {
  const response = await fetch(settings, { headers: admin, redirect: "manual" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  return response.json();
}

function patch(draft, requestId, headers = admin) {
  return fetch(settings, {
    method: "PATCH",
    headers: { ...headers, Origin: trustedOrigin, "Content-Type": "application/json", "Idempotency-Key": requestId },
    body: JSON.stringify(draft),
    redirect: "manual",
  });
}

try {
  // Confirm the local synthetic Admin session and academic seed before inserting rows.
  const fixture = await fetch(`${server}/api/native/academic/admin/courses`, { headers: admin, redirect: "manual" });
  assert.equal(fixture.status, 200);
  const seeded = await pool.query("select id from mata_kuliah where id = 'academic-course-1' and legacy_course_id = 'biologi-dasar'");
  assert.equal(seeded.rowCount, 1);

  await pool.query("insert into courses(id,title,category) values ($1,$2,$3)", [courseId, "Biologi transaksi", "Biologi"]);
  await pool.query("insert into mata_kuliah(id,code,title,legacy_course_id) values ($1,$2,$3,$4)",
    [canonicalId, `ATOMIC-${suffix}`, "Biologi transaksi", courseId]);
  await pool.query("insert into quiz_templates(id,course_id,title,category,selection_rules) values ($1,$2,$3,'chapter','{}')",
    [quizId, courseId, "Kuis transaksi"]);
  await pool.query(`insert into student_quiz_attempts(id,student_id,template_id,score,duration_seconds,status,questions_snapshot)
    values ($1,'academic-student',$2,80,90,'completed','[]')`, [`fixture-native-attempt-${suffix}`, quizId]);
  await pool.query(`insert into course_materials(id,course_id,title,type,file_url,chapter_ids)
    values ($1,$2,$3,'materi','fixture/private/test.pdf','[]')`, [materialId, courseId, "Dokumen transaksi"]);
  const reads = [
    ["analytics", "analytics", (result) => assert.equal(result.quizzes[0].id, quizId)],
    [`analytics/${quizId}`, "quiz-insight", (result) => assert.equal(result.summary.totalCompleted, 1)],
    ["results", "results", (result) => assert.equal(result.stats.avgScore, 80)],
    ["leaderboard", "leaderboard", (result) => assert.equal(result.attempts[0].score, 80)],
    ["documents", "documents", (result) => assert.equal(result.documents[0].id, materialId)],
    [`documents/${materialId}`, "document", (result) => assert.equal(result.document.title, "Dokumen transaksi")],
    ["flashcards", "flashcards"], ["videos", "videos"], ["questions", "questions"], ["review", "review"],
  ];

  for (const [section, type, verify] of reads) {
    const response = await fetch(`${resource}/${section}`, { headers: admin, redirect: "manual" });
    assert.equal(response.status, 200, section);
    const result = await response.json();
    assert.equal(result.type, type);
    assert.equal(result.course.id, canonicalId);
    verify?.(result);
  }
  for (const section of [`analytics/${quizId}`, `documents/${materialId}`]) {
    const foreign = await fetch(`${collection}/fisika-dasar/${section}`, { headers: admin, redirect: "manual" });
    assert.equal(foreign.status, 404, section);
  }

  const initial = await readSettings();
  assert.equal(initial.course.id, canonicalId);
  assert.equal(initial.course.title, "Biologi transaksi");

  const requestId = randomUUID();
  const draft = { title: "Biologi transaksi tersimpan", category: "Biologi", description: null, expectedRevision: initial.revision };
  assert.equal((await patch(draft, requestId, { cookie: fixtureCookie("tutor") })).status, 403);
  assert.equal((await patch(draft, requestId, {})).status, 401);
  const duplicates = await Promise.all([patch(draft, requestId), patch(draft, requestId)]);
  for (const response of duplicates) {
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    assert.deepEqual(await response.json(), { status: "saved", requestId });
  }
  const afterSave = await readSettings();
  assert.equal(afterSave.course.title, draft.title);
  assert.notEqual(afterSave.revision, initial.revision);
  assert.equal((await patch({ ...draft, title: "Isi berbeda" }, requestId)).status, 409);
  const receipts = await pool.query("select id from audit_mutasi where entity_type = 'native_course_settings' and course_id = $1", [canonicalId]);
  assert.equal(receipts.rowCount, 1);

  const competing = await Promise.all(["Versi satu", "Versi dua"].map((title) =>
    patch({ ...draft, title, expectedRevision: afterSave.revision }, randomUUID())));
  assert.deepEqual(competing.map((response) => response.status).sort(), [200, 409]);
  const afterRace = await readSettings();
  assert.ok(["Versi satu", "Versi dua"].includes(afterRace.course.title));
  assert.equal((await patch(draft, requestId)).status, 200);
  assert.equal((await readSettings()).revision, afterRace.revision);
  console.log("course slices, cross-course denial, course settings durable replay and revision races passed");
} finally {
  try {
    await pool.query("delete from audit_mutasi where course_id = $1 or entity_id = $1", [canonicalId]);
    await pool.query("delete from mata_kuliah where id = $1", [canonicalId]);
    await pool.query("delete from courses where id = $1", [courseId]);
  } finally {
    await pool.end();
  }
}
