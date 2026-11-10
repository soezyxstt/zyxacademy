import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { and, eq, inArray, ne, or, sql } from "drizzle-orm";
import { workerTarget, assertWorkerEnvironment } from "./worker-targets.mjs";
import { todayUtc, daysFrom } from "../../lib/date-utils";

// No web deployment, email-producing worker, assessment catalog writes, or PDF jobs.
export function remainingSmokeArguments(args: string[]) {
  const target = workerTarget(args[0]);
  assert.equal(target.name, "production", "REMAINING_SMOKE_PRODUCTION_REQUIRED");
  const tail = args.slice(1);
  const deterministic = tail[0] === "--deterministic";
  if (deterministic) tail.shift();
  const skipSearch = tail[0] === "--skip-search";
  if (skipSearch) tail.shift();
  const resume = tail[0] === "--resume" ? tail[1] : undefined;
  assert.ok(tail.length === 0 || (tail.length === 2 && resume
    && /^neon-remaining-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(resume)), "REMAINING_SMOKE_ARGUMENTS_INVALID");
  assert.ok(!skipSearch || (deterministic && resume), "REMAINING_SMOKE_SKIP_SEARCH_REQUIRES_DETERMINISTIC_RESUME");
  return { target, deterministic, skipSearch, resume };
}

type RunSummary = { id: string; status: string; function?: { id: string }; output?: unknown };
export async function readRemainingRun(
  read: (path: string) => Promise<{ data?: RunSummary | RunSummary[] } | undefined>, functionId: string, runId: string,
) {
  const direct = await read(`/runs/${encodeURIComponent(runId)}?include=output`);
  const summary = direct?.data && !Array.isArray(direct.data) ? direct.data : undefined;
  if (summary?.output !== undefined) return summary;
  // The single-run beta API can briefly return 404 after invoke succeeds.
  const listed = await read(`/apps/zyx-academy/functions/${encodeURIComponent(functionId)}/runs?include=output&limit=100`);
  const candidate = (Array.isArray(listed?.data) ? listed.data.find(run => run.id === runId) : undefined) ?? summary;
  return candidate?.status.toUpperCase() === "COMPLETED" && candidate.output === undefined ? undefined : candidate;
}

export async function waitForOwnedSearchVector(
  read: () => Promise<Array<{ id: string; metadata?: Record<string, unknown> }>>,
  id: string,
  present: boolean,
  pause: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, 3000)),
) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const matches = await read();
    // The caller uses the strict HTTP port, so an HTTP error cannot look like deletion.
    assert.ok(matches.every(match => match.id === id), "REMAINING_SEARCH_FOREIGN_RESULT");
    if (present && matches.some(match => match.id === id)) {
      assert.ok(matches.every(match => match.metadata?.course_id === id
        && match.metadata?.entity_id === id && match.metadata?.min_role === 3), "REMAINING_SEARCH_METADATA_MISMATCH");
      return;
    }
    if (!present && matches.length === 0) return;
    if (attempt < 99) await pause();
  }
  throw new Error(present ? "REMAINING_SEARCH_VECTOR_MISSING" : "REMAINING_SEARCH_VECTOR_DELETE_PENDING");
}

export function assertDeterministicOutput(functionId: string, output: Record<string, unknown>) {
  if (functionId === "mastery-snapshot-cron") {
    assert.ok(Number.isInteger(output.activeStudents) && Number(output.activeStudents) > 0, "REMAINING_SNAPSHOT_NO_STUDENTS");
    assert.ok(Number.isInteger(output.snapshotsWritten) && Number(output.snapshotsWritten) > 0, "REMAINING_SNAPSHOT_NO_EVIDENCE");
  } else {
    assert.equal(output.failed, 0, "REMAINING_CRON_PARTIAL_FAILURE");
    assert.ok(Number.isInteger(output.activeCourseIds) && Number(output.activeCourseIds) > 0, "REMAINING_CRON_NO_COURSES");
    if (functionId === "course-analytics-snapshot-cron") assert.equal(output.built, output.activeCourseIds, "REMAINING_ANALYTICS_INCOMPLETE");
    else assert.ok(Number.isInteger(output.flagged) && Number(output.flagged) >= 2, "REMAINING_QUALITY_NO_FIXTURE_FLAGS");
  }
}

async function main() {
  const { target, deterministic: requestedDeterministic, skipSearch, resume } = remainingSmokeArguments(process.argv.slice(2));
  const config = JSON.parse(await readFile(`${target.output}/.env.${target.name}.json`, "utf8"));
  assertWorkerEnvironment(target, config);
  assert.equal(config.INNGEST_SERVE_ORIGIN, target.origin);
  Object.assign(process.env, config);
  const [{ db, pool }, s, search] = await Promise.all([
    import("../../lib/db"), import("../../db/schema"), import("../../lib/search/service"),
  ]);
  const prior = resume ? JSON.parse(await readFile(`${target.output}/remaining-smoke.json`, "utf8")) : undefined;
  if (prior) {
    assert.equal(prior.fixtureId, resume, "REMAINING_SMOKE_RESUME_EVIDENCE_MISMATCH");
    assert.equal(prior.cleanupComplete, false, "REMAINING_SMOKE_ALREADY_CLEANED");
    assert.ok(Array.isArray(prior.evidence), "REMAINING_SMOKE_RESUME_RUNS_MISSING");
    assert.ok(!requestedDeterministic || prior.deterministic, "REMAINING_SMOKE_RESUME_SCOPE_MISMATCH");
  }
  const deterministic = prior ? prior.deterministic === true : requestedDeterministic;
  const id = resume ?? `neon-remaining-${randomUUID()}`;
  const conceptName = id;
  const evidence: Array<{ functionId: string; runId: string; eventId?: string; status: string }> = prior?.evidence ?? [];
  assert.ok(evidence.every(item => typeof item.runId === "string" && (item.runId.length > 0 || typeof item.eventId === "string" && item.eventId.length > 0)
    && ["sync-search-documents", "mastery-recompute-worker", "mastery-snapshot-cron", "course-analytics-snapshot-cron", "content-quality-audit-cron"].includes(item.functionId)), "REMAINING_SMOKE_RESUME_RUNS_INVALID");
  const checks: Record<string, unknown> = prior?.checks ?? {};
  let fixturesCreated = false, accepted = false, independentAccepted = false, cleanupComplete = false, stage = "preflight";
  const headers = { Authorization: `Bearer ${config.INNGEST_SIGNING_KEY}`, "X-Inngest-Env": config.INNGEST_ENV };
  const pause = () => new Promise(resolve => setTimeout(resolve, 3000));
  async function save() {
    await writeFile(`${target.output}/remaining-smoke.json`, JSON.stringify({ fixtureId: id, deterministic, skipSearch, accepted, independentAccepted, cleanupComplete, stage, checks, evidence,
      excluded: ["weekly-reflection-cron: sends emails", "assessment-ingest-worker: global catalog ownership", "product-diktat-pdf-worker: separate acceptance"] }, null, 2));
  }
  async function api(path: string, init: RequestInit = {}, allowMissing = false) {
    const response = await fetch(`https://api.inngest.com/v2${path}`, { ...init,
      headers: { ...headers, "Content-Type": "application/json" }, signal: AbortSignal.timeout(30_000) });
    if (allowMissing && response.status === 404) return undefined;
    assert.ok(response.ok, `REMAINING_INNGEST_HTTP_${response.status}`);
    return response.json();
  }
  async function run(functionId: string, data: Record<string, unknown>) {
    stage = `invoke:${functionId}`;
    await save();
    let item = evidence.find(entry => entry.functionId === functionId);
    if (!item) {
      // Inngest rejects direct invocation of debounced functions.
      if (functionId === "mastery-recompute-worker") {
        const { inngest } = await import("../../jobs/client");
        const sent = await inngest.send({ id: `${id}-${functionId}`, name: "mastery/recompute.requested", data });
        assert.equal(sent.ids.length, 1, "REMAINING_MASTERY_EVENT_MISSING");
        item = { functionId, runId: "", eventId: sent.ids[0], status: "pending" };
      } else {
        const response = await api(`/apps/zyx-academy/functions/${encodeURIComponent(functionId)}/invoke`, {
          method: "POST", body: JSON.stringify({ data, idempotencyKey: `${id}-${functionId}` }),
        });
        assert.equal(typeof response.data?.runId, "string", "REMAINING_INVOKE_RUN_MISSING");
        item = { functionId, runId: response.data.runId as string, status: "pending" };
      }
      evidence.push(item);
    }
    await save();
    for (let attempt = 0; attempt < 220; attempt++) {
      const execution: RunSummary | undefined = item.eventId
        ? (await api(`/events/${encodeURIComponent(item.eventId)}/runs?include=output`)).data?.find((run: RunSummary) => run.function?.id === functionId)
        : await readRemainingRun(path => api(path, {}, true), functionId, item.runId);
      if (!execution) { await pause(); continue; }
      item.runId = execution.id;
      assert.equal(execution?.function?.id, functionId, "REMAINING_RUN_FUNCTION_MISMATCH");
      item.status = String(execution.status).toUpperCase();
      if (["COMPLETED", "FAILED", "CANCELLED", "SKIPPED"].includes(item.status)) {
        await save();
        assert.equal(item.status, "COMPLETED", "REMAINING_RUN_NOT_COMPLETED");
        const output = typeof execution.output === "string" ? JSON.parse(execution.output) : execution.output;
        if (output === undefined || output === null) { await pause(); continue; }
        assert.ok(output && typeof output === "object", "REMAINING_RUN_OUTPUT_MISSING");
        return output as Record<string, unknown>;
      }
      await pause();
    }
    throw new Error("REMAINING_RUN_PENDING");
  }
  // Use a strict port rather than querySearchVectors, whose fallback masks HTTP errors.
  async function searchPost(path: string, body: unknown) {
    const response = await fetch(`${String(config.VECTORIZE_WORKER_URL).replace(/\/$/, "")}${path}`, {
      method: "POST", headers: { Authorization: `Bearer ${config.VECTORIZE_SHARED_SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(30_000),
    });
    assert.equal(response.status, 200, "REMAINING_SEARCH_HTTP_FAILURE");
    return response.json();
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
    assert.equal(new URL(config.VECTORIZE_WORKER_URL).origin, "https://zyx-vector-api-background.16922204.workers.dev", "REMAINING_SEARCH_TARGET_MISMATCH");
    assert.ok(config.VECTORIZE_SHARED_SECRET, "REMAINING_SEARCH_SECRET_MISSING");
    // Both handlers drain a global queue. Refuse any existing pending/processing work.
    const searchPending = await db.select({ id: s.searchDocuments.id }).from(s.searchDocuments)
      .where(and(ne(s.searchDocuments.id, id), or(eq(s.searchDocuments.isSynced, false), ne(s.searchDocuments.syncStatus, "completed")))).limit(1);
    const masteryPending = await db.select({ id: s.masteryRecomputeQueue.id }).from(s.masteryRecomputeQueue)
      .where(and(ne(s.masteryRecomputeQueue.studentId, id), inArray(s.masteryRecomputeQueue.status, ["pending", "processing", "failed"]))).limit(1);
    assert.equal(searchPending.length, 0, "REMAINING_SEARCH_GLOBAL_QUEUE_NOT_EMPTY");
    assert.equal(masteryPending.length, 0, "REMAINING_MASTERY_GLOBAL_QUEUE_NOT_EMPTY");
    checks.preflight = { database: "neondb", workerRevision: worker.version, searchQueueEmpty: true, masteryQueueEmpty: true };
    if (resume) {
      stage = "verify-retained-owned-fixtures";
      const [owner] = await db.select().from(s.user).where(eq(s.user.id, id));
      const [course] = await db.select().from(s.courses).where(eq(s.courses.id, id));
      const [chapter] = await db.select().from(s.chapters).where(eq(s.chapters.id, id));
      const [mtd] = await db.select().from(s.masterTeachingDocuments).where(eq(s.masterTeachingDocuments.id, id));
      const [ko] = await db.select().from(s.knowledgeObjects).where(eq(s.knowledgeObjects.id, id));
      const [event] = await db.select().from(s.learningEvents).where(eq(s.learningEvents.id, id));
      const [document] = await db.select().from(s.searchDocuments).where(eq(s.searchDocuments.id, id));
      assert.equal(owner?.email, `${id}@example.invalid`, "REMAINING_SMOKE_RESUME_OWNER_MISMATCH");
      assert.equal(owner.name, "Neon remaining worker fixture");
      assert.equal(owner.role, "student");
      assert.equal(course?.title, "Neon remaining worker fixture", "REMAINING_SMOKE_RESUME_COURSE_MISMATCH");
      assert.equal(chapter?.courseId, id);
      assert.equal(mtd?.courseId, id);
      assert.equal(mtd.createdById, id);
      assert.equal(ko?.courseId, id);
      assert.equal(ko.chapterId, id);
      assert.equal(ko.mtdId, id);
      assert.equal(ko.conceptId, id);
      assert.equal(ko.conceptName, conceptName);
      assert.equal(event?.studentId, id);
      assert.equal(event.courseId, id);
      assert.equal(event.koId, id);
      assert.equal(event.correctness, 1);
      assert.equal(event.weight, 1);
      assert.equal(document?.courseId, id);
      assert.equal(document.entityId, id);
      assert.equal(document.minRole, 3);
      assert.equal(document.path, `/admin/courses/${id}`);
      if (deterministic) {
        const [enrollment] = await db.select().from(s.enrollments).where(eq(s.enrollments.id, id));
        const [question] = await db.select().from(s.aiQuestionBank).where(eq(s.aiQuestionBank.id, id));
        assert.equal(enrollment?.userId, id);
        assert.equal(enrollment.courseId, id);
        assert.ok(enrollment.expiresAt > new Date(), "REMAINING_SMOKE_RESUME_ENROLLMENT_EXPIRED");
        assert.equal(question?.courseId, id);
        assert.equal(question.quizEligible, false);
        assert.equal(question.prompt, "Berapakah 2+3?");
        const stats = await db.select().from(s.questionOptionStats).where(eq(s.questionOptionStats.questionId, id));
        assert.deepEqual(stats.map(row => row.id).sort(), [`${id}-correct`, `${id}-total`, `${id}-wrong`]);
        assert.ok(stats.every(row => row.courseId === id && row.totalAttempts === 10));
      }
    } else {
    stage = "create-owned-fixtures";
    await save();
    await db.transaction(async tx => {
      await tx.insert(s.user).values({ id, name: "Neon remaining worker fixture", email: `${id}@example.invalid`, role: "student", lastActivityAt: new Date() });
      await tx.insert(s.pengguna).values({ id, status: "active" });
      await tx.insert(s.courses).values({ id, title: "Neon remaining worker fixture", category: "Matematika" });
      await tx.insert(s.chapters).values({ id, courseId: id, title: "Penjumlahan", orderIndex: 1 });
      await tx.insert(s.masterTeachingDocuments).values({ id, courseId: id, title: "Penjumlahan", markdownContent: "Penjumlahan dua bilangan: 2+3=5.", createdById: id, status: "active" });
      await tx.insert(s.concepts).values({ id, canonicalSlug: id });
      await tx.insert(s.knowledgeObjects).values({ id, courseId: id, mtdId: id, chapterId: id, conceptId: id, learningOrder: 1,
        title: "Penjumlahan", conceptName, type: "formula", bloomLevel: "apply", status: "active", content: "2+3=5" });
      await tx.insert(s.learningEvents).values({ id, studentId: id, courseId: id, koId: id, conceptName, eventType: "quiz_answer", correctness: 1, weight: 1 });
      await tx.insert(s.searchDocuments).values({ id, entityType: "course", entityId: id, courseId: id, title: id,
        searchableText: `Penjumlahan dua bilangan. ${id}`, path: `/admin/courses/${id}`, minRole: 3 });
      if (deterministic) {
        await tx.insert(s.enrollments).values({ id, userId: id, courseId: id, expiresAt: daysFrom(1) });
        await tx.insert(s.aiQuestionBank).values({ id, courseId: id, prompt: "Berapakah 2+3?", options: ["5", "6"], correctIndices: [0],
          explanation: "2+3=5", reviewStatus: "published", quizEligible: false, qualityScore: 1 });
        await tx.insert(s.questionOptionStats).values([
          { id: `${id}-total`, questionId: id, courseId: id, optionIndex: -1, totalAttempts: 10 },
          { id: `${id}-correct`, questionId: id, courseId: id, optionIndex: 0, selectedCount: 10, totalAttempts: 10 },
          { id: `${id}-wrong`, questionId: id, courseId: id, optionIndex: 1, selectedCount: 0, totalAttempts: 10 },
        ]);
      }
    });
    }
    fixturesCreated = true;
    let vector: number[] | undefined;
    const readMatches = async () => {
      assert.ok(vector, "REMAINING_SEARCH_QUERY_VECTOR_MISSING");
      const result = await searchPost("/v2/search/query", { vector, topK: 1, course_id: id, min_role: 3 });
      assert.ok(Array.isArray(result.matches), "REMAINING_SEARCH_INVALID_RESPONSE");
      return result.matches;
    };
    if (!skipSearch) {
      await run("sync-search-documents", {});
      const [document] = await db.select().from(s.searchDocuments).where(eq(s.searchDocuments.id, id));
      assert.equal(document.isSynced, true);
      assert.equal(document.syncStatus, "completed");
      stage = "verify-owned-search-vector";
      vector = await search.embedSearchDocument(id, `Penjumlahan dua bilangan. ${id}`);
      await waitForOwnedSearchVector(readMatches, id, true);
      checks.search = { rowCompleted: true, exactOwnedVector: true, adminOnly: true };
    } else {
      checks.search = { status: "not_verified", reason: "Physical search acceptance deferred; owned fixture retained" };
    }
    await run("mastery-recompute-worker", { studentId: id, courseId: id, reason: id });
    const queue = await db.select().from(s.masteryRecomputeQueue).where(and(eq(s.masteryRecomputeQueue.studentId, id), eq(s.masteryRecomputeQueue.courseId, id)));
    assert.ok(queue.length > 0, "REMAINING_MASTERY_QUEUE_MISSING");
    assert.ok(queue.every(row => row.status === "completed" && row.retries === 0), "REMAINING_MASTERY_QUEUE_INCOMPLETE");
    const [concept] = await db.select().from(s.studentConceptMastery).where(and(eq(s.studentConceptMastery.studentId, id), eq(s.studentConceptMastery.courseId, id)));
    const [chapter] = await db.select().from(s.studentChapterMastery).where(and(eq(s.studentChapterMastery.studentId, id), eq(s.studentChapterMastery.courseId, id)));
    assert.equal(concept?.conceptName, conceptName);
    assert.equal(concept.evidenceCount, 1);
    assert.ok(concept.masteryScore > 0 && concept.masteryScore <= 100);
    assert.equal(chapter?.chapterId, id);
    assert.equal(chapter.evidenceCount, 1);
    assert.equal(chapter.masteryScore, concept.masteryScore);
    checks.mastery = { queueCompleted: true, recomputations: queue.length, conceptEvidenceCount: concept.evidenceCount, chapterEvidenceCount: chapter.evidenceCount };
    if (deterministic) {
      stage = "deterministic-normal-recomputation";
      const before = await db.select({ count: sql<number>`count(*)::int` }).from(s.courseAnalyticsSnapshots);
      for (const functionId of ["mastery-snapshot-cron", "course-analytics-snapshot-cron", "content-quality-audit-cron"]) {
        const output = await run(functionId, {});
        assertDeterministicOutput(functionId, output);
        checks[functionId] = Object.fromEntries(Object.entries(output).filter(([, value]) => typeof value === "number"));
      }
      const history = await db.select().from(s.studentConceptMasteryHistory).where(and(eq(s.studentConceptMasteryHistory.studentId, id), eq(s.studentConceptMasteryHistory.snapshotDate, todayUtc())));
      assert.equal(history.length, 1);
      assert.equal(history[0].courseId, id);
      assert.equal(history[0].masteryScore, concept.masteryScore);
      const snapshots = await db.select().from(s.courseAnalyticsSnapshots).where(and(eq(s.courseAnalyticsSnapshots.courseId, id), eq(s.courseAnalyticsSnapshots.date, todayUtc())));
      assert.equal(snapshots.length, 1);
      assert.ok(snapshots[0].payload && typeof snapshots[0].payload === "object");
      const flags = await db.select().from(s.contentQualityFlags).where(eq(s.contentQualityFlags.questionId, id));
      assert.deepEqual(flags.map(row => row.flagType).sort(), ["dead_distractor", "too_easy"]);
      const [question] = await db.select().from(s.aiQuestionBank).where(eq(s.aiQuestionBank.id, id));
      assert.equal(question.qualityScore, 0.5);
      const after = await db.select({ count: sql<number>`count(*)::int` }).from(s.courseAnalyticsSnapshots);
      checks.deterministic = { snapshotsBefore: before[0].count, snapshotsAfter: after[0].count,
        ownedHistory: 1, ownedAnalyticsSnapshot: 1, ownedQualityFlags: flags.length, ownedQuestionScore: question.qualityScore };
    }
    if (skipSearch) {
      independentAccepted = true;
      stage = "search-blocked";
      await save();
      console.log(JSON.stringify({ fixtureId: id, independentAccepted, accepted, cleanupComplete, stage,
        functions: evidence.filter(item => item.functionId !== "sync-search-documents").map(item => item.functionId) }));
      return;
    }
    stage = "delete-exact-owned-search-vector";
    await save();
    const deleted = await searchPost("/v2/search/delete", { ids: [id] });
    assert.equal(deleted.ok, true, "REMAINING_SEARCH_DELETE_REJECTED");
    await waitForOwnedSearchVector(readMatches, id, false);
    checks.search = { ...(checks.search as object), exactOwnedVectorDeleted: true };
    accepted = true;
    stage = "cleanup-owned-fixtures";
    await save();
    await db.transaction(async tx => {
      await tx.delete(s.searchDocuments).where(eq(s.searchDocuments.id, id));
      await tx.delete(s.contentQualityFlags).where(eq(s.contentQualityFlags.questionId, id));
      await tx.delete(s.questionOptionStats).where(eq(s.questionOptionStats.questionId, id));
      await tx.delete(s.aiQuestionBank).where(eq(s.aiQuestionBank.id, id));
      await tx.delete(s.courseAnalyticsSnapshots).where(eq(s.courseAnalyticsSnapshots.courseId, id));
      await tx.delete(s.studentConceptMasteryHistory).where(eq(s.studentConceptMasteryHistory.studentId, id));
      await tx.delete(s.studentChapterMastery).where(eq(s.studentChapterMastery.studentId, id));
      await tx.delete(s.studentConceptMastery).where(eq(s.studentConceptMastery.studentId, id));
      await tx.delete(s.masteryRecomputeQueue).where(eq(s.masteryRecomputeQueue.studentId, id));
      await tx.delete(s.learningEvents).where(eq(s.learningEvents.id, id));
      await tx.delete(s.enrollments).where(eq(s.enrollments.id, id));
      await tx.delete(s.knowledgeObjects).where(eq(s.knowledgeObjects.id, id));
      await tx.delete(s.masterTeachingDocuments).where(eq(s.masterTeachingDocuments.id, id));
      await tx.delete(s.chapters).where(eq(s.chapters.id, id));
      await tx.delete(s.concepts).where(eq(s.concepts.id, id));
      await tx.delete(s.courses).where(eq(s.courses.id, id));
      await tx.delete(s.pengguna).where(eq(s.pengguna.id, id));
      await tx.delete(s.user).where(eq(s.user.id, id));
    });
    cleanupComplete = true;
    stage = "complete";
    await save();
    console.log(JSON.stringify({ fixtureId: id, accepted, cleanupComplete, functions: evidence.map(item => item.functionId) }));
  } finally {
    try {
      if (fixturesCreated && !cleanupComplete) {
        await save();
        await writeFile(`${target.output}/remaining-retained.json`, JSON.stringify({ fixtureId: id, stage, accepted, independentAccepted, cleanupComplete, reason: "Incomplete acceptance or cleanup. Preserve exact owned fixture graph and run IDs for diagnosis.", evidence }, null, 2));
        console.log(JSON.stringify({ fixtureId: id, cleanup: "retained", stage }));
      }
    } finally { await pool.end(); }
  }
}

if (import.meta.main) await main();
