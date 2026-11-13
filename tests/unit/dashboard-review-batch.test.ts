import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "../../db/schema";

const tables = [schema.bab, schema.setFlashcard, schema.flashcard, schema.flashcardIde, schema.kemajuanFlashcardMurid, schema.pemahamanIde, schema.flashcardSets, schema.flashcards, schema.studentFlashcardProgress];
const client = new PGlite();
const queries: string[] = [];
const db = drizzle(client, { logger: { logQuery(query) { if (/^select/i.test(query)) queries.push(query); } } });
const courses = new Map<string, any>();
const access = new Map<string, any>();
mock.module("@/db", () => ({ db }));
mock.module("@/lib/student/course-catalog", () => ({ resolveStudentCourse: async (id: string) => courses.get(id) ?? null }));
mock.module("@/lib/course-utils", () => ({ getStudentCourseAccess: async (_: string, id: string) => {
  const entry = access.get(id);
  if (!entry) return null;
  return { ...entry, policy: { hasCourseAccess: true, capabilities: { canReviewFlashcard: true }, tier: entry.tier === "free" ? "free" : "enrolled", hasFullContentAccess: entry.tier !== "free", scopedChapterIds: ["ch", "old-ch"], freeChapterIds: entry.freeChapterIds ?? [] } };
}, isFreeChapterScoped: (ids: (string | null)[], allowed: Set<string> | string[]) => ids.length > 0 && ids.every(id => id !== null && new Set(allowed).has(id)) }));
mock.module("@/lib/recommendation-service", () => ({ markRecommendationDone: async () => {} }));
mock.module("@/lib/migrasi/repository-kompatibilitas", () => ({ dualWriteFlashcardReview: async () => {}, dualWriteLearningEvent: async () => {} }));
mock.module("@/lib/pemahaman/evidence", () => ({ recordLearningEvidence: async () => {} }));
const { getReviewQueue } = await import("../../lib/flashcard-actions");
const { getDashboardReviewSummary } = await import("../../lib/student/dashboard-review-summary");
const now = Date.parse("2025-01-01T00:00:00Z");
const originalNow = Date.now;
async function insert(table: any, values: Record<string, unknown>) {
  const entries = Object.entries(values).map(([key, value]) => [table[key].name, value] as const);
  await client.query(`insert into "${getTableConfig(table).name}" (${entries.map(([name]) => `"${name}"`).join(",")}) values (${entries.map((_, i) => `$${i + 1}`).join(",")})`, entries.map(([, value]) => value));
}
async function canonical(course: string, card: string, chapter = "ch") {
  await insert(schema.setFlashcard, { id: `set-${card}`, mataKuliahId: course, babId: chapter, status: "published" });
  await insert(schema.flashcard, { id: card, setFlashcardId: `set-${card}`, status: "published", front: "front", back: "back", createdAt: new Date(now) });
}
async function legacy(course: string, card: string, chapter = "ch") {
  await insert(schema.flashcardSets, { id: `legacy-${card}`, courseId: course, chapterId: chapter, status: "published", isStale: false });
  await insert(schema.flashcards, { id: card, setId: `legacy-${card}`, status: "active" });
}
async function compare(ids: string[], expected: number[]) {
  const old = await Promise.all(ids.map(id => getReviewQueue("student", id)));
  const summary = await getDashboardReviewSummary("student", ids);
  expect(summary).toEqual(ids.map((courseId, i) => ({ courseId, count: old[i].length })));
  expect(summary.map(row => row.count)).toEqual(expected);
  return old;
}
beforeAll(async () => {
  for (const table of tables) {
    const config = getTableConfig(table);
    await client.exec(`create table "${config.name}" (${config.columns.map(column => `"${column.name}" ${column.getSQLType()}`).join(", ")})`);
  }
});
beforeEach(async () => {
  for (const table of tables) await client.exec(`delete from "${getTableConfig(table).name}"`);
  courses.clear(); access.clear(); queries.length = 0; Date.now = () => now;
});
afterAll(async () => { Date.now = originalNow; await client.close(); });
describe("dashboard review batch parity", () => {
  test("empty courses and canonical fallback, entitlement and due boundaries", async () => {
    expect(await getDashboardReviewSummary("student", [])).toEqual([]);
    for (const id of ["a", "b", "c", "d", "e"]) { courses.set(id, { canonicalId: id, legacyId: id }); access.set(id, { tier: "paid", freeChapterIds: [] }); }
    await insert(schema.bab, { id: "ch", legacyChapterId: "old-ch" });
    await canonical("a", "same"); await legacy("a", "same");
    await insert(schema.kemajuanFlashcardMurid, { flashcardId: "same", penggunaId: "student", dueAt: new Date(now + 1), status: "active" });
    await legacy("b", "legacy-b", "old-ch");
    await canonical("c", "exact"); await insert(schema.kemajuanFlashcardMurid, { flashcardId: "exact", penggunaId: "student", dueAt: new Date(now), status: "active" });
    await canonical("c", "paused"); await insert(schema.kemajuanFlashcardMurid, { flashcardId: "paused", penggunaId: "student", dueAt: new Date(now), status: "paused" });
    await canonical("d", "free"); access.set("d", { tier: "free", freeChapterIds: ["ch", "old-ch"] });
    await canonical("e", "denied"); access.delete("e");
    await compare(["a", "b", "c", "d", "e"], [0, 1, 1, 1, 0]);
  });
  test("mastery thresholds and weakest idea ties", async () => {
    courses.set("a", { canonicalId: "a", legacyId: "a" }); access.set("a", { tier: "paid" });
    for (const [card, score] of [["null", null], ["zero", 0], ["near", 79], ["mastered", 80]] as const) {
      await canonical("a", card);
      await insert(schema.flashcardIde, { flashcardId: card, ideId: `idea-${card}` });
      await insert(schema.pemahamanIde, { ideId: `idea-${card}`, penggunaId: "student", skor: score });
    }
    await insert(schema.flashcardIde, { flashcardId: "zero", ideId: "a-tie" });
    await insert(schema.pemahamanIde, { ideId: "a-tie", penggunaId: "student", skor: 0 });
    const [queue] = await compare(["a"], [3]);
    expect(queue.find(item => item.card.id === "zero")?.ideaId).toBe("a-tie");
  });
  test("batches five courses and chunks more than 400 cards without loading card content", async () => {
    const ids = ["a", "b", "c", "d", "e"];
    for (const id of ids) { courses.set(id, { canonicalId: id, legacyId: id }); access.set(id, { tier: "paid" }); }
    for (let i = 0; i < 401; i++) await canonical("a", `card-${i}`);
    for (const id of ids.slice(1)) await canonical(id, `card-${id}`);
    queries.length = 0;
    const old = await Promise.all(ids.map(id => getReviewQueue("student", id)));
    const oldCount = queries.length; queries.length = 0;
    const result = await getDashboardReviewSummary("student", ids);
    expect(result.map(row => row.count)).toEqual(old.map(queue => queue.length));
    expect(result.map(row => row.count)).toEqual([401, 1, 1, 1, 1]);
    expect(queries.length).toBeLessThan(oldCount);
    expect(queries.filter(query => query.includes('"flashcard_ide"')).length).toBe(2);
    for (const query of queries) expect(query.split(/\sfrom\s/i)[0]).not.toMatch(/"(front|back|explanation)"/i);
  });
});
