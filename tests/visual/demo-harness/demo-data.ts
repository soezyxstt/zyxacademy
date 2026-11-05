import "server-only";
import { publicDemoSnapshotSchema } from "@/lib/demo/snapshot";
import type { PublicArticleReadModel } from "@/lib/articles/structured-read-model";
import { padDemoCatalogue, type DemoCatalogue } from "@/lib/demo/catalogue";
import { fictionalDemoSnapshot } from "@/lib/demo/fictional-snapshot";

export type DemoDiktatSection = { title: string; content: string };
export type DemoFlashcard = { front: string; back: string; explanation: string | null };
export type DemoQuizQuestion = { id: string; prompt: string; options: string[]; multiple: boolean };
export type DemoCourseSummary = { id: string; title: string; category: string; description: string | null; chapterTitle: string; chapterNumber: number };
export type DemoEligibility = { courseId: string | null; eligible: boolean; checks: { key: "article" | "diktat" | "flashcards" | "quiz"; label: string; ready: boolean; count: number }[]; issues: string[] };
const course: DemoCourseSummary = { id: "fictional-course", title: "Dasar pembelajaran", category: "Sains", description: null, chapterTitle: "Konsep dasar", chapterNumber: 1 };
const article: PublicArticleReadModel = {
  id: "article-fictional",
  courseId: course.id,
  chapterId: "chapter-fictional",
  slug: "konsep-dasar",
  title: "Mengenal konsep dasar",
  courseTitle: course.title,
  chapterTitle: course.chapterTitle,
  chapterNumber: 1,
  version: 1,
  totalEstimatedReadingMinutes: 3,
  sections: [{
    id: "section-fictional",
    slug: "pengantar",
    title: "Pengantar",
    sectionNumber: "1.1",
    sectionKind: "topic",
    learningObjective: "Menjelaskan konsep dasar",
    estimatedReadingMinutes: 3,
    orderIndex: 0,
    parentSectionId: null,
    blocks: [{
      id: "block-fictional",
      blockKey: "intro",
      blockType: "text",
      title: null,
      orderIndex: 0,
      content: "Konsep dasar membantu kita memahami hubungan antara gagasan dan penerapannya.",
    }],
  }],
};
const snapshot = publicDemoSnapshotSchema.parse({ version: 2, contentPolicy: "free-first-chapter", courseId: course.id, revision: "fixture-v1", displayName: "Pelajar Demo", asOf: "2026-06-30", streakDays: 3, mockChapters: [{ id: "later-fictional", title: "Bab berikutnya", orderIndex: 2, completionPercent: 25 }], course: { completedMaterials: 6, totalMaterials: 12, nextConcept: "Penerapan konsep" }, inProgressDocuments: [{ id: "doc-1", title: "Konsep dasar", completionPercent: 60 }], flashcards: { dueCount: 3, recentReviews: [{ id: "review-1", front: "Apa itu konsep?", grade: 3, reviewedOn: "2026-06-30" }] }, weakConcepts: [{ id: "concept-1", title: "Penerapan konsep", masteryPercent: 45 }], availableAssessments: [{ id: "assessment-1", title: "Latihan konsep", type: "quiz" }], history: ["2026-02-12", "2026-03-10", "2026-04-16", "2026-05-20", "2026-06-28", "2026-06-29", "2026-06-30"].map((date, index) => ({ date, materialsCompleted: index < 6 ? 1 : 0, flashcardsReviewed: 2, quizzesCompleted: index === 1 ? 1 : 0 })) });
const fixtureCourses = [
  { id: "fictional-berpikir", title: "Berpikir Komputasional" },
  { id: "fictional-fisika", title: "Fisika Dasar I" },
  { id: "fictional-kimia", title: "Kimia Dasar I" },
  { id: "fictional-matematika", title: "Matematika I" },
] as const;

export type DemoProductSelection = { articleId?: string; diktatId?: string; flashcardSetId?: string; quizOffset?: number; collectionOffset?: number; flashcardOffset?: number };
export async function fixtureDelay(multiplier = 1) {
  const delay = Number(process.env.DEMO_VISUAL_DELAY_MS ?? 0);
  if (Number.isFinite(delay) && delay > 0) await new Promise(resolve => setTimeout(resolve, Math.min(delay, 10000) * multiplier));
}
export type DemoContent = {
  collections: { articles: { id: string; title: string }[]; diktats: { id: string; title: string }[]; flashcardSets: { id: string; title: string }[]; quiz: { offset: number; total: number; pageSize: number; nextOffset: number | null; previousOffset: number | null }; page: { offset: number; pageSize: number; hasMore: boolean; nextOffset: number | null }; flashcards: { offset: number; pageSize: number; nextOffset: number | null } };
  selected: { articleId: string; diktatId: string; flashcardSetId: string | null };
  course: DemoCourseSummary; article: PublicArticleReadModel; diktat: { title: string; sections: DemoDiktatSection[] }; flashcards: DemoFlashcard[]; quiz: DemoQuizQuestion[]; quizSetToken: string;
};
export type DemoExperience = { content: DemoContent; snapshot: typeof snapshot };
type FixtureCourse = typeof fixtureCourses[number];
const pageToken = (courseId: string, offset: number, revision = snapshot.revision) => `fictional-token:${courseId}:free-first-chapter:${revision}:${offset}`;
function makeExperience(item: FixtureCourse, selection: DemoProductSelection = {}): DemoExperience | null {
  const quizOffset = selection.quizOffset ?? 0;
  const collectionOffset = selection.collectionOffset ?? 0;
  const flashcardOffset = selection.flashcardOffset ?? 0;
  if (![0, 3].includes(quizOffset) || collectionOffset !== 0 || flashcardOffset !== 0) return null;
  const articles = [1, 2].map((n) => ({ id: `${item.id}-article-${n}`, title: n === 1 ? "Mengenal konsep dasar" : "Penerapan konsep" }));
  const diktats = [1, 2].map((n) => ({ id: `${item.id}-diktat-${n}`, title: `Ringkasan konsep ${n}` }));
  const flashcardSets = [1, 2].map((n) => ({ id: `${item.id}-set-${n}`, title: `Kumpulan kartu ${n}` }));
  const articleItem = articles.find((entry) => entry.id === (selection.articleId ?? articles[0].id));
  const diktatItem = diktats.find((entry) => entry.id === (selection.diktatId ?? diktats[0].id));
  const setItem = flashcardSets.find((entry) => entry.id === (selection.flashcardSetId ?? flashcardSets[0].id));
  if (!articleItem || !diktatItem || !setItem) return null;
  const questions: DemoQuizQuestion[] = [1, 2, 3, 4].map((n) => ({ id: `${item.id}-question-${n}`, prompt: `Pertanyaan konsep ${n}?`, options: ["Pilihan pertama", "Pilihan kedua"], multiple: false }));
  return {
    snapshot: publicDemoSnapshotSchema.parse({ ...fictionalDemoSnapshot(item.id, item.title), revision: snapshot.revision }),
    content: {
      course: { ...course, id: item.id, title: item.title },
      collections: { articles, diktats, flashcardSets, page: { offset: 0, pageSize: 500, hasMore: false, nextOffset: null }, flashcards: { offset: 0, pageSize: 100, nextOffset: null }, quiz: { offset: quizOffset, total: questions.length, pageSize: 3, previousOffset: quizOffset ? 0 : null, nextOffset: quizOffset ? null : 3 } },
      selected: { articleId: articleItem.id, diktatId: diktatItem.id, flashcardSetId: setItem.id },
      article: { ...article, id: articleItem.id, title: articleItem.title, courseId: item.id, courseTitle: item.title },
      diktat: { title: diktatItem.title, sections: [{ title: "Dasar", content: "Dasar konsep pembelajaran." }, { title: "Penerapan", content: "Contoh penerapan konsep." }] },
      flashcards: [1, 2, 3, 4, 5].map((n) => ({ front: `Pertanyaan kartu ${n}?`, back: `Jawaban kartu ${n}`, explanation: null })),
      quiz: questions.slice(quizOffset, quizOffset + 3), quizSetToken: pageToken(item.id, quizOffset),
    },
  };
}
export async function getDemoExperiences(): Promise<DemoExperience[]> { return fixtureCourses.map((item) => makeExperience(item)).filter((item): item is DemoExperience => item !== null); }
export async function getDemoCatalogue(courseId: string): Promise<DemoCatalogue | null> {
  await fixtureDelay();
  const item = fixtureCourses.find(course => course.id === courseId);
  if (!item) return null;
  const chapters = Array.from({ length: item.id === "fictional-berpikir" ? 1 : 4 }, (_, index) => ({ id: `${item.id}-chapter-${index + 1}`, title: index ? `Bab ${index + 1}: Penerapan ${item.title}` : "Konsep dasar", orderIndex: index + 1 }));
  return padDemoCatalogue(item.title, chapters, chapters.slice(1).map((chapter, index) => ({ id: `${item.id}-later-${index}`, title: `Materi ${chapter.title}`, chapterId: chapter.id, kind: index % 2 ? "diktat" : "article" })));
}
export async function getDemoExperience(courseId?: string, selection?: DemoProductSelection): Promise<DemoExperience | null> {
  await fixtureDelay();
  const item = courseId === undefined ? (fixtureCourses.length === 1 ? fixtureCourses[0] : undefined) : fixtureCourses.find((entry) => entry.id === courseId);
  return item ? makeExperience(item, selection) : null;
}
export async function getDemoContent(): Promise<DemoContent | null> { return (await getDemoExperience())?.content ?? null; }
export async function getDemoCourseEligibility(courseId: string): Promise<DemoEligibility> { const exists = fixtureCourses.some((item) => item.id === courseId); return { courseId: exists ? courseId : null, eligible: exists, checks: [], issues: [] }; }
export async function getDemoQuizSet(courseId?: string, offset = 0) {
  const experience = await getDemoExperience(courseId, { quizOffset: offset });
  return experience ? { courseId: experience.snapshot.courseId, contentPolicy: experience.snapshot.contentPolicy, contentRevision: experience.snapshot.revision, questions: experience.content.quiz.map((q) => ({ ...q, version: 1, correctIndices: [0], explanation: "Penjelasan fiktif." })) } : null;
}
export async function getDemoQuizAnswers() { return (await getDemoQuizSet())?.questions ?? null; }
export function verifyDemoQuestionSetToken(token: unknown, expected: { courseId: string; contentPolicy: "free-first-chapter"; contentRevision: string; questionIds: readonly string[]; questionVersions: readonly number[] }) {
  const offset = expected.questionIds[0]?.endsWith("-question-4") ? 3 : 0;
  const count = offset === 3 ? 1 : 3;
  return token === pageToken(expected.courseId, offset, expected.contentRevision) && expected.contentPolicy === "free-first-chapter" && expected.questionIds.length === count && expected.questionIds.every((id, index) => id === `${expected.courseId}-question-${offset + index + 1}`) && expected.questionVersions.length === count && expected.questionVersions.every((version) => version === 1);
}
type PrivateQuestion = DemoQuizQuestion & { version: number; correctIndices: number[]; explanation: string | null };
export function gradeDemoAnswers(questions: readonly PrivateQuestion[], answers: readonly (number | readonly number[])[]) { const results = questions.map((_, index) => { const answer = answers[index]; return { index, isCorrect: Array.isArray(answer) ? answer.length === 1 && answer[0] === 0 : answer === 0, explanation: "Penjelasan fiktif." }; }); return { score: results.filter((r) => r.isCorrect).length, total: questions.length, results }; }
