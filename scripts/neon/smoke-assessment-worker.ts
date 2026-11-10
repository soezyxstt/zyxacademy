import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { workerTarget, assertWorkerEnvironment } from "./worker-targets.mjs";
import { canonicalOutboxPayload } from "../../lib/vectorize/outbox";
import { CANONICAL_VECTOR_PROFILE } from "../../lib/vectorize/contracts";
import { generateCanonicalHash } from "../../lib/assessment-utils";
import { readRemainingRun } from "./smoke-remaining-workers";

type CreatedConcept = { conceptId: string; localizationId: string };
export function assessmentSmokeArguments(args: string[]) {
  const target = workerTarget(args[0]);
  assert.equal(target.name, "production", "ASSESSMENT_SMOKE_PRODUCTION_REQUIRED");
  const resume = args[1] === "--resume" ? args[2] : undefined;
  const runId = args[3] === "--run-id" ? args[4] : undefined;
  assert.ok(args.length === 1 || (args.length === 5 && resume && runId
    && /^neon-assessment-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(resume)
    && /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(runId)), "ASSESSMENT_SMOKE_ARGUMENTS_INVALID");
  return { target, resume, runId };
}
export function assessmentProvenance(value: unknown): CreatedConcept[] {
  assert.ok(Array.isArray(value), "ASSESSMENT_SMOKE_PROVENANCE_MISSING");
  const concepts = new Set<string>(), localizations = new Set<string>();
  for (const item of value) {
    assert.ok(item && typeof item.conceptId === "string" && /^[a-f0-9-]{36}$/.test(item.conceptId)
      && typeof item.localizationId === "string" && /^cl-[a-f0-9-]{36}$/.test(item.localizationId), "ASSESSMENT_SMOKE_PROVENANCE_INVALID");
    assert.ok(!concepts.has(item.conceptId) && !localizations.has(item.localizationId), "ASSESSMENT_SMOKE_PROVENANCE_DUPLICATE");
    concepts.add(item.conceptId); localizations.add(item.localizationId);
  }
  return value;
}
export function assessmentRunOutput(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "string") {
    if (!value.trim()) return undefined;
    value = JSON.parse(value);
  }
  return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length
    ? value as Record<string, unknown> : undefined;
}
export async function waitForAssessmentVectors(
  read: () => Promise<Array<{ id: string; values: number[]; metadata: { contentHash?: unknown; courseId?: unknown; profileId?: unknown; namespace?: unknown } }>>,
  expected: Array<{ vectorId: string; contentHash: string; courseId: string }>, present: boolean,
  pause: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, 3000)),
) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const found = await read();
    assert.ok(found.every(vector => expected.some(item => item.vectorId === vector.id)), "ASSESSMENT_SMOKE_FOREIGN_VECTOR");
    if (!present && !found.length) return;
    if (present && found.length === expected.length) {
      assert.ok(expected.every(item => found.some(vector => vector.id === item.vectorId && vector.values.length === 768
        && vector.values.every(Number.isFinite) && vector.metadata.contentHash === item.contentHash && vector.metadata.courseId === item.courseId
        && vector.metadata.profileId === CANONICAL_VECTOR_PROFILE.id && vector.metadata.namespace === "itb_question_references")), "ASSESSMENT_SMOKE_VECTOR_MISMATCH");
      return;
    }
    if (attempt < 99) await pause();
  }
  throw new Error(present ? "ASSESSMENT_SMOKE_VECTOR_PENDING" : "ASSESSMENT_SMOKE_VECTOR_DELETE_PENDING");
}

async function main() {
  const { target, resume, runId } = assessmentSmokeArguments(process.argv.slice(2));
  const config = JSON.parse(await readFile(`${target.output}/.env.${target.name}.json`, "utf8"));
  assertWorkerEnvironment(target, config);
  assert.equal(config.INNGEST_SERVE_ORIGIN, target.origin);
  assert.equal(config.VECTORIZE_WORKER_URL, "https://zyx-vector-api-background.16922204.workers.dev");
  assert.ok(config.VECTORIZE_SHARED_SECRET, "ASSESSMENT_SMOKE_VECTOR_SECRET_MISSING");
  Object.assign(process.env, config);
  const [{ db, pool }, s, { createCanonicalVectorClient }] = await Promise.all([
    import("../../lib/db"), import("../../db/schema"), import("../../lib/vectorize-client"),
  ]);
  const vectors = createCanonicalVectorClient();
  const id = resume ?? `neon-assessment-${randomUUID()}`;
  const conceptName = `Penjumlahan ${id}`;
  const question = `## Soal 1\nKonsep yang diuji adalah ${conceptName}, yaitu menjumlahkan dua bilangan bulat. Berapakah 2+3?\nA. 5\nB. 6\nC. 7\nD. 8`;
  const sourceMarkdown = `---\ncategory: quiz\nchapters: ["${id}"]\n---\n${question}`;
  const sourceHash = createHash("sha256").update(sourceMarkdown).digest("hex");
  let fixturesCreated = false, accepted = false, cleanupComplete = false, stage = "preflight";
  let createdConcepts: CreatedConcept[] = [];
  const evidence: Array<{ functionId: string; runId: string; status: string }> = [];
  const checks: Record<string, unknown> = {};
  const headers = { Authorization: `Bearer ${config.INNGEST_SIGNING_KEY}`, "X-Inngest-Env": config.INNGEST_ENV, "Content-Type": "application/json" };
  async function save() {
    await writeFile(`${target.output}/assessment-smoke.json`, JSON.stringify({ fixtureId: id, resumed: Boolean(resume), accepted, cleanupComplete, stage, checks, evidence, createdConcepts }, null, 2));
  }
  async function api(path: string, init: RequestInit = {}, allowMissing = false) {
    const response = await fetch(`https://api.inngest.com/v2${path}`, { ...init, headers, signal: AbortSignal.timeout(30_000) });
    if (allowMissing && response.status === 404) return undefined;
    assert.ok(response.ok, `ASSESSMENT_SMOKE_INNGEST_HTTP_${response.status}`);
    return response.json();
  }
  async function run(functionId: string, data: Record<string, unknown>, existingRunId?: string) {
    stage = `${existingRunId ? "resume" : "invoke"}:${functionId}`;
    await save();
    let executionId = existingRunId;
    if (!executionId) {
      const response = await api(`/apps/zyx-academy/functions/${encodeURIComponent(functionId)}/invoke`, {
        method: "POST", body: JSON.stringify({ data, idempotencyKey: `${id}-${functionId}` }),
      });
      assert.equal(typeof response.data?.runId, "string", "ASSESSMENT_SMOKE_RUN_MISSING");
      executionId = response.data.runId;
    }
    const item = { functionId, runId: executionId!, status: "pending" };
    evidence.push(item); await save();
    for (let attempt = 0; attempt < 200; attempt++) {
      const execution = await readRemainingRun(path => api(path, {}, true), functionId, item.runId);
      if (!execution) { await new Promise(resolve => setTimeout(resolve, 3000)); continue; }
      assert.equal(execution.id, item.runId, "ASSESSMENT_SMOKE_RUN_ID_MISMATCH");
      assert.equal(execution?.function?.id, functionId, "ASSESSMENT_SMOKE_FUNCTION_MISMATCH");
      item.status = String(execution.status).toUpperCase();
      if (["COMPLETED", "FAILED", "CANCELLED", "SKIPPED"].includes(item.status)) {
        await save();
        assert.equal(item.status, "COMPLETED", "ASSESSMENT_SMOKE_RUN_FAILED");
        const output = assessmentRunOutput(execution.output);
        if (!output) {
          await new Promise(resolve => setTimeout(resolve, 3000)); continue;
        }
        return output;
      }
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    throw new Error("ASSESSMENT_SMOKE_RUN_PENDING");
  }
  try {
    assert.equal((await db.execute(sql`select current_database() as name`)).rows[0].name, "neondb");
    const environments = await api("/envs?limit=250");
    assert.equal(environments.data?.length, 1);
    assert.equal(environments.data[0].id, target.inngestEnvironment);
    const eventKeys = await api("/keys/events?limit=100");
    assert.ok(eventKeys.data?.some((key: { key: string }) => key.key === config.INNGEST_EVENT_KEY), "ASSESSMENT_SMOKE_EVENT_KEY_MISMATCH");
    const health = await fetch(`${target.origin}/health?assessment=${id}`, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
    assert.equal(health.status, 200);
    const worker = await health.json();
    assert.match(config.ZYX_COMPUTE_REVISION, /^[a-f0-9]{64}$/);
    assert.equal(worker.version, config.ZYX_COMPUTE_REVISION);
    assert.equal(worker.functions, 22);
    checks.preflight = { database: "neondb", workerRevision: worker.version };
    if (resume) {
      const [[owner], [course], [chapter], [mtd], [ko], [source], objects, [concept], [localization]] = await Promise.all([
        db.select().from(s.user).where(eq(s.user.id, id)),
        db.select().from(s.courses).where(eq(s.courses.id, id)),
        db.select().from(s.chapters).where(eq(s.chapters.id, id)),
        db.select().from(s.masterTeachingDocuments).where(eq(s.masterTeachingDocuments.id, id)),
        db.select().from(s.knowledgeObjects).where(eq(s.knowledgeObjects.id, id)),
        db.select().from(s.assessmentSources).where(eq(s.assessmentSources.id, id)),
        db.select().from(s.assessmentObjects).where(eq(s.assessmentObjects.sourceId, id)),
        db.select().from(s.concepts).where(eq(s.concepts.id, id)),
        db.select().from(s.conceptLocalizations).where(eq(s.conceptLocalizations.id, id)),
      ]);
      assert.equal(owner?.email, `${id}@example.invalid`, "ASSESSMENT_SMOKE_RESUME_OWNER_MISMATCH");
      assert.equal(owner.name, "Neon assessment fixture"); assert.equal(owner.role, "teacher");
      assert.equal(course?.title, "Neon assessment fixture", "ASSESSMENT_SMOKE_RESUME_COURSE_MISMATCH");
      assert.equal(course.category, "Matematika");
      assert.equal(chapter?.courseId, id); assert.equal(chapter.title, id);
      assert.equal(mtd?.courseId, id); assert.equal(mtd.createdById, id); assert.equal(mtd.title, id);
      assert.equal(mtd.markdownContent, "Penjumlahan dua bilangan."); assert.equal(mtd.status, "active");
      assert.equal(ko?.courseId, id); assert.equal(ko.mtdId, id); assert.equal(ko.chapterId, id); assert.equal(ko.conceptId, id);
      assert.equal(ko.conceptName, conceptName); assert.equal(ko.content, "2+3=5"); assert.equal(ko.status, "active");
      assert.equal(concept?.canonicalSlug, id); assert.equal(localization?.conceptId, id); assert.equal(localization.displayName, conceptName);
      assert.equal(source?.courseId, id); assert.equal(source.uploadedByUserId, id); assert.equal(source.title, "Neon assessment fixture");
      assert.equal(source.sourceMarkdown, sourceMarkdown); assert.equal(source.sourceHash, sourceHash); assert.equal(source.ingestionStatus, "completed");
      assert.equal(objects.length, 1, "ASSESSMENT_SMOKE_RESUME_OBJECT_MISMATCH");
      assert.equal(objects[0].questionMarkdown, question); assert.equal(objects[0].canonicalQuestionHash, generateCanonicalHash(question));
      checks.resume = { ownedFixtureVerified: true, reusedRunId: runId, extractionSkipped: true };
    } else {
    await db.transaction(async tx => {
      await tx.insert(s.user).values({ id, name: "Neon assessment fixture", email: `${id}@example.invalid`, role: "teacher" });
      await tx.insert(s.pengguna).values({ id, status: "active" });
      await tx.insert(s.courses).values({ id, title: "Neon assessment fixture", category: "Matematika" });
      await tx.insert(s.chapters).values({ id, courseId: id, title: id, orderIndex: 1 });
      await tx.insert(s.masterTeachingDocuments).values({ id, courseId: id, title: id, markdownContent: "Penjumlahan dua bilangan.", createdById: id, status: "active" });
      await tx.insert(s.concepts).values({ id, canonicalSlug: id });
      await tx.insert(s.conceptLocalizations).values({ id, conceptId: id, lang: "id", displayName: conceptName, aliases: [] });
      await tx.insert(s.knowledgeObjects).values({ id, courseId: id, mtdId: id, chapterId: id, conceptId: id, learningOrder: 1,
        title: conceptName, conceptName, type: "formula", bloomLevel: "apply", status: "active", content: "2+3=5" });
      await tx.insert(s.assessmentSources).values({ id, courseId: id, title: "Neon assessment fixture", category: "quiz", sourceMarkdown,
        sourceHash, uploadedByUserId: id });
    });
    }
    fixturesCreated = true;
    const result = await run("assessment-ingest-worker", { sourceId: id }, runId);
    assert.equal(result?.sourceId, id);
    assert.ok(typeof result.status === "string" && ["accepted", "needs_review"].includes(result.status), "ASSESSMENT_SMOKE_EXTRACTION_NOT_ACCEPTED");
    createdConcepts = assessmentProvenance(result.createdConcepts);
    const objectIds = result.objectIds;
    assert.ok(Array.isArray(objectIds) && objectIds.length === 1 && typeof objectIds[0] === "string", "ASSESSMENT_SMOKE_OBJECT_IDS_INVALID");
    await save();
    const [source] = await db.select().from(s.assessmentSources).where(eq(s.assessmentSources.id, id));
    assert.equal(source?.courseId, id); assert.equal(source.uploadedByUserId, id); assert.equal(source.ingestionStatus, "completed");
    const objects = await db.select().from(s.assessmentObjects).where(eq(s.assessmentObjects.sourceId, id));
    assert.deepEqual(objects.map(object => object.id), objectIds);
    assert.equal(objects[0].questionMarkdown, question);
    assert.equal(objects[0].canonicalQuestionHash, generateCanonicalHash(question));
    assert.ok(objects[0].answerMarkdown?.trim(), "ASSESSMENT_SMOKE_SOLUTION_MISSING");
    const links = await db.select({ koId: s.knowledgeObjects.id, courseId: s.knowledgeObjects.courseId }).from(s.assessmentObjectKos)
      .innerJoin(s.knowledgeObjects, eq(s.knowledgeObjects.id, s.assessmentObjectKos.koId)).where(inArray(s.assessmentObjectKos.assessmentObjectId, objectIds));
    assert.ok(links.every(link => link.courseId === id), "ASSESSMENT_SMOKE_FOREIGN_KO_LINK");
    const concepts = await db.select().from(s.assessmentObjectConcepts).where(inArray(s.assessmentObjectConcepts.assessmentObjectId, objectIds));
    assert.ok(concepts.length > 0, "ASSESSMENT_SMOKE_CONCEPT_EVIDENCE_MISSING");
    const profiles = await db.select().from(s.assessmentProfiles).where(eq(s.assessmentProfiles.courseId, id));
    const policies = await db.select().from(s.coursePolicies).where(eq(s.coursePolicies.courseId, id));
    assert.equal(profiles.length, 1); assert.equal(policies.length, 1);
    if (!resume) await run("vector-sync-worker", { courseId: id });
    let outbox: typeof s.vectorSyncQueue.$inferSelect[] = [];
    for (let attempt = 0; attempt < 160; attempt++) {
      outbox = await db.select().from(s.vectorSyncQueue).where(eq(s.vectorSyncQueue.courseId, id));
      assert.ok(outbox.length > 0 && !outbox.some(row => row.status === "failed"), "ASSESSMENT_SMOKE_OUTBOX_FAILED");
      if (outbox.every(row => row.status === "completed")) break;
      if (attempt === 159) throw new Error("ASSESSMENT_SMOKE_OUTBOX_PENDING");
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    const expected = outbox.map(row => {
      const operation = canonicalOutboxPayload(row);
      assert.ok(operation.operation === "upsert" && objectIds.includes(operation.entityId), "ASSESSMENT_SMOKE_FOREIGN_OUTBOX");
      assert.equal(operation.operation === "upsert" ? operation.metadata.courseId : "", id);
      return { vectorId: operation.vectorId, contentHash: operation.operation === "upsert" ? operation.metadata.contentHash! : "", courseId: id };
    });
    assert.equal(expected.length, 1);
    const readVectors = async () => (await vectors.get({ profileId: CANONICAL_VECTOR_PROFILE.id, ids: expected.map(item => item.vectorId) })).vectors;
    await waitForAssessmentVectors(readVectors, expected, true);
    checks.extraction = { objects: objects.length, linkedConcepts: concepts.length, ownCourseKoLinks: links.length, profile: true, policy: true, vectorVerified: true };
    accepted = true; stage = "cleanup-provenance-check"; await save();
    // New global concepts can be reused concurrently. Retain them and the fixture for reviewed cleanup.
    if (createdConcepts.length) {
      checks.cleanupDeferred = "Created global concepts require review of durable extraction provenance and references.";
      await save();
      return;
    }
    const foreignReferences = await db.execute(sql`select
      (select count(*) from knowledge_objects where concept_id=${id} and course_id<>${id})+
      (select count(*) from ide where concept_id=${id})+
      (select count(*) from assessment_object_concepts a join assessment_objects o on o.id=a.assessment_object_id where a.concept_id=${id} and o.source_id<>${id})+
      (select count(*) from learning_outcome_concepts where concept_id=${id})+
      (select count(*) from career_path_concepts where concept_id=${id}) as count`);
    assert.equal(Number(foreignReferences.rows[0].count), 0, "ASSESSMENT_SMOKE_SHARED_FIXTURE_CONCEPT");
    stage = "delete-exact-owned-vector"; await save();
    await vectors.delete({ profileId: CANONICAL_VECTOR_PROFILE.id, ids: expected.map(item => item.vectorId) });
    await waitForAssessmentVectors(readVectors, expected, false);
    // The isolated preseeded concept has no public aliases. Keep all unowned concepts untouched.
    await db.transaction(async tx => {
      await tx.execute(sql`select id from concepts where id=${id} for update`);
      const shared = await tx.select({ id: s.knowledgeObjects.id }).from(s.knowledgeObjects).where(and(eq(s.knowledgeObjects.conceptId, id), ne(s.knowledgeObjects.courseId, id))).limit(1);
      assert.equal(shared.length, 0, "ASSESSMENT_SMOKE_SHARED_FIXTURE_CONCEPT");
      const references = await tx.execute(sql`select
        (select count(*) from ide where concept_id=${id})+
        (select count(*) from assessment_object_concepts a join assessment_objects o on o.id=a.assessment_object_id where a.concept_id=${id} and o.source_id<>${id})+
        (select count(*) from learning_outcome_concepts where concept_id=${id})+
        (select count(*) from career_path_concepts where concept_id=${id})+
        (select count(*) from concept_localizations where concept_id=${id} and id<>${id}) as count`);
      assert.equal(Number(references.rows[0].count), 0, "ASSESSMENT_SMOKE_SHARED_FIXTURE_CONCEPT");
      await tx.delete(s.vectorSyncQueue).where(eq(s.vectorSyncQueue.courseId, id));
      await tx.delete(s.assessmentSources).where(and(eq(s.assessmentSources.id, id), eq(s.assessmentSources.courseId, id), eq(s.assessmentSources.uploadedByUserId, id)));
      await tx.delete(s.assessmentProfiles).where(eq(s.assessmentProfiles.courseId, id));
      await tx.delete(s.coursePolicies).where(eq(s.coursePolicies.courseId, id));
      await tx.delete(s.knowledgeObjects).where(eq(s.knowledgeObjects.id, id));
      await tx.delete(s.masterTeachingDocuments).where(eq(s.masterTeachingDocuments.id, id));
      await tx.delete(s.chapters).where(eq(s.chapters.id, id));
      await tx.delete(s.conceptLocalizations).where(and(eq(s.conceptLocalizations.id, id), eq(s.conceptLocalizations.conceptId, id)));
      await tx.delete(s.concepts).where(eq(s.concepts.id, id));
      await tx.delete(s.courses).where(eq(s.courses.id, id));
      await tx.delete(s.pengguna).where(eq(s.pengguna.id, id));
      await tx.delete(s.user).where(eq(s.user.id, id));
    });
    cleanupComplete = true; stage = "complete"; await save();
    console.log(JSON.stringify({ fixtureId: id, accepted, cleanupComplete, evidence }));
  } finally {
    try {
      if (fixturesCreated && !cleanupComplete) {
        await save();
        await writeFile(`${target.output}/assessment-retained.json`, JSON.stringify({ fixtureId: id, accepted, stage, createdConcepts, evidence,
          reason: "Retain the owned source and complete fixture graph. Failed-run provenance is in the durable extract-assessment-objects step." }, null, 2));
        console.log(JSON.stringify({ fixtureId: id, accepted, cleanup: "retained", stage }));
      }
    } finally { await pool.end(); }
  }
}

if (import.meta.main) await main();
