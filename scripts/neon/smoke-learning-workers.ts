import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { and, eq, inArray, sql } from "drizzle-orm";
import { workerTarget, assertWorkerEnvironment } from "./worker-targets.mjs";
import { canonicalOutboxPayload } from "../../lib/vectorize/outbox";

const target = workerTarget(process.argv[2]);
const config = JSON.parse(await readFile(`${target.output}/.env.${target.name}.json`, "utf8"));
assertWorkerEnvironment(target, config);
assert.equal(config.INNGEST_SERVE_ORIGIN, target.origin);
Object.assign(process.env, config);
const [{ db, pool }, s, { inngest }, { vectorizeCanonicalDelete }, { CANONICAL_VECTOR_PROFILE }] = await Promise.all([
  import("../../lib/db"), import("../../db/schema"), import("../../jobs/client"),
  import("../../lib/vectorize-client"), import("../../lib/vectorize/contracts"),
]);
const id = `neon-learning-${randomUUID()}`;
const evidence: Array<{ functionId: string; eventId: string; runId: string; status: string }> = [];
let fixturesCreated = false, accepted = false;
const headers = { Authorization: `Bearer ${config.INNGEST_SIGNING_KEY}`, "X-Inngest-Env": config.INNGEST_ENV };
async function api(path: string) {
  const response = await fetch(`https://api.inngest.com/v2${path}`, { headers, signal: AbortSignal.timeout(20_000) });
  assert.equal(response.status, 200, "Inngest read failed");
  return response.json();
}
async function run(functionId: string, name: string, data: Record<string, unknown>, suffix = functionId) {
  const eventId = `${id}-${suffix}`;
  await writeFile(`${target.output}/learning-pending.json`, JSON.stringify({ fixtureId: id, functionId, eventId }));
  const sent = await inngest.send({ id: eventId, name, data });
  assert.equal(sent.ids.length, 1);
  await writeFile(`${target.output}/learning-pending.json`, JSON.stringify({ fixtureId: id, functionId, eventId: sent.ids[0] }));
  for (let attempt = 0; attempt < 160; attempt++) {
    const runs = await api(`/events/${encodeURIComponent(sent.ids[0])}/runs?include=output`);
    const execution = runs.data?.find((item: { function?: { id: string } }) => item.function?.id === functionId);
    if (execution && ["COMPLETED", "FAILED", "CANCELLED"].includes(execution.status.toUpperCase())) {
      evidence.push({ functionId, eventId: sent.ids[0], runId: execution.id, status: execution.status });
      await writeFile(`${target.output}/learning-smoke.json`, JSON.stringify({ fixtureId: id, accepted: false, evidence }, null, 2));
      assert.equal(execution.status.toUpperCase(), "COMPLETED", functionId);
      console.log(JSON.stringify(evidence.at(-1)));
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  throw new Error(`WORKER_SMOKE_PENDING:${functionId}`);
}
try {
  const database = await db.execute(sql`select current_database() as name`);
  assert.equal(database.rows[0].name, "neondb");
  const environments = await api("/envs?limit=250");
  assert.equal(environments.data?.length, 1);
  assert.equal(environments.data[0].id, target.inngestEnvironment);
  const eventKeys = await api("/keys/events?limit=100");
  assert.ok(eventKeys.data?.some((key: { key: string }) => key.key === config.INNGEST_EVENT_KEY), "Inngest event key target mismatch");
  const health = await fetch(`${target.origin}/health`, { signal: AbortSignal.timeout(30_000) });
  assert.equal(health.status, 200);
  const worker = await health.json();
  assert.equal(worker.functions, 22);
  assert.match(config.ZYX_COMPUTE_REVISION, /^[a-f0-9]{64}$/);
  assert.equal(worker.version, config.ZYX_COMPUTE_REVISION);

  await db.transaction(async tx => {
    await tx.insert(s.user).values({ id, name: "Neon learning fixture", email: `${id}@example.invalid`, role: "teacher" });
    await tx.insert(s.pengguna).values({ id, status: "active" });
    await tx.insert(s.courses).values({ id, title: "Neon learning fixture", category: "Matematika" });
    await tx.insert(s.chapters).values({ id, courseId: id, title: "Penjumlahan", orderIndex: 1 });
    await tx.insert(s.masterTeachingDocuments).values({ id, courseId: id, title: "Penjumlahan", markdownContent: "Jumlah dua bilangan a dan b adalah s=a+b. Jika a=2 dan b=3, maka s=5.", createdById: id, status: "active" });
    await tx.insert(s.concepts).values({ id, canonicalSlug: id });
    await tx.insert(s.knowledgeObjects).values({ id, courseId: id, mtdId: id, chapterId: id, conceptId: id, learningOrder: 1,
      title: "Penjumlahan dua bilangan", conceptName: "Penjumlahan", type: "formula", bloomLevel: "apply", status: "active",
      content: "$$s=a+b$$\nJumlah s diperoleh dengan menambahkan bilangan a dan b. Contoh: 2+3=5. Kedua bilangan memiliki satuan yang sama.",
      metadata: { latex: "s=a+b", parameters: [{ symbol: "s", name: "Jumlah", unit: "1" }, { symbol: "a", name: "Bilangan pertama", unit: "1" }, { symbol: "b", name: "Bilangan kedua", unit: "1" }], assumptions: ["Bilangan memiliki satuan yang sama."], whenToUse: ["Menghitung total dua bilangan."] } });
    await tx.insert(s.mataKuliah).values({ id, code: id, title: "Neon learning fixture", status: "draft", legacyCourseId: id });
    await tx.insert(s.bab).values({ id, mataKuliahId: id, code: "1", title: "Penjumlahan", orderIndex: 1, status: "draft" });
    await tx.insert(s.ide).values({ id, mataKuliahId: id, babId: id, stableKey: id, code: "1", canonicalStatement: "Jumlah dua bilangan adalah hasil penjumlahannya.", conciseExplanation: "Dua ditambah tiga sama dengan lima.", semanticHash: "a".repeat(64), generationHash: "b".repeat(64), creatorId: id, status: "draft" });
    await tx.insert(s.buktiPembelajaran).values({ id, penggunaId: id, ideId: id, evidenceSource: "deterministic_rubric", sourceId: id,
      scoreContribution: 1, confidence: 100, rubricVersion: "idea-evidence.v1", derivationStatus: "deterministic", affectsMastery: true, occurredAt: new Date() });
    await tx.insert(s.quizTemplates).values({ id, courseId: id, title: "Penjumlahan", category: "chapter", selectionRules: {} });
    await tx.insert(s.studentQuizAttempts).values({ id, studentId: id, templateId: id, status: "completed", score: 100, durationSeconds: 30,
      questionsSnapshot: [{ id, prompt: "Berapa hasil 2+3?", options: ["5", "6", "4", "3"], correct_indices: [0], explanation: "2+3=5", difficulty: "easy", time_spent_seconds: 30 }],
      answersSnapshot: { [id]: [0] }, submittedAt: new Date() });
    await tx.insert(s.aiGenerationJobs).values({ id, tutorId: id, courseId: id, status: "pending", promptParameters: { chapterId: id, koId: id }, targetCount: 1 });
  });
  fixturesCreated = true;
  await run("idea-mastery-recompute-v1", "mastery/idea-recompute.requested.v1", { studentId: id, ideaId: id, idempotencyKey: `${id}-initial` });
  const [first] = await db.select().from(s.pemahamanIde).where(and(eq(s.pemahamanIde.penggunaId, id), eq(s.pemahamanIde.ideId, id)));
  assert.ok(first);
  assert.equal(first.skor, 100);
  assert.equal(first.evidenceCount, 1);
  assert.ok(first.keyakinan > 0);
  const changes = await db.select().from(s.perubahanPemahaman).where(eq(s.perubahanPemahaman.pemahamanIdeId, first.id));
  assert.equal(changes.length, 1);
  await run("idea-mastery-recompute-v1", "mastery/idea-recompute.requested.v1", { studentId: id, ideaId: id, idempotencyKey: `${id}-replay` }, "mastery-replay");
  const [replay] = await db.select().from(s.pemahamanIde).where(eq(s.pemahamanIde.id, first.id));
  assert.equal(replay.version, first.version);
  assert.equal(replay.inputWatermark, first.inputWatermark);
  assert.equal((await db.select().from(s.perubahanPemahaman).where(eq(s.perubahanPemahaman.pemahamanIdeId, first.id))).length, changes.length);

  await run("student-quiz-analytics-worker", "quiz/analytics.requested", { attemptId: id, studentId: id, courseId: id });
  const [analytics] = await db.select().from(s.studentQuizAnalytics).where(eq(s.studentQuizAnalytics.attemptId, id));
  assert.equal(analytics?.status, "completed");
  const metrics = analytics.computedMetrics as { correctCount: number; totalQuestions: number };
  const diagnosis = analytics.aiDiagnosis as { headline: string; overall_summary: string };
  assert.equal(metrics.correctCount, 1);
  assert.equal(metrics.totalQuestions, 1);
  assert.ok(diagnosis.headline?.trim());
  assert.ok(diagnosis.overall_summary?.trim());

  await run("question-generation-worker", "ai.generation.job.start", { jobId: id, params: { courseId: id, tutorId: id, chapterId: id, koId: id, targetCount: 1 } });
  const [job] = await db.select().from(s.aiGenerationJobs).where(eq(s.aiGenerationJobs.id, id));
  assert.equal(job?.status, "completed");
  assert.ok(job.generatedCount > 0);
  const questions = await db.select().from(s.aiQuestionBank).where(and(eq(s.aiQuestionBank.courseId, id), eq(s.aiQuestionBank.knowledgeObjectId, id)));
  assert.equal(questions.length, job.generatedCount);
  for (const question of questions) {
    assert.ok(question.prompt.trim());
    assert.ok(Array.isArray(question.options) && question.options.length >= 2);
    assert.ok(Array.isArray(question.correctIndices) && question.correctIndices.length > 0);
  }
  // The same concurrency-1 worker serializes this check with generation's automatic follow-up.
  await run("vector-sync-worker", "vector.sync.dispatch", { courseId: id }, "owned-vector-finalize");
  const outbox = await db.select().from(s.vectorSyncQueue).where(eq(s.vectorSyncQueue.courseId, id));
  assert.ok(outbox.length > 0);
  const vectorIds = outbox.map(row => {
    assert.equal(row.courseId, id);
    assert.equal(row.status, "completed");
    const payload = row.payload as { id?: string; vectorizeCompletion?: { vectorId?: string } };
    assert.ok(questions.some(question => question.id === payload.id), "Vector must belong to a generated fixture question");
    const completion = payload.vectorizeCompletion;
    assert.ok(completion?.vectorId);
    assert.equal(completion.vectorId, canonicalOutboxPayload(row).vectorId);
    return completion.vectorId;
  });
  await vectorizeCanonicalDelete({ profileId: CANONICAL_VECTOR_PROFILE.id, ids: vectorIds });
  accepted = true;
  await writeFile(`${target.output}/learning-smoke.json`, JSON.stringify({ fixtureId: id, accepted, generatedQuestions: questions.length, deletedOwnedVectors: vectorIds.length, evidence }, null, 2));
} finally {
  try {
  if (fixturesCreated && accepted) {
    await db.transaction(async tx => {
      const masteries = await tx.select({ id: s.pemahamanIde.id }).from(s.pemahamanIde).where(eq(s.pemahamanIde.penggunaId, id));
      if (masteries.length) await tx.delete(s.perubahanPemahaman).where(inArray(s.perubahanPemahaman.pemahamanIdeId, masteries.map(row => row.id)));
      await tx.delete(s.pemahamanIde).where(and(eq(s.pemahamanIde.penggunaId, id), eq(s.pemahamanIde.ideId, id)));
      await tx.delete(s.buktiPembelajaran).where(eq(s.buktiPembelajaran.id, id));
      await tx.delete(s.ide).where(eq(s.ide.id, id));
      await tx.delete(s.bab).where(eq(s.bab.id, id));
      await tx.delete(s.mataKuliah).where(eq(s.mataKuliah.id, id));
      await tx.delete(s.studentQuizAnalytics).where(eq(s.studentQuizAnalytics.attemptId, id));
      await tx.delete(s.studentQuizAttempts).where(eq(s.studentQuizAttempts.id, id));
      await tx.delete(s.quizTemplates).where(eq(s.quizTemplates.id, id));
      const questions = await tx.select({ id: s.aiQuestionBank.id }).from(s.aiQuestionBank).where(eq(s.aiQuestionBank.courseId, id));
      if (questions.length) await tx.delete(s.distractorProvenance).where(inArray(s.distractorProvenance.questionId, questions.map(row => row.id)));
      await tx.delete(s.vectorSyncQueue).where(eq(s.vectorSyncQueue.courseId, id));
      await tx.delete(s.aiQuestionBank).where(eq(s.aiQuestionBank.courseId, id));
      await tx.delete(s.questionGenerationRuns).where(eq(s.questionGenerationRuns.courseId, id));
      await tx.delete(s.aiGenerationJobs).where(eq(s.aiGenerationJobs.id, id));
      await tx.delete(s.knowledgeObjects).where(eq(s.knowledgeObjects.id, id));
      await tx.delete(s.masterTeachingDocuments).where(eq(s.masterTeachingDocuments.id, id));
      await tx.delete(s.chapters).where(eq(s.chapters.id, id));
      await tx.delete(s.concepts).where(eq(s.concepts.id, id));
      await tx.delete(s.courses).where(eq(s.courses.id, id));
      await tx.delete(s.pengguna).where(eq(s.pengguna.id, id));
      await tx.delete(s.user).where(eq(s.user.id, id));
    });
    console.log(JSON.stringify({ fixtureId: id, cleanup: "complete" }));
  } else if (fixturesCreated) {
    await writeFile(`${target.output}/learning-retained.json`, JSON.stringify({ fixtureId: id, reason: "Acceptance incomplete; retain fixtures and downstream jobs for diagnosis", evidence }, null, 2));
    console.log(JSON.stringify({ fixtureId: id, cleanup: "retained" }));
  }
  } finally { await pool.end(); }
}
