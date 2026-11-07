import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "../../db/schema";

const client = new PGlite();
const queries: string[] = [];
const db = drizzle(client, { logger: { logQuery(query) { if (/^select/i.test(query)) queries.push(query); } } });
mock.module("@/db", () => ({ db }));
const identities: Record<string, string | null> = { aliascourse: "canonical-alias", missingcourse: null };
mock.module("@/lib/student/course-catalog", () => ({ resolveStudentCourse: async (id: string) => {
  const canonicalId = Object.hasOwn(identities, id) ? identities[id] : id;
  return canonicalId ? { canonicalId } : null;
} }));
mock.module("@/lib/articles/structured-repository", () => ({ getCanonicalPublishedArticlesForCourse: async () => [] }));
const { getOrComputeStudyPath, getNextConceptsForCourses, selectCanonicalLearningSteps } = await import("../../lib/study-path-service");
const tables = [schema.ide, schema.bab, schema.concepts, schema.conceptLocalizations, schema.pemahamanIde, schema.relasiIde, schema.flashcardIde, schema.flashcard, schema.setFlashcard, schema.studyPaths];
async function insert(table: any, values: Record<string, unknown>) {
  const entries = Object.entries(values).map(([key, value]) => [table[key].name, value] as const);
  await client.query(`insert into "${getTableConfig(table).name}" (${entries.map(([name]) => `"${name}"`).join(",")}) values (${entries.map((_, i) => `$${i + 1}`).join(",")})`, entries.map(([, value]) => value));
}
beforeAll(async () => {
  for (const table of tables) {
    const config = getTableConfig(table);
    await client.exec(`create table "${config.name}" (${config.columns.map(column => `"${column.name}" ${column.getSQLType()}`).join(", ")})`);
  }
});
afterAll(async () => { await client.close(); });
test("batch matches full paths for five courses and preserves edges across chunks", async () => {
  const ids = ["a", "b", "c", "d", "e"];
  for (const id of ids) {
    await insert(schema.bab, { id: `chapter-${id}`, mataKuliahId: id, orderIndex: 1, title: id, status: "active" });
    const count = id === "a" ? 401 : 1;
    for (let i = 0; i < count; i++) await insert(schema.ide, { id: `${id}-${i}`, mataKuliahId: id, babId: `chapter-${id}`, code: String(i).padStart(4, "0"), canonicalStatement: `${id} concept ${i}`, status: "published" });
  }
  await insert(schema.relasiIde, { sourceIdeaId: "a-400", targetIdeaId: "a-0", status: "active", relationType: "prerequisite" });
  queries.length = 0;
  const paths = await Promise.all(ids.map(id => getOrComputeStudyPath("student", id)));
  const oldCount = queries.length;
  queries.length = 0;
  const batch = await getNextConceptsForCourses("student", ids);
  expect(batch.a).toBe("a concept 1");
  expect(batch).toEqual(Object.fromEntries(ids.map((id, i) => [id, paths[i].find(step => step.status === "available" || step.status === "in_progress")!.conceptName])));
  expect(queries.length).toBeLessThan(oldCount);
  expect(queries.some(query => /markdown|flashcard/i.test(query))).toBe(false);
  console.log(`study path select queries: old=${oldCount}, batch=${queries.length}`);
});
test("selector handles cycles, ties, deduplication and mastery", () => {
  const idea = (id: string, name: string, score: number | null, confidence: number | null) => ({ id, name, score, confidence, conceptDisplayName: null, chapterId: "ch", chapterTitle: "Chapter", chapterOrder: 1, code: id });
  const steps = selectCanonicalLearningSteps([idea("b", "Same", null, null), idea("a", "Same", 70, 50), idea("c", "Other", null, null)], [{ sourceIdeaId: "a", targetIdeaId: "c" }, { sourceIdeaId: "c", targetIdeaId: "a" }]);
  expect(steps.map(s => [s.current.id, s.status])).toEqual([["b", "available"], ["c", "available"]]);
  expect(selectCanonicalLearningSteps([idea("a", "Mastered", 70, 50), idea("b", "Locked", null, null)], [{ sourceIdeaId: "b", targetIdeaId: "a" }, { sourceIdeaId: "a", targetIdeaId: "b" }]).map(s => s.status)).toEqual(["mastered", "available"]);
});

test("batch matches cached legacy and empty paths, missing identities, and canonical aliases", async () => {
  await insert(schema.bab, { id: "alias-chapter", mataKuliahId: "canonical-alias", orderIndex: 1, title: "Alias chapter", status: "active" });
  await insert(schema.ide, { id: "alias-idea", mataKuliahId: "canonical-alias", babId: "alias-chapter", code: "001", canonicalStatement: "Alias concept", status: "published" });
  const legacy = [
    { stepId: "legacy-locked", chapterId: "legacy-chapter", status: "locked", conceptName: "Locked" },
    { stepId: "legacy-active", chapterId: "legacy-chapter", status: "in_progress", conceptName: "Legacy active" },
  ];
  for (const [courseId, pathJson] of [["legacycourse", legacy], ["emptycourse", []], ["missingcourse", []]] as const) {
    await insert(schema.studyPaths, { id: `path-${courseId}`, studentId: "student", courseId, pathJson: JSON.stringify(pathJson), computedAt: new Date().toISOString() });
  }
  const ids = ["legacycourse", "emptycourse", "missingcourse", "aliascourse"];
  const paths = await Promise.all(ids.map(id => getOrComputeStudyPath("student", id)));
  const batch = await getNextConceptsForCourses("student", ids);
  const expected = Object.fromEntries(ids.flatMap((id, i) => {
    const active = paths[i].find(step => step.status === "available" || step.status === "in_progress");
    return active ? [[id, active.conceptName]] : [];
  }));
  expect(batch).toEqual(expected);
  expect(batch).toEqual({ legacycourse: "Legacy active", aliascourse: "Alias concept" });
  expect(paths[1]).toEqual([]);
  expect(paths[2]).toEqual([]);
});
