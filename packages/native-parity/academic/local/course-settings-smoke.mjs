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
const standaloneId = `fixture-course-standalone-${suffix}`;
const collection = `${server}/api/native/academic/admin/courses`;
const resource = `${collection}/${courseId}`;
const settings = `${resource}/settings`;
const quizId = `fixture-native-analytics-${suffix}`;
const materialId = `fixture-native-material-${suffix}`;
const projectionId = `sm-legacy-${materialId}`;
const materialKey = "fixture/private/test.pdf";
const admin = { cookie: fixtureCookie("admin") };

async function read(target) {
  const response = await fetch(target, { headers: admin, redirect: "manual" });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  return response.json();
}

const readSettings = () => read(settings);

function courseCommand(target, method, draft, requestId, headers = admin) {
  return fetch(target, {
    method,
    headers: { ...headers, Origin: trustedOrigin, "Content-Type": "application/json", "Idempotency-Key": requestId },
    body: JSON.stringify(draft),
    redirect: "manual",
  });
}

const patch = (draft, requestId, headers) => courseCommand(settings, "PATCH", draft, requestId, headers);

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
  await pool.query(`insert into course_materials(id,course_id,title,type,subcategory,year,file_url,chapter_ids)
    values ($1,$2,$3,'materi','modul',2024,$4,'[]')`, [materialId, courseId, "Dokumen transaksi", materialKey]);
  await pool.query(`insert into sumber_materi(id,mata_kuliah_id,source_type,title,canonical_uri_or_r2_key,checksum,status,creator_id)
    values ($1,$2,'pdf',$3,$4,$4,'active','academic-admin')`, [projectionId, canonicalId, "Dokumen transaksi", materialKey]);
  const reads = [
    ["analytics", "analytics", (result) => assert.equal(result.quizzes[0].id, quizId)],
    [`analytics/${quizId}`, "quiz-insight", (result) => {
      assert.equal(result.summary.totalCompleted, 1);
      assert.equal(result.attempts[0].score, 80);
      assert.equal(result.attempts[0].name, "Nadia Lestari");
    }],
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

  const materialPath = `${resource}/documents/${materialId}`;
  const materialCommandPath = `${collection}/${canonicalId}/documents/${materialId}/metadata`;
  const beforePdf = await read(materialPath);
  assert.deepEqual(Object.keys(beforePdf.titleEdit).sort(), ["revision", "title"]);
  assert.equal(beforePdf.titleEdit.title, "Dokumen transaksi");
  assert.ok(/^[a-f0-9]{64}$/.test(beforePdf.titleEdit.revision));
  const protectedFields = "select course_id, type, subcategory, year, file_url, chapter_ids, checksum from course_materials where id = $1";
  const originalPdf = (await pool.query(protectedFields, [materialId])).rows[0];
  const newTitle = { title: "Dokumen PDF tersimpan", expectedRevision: beforePdf.titleEdit.revision };
  const materialRequestId = randomUUID();
  const renamePdf = (input, key = randomUUID(), headers) => courseCommand(materialCommandPath, "PATCH", input, key, headers);
  assert.equal((await renamePdf(newTitle, randomUUID(), { cookie: fixtureCookie("tutor") })).status, 403);
  assert.equal((await renamePdf({ ...newTitle, fileUrl: "not-writable" })).status, 422);
  const foreignMaterial = `${collection}/fisika-dasar/documents/${materialId}/metadata`;
  assert.equal((await courseCommand(foreignMaterial, "PATCH", newTitle, randomUUID())).status, 404);
  const pdfConcurrent = await Promise.all([renamePdf(newTitle, materialRequestId), renamePdf(newTitle, materialRequestId)]);
  for (const reply of pdfConcurrent) {
    assert.equal(reply.status, 200, JSON.stringify(await reply.clone().json()));
    assert.deepEqual(await reply.json(), { status: "saved", requestId: materialRequestId });
  }
  const afterPdf = await read(materialPath);
  assert.equal(afterPdf.document.title, newTitle.title);
  assert.notEqual(afterPdf.titleEdit.revision, beforePdf.titleEdit.revision);
  assert.deepEqual((await pool.query(protectedFields, [materialId])).rows[0], originalPdf);
  assert.deepEqual((await pool.query("select title, canonical_uri_or_r2_key, status from sumber_materi where id = $1", [projectionId])).rows[0],
    { title: newTitle.title, canonical_uri_or_r2_key: materialKey, status: "active" });
  assert.equal((await renamePdf({ ...newTitle, title: "Payload berbeda" }, materialRequestId)).status, 409);
  assert.equal((await renamePdf(newTitle)).status, 409);
  assert.equal((await pool.query("select id from audit_mutasi where entity_type = 'native_course_material' and entity_id = $1", [materialId])).rowCount, 1);
  assert.equal((await pool.query("select cursor from offline_content_changes where course_id = $1 and kind = 'course' and action = 'invalidate'", [courseId])).rowCount, 1);

  const faultName = `native_pdf_retry_${suffix.replaceAll("-", "")}`;
  const faultSequence = `${faultName}_attempt`;
  await pool.query(`create sequence ${faultSequence};
    create function ${faultName}() returns trigger language plpgsql as $$
    begin
      if new.id = '${materialId}' then
        if new.title = 'Dokumen PDF sementara' and nextval('${faultSequence}') = 1 then
          raise serialization_failure;
        end if;
        if new.title = 'Dokumen PDF gagal sementara' then raise deadlock_detected; end if;
      end if;
      return new;
    end $$;
    create trigger ${faultName} before update on course_materials for each row execute function ${faultName}()`);
  try {
    const retryTitle = { title: "Dokumen PDF sementara", expectedRevision: afterPdf.titleEdit.revision };
    const retryRequest = randomUUID();
    const retried = await renamePdf(retryTitle, retryRequest);
    assert.equal(retried.status, 200, JSON.stringify(await retried.clone().json()));
    assert.deepEqual(await retried.json(), { status: "saved", requestId: retryRequest });
    const afterRetry = await read(materialPath);
    assert.equal(afterRetry.titleEdit.title, retryTitle.title);
    assert.equal((await pool.query(`select last_value from ${faultSequence}`)).rows[0].last_value, "2");
    assert.equal((await pool.query("select id from audit_mutasi where correlation_id = $1", [retryRequest])).rowCount, 1);
    assert.equal((await renamePdf({ ...retryTitle, title: "Judul dari revisi lama" })).status, 409);
    const failedRequest = randomUUID();
    const exhausted = await renamePdf({ title: "Dokumen PDF gagal sementara", expectedRevision: afterRetry.titleEdit.revision }, failedRequest);
    assert.equal(exhausted.status, 500);
    assert.equal((await read(materialPath)).titleEdit.revision, afterRetry.titleEdit.revision);
    assert.equal((await pool.query("select id from audit_mutasi where correlation_id = $1", [failedRequest])).rowCount, 0);
  } finally {
    await pool.query(`drop trigger ${faultName} on course_materials; drop function ${faultName}(); drop sequence ${faultSequence}`);
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
  const baseBefore = await read(resource);
  assert.equal(baseBefore.chapterEdit.allowsDescription, true);
  const chaptersEndpoint = `${resource}/chapters`;
  const chapterDraft = { title: "Bab transaksi", description: "Catatan uji", expectedRevision: baseBefore.chapterEdit.revision };
  const chapterKey = randomUUID();
  const append = (input, id = randomUUID(), headers) => courseCommand(chaptersEndpoint, "POST", input, id, headers);
  assert.equal((await append(chapterDraft, randomUUID(), { cookie: fixtureCookie("tutor") })).status, 403);
  assert.equal((await append({ ...chapterDraft, title: " " })).status, 422);
  const chapterCopies = await Promise.all([append(chapterDraft, chapterKey), append(chapterDraft, chapterKey)]);
  for (const response of chapterCopies) {
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    assert.deepEqual(await response.json(), { status: "saved", requestId: chapterKey });
  }
  const afterChapter = await read(resource);
  assert.equal(afterChapter.chapters.length, 1);
  assert.equal(afterChapter.chapters[0].title, chapterDraft.title);
  assert.equal(afterChapter.chapters[0].description, chapterDraft.description);
  assert.notEqual(afterChapter.chapterEdit.revision, baseBefore.chapterEdit.revision);
  const singleReceipt = await pool.query("select id from audit_mutasi where entity_type = 'native_course_chapter' and course_id = $1", [canonicalId]);
  assert.equal(singleReceipt.rowCount, 1);

  const chapterId = afterChapter.chapters[0].id;
  const editPath = `${chaptersEndpoint}/${encodeURIComponent(chapterId)}`;
  assert.equal((await courseCommand(editPath, "PATCH", chapterDraft, chapterKey)).status, 409);
  const foreignCourse = await read(`${collection}/fisika-dasar`);
  const foreign = await courseCommand(`${collection}/fisika-dasar/chapters/${encodeURIComponent(chapterId)}`, "PATCH",
    { ...chapterDraft, expectedRevision: foreignCourse.chapterEdit.revision }, randomUUID());
  assert.equal(foreign.status, 404);
  assert.equal((await append({ ...chapterDraft, title: "Bab kedua", expectedRevision: afterChapter.chapterEdit.revision })).status, 200);
  const editingChapter = await read(resource);
  const chapterRace = await Promise.all(["Bab edit satu", "Bab edit dua"].map((title) =>
    courseCommand(editPath, "PATCH", { ...chapterDraft, title, expectedRevision: editingChapter.chapterEdit.revision }, randomUUID())));
  assert.deepEqual(chapterRace.map((response) => response.status).sort(), [200, 409]);
  const afterEdit = await read(resource);
  assert.deepEqual(afterEdit.chapters.map(({ orderIndex }) => orderIndex), editingChapter.chapters.map(({ orderIndex }) => orderIndex));
  assert.ok(["Bab edit satu", "Bab edit dua"].includes(afterEdit.chapters[0].title));
  assert.equal(afterEdit.chapters[1].title, "Bab kedua");
  assert.equal((await append(chapterDraft, chapterKey)).status, 200);
  assert.equal((await read(resource)).chapterEdit.revision, afterEdit.chapterEdit.revision);

  await pool.query("insert into mata_kuliah(id,code,title) values ($1,$2,$3)", [standaloneId, `STANDALONE-${suffix}`, "Biologi canonical"]);
  const standalone = `${collection}/${standaloneId}`;
  const canonical = await read(standalone);
  assert.equal(canonical.chapterEdit.allowsDescription, false);
  const canonicalDraft = { ...chapterDraft, expectedRevision: canonical.chapterEdit.revision };
  assert.equal((await courseCommand(`${standalone}/chapters`, "POST", canonicalDraft, randomUUID())).status, 422);
  assert.equal((await courseCommand(`${standalone}/chapters`, "POST", { ...canonicalDraft, description: null }, randomUUID())).status, 200);
  assert.equal((await read(standalone)).chapters[0].title, chapterDraft.title);

  await pool.query("update bab set status = 'archived' where id = $1 and mata_kuliah_id = $2", [chapterId, canonicalId]);
  assert.equal((await append(chapterDraft, chapterKey)).status, 404);
  await pool.query("update mata_kuliah set status = 'archived' where id = $1", [canonicalId]);
  assert.equal((await patch(draft, requestId)).status, 404);
  assert.equal((await append(chapterDraft, chapterKey)).status, 404);
  assert.equal((await renamePdf(newTitle, materialRequestId)).status, 404);
  console.log("course slices, cross-course denial, settings, PDF titles and chapter replay, active target checks and revision races passed");
} finally {
  try {
    await pool.query(`delete from audit_mutasi where course_id = any($1) or entity_id = any($1)
      or entity_id in (select id from bab where mata_kuliah_id = any($1))`, [[canonicalId, standaloneId]]);
    await pool.query("delete from offline_content_changes where course_id = any($1)", [[canonicalId, standaloneId, courseId]]);
    await pool.query("delete from sumber_materi where id = $1 and mata_kuliah_id = $2", [projectionId, canonicalId]);
    await pool.query("delete from mata_kuliah where id = any($1)", [[canonicalId, standaloneId]]);
    await pool.query("delete from courses where id = $1", [courseId]);
  } finally {
    await pool.end();
  }
}
