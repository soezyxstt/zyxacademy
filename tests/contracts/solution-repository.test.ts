import { expect, mock, test } from "bun:test";
import { solutionCollectionFixture } from "@/app/visual-fixtures/solution-collection/fixture";
import * as coursePolicy from "@/lib/student/course-access";

let permitted = true;
let chapter = solutionCollectionFixture.chapter.id;
let content: unknown = solutionCollectionFixture;
let selects = 0;
const access = {
  isAuthenticated: true, hasCourseAccess: true, canonicalCourseId: solutionCollectionFixture.course.id,
  legacyCourseId: null, tier: "free", capabilities: { canReadArticle: true },
  scopedChapterIds: [chapter], freeChapterIds: [chapter],
};
mock.module("@/lib/student/course-access", () => ({ ...coursePolicy,
  resolveCourseAccess: async () => ({ ...access, isAuthenticated: permitted, hasCourseAccess: permitted }),
}));
mock.module("@/db", () => ({ db: { select: () => {
  selects++;
  const row = () => ({ id: "stored-collection", productId: solutionCollectionFixture.id, version: 1, title: solutionCollectionFixture.title,
    chapterId: chapter, legacyChapterId: null, content });
  const query: any = { from: () => query, innerJoin: () => query, where: () => query,
    orderBy: async () => [row()], limit: async () => [row()] };
  return query;
} } }));
const { listPublishedSolutionCollections, getPublishedSolutionCollection } = await import("@/lib/solutions/repository");
const input = { courseId: access.canonicalCourseId, userId: "learner", collectionId: "stored-collection" };

test("eligible learners can list and read a canonical chapter without a legacy ID", async () => {
  expect(await listPublishedSolutionCollections(input)).toHaveLength(1);
  expect((await getPublishedSolutionCollection(input))?.collection.id).toBe(solutionCollectionFixture.id);
});
test("denied access never queries content, foreign scope and invalid content fail closed", async () => {
  permitted = false;
  const before = selects;
  expect(await listPublishedSolutionCollections(input)).toEqual([]);
  expect(await getPublishedSolutionCollection(input)).toBeNull();
  expect(selects).toBe(before);
  permitted = true;
  chapter = "foreign-chapter";
  expect(await listPublishedSolutionCollections(input)).toEqual([]);
  expect(await getPublishedSolutionCollection(input)).toBeNull();
  chapter = solutionCollectionFixture.chapter.id;
  content = { ...solutionCollectionFixture, release: "protected_assessment" };
  expect(await getPublishedSolutionCollection(input)).toBeNull();
});
