import { afterAll, beforeEach, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import * as schema from "../../db/schema";
import { canonicalAdvisoryKey } from "../../lib/vectorize/canonical-locks";
import { embeddingKey, reconcileVectorRows, validateQueuedVectorRow } from "../../lib/vectorize/reconcile";
import { createPostgresTestDb } from "../helpers/postgres";

const { client, testDb } = await createPostgresTestDb();
const dialect = new PgDialect();
afterAll(async () => { await client.close(); });

beforeEach(async () => {
  await client.exec('TRUNCATE TABLE "user", courses, mata_kuliah CASCADE');
  await testDb.insert(schema.user).values({ id: "author", name: "Author", email: "author@example.test" });
  await testDb.insert(schema.pengguna).values({ id: "author" });
  await testDb.insert(schema.courses).values({ id: "legacy", title: "Course", category: "Fisika" });
  await testDb.insert(schema.mataKuliah).values({ id: "canonical", code: "CAN", title: "Course", legacyCourseId: "legacy" });
  await testDb.insert(schema.bab).values({ id: "chapter", mataKuliahId: "canonical", code: "CH", title: "Chapter", orderIndex: 0 });
  await testDb.insert(schema.ide).values({ id: "idea", mataKuliahId: "canonical", babId: "chapter", stableKey: "idea", code: "IDEA", canonicalStatement: " Statement ", conciseExplanation: "Explanation", semanticHash: "hash", generationHash: "hash", status: "published", creatorId: "author" });
  await testDb.insert(schema.sumberMateri).values({ id: "source", mataKuliahId: "canonical", babId: "chapter", title: "Source", canonicalUriOrR2Key: "source.md", checksum: "hash", status: "active", creatorId: "author" });
  await testDb.insert(schema.potonganSumber).values({ id: "chunk", sumberMateriId: "source", sourceVersion: 1, content: "Source content", startOffset: 0, endOffset: 14, checksum: "hash" });
  await testDb.insert(schema.artikel).values({ id: "article:v2", mataKuliahId: "canonical", babId: "chapter", slug: "article", title: "Article", contentMarkdown: "Public text", version: 2, status: "published", sourceHash: "hash", generationHash: "hash", creatorId: "author" });
  await testDb.insert(schema.soal).values({ id: "question", mataKuliahId: "canonical", babId: "chapter", questionType: "multiple_choice", prompt: "Which?", optionsSnapshot: [{ text: "A", isCorrect: true }, { text: "B", isCorrect: false }], status: "published", difficulty: "easy", cognitiveLevel: "remember", reasoningPattern: "recall", generationHash: "hash", creatorId: "author" });
  await testDb.insert(schema.pembahasanSoal).values({ id: "solution", soalId: "question", content: "Solution", status: "published", generationHash: "hash", creatorId: "author" });
});

function row(entityType: string, entityId: string, version = 1, action: "upsert" | "delete" = "upsert"): typeof schema.vectorSyncQueue.$inferSelect {
  const namespace = ({ idea: "canonical_ideas", source_material: "source_materials", article: "published_articles", question: "published_questions", solution: "published_solutions" } as Record<string, string>)[entityType];
  return { id: `queue-${entityId}`, courseId: "legacy", koId: null, namespace, action, payload: { entityType, entityId, version, text: "untrusted queued text", canonicalCourseId: "wrong-course" }, status: "processing", attempts: 0, leaseId: "lease", leaseExpiresAt: new Date(), lastError: null, createdAt: new Date(), updatedAt: new Date() };
}

async function reconcile(rows: ReturnType<typeof row>[], locks: string[] = []) {
  return testDb.transaction(tx => {
    const traced = new Proxy(tx, { get(target, key) {
      if (key === "execute") return async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        const statement = dialect.sqlToQuery(query);
        if (statement.sql.includes("pg_advisory_xact_lock")) locks.push(String(statement.params[0]));
        return target.execute(query);
      };
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    } });
    return reconcileVectorRows(traced as never, rows);
  });
}

test("current canonical projections and exact publication lock keys include both parents", async () => {
  const locks: string[] = [];
  const result = await reconcile([row("solution", "solution"), row("source_material", "chunk"), row("idea", "idea"), row("article", "article:v2", 2), row("question", "question")], locks);
  expect(locks).toEqual([
    canonicalAdvisoryKey({ domain: "product", entityType: "article", entityId: "article:v2" }),
    canonicalAdvisoryKey({ domain: "product", entityType: "question", entityId: "question" }),
    canonicalAdvisoryKey({ domain: "product", entityType: "solution", entityId: "solution" }),
    canonicalAdvisoryKey({ domain: "idea", entityType: "idea", entityId: "idea" }),
    canonicalAdvisoryKey({ domain: "idea", entityType: "source_chunk", entityId: "chunk" }),
    canonicalAdvisoryKey({ domain: "idea", entityType: "source_material", entityId: "source" }),
  ]);
  expect(result.every(item => item.outbox.operation === "upsert")).toBe(true);
  const article = result[3].outbox;
  expect(article).toMatchObject({ vectorId: "v2:article:article%3Av2:2", content: "Public text", metadata: { courseId: "canonical", chapterId: "chapter" } });
  expect(result[4].outbox).toMatchObject({ content: 'Which?\n\nOptions: [{"text":"A"},{"text":"B"}]' });
  expect(result[0].outbox).toMatchObject({ metadata: { accessClass: "restricted_solution" } });
});

test("managed identities reject missing, malformed and conflicting producer fields before fallback", () => {
  for (const payload of [
    {}, { entityId: "idea" }, { entityId: {}, version: 1 }, { entityId: " ", version: 1 },
    ...[0, -1, 1.5, "1", null].map(version => ({ entityId: "idea", version })),
    { entityId: "idea", version: 1, metadata: { entityId: "other" } },
    { entityId: "idea", version: 1, metadata: { version: 2 } },
    { entityId: "idea", id: "other", version: 1 },
    { entityId: "idea", entityType: "article", version: 1 },
  ]) for (const action of ["upsert", "delete"] as const) {
    expect(() => validateQueuedVectorRow({ ...row("idea", "idea"), action, payload })).toThrow();
  }
  expect(() => validateQueuedVectorRow(row("idea", "idea"))).not.toThrow();
});

test("retired aliases are rejected before resolving a canonical vector identity", async () => {
  for (const namespace of ["learning", "practice", "past_exams", "idea", "product"]) {
    expect(() => validateQueuedVectorRow({ ...row("idea", "idea"), namespace })).toThrow("VECTOR_SYNC_LEGACY_NAMESPACE_RETIRED");
  }
});

test("withdrawn, stale and ineligible canonical rows reconcile to deletes", async () => {
  await testDb.update(schema.ide).set({ status: "withdrawn" }).where(eq(schema.ide.id, "idea"));
  await testDb.update(schema.sumberMateri).set({ version: 2 }).where(eq(schema.sumberMateri.id, "source"));
  await testDb.update(schema.soal).set({ status: "retired" }).where(eq(schema.soal.id, "question"));
  const result = await reconcile([row("idea", "idea"), row("source_material", "chunk"), row("article", "article:v2", 1), row("solution", "solution")]);
  expect(result.map(item => item.outbox.operation)).toEqual(["delete", "delete", "delete", "delete"]);
});

test("unsafe historical Article bodies never become embedding input", async () => {
  await testDb.update(schema.artikel).set({ contentMarkdown: 'Intro\n{"content":"Question","answer":"private"}' }).where(eq(schema.artikel.id, "article:v2"));
  const [result] = await reconcile([row("article", "article:v2", 2)]);
  expect(result.outbox.operation).toBe("delete");
  expect(JSON.stringify(result.outbox)).not.toContain("private");
});

test("a safe Article uses current indexable text even when the queued body is private", async () => {
  await testDb.update(schema.artikel).set({ contentMarkdown: "Public text\n<!--__ZYX_V3_ARTICLE_VISUALS__:YWJj-->" }).where(eq(schema.artikel.id, "article:v2"));
  const unsafe = row("article", "article:v2", 2);
  unsafe.payload = { entityId: "article:v2", version: 2, text: '{"answer":"private"}' };
  const [result] = await reconcile([unsafe]);
  expect(result.outbox).toMatchObject({ operation: "upsert", content: "Public text" });
  expect(JSON.stringify(result.outbox)).not.toContain("private");
});

test("active shared records override obsolete deletes and embedding keys track title and content", async () => {
  const [current] = await reconcile([row("idea", "idea", 1, "delete")]);
  expect(current.outbox.operation).toBe("upsert");
  if (current.outbox.operation !== "upsert") throw new Error("expected current vector");
  const key = embeddingKey(current.outbox, current.title);
  await testDb.update(schema.ide).set({ canonicalStatement: "Changed", code: "NEW" }).where(eq(schema.ide.id, "idea"));
  const [changed] = await reconcile([row("idea", "idea")]);
  if (changed.outbox.operation !== "upsert") throw new Error("expected changed vector");
  expect(embeddingKey(changed.outbox, changed.title)).not.toBe(key);
});
