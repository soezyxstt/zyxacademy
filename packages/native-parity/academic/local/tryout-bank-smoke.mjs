import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { fixtureCookie } from "./cookie.mjs";

const origin = "http://localhost:3314";
const api = "http://127.0.0.1:3314/api/native/academic-assessment";
const pool = new pg.Pool({ connectionString: "postgres://postgres:academic-local-only@127.0.0.1:55434/academic" });
const slug = "biologi-dasar";
const courseId = "academic-course-1";
const marker = `native-tryout-smoke-${randomUUID()}`;
const [first, second, unpublished, foreign, historical] = ["a", "b", "private", "foreign", "historical"].map((suffix) => `${marker}-${suffix}`);
const bankIds = [first, second, unpublished, foreign, historical];
const collection = `${api}/admin/${slug}/tryouts`;
let examId;

function request(url, body, { requestId = randomUUID(), role = "admin", requestOrigin = origin } = {}) {
  return fetch(url, {
    method: body ? "POST" : "GET",
    redirect: "manual",
    headers: {
      ...(role ? { cookie: fixtureCookie(role) } : {}),
      ...(body ? { Origin: requestOrigin, "Content-Type": "application/json", "Idempotency-Key": requestId } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function json(response, status) {
  assert.equal(response.status, status, await response.clone().text());
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  return response.json();
}

let fixtureVerified = false;
try {
  const fixture = await pool.query("select id from session where id = 'session-academic-admin' and user_id = 'academic-admin'");
  assert.equal(fixture.rowCount, 1);
  assert.equal((await json(await request(collection), 200)).course.id, courseId);
  fixtureVerified = true;
  await pool.query(`
    insert into ai_question_bank (id, course_id, origin, prompt, tags, options, correct_indices, explanation, review_status, quiz_eligible)
    select id,
      case when id = $2 then 'fisika-dasar' else $3 end,
      case when id = $4 then 'historical_reference' else 'zyx_original' end,
      'Soal ' || id, '[]', '["A", "B"]', '[1]', 'Pembahasan',
      case when id = $5 then 'generated' else 'published' end, true
    from unnest($1::text[]) as entries(id)
  `, [bankIds, foreign, slug, historical, unpublished]);
  const created = await json(await request(collection, {
    courseId, title: marker, timeLimitMinutes: 90, maxAttempts: 2, openAt: null, closeAt: null, expectedRevision: null,
  }), 201);
  examId = created.examId;
  const questionsPath = `${collection}/${encodeURIComponent(examId)}/questions`;
  const loaded = await json(await request(collection), 200);
  const choices = loaded.bank.filter((row) => bankIds.includes(row.id));
  assert.deepEqual(choices.map((row) => row.id).sort(), [first, second]);
  assert.deepEqual(Object.keys(choices[0]).sort(), ["difficulty", "id", "prompt", "tags", "type"]);
  const chooserDisclosures = await pool.query("select distinct question_id from gamification_question_bank_disclosures where user_id = 'academic-admin' and question_id = any($1) order by question_id", [bankIds]);
  assert.deepEqual(chooserDisclosures.rows.map((row) => row.question_id), [first, second]);
  const initial = loaded.tryouts.find((exam) => exam.id === examId);
  assert.match(initial.questionSetRevision, /^[0-9a-f]{64}$/);
  const draft = { courseId, expectedRevision: initial.questionSetRevision, action: "import", bankIds: [second, first] };
  assert.equal((await request(questionsPath, draft, { role: null })).status, 401);
  assert.equal((await request(questionsPath, draft, { role: "tutor" })).status, 403);
  assert.equal((await request(questionsPath, draft, { requestOrigin: "https://foreign.invalid" })).status, 403);
  assert.deepEqual(await json(await request(questionsPath, { ...draft, bankIds: [first, foreign] }), 409), { error: "TRYOUT_BANK_CHANGED" });
  const requestId = randomUUID();
  const retries = await Promise.all([request(questionsPath, draft, { requestId }), request(questionsPath, draft, { requestId })]);
  const [receipt, duplicate] = await Promise.all(retries.map((response) => json(response, 200)));
  assert.deepEqual(receipt, duplicate);
  assert.deepEqual(receipt, { requestId, examId, revision: receipt.revision, imported: 2, skipped: 0 });
  assert.deepEqual(await json(await request(questionsPath, { ...draft, bankIds: [first] }, { requestId }), 409), { error: "REQUEST_CONFLICT" });
  assert.deepEqual(await json(await request(questionsPath, draft), 409), { error: "REVISION_CONFLICT" });

  const saved = (await json(await request(collection), 200)).tryouts.find((exam) => exam.id === examId);
  assert.equal(saved.questionSetRevision, receipt.revision);
  assert.deepEqual(saved.questions.map((row) => [row.bankQuestionId, row.order, row.correctIndices]), [[second, 1, [1]], [first, 2, [1]]]);
  const removal = { courseId, expectedRevision: saved.questionSetRevision, action: "remove", questionId: saved.questions[0].id };
  const removalId = randomUUID();
  const removed = await json(await request(questionsPath, removal, { requestId: removalId }), 200);
  assert.deepEqual(await json(await request(questionsPath, removal, { requestId: removalId }), 200), removed);
  const latest = (await json(await request(collection), 200)).tryouts.find((exam) => exam.id === examId);
  assert.equal(latest.status, "draft");
  assert.equal(latest.questionSetRevision, removed.revision);
  assert.deepEqual(latest.questions.map((row) => row.bankQuestionId), [first]);

  await pool.query("insert into submissions (id, user_id, exam_id) values ($1, 'academic-admin', $2)", [marker, examId]);
  const used = (await json(await request(collection), 200)).tryouts.find((exam) => exam.id === examId);
  assert.equal(used.questionSetRevision, undefined);
  assert.deepEqual(await json(await request(questionsPath, {
    ...removal, questionId: latest.questions[0].id, expectedRevision: latest.questionSetRevision,
  }), 409), { error: "TRYOUT_HAS_SUBMISSIONS" });

  const disclosures = await pool.query("select count(*)::int as count from gamification_question_bank_disclosures where user_id = 'academic-admin' and question_id = any($1)", [bankIds]);
  assert.ok(disclosures.rows[0].count > chooserDisclosures.rowCount);
  const audits = await pool.query("select count(*)::int as count from audit_mutasi where entity_id = $1 and action = 'tryout_question:manage'", [examId]);
  assert.equal(audits.rows[0].count, 2);
  console.log("Tryout bank local HTTP/PG: scoped picker, disclosure, authorization, ordered import, concurrent replay, stale conflict and removal passed");
} finally {
  try {
    if (fixtureVerified) {
      await pool.query("delete from gamification_question_exposure_projection where question_id = any($1)", [bankIds]);
      await pool.query("delete from gamification_question_bank_disclosures where question_id = any($1)", [bankIds]);
      if (examId) {
        await pool.query("delete from audit_mutasi where entity_id = $1", [examId]);
        await pool.query("delete from submissions where id = $1 and exam_id = $2", [marker, examId]);
        await pool.query("delete from questions where exam_id = $1", [examId]);
        await pool.query("delete from exams where id = $1", [examId]);
      }
      await pool.query("delete from ai_question_bank where id = any($1)", [bankIds]);
    }
  } finally {
    await pool.end();
  }
}
