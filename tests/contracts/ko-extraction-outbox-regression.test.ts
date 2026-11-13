import { afterAll, beforeEach, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { persistKoExtractionTx } from "@/lib/knowledge/extraction-persistence";
import { computeSemanticKoHash, generateStableKoKey } from "@/lib/knowledge/identity";
import { createPostgresTestDb } from "../helpers/postgres";

const { client, testDb } = await createPostgresTestDb();
afterAll(async () => { await client.close(); });

const candidate = (id: string, title: string, content: string) => ({
  id, title, content, courseId: "course", mtdId: "mtd", chapterId: "chapter", conceptId: "concept",
  conceptName: "Concept", learningOrder: 1, type: "definition" as const,
  bloomLevel: "remember" as const, difficulty: "easy" as const, importance: "medium" as const,
  tags: ["tag"], metadata: {}, status: "active" as const,
});

beforeEach(async () => {
  await client.exec('TRUNCATE TABLE "user", courses, concepts CASCADE');
  await testDb.insert(schema.user).values({ id: "author", name: "Author", email: "ko@example.test" });
  await testDb.insert(schema.courses).values({ id: "course", title: "Course", category: "Test" });
  await testDb.insert(schema.chapters).values({ id: "chapter", courseId: "course", title: "Chapter", orderIndex: 0 });
  await testDb.insert(schema.masterTeachingDocuments).values({ id: "mtd", courseId: "course", title: "Source", markdownContent: "Source", createdById: "author", version: 3, sourceHash: "old-source", derivedHash: "old-derived" });
  await testDb.insert(schema.concepts).values({ id: "concept", canonicalSlug: "concept" });
});

function persist(candidates: ReturnType<typeof candidate>[]) {
  return testDb.transaction((tx) => persistKoExtractionTx(tx as never, {
    courseId: "course", mtdId: "mtd", chapterId: "chapter", sourceVersion: "4.0", sourceHash: "new-source",
    chapterMarkdown: "Retain Update New", candidates, newConcepts: [], newLocalizations: [],
  }));
}

test("retained, updated, inserted and superseded KOs use persisted IDs and versions", async () => {
  const retained = candidate("retained", "Retain", "Same content");
  const updated = candidate("updated", "Update", "Old content");
  const removed = candidate("removed", "Removed", "Removed content");
  await testDb.insert(schema.knowledgeObjects).values([retained, updated, removed].map((row, index) => ({
    ...row, version: index + 2, stableKey: generateStableKoKey("mtd", "chapter", row.title),
    semanticHash: computeSemanticKoHash(row.title, row.content, "definition", "core"),
  })));

  expect(await persist([
    candidate("unused-retain", "Retain", "Same content"),
    candidate("unused-update", "Update", "New content"),
    candidate("inserted", "New", "New content"),
  ])).toBe(true);

  const rows = await testDb.select().from(schema.knowledgeObjects);
  expect(rows.find((row) => row.id === "retained")).toMatchObject({ version: 2, status: "active" });
  expect(rows.find((row) => row.id === "updated")).toMatchObject({ version: 4, content: "New content" });
  expect(rows.find((row) => row.id === "inserted")).toMatchObject({ version: 1, status: "active" });
  expect(rows.find((row) => row.id === "removed")).toMatchObject({ version: 4, status: "superseded" });
  expect(rows.some((row) => row.id.startsWith("unused-"))).toBe(false);

  const spans = await testDb.select().from(schema.knowledgeObjectSources);
  expect(spans.map((row) => row.koId).sort()).toEqual(["inserted", "retained", "updated"]);
  const queued = await testDb.select().from(schema.vectorSyncQueue);
  const jobs = queued.map((row) => ({ id: row.koId, action: row.action, namespace: row.namespace, ...(row.payload as { entityId: string; version: number }) }));
  expect(jobs).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "retained", entityId: "retained", version: 2, action: "upsert" }),
    expect.objectContaining({ id: "updated", entityId: "updated", version: 4, action: "upsert" }),
    expect.objectContaining({ id: "inserted", entityId: "inserted", version: 1, action: "upsert" }),
    expect.objectContaining({ id: "removed", entityId: "removed", version: 4, action: "delete" }),
    expect.objectContaining({ id: "removed", version: 1, action: "delete" }),
    expect.objectContaining({ id: "updated", version: 3, action: "delete", namespace: "canonical_ideas" }),
    expect.objectContaining({ id: "updated", version: 1, action: "delete", namespace: "canonical_ideas" }),
  ]));
  expect(jobs.every((job) => job.id === job.entityId && rows.some((row) => row.id === job.id))).toBe(true);
});

test("ambiguous matches and duplicate candidates make no persistence or outbox changes", async () => {
  const duplicateKey = generateStableKoKey("mtd", "chapter", "Retain");
  await testDb.insert(schema.knowledgeObjects).values([
    { ...candidate("old-1", "Retain", "Same content"), stableKey: duplicateKey },
    { ...candidate("old-2", "Retain", "Same content"), stableKey: duplicateKey },
  ]);
  expect(await persist([candidate("new-1", "Retain", "Same content")])).toBe(false);
  await testDb.delete(schema.knowledgeObjects).where(eq(schema.knowledgeObjects.id, "old-2"));
  expect(await persist([candidate("new-1", "Retain", "Same content"), candidate("new-2", "Retain", "Same content")])).toBe(false);
  expect(await testDb.select().from(schema.knowledgeObjectSources)).toHaveLength(0);
  expect(await testDb.select().from(schema.vectorSyncQueue)).toHaveLength(0);
  expect(await testDb.select().from(schema.knowledgeObjects)).toHaveLength(1);
  const [mtd] = await testDb.select().from(schema.masterTeachingDocuments);
  expect(mtd).toMatchObject({ version: 3, sourceHash: "old-source", derivedHash: "old-derived" });
});
