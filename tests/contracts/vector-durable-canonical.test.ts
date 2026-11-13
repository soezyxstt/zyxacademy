import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import { Inngest } from "inngest";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { createPostgresTestDb } from "../helpers/postgres";
import { inngestReplay } from "../helpers/inngest-replay";

const { client, testDb } = await createPostgresTestDb();
const events: unknown[] = [];
const effects: Array<{ action: string; ids: string[] }> = [];
let phase: "embedding" | "upsert" | "delete";
const noNetwork = mock(async (): Promise<never> => { throw new Error("External transport forbidden in local SDK test"); });
const inngest = new Inngest({ id: "local-vector-sdk", isDev: false, fetch: noNetwork });
// Keep SDK step.sendEvent, replacing only its external event transport.
Object.assign(inngest, { _send: async (input: { payload: unknown }) => { events.push(input.payload); return { ids: ["local-continuation"] }; } });
const embed = mock(async (documents: readonly { title: string; content: string }[]) => {
  if (phase === "embedding" && documents.some(document => document.title === "BAD")) throw new Error("REJECTED_CANONICAL_EMBEDDING");
  return documents.map(() => Array(768).fill(0.5));
});
const upsert = mock(async (request: { vectors: Array<{ id: string; metadata: Record<string, unknown> }> }) => {
  if (phase === "upsert" && request.vectors.some(vector => vector.id.includes("bad-idea:"))) throw new Error("REJECTED_CANONICAL_UPSERT");
  effects.push({ action: "upsert", ids: request.vectors.map(vector => vector.id) });
  expect(request.vectors.every(vector => vector.metadata.courseId === "canonical-course")).toBe(true);
  return {};
});
const remove = mock(async (request: { ids: string[] }) => {
  if (phase === "delete" && request.ids.some(id => id.includes("bad-idea:"))) throw new Error("REJECTED_CANONICAL_DELETE");
  effects.push({ action: "delete", ids: request.ids }); return {};
});
mock.module("@/db", () => ({ db: testDb }));
mock.module("@/jobs/client", () => ({ inngest }));
mock.module("@/lib/compute/vector-embeddings", () => ({ embedWorkerVectorDocuments: embed }));
mock.module("@/lib/vectorize-client", () => ({ vectorizeCanonicalUpsert: upsert, vectorizeCanonicalDelete: remove }));
mock.module("@/lib/vector-sync-dispatch", () => ({ dispatchVectorSync: async () => undefined }));
const { vectorSyncWorker } = await import("@/jobs/vector-sync");
afterAll(async () => { await client.close(); });
beforeEach(async () => {
  effects.length = 0; events.length = 0; embed.mockClear(); upsert.mockClear(); remove.mockClear(); noNetwork.mockClear();
  await client.exec('TRUNCATE TABLE "user", courses, mata_kuliah CASCADE');
  await testDb.insert(schema.user).values({ id: "author", name: "Author", email: "sdk-author@example.test" });
  await testDb.insert(schema.pengguna).values({ id: "author" });
  await testDb.insert(schema.courses).values({ id: "queue-course", title: "Course", category: "Test" });
  await testDb.insert(schema.mataKuliah).values({ id: "canonical-course", legacyCourseId: "queue-course", code: "SDK", title: "Course" });
  await testDb.insert(schema.bab).values({ id: "canonical-chapter", mataKuliahId: "canonical-course", code: "SDK", title: "Chapter", orderIndex: 0 });
});

for (const failure of ["embedding", "upsert", "delete"] as const) {
  test(`installed SDK checkpoint replay isolates persistent ${failure} rejection on managed canonical rows`, async () => {
    phase = failure;
    await testDb.insert(schema.ide).values({ id: "bad-idea", mataKuliahId: "canonical-course", babId: "canonical-chapter", stableKey: "bad-idea", code: "BAD", canonicalStatement: "Rejected identity", conciseExplanation: "Rejected record", semanticHash: "hash", generationHash: "hash", status: failure === "delete" ? "withdrawn" : "published", creatorId: "author" });
    await testDb.insert(schema.artikel).values({ id: "good-article", mataKuliahId: "canonical-course", slug: "good-article", title: "Good article", contentMarkdown: "Current public Article", status: "published", sourceHash: "hash", generationHash: "hash", creatorId: "author" });
    await testDb.insert(schema.soal).values({ id: "retired-question", mataKuliahId: "canonical-course", questionType: "essay", prompt: "Retired", status: "retired", difficulty: "easy", cognitiveLevel: "remember", reasoningPattern: "recall", generationHash: "hash", creatorId: "author" });
    await testDb.insert(schema.vectorSyncQueue).values([
      { id: "queue-0", namespace: "canonical_ideas", payload: { entityId: "bad-idea", version: 1, text: "Never trust this queued body" } },
      { id: "queue-1", namespace: "published_articles", payload: { entityId: "good-article", version: 1, text: "Never trust this queued body" } },
      { id: "queue-2", namespace: "published_questions", payload: { entityId: "retired-question", version: 1, text: "Never embed this retired body" } },
    ].map(row => ({ ...row, courseId: "queue-course", action: "upsert" as const, attempts: 9, createdAt: new Date(0) })));
    const execution = inngestReplay(inngest, vectorSyncWorker, { name: "vector.sync.dispatch", data: { courseId: "queue-course" } });
    const result = await execution.run();
    expect(result).toEqual({ processed: 3, success: 2, failed: 1, continuation: true, retryScheduled: true });
    const rows = await testDb.select().from(schema.vectorSyncQueue).orderBy(schema.vectorSyncQueue.id);
    expect(rows[0]).toMatchObject({ status: "failed", attempts: 10, leaseId: null });
    expect(rows.slice(1).map(row => ({ status: row.status, attempts: row.attempts }))).toEqual([{ status: "completed", attempts: 9 }, { status: "completed", attempts: 9 }]);
    expect(effects.some(effect => effect.action === "upsert" && effect.ids.includes("v2:article:good-article:1"))).toBe(true);
    expect(effects.some(effect => effect.action === "delete" && effect.ids.includes("v2:question:retired-question:1"))).toBe(true);
    expect(execution.trace.some(op => op.op === "Sleep")).toBe(true);
    expect(execution.trace.some(op => op.name?.includes("isolate-"))).toBe(true);
    expect([...execution.failures.values()].every(count => count === 2)).toBe(true);
    expect(events).toHaveLength(1);
    const beforeReplay = { effects: structuredClone(effects), events: structuredClone(events), embeddings: embed.mock.calls.length };
    expect(await execution.run()).toEqual(result);
    expect({ effects, events, embeddings: embed.mock.calls.length }).toEqual(beforeReplay);
    expect(embed.mock.calls.flatMap(call => call[0]).every(document => !document.content.includes("queued body") && !document.content.includes("retired body"))).toBe(true);
    const nextEvent = inngestReplay(inngest, vectorSyncWorker, { name: "vector.sync.dispatch", data: { courseId: "queue-course" } });
    expect(await nextEvent.run()).toEqual({ processed: 0, success: 0, failed: 0, continuation: false });
    expect({ effects, events, embeddings: embed.mock.calls.length }).toEqual(beforeReplay);
    expect(noNetwork).not.toHaveBeenCalled();
    expect((await testDb.select().from(schema.vectorSyncQueue).where(eq(schema.vectorSyncQueue.id, "queue-0")))[0].attempts).toBe(10);
  }, 30_000);
}
