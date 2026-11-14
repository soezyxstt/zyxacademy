import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { and, eq, inArray, sql } from "drizzle-orm";
import { workerTarget, assertWorkerEnvironment } from "./worker-targets.mjs";
import { canonicalOutboxPayload } from "../../lib/vectorize/outbox";

export async function waitForContentOutbox<T extends { status: string }>(
  read: () => Promise<T[]>,
  pause: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, 3000)),
): Promise<T[]> {
  for (let attempt = 0; attempt < 160; attempt++) {
    const rows = await read();
    assert.ok(rows.length > 0, "CONTENT_SMOKE_VECTOR_OUTBOX_MISSING");
    assert.ok(!rows.some(row => row.status === "failed"), "CONTENT_SMOKE_VECTOR_OUTBOX_FAILED");
    if (rows.every(row => row.status === "completed")) return rows;
    if (attempt < 159) await pause();
  }
  throw new Error("CONTENT_SMOKE_VECTOR_OUTBOX_PENDING");
}

async function main() {
const target = workerTarget(process.argv[2]);
const args = process.argv.slice(3);
assert.ok(args.length === 0 || (args.length === 2 && args[0] === "--resume"
  && /^neon-content-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(args[1])), "CONTENT_SMOKE_ARGUMENTS_INVALID");
const resume = args[1];
const config = JSON.parse(await readFile(`${target.output}/.env.${target.name}.json`, "utf8"));
assertWorkerEnvironment(target, config);
assert.equal(config.INNGEST_SERVE_ORIGIN, target.origin);
Object.assign(process.env, config);
const [{ db, pool }, s, { inngest }, { vectorizeCanonicalDelete }, { CANONICAL_VECTOR_PROFILE }] = await Promise.all([
  import("../../lib/db"), import("../../db/schema"), import("../../jobs/client"),
  import("../../lib/vectorize-client"), import("../../lib/vectorize/contracts"),
]);
const id = resume ?? `neon-content-${randomUUID()}`;
const evidence: Array<{ functionId: string; eventId: string; runId: string; status: string }> = [];
let fixturesCreated = false, accepted = false;
const headers = { Authorization: `Bearer ${config.INNGEST_SIGNING_KEY}`, "X-Inngest-Env": config.INNGEST_ENV };
async function api(path: string) {
  const response = await fetch(`https://api.inngest.com/v2${path}`, { headers, signal: AbortSignal.timeout(20_000) });
  assert.equal(response.status, 200, "Inngest read failed");
  return response.json();
}
async function run(functionId: string, name: string, data: Record<string, unknown>) {
  const sent = await inngest.send({ id: `${id}-${functionId}${resume ? `-resume-${randomUUID()}` : ""}`, name, data });
  assert.equal(sent.ids.length, 1);
  await writeFile(`${target.output}/content-pending.json`, JSON.stringify({ fixtureId: id, functionId, eventId: sent.ids[0] }));
  for (let attempt = 0; attempt < 200; attempt++) {
    const runs = await api(`/events/${encodeURIComponent(sent.ids[0])}/runs?include=output`);
    const execution = runs.data?.find((item: { function?: { id: string } }) => item.function?.id === functionId);
    if (execution && ["COMPLETED", "FAILED", "CANCELLED"].includes(execution.status.toUpperCase())) {
      evidence.push({ functionId, eventId: sent.ids[0], runId: execution.id, status: execution.status });
      await writeFile(`${target.output}/content-smoke.json`, JSON.stringify({ fixtureId: id, accepted: false, evidence }, null, 2));
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
  if (resume) {
    const [owner] = await db.select().from(s.user).where(eq(s.user.id, id));
    const [course] = await db.select().from(s.courses).where(eq(s.courses.id, id));
    const [chapter] = await db.select().from(s.chapters).where(eq(s.chapters.id, id));
    const [mtd] = await db.select().from(s.masterTeachingDocuments).where(eq(s.masterTeachingDocuments.id, id));
    const [ko] = await db.select().from(s.knowledgeObjects).where(eq(s.knowledgeObjects.id, id));
    assert.equal(owner?.email, `${id}@example.invalid`, "CONTENT_SMOKE_RESUME_OWNER_MISMATCH");
    assert.equal(owner.name, "Neon content fixture");
    assert.equal(owner.role, "teacher");
    assert.equal(course?.title, "Neon content fixture", "CONTENT_SMOKE_RESUME_COURSE_MISMATCH");
    assert.equal(course.category, "Matematika");
    assert.equal(chapter?.courseId, id);
    assert.equal(mtd?.courseId, id);
    assert.equal(mtd.createdById, id);
    assert.equal(ko?.courseId, id);
    assert.equal(ko.chapterId, id);
    assert.equal(ko.mtdId, id);
  } else {
  await db.transaction(async tx => {
    await tx.insert(s.user).values({ id, name: "Neon content fixture", email: `${id}@example.invalid`, role: "teacher" });
    await tx.insert(s.pengguna).values({ id, status: "active" });
    await tx.insert(s.courses).values({ id, title: "Neon content fixture", category: "Matematika" });
    await tx.insert(s.chapters).values({ id, courseId: id, title: "Penjumlahan", orderIndex: 1 });
    await tx.insert(s.masterTeachingDocuments).values({ id, courseId: id, title: "Penjumlahan", markdownContent: "Penjumlahan menggabungkan dua bilangan. Jumlah a dan b adalah s=a+b. Jika a=2 dan b=3, s=5.", createdById: id, status: "active" });
    await tx.insert(s.concepts).values({ id, canonicalSlug: id });
    await tx.insert(s.knowledgeObjects).values({ id, courseId: id, mtdId: id, chapterId: id, conceptId: id, learningOrder: 1,
      title: "Penjumlahan dua bilangan", conceptName: "Penjumlahan", type: "formula", bloomLevel: "apply", status: "active",
      content: "Penjumlahan menggabungkan nilai dua bilangan menjadi jumlah. $$s=a+b$$ Jumlah s diperoleh dengan menambahkan a dan b. Jika a=2 dan b=3, s=2+3=5. Gunakan operasi ini untuk menghitung total dua kelompok dengan satuan yang sama.",
      metadata: { latex: "s=a+b", parameters: [{ symbol: "s", name: "Jumlah", unit: "1" }, { symbol: "a", name: "Bilangan pertama", unit: "1" }, { symbol: "b", name: "Bilangan kedua", unit: "1" }], assumptions: ["Bilangan memiliki satuan yang sama."], whenToUse: ["Menghitung total dua bilangan."] } });
  });
  }
  fixturesCreated = true;
  if (!resume) await run("bulk-chapter-generator", "ai.bulk.chapter.generate", { chapterId: id });
  const [chapter] = await db.select().from(s.chapters).where(eq(s.chapters.id, id));
  assert.equal(chapter.assetGenStatus, "completed");
  assert.ok(chapter.assetGenFlashcardsCurrent > 0);
  assert.equal(chapter.assetGenQuestionsCurrent, 1);
  const sets = await db.select().from(s.flashcardSets).where(eq(s.flashcardSets.courseId, id));
  assert.equal(sets.length, 1);
  const cards = await db.select().from(s.flashcards).where(eq(s.flashcards.setId, sets[0].id));
  assert.ok(cards.length > 0);
  assert.equal(cards.length, chapter.assetGenFlashcardsCurrent);
  for (const card of cards) {
    assert.equal(card.koId, id);
    assert.ok(card.front.trim() && card.back.trim());
  }
  const questions = await db.select().from(s.aiQuestionBank).where(and(eq(s.aiQuestionBank.courseId, id), eq(s.aiQuestionBank.knowledgeObjectId, id)));
  assert.ok(questions.length > 0);
  const materials = await db.select().from(s.websiteMaterials).where(eq(s.websiteMaterials.courseId, id));
  assert.equal(materials.length, 1);
  assert.equal(materials[0].status, "draft");
  assert.ok(materials[0].canonicalMarkdown.trim().length > 100);
  const compiled = materials[0].structuredContent as { compilerResult?: { ast?: { blocks?: unknown[] }; diagnostics?: Array<{ severity: string }> } };
  assert.ok((compiled.compilerResult?.ast?.blocks?.length ?? 0) > 0);
  assert.equal(compiled.compilerResult?.diagnostics?.filter(entry => entry.severity === "error").length ?? 0, 0);
  const versions = await db.select().from(s.websiteMaterialVersions).where(eq(s.websiteMaterialVersions.materialId, materials[0].id));
  assert.equal(versions.length, 1);
  // Inngest concurrency applies to steps, so a completed finalizer can overlap an automatic run.
  await run("vector-sync-worker", "vector.sync.dispatch", { courseId: id });
  const outbox = await waitForContentOutbox(() => db.select().from(s.vectorSyncQueue).where(eq(s.vectorSyncQueue.courseId, id)));
  const vectorIds = outbox.map(row => {
    assert.equal(row.courseId, id);
    assert.equal(row.status, "completed");
    const payload = row.payload as { id?: string; vectorizeCompletion?: { vectorId?: string } };
    assert.ok(questions.some(question => question.id === payload.id), "Vector must belong to a generated fixture question");
    assert.ok(payload.vectorizeCompletion?.vectorId);
    assert.equal(payload.vectorizeCompletion.vectorId, canonicalOutboxPayload(row).vectorId);
    return payload.vectorizeCompletion.vectorId;
  });
  await vectorizeCanonicalDelete({ profileId: CANONICAL_VECTOR_PROFILE.id, ids: vectorIds });
  accepted = true;
  await writeFile(`${target.output}/content-smoke.json`, JSON.stringify({ fixtureId: id, resumed: Boolean(resume), accepted, generatedQuestions: questions.length,
    generatedFlashcards: cards.length, generatedDraftMaterials: materials.length, deletedOwnedVectors: vectorIds.length,
    assessment: "Not invoked: global concept creation has no fixture ownership boundary", evidence }, null, 2));
} finally {
  try {
    if (fixturesCreated && accepted) {
      await db.transaction(async tx => {
        const questions = await tx.select({ id: s.aiQuestionBank.id }).from(s.aiQuestionBank).where(eq(s.aiQuestionBank.courseId, id));
        if (questions.length) await tx.delete(s.distractorProvenance).where(inArray(s.distractorProvenance.questionId, questions.map(row => row.id)));
        await tx.delete(s.vectorSyncQueue).where(eq(s.vectorSyncQueue.courseId, id));
        await tx.delete(s.aiQuestionBank).where(eq(s.aiQuestionBank.courseId, id));
        await tx.delete(s.questionGenerationRuns).where(eq(s.questionGenerationRuns.courseId, id));
        await tx.delete(s.websiteMaterials).where(eq(s.websiteMaterials.courseId, id));
        await tx.delete(s.flashcardSets).where(eq(s.flashcardSets.courseId, id));
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
      await writeFile(`${target.output}/content-retained.json`, JSON.stringify({ fixtureId: id, reason: "Acceptance incomplete; retain owned outputs and downstream jobs for diagnosis", evidence }, null, 2));
      console.log(JSON.stringify({ fixtureId: id, cleanup: "retained" }));
    }
  } finally { await pool.end(); }
}
}

if (import.meta.main) await main();
