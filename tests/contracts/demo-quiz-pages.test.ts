import { expect, mock, test } from "bun:test";
import { collectDemoProducts, collectDemoFlashcards } from "@/lib/demo/product-pages";
import { collectDemoQuizPages } from "@/lib/demo/quiz-pages";
mock.module("server-only", () => ({}));
const { getDemoExperience } = await import("../visual/demo-harness/demo-data");
const courseId = "fictional-berpikir";
test("the student quiz receives all redacted questions while retaining each signed grading page", async () => {
 const first = (await getDemoExperience(courseId))!;
 const pages = await collectDemoQuizPages(first, getDemoExperience);
 expect(pages?.map(page => [page.offset, page.questions.length])).toEqual([[0,3],[3,1]]);
 expect(pages?.flatMap(page => page.questions).map(question => question.id)).toHaveLength(4);
 expect(JSON.stringify(pages)).not.toMatch(/correctIndices|explanation|correct_indices/);
 expect(pages?.[0].token).not.toBe(pages?.[1].token);
});
test("page aggregation fails closed on missing, mixed, duplicate or incomplete selections", async () => {
 const first = (await getDemoExperience(courseId))!;
 for (const kind of ["missing", "course", "revision", "total", "offset", "duplicate", "empty", "token"] as const) {
   const pages = await collectDemoQuizPages(first, async (id, selection) => {
     const item = structuredClone(await getDemoExperience(id, selection));
     if (!item || kind === "missing") return null;
     if (kind === "course") item.snapshot.courseId = "another-course";
     if (kind === "revision") item.snapshot.revision = "another-revision";
     if (kind === "total") item.content.collections.quiz.total = 5;
     if (kind === "offset") item.content.collections.quiz.offset = 0;
     if (kind === "duplicate") item.content.quiz[0].id = first.content.quiz[0].id;
     if (kind === "empty") item.content.quiz = [];
     if (kind === "token") item.content.quizSetToken = "";
     return item;
   });
   expect(pages).toBeNull();
 }
});

test("student document and flashcard adapters cover both eligible sets without trusting foreign pages", async () => {
 const first = (await getDemoExperience(courseId))!;
 const products = await collectDemoProducts(first, getDemoExperience);
 expect(products?.articles).toHaveLength(2);
 expect(products?.diktats).toHaveLength(2);
 expect(products?.flashcardSets).toHaveLength(2);
 expect(await collectDemoFlashcards(first, products!, getDemoExperience)).toHaveLength(10);
 const foreign = structuredClone(first); foreign.content.course.id = "foreign-course";
 expect(await collectDemoProducts(foreign, getDemoExperience)).toBeNull();
 const badCursor = structuredClone(first); badCursor.content.collections.page.hasMore = true; badCursor.content.collections.page.nextOffset = 1;
 expect(await collectDemoProducts(badCursor, getDemoExperience)).toBeNull();
 expect(await collectDemoFlashcards(first, products!, async () => foreign)).toBeNull();
});

test("collects metadata after 500 items and cards after 100 without accepting invalid cursors", async () => {
 const first = structuredClone((await getDemoExperience(courseId))!);
 const setId = first.content.selected.flashcardSetId!;
 first.content.collections.articles = Array.from({ length: 500 }, (_, i) => ({ id: `article-${i}`, title: `Article ${i}` }));
 first.content.collections.diktats = [];
 first.content.collections.flashcardSets = [{ id: setId, title: "Set" }];
 first.content.collections.page = { offset: 0, pageSize: 500, hasMore: true, nextOffset: 500 };
 const next = structuredClone(first);
 next.content.collections.articles = [{ id: "article-500", title: "Article 500" }];
 next.content.collections.flashcardSets = [];
 next.content.collections.page = { offset: 500, pageSize: 500, hasMore: false, nextOffset: null };
 const products = await collectDemoProducts(first, async () => next);
 expect(products?.articles).toHaveLength(501);
 expect(products?.articles[500].collectionOffset).toBe(500);
 const loadCards = async (_id: string, selection: { flashcardOffset?: number }) => {
   const page = structuredClone(first);
   const offset = selection.flashcardOffset ?? 0;
   page.content.collections.flashcards = { offset, pageSize: 100, nextOffset: offset === 0 ? 100 : null };
   page.content.flashcards = Array.from({ length: offset === 0 ? 100 : 1 }, (_, i) => ({ front: `Front ${offset + i}`, back: "Back", explanation: null }));
   return page;
 };
 expect(await collectDemoFlashcards(first, products!, loadCards)).toHaveLength(101);
 expect(await collectDemoFlashcards(first, products!, async (id, selection) => {
   const page = await loadCards(id, selection);
   page.content.collections.flashcards.nextOffset = 99;
   return page;
 })).toBeNull();
});
