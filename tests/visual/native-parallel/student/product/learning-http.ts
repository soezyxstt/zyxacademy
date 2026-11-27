import assert from "node:assert/strict";
import { makeSignature } from "better-auth/crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { bab, flashcard, setFlashcard } from "../../../../../db/schema";
import type { LearningData, LearningView, StudyDayPlan, StudyPathStep } from "../../../../../packages/native-parity/student/learning/contracts";
import { learningEvidence, learningEvidenceDatabase } from "./learning-seed";

const origin = new URL(process.env.BETTER_AUTH_URL ?? "");
const secret = process.env.BETTER_AUTH_SECRET;
assert(["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname) && secret && secret.length >= 32,
  "Expected a loopback Next server and a synthetic Better Auth secret");

const { learner, visitor, course, canonical, concept, pkaCanonical } = learningEvidence;
const previewCardId = `${course}-card`;
const cardId = `${course}-full-access-card`;
const conceptName = "Limit dari dua arah";
const learningPath = "/api/native/student/learning";
const studyPath = "/api/student/study-path?" + new URLSearchParams({ courseId: course, days: "3" });
const reviewInput = { action: "flashcard-review", courseId: course, flashcardId: cardId, grade: 3, isExamMode: false };
const database = new Client({ connectionString: learningEvidenceDatabase().href });
const cookies = new Map<string, string>();
const counts = new Map<number, number>();
type Ready = Extract<LearningData, { state: "ready" }>;

async function request(path: string, status: number, actor?: string, payload?: unknown, expected = actor) {
  const headers = new Headers({ "x-app-locale": "id" });
  if (actor) {
    const cookie = cookies.get(actor);
    assert(cookie, "Missing synthetic Student session");
    headers.set("cookie", cookie);
    headers.set("x-student-id", expected ?? actor);
  }
  if (payload !== undefined) headers.set("content-type", "application/json");
  const response = await fetch(new URL(path, origin), {
    method: payload === undefined ? "GET" : "POST", headers,
    body: payload === undefined ? undefined : JSON.stringify(payload),
    redirect: "error", signal: AbortSignal.timeout(180_000),
  });
  assert.equal(response.status, status, `Unexpected HTTP status for ${path}`);
  if (path.startsWith(learningPath) || status === 200) assert.equal(response.headers.get("cache-control"), "private, no-store");
  counts.set(status, (counts.get(status) ?? 0) + 1);
  return response.json();
}

const query = (view: LearningView, params: Record<string, string> = {}) =>
  learningPath + "?" + new URLSearchParams({ view, ...params });
const courseQuery = (view: LearningView) => query(view, { courseId: course, ...(view === "concept" ? { slug: concept } : {}) });
function ready<T extends Ready["view"]>(view: T, data: Ready): asserts data is Extract<Ready, { view: T }> {
  assert.equal(data.state, "ready");
  assert.equal(data.view, view);
}

async function assertPreviewOnly(actor: string) {
  for (const view of ["mastery", "path", "concept"] as const) {
    assert.deepEqual(await request(courseQuery(view), 200, actor), { view, state: "locked", courseTitle: "Matematika Referensi" });
  }
  const preview: Ready = await request(courseQuery("flashcard"), 200, actor);
  ready("flashcard", preview);
  assert.deepEqual(preview.cards.map(item => item.id), [previewCardId]);
  const video: Ready = await request(courseQuery("video"), 200, actor);
  ready("video", video);
  assert.equal(video.hasFullContentAccess, false);
  const videos = video.playlists.flatMap(playlist => playlist.videos);
  assert.equal(videos.find(item => item.id === `${course}-video`)?.locked, true);
  assert(!JSON.stringify(videos).includes("/learning-evidence-video.mp4"));
  await request(studyPath, 403, actor);
  await request(learningPath, 403, actor, reviewInput);
}

async function reviewRows() {
  return (await database.query<{ owner: string; grade: number; due: Date }>(
    `SELECT progress.pengguna_id AS owner, review.grade::int, progress.due_at AS due
     FROM review_flashcard review
     JOIN kemajuan_flashcard_murid progress ON progress.id = review.kemajuan_flashcard_murid_id
     WHERE progress.flashcard_id = $1`, [cardId],
  )).rows;
}

await database.connect();
try {
  for (const id of [learner, visitor]) {
    const result = await database.query<{ token: string }>(
      "SELECT token FROM session WHERE id = $1 AND user_id = $1 AND expires_at > now()", [id],
    );
    assert.equal(result.rowCount, 1, "Run learning-seed.ts in a disposable database first");
    const token = result.rows[0].token;
    cookies.set(id, "better-auth.session_token=" + encodeURIComponent(token + "." + await makeSignature(token, secret)));
  }
  assert.equal((await reviewRows()).length, 0, "The seeded flashcard must be unreviewed");
  assert.deepEqual(await request(courseQuery("mastery"), 401), { code: "SESSION_EXPIRED" });
  assert.deepEqual(await request(courseQuery("mastery"), 409, learner, undefined, visitor), { code: "ACCOUNT_CHANGED" });
  assert.deepEqual(await request(learningPath, 401, undefined, reviewInput), { code: "SESSION_EXPIRED" });
  assert.deepEqual(await request(learningPath, 409, learner, reviewInput, visitor), { code: "ACCOUNT_CHANGED" });

  const mastery: Ready = await request(courseQuery("mastery"), 200, learner);
  ready("mastery", mastery);
  assert(mastery.groups.flatMap(group => group.concepts)
    .some(item => item.conceptName === conceptName && item.masteryScore === 56 && item.confidence === 75));
  const path: Ready = await request(courseQuery("path"), 200, learner);
  ready("path", path);
  const planned: { steps: StudyPathStep[]; dayPlan: StudyDayPlan[] } = await request(studyPath, 200, learner);
  assert(planned.steps.some(step => step.conceptName === conceptName));
  assert.deepEqual(planned.dayPlan.map(day => day.day), [1]);
  assert(planned.dayPlan[0].steps.some(step => step.conceptName === conceptName));
  const explorer: Ready = await request(courseQuery("concept"), 200, learner);
  ready("concept", explorer);
  assert.equal(explorer.concept.canonicalSlug, concept);
  assert(explorer.concept.kosByType.definition?.some(item => item.content.includes("nilai dari kiri dan kanan")));
  const video: Ready = await request(courseQuery("video"), 200, learner);
  ready("video", video);
  assert.equal(video.hasFullContentAccess, true);
  const videos = video.playlists.flatMap(playlist => playlist.videos);
  assert(videos.some(item => item.id === `${course}-video` && !item.locked && item.duration === 312));
  assert(!JSON.stringify(videos).includes("/learning-evidence-video.mp4"));
  // The checked-in learning seed has only the preview chapter. Add a scoped card
  // in a second chapter to exercise denial independently of title or account binding.
  await drizzle(database).transaction(async tx => {
    const chapterId = `${canonical}-full-access`, deckId = `${course}-full-access-deck`;
    await tx.insert(bab).values({ id: chapterId, mataKuliahId: canonical, code: "LE-B2", title: "Limit lanjutan",
      status: "active", orderIndex: 2 }).onConflictDoNothing();
    await tx.insert(setFlashcard).values({ id: deckId, mataKuliahId: canonical, babId: chapterId, title: "Limit lanjutan",
      status: "published", generationHash: deckId, creatorId: learner, publishedAt: new Date("2026-07-01T07:00:00Z") }).onConflictDoNothing();
    await tx.insert(flashcard).values({ id: cardId, setFlashcardId: deckId, front: "Kapan limit dua arah setara?",
      back: "Ketika kedua limit satu arah sama.", status: "published", generationHash: cardId }).onConflictDoNothing();
  });
  const queue: Ready = await request(courseQuery("flashcard"), 200, learner);
  ready("flashcard", queue);
  assert(queue.cards.some(item => item.id === cardId && item.dueStatus === "new"));

  const home: Ready = await request(query("pka-home"), 200, learner);
  ready("pka-home", home);
  assert.equal(home.simulationCount, 9);
  assert.equal(home.bestScore, 85);
  assert.equal(home.nextSession?.title, "Diskusi limit PKA");
  const schedule: Ready = await request(query("pka-schedule"), 200, learner);
  ready("pka-schedule", schedule);
  assert(schedule.schedules.some(item => item.isPast && item.meetLink === null));
  const report: Ready = await request(query("pka-report"), 200, learner);
  ready("pka-report", report);
  assert(report.results.some(item => item.subject === "fisika" && item.bestScore === 85));
  const stageQuery = query("pka-stage", { subject: "matematika", stage: "2" });
  const stage: Ready = await request(stageQuery, 200, learner);
  ready("pka-stage", stage);
  assert.equal(stage.stage.status, "locked");
  assert.equal(stage.template.id, `${pkaCanonical}-matematika-2`);
  assert.equal(stage.attempt, null);
  for (const view of ["pka-home", "pka-schedule", "pka-report", "pka-material", "pka-simulation", "pka-stage"] as const) {
    assert.deepEqual(await request(view === "pka-stage" ? stageQuery : query(view), 200, visitor),
      { view, state: "redirect", path: "/courses/tutorial-pka/daftar" });
  }
  await assertPreviewOnly(visitor);
  assert.equal((await reviewRows()).length, 0);

  const review: { nextReviewDue: string; nextIntervalDays: number; nextBox: number } = await request(learningPath, 200, learner, reviewInput);
  assert(Date.parse(review.nextReviewDue) > Date.now());
  assert(review.nextIntervalDays > 0 && review.nextBox > 0);
  const saved = await reviewRows();
  assert.deepEqual(saved, [{ owner: learner, grade: 3, due: new Date(review.nextReviewDue) }]);
  const nextQueue: Ready = await request(courseQuery("flashcard"), 200, learner);
  ready("flashcard", nextQueue);
  assert(!nextQueue.cards.some(item => item.id === cardId));

  const expired = new Date(0);
  const enrollment = await database.query<{ expires_at: Date }>(
    "SELECT expires_at FROM enrollments WHERE id = $1 AND user_id = $2 AND course_id = $3", [`${learner}-math`, learner, course],
  );
  const registration = await database.query<{ end_at: Date }>(
    "SELECT end_at FROM pendaftaran_murid WHERE id = $1 AND pengguna_id = $2 AND mata_kuliah_id = $3", [`${learner}-math`, learner, canonical],
  );
  assert.equal(enrollment.rowCount, 1);
  assert.equal(registration.rowCount, 1);
  try {
    await database.query("UPDATE enrollments SET expires_at = $1 WHERE id = $2", [expired, `${learner}-math`]);
    await database.query("UPDATE pendaftaran_murid SET end_at = $1 WHERE id = $2", [expired, `${learner}-math`]);
    await assertPreviewOnly(learner);
    assert.deepEqual(await reviewRows(), saved);
  } finally {
    await database.query("UPDATE enrollments SET expires_at = $1 WHERE id = $2", [enrollment.rows[0].expires_at, `${learner}-math`]);
    await database.query("UPDATE pendaftaran_murid SET end_at = $1 WHERE id = $2", [registration.rows[0].end_at, `${learner}-math`]);
  }
  console.log("Verified signed Student learning, PKA, flashcard persistence and same-session access withdrawal",
    JSON.stringify(Object.fromEntries(counts)));
} finally {
  await database.end();
}
