import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import type { PublicArticleReadModel } from "@/lib/articles/structured-read-model";
import { sanitizeDemoArticle, sanitizeDemoMarkdown } from "@/lib/demo/public-content-sanitizer";
import { resolveAuthSecret } from "@/lib/auth-secret";
import { getPublicDemoContexts, type DemoCourseContext } from "@/lib/demo/context-repository";
import type { DemoAllowedCourse } from "@/lib/demo/snapshot-repository";
import { matchesDemoQuizScope, type PublicDemoSnapshot } from "@/lib/demo/snapshot";

export type DemoDiktatSection = { title: string; content: string };
export type DemoFlashcard = { front: string; back: string; explanation: string | null };
export type DemoQuizQuestion = { id: string; prompt: string; options: string[]; multiple: boolean };
type DemoQuizQuestionPrivate = DemoQuizQuestion & { version: number; correctIndices: number[]; explanation: string | null };
export type DemoCourseSummary = { id: string; title: string; category: string; description: string | null; chapterTitle: string; chapterNumber: number };
export type DemoProductSelection = { articleId?: string; diktatId?: string; flashcardSetId?: string; quizOffset?: number; collectionOffset?: number; flashcardOffset?: number };
export type DemoExperienceKind = import("@/lib/demo/legacy-eligibility").PublicDemoKind;
export type DemoContent = { collections: { articles: { id: string; title: string }[]; diktats: { id: string; title: string }[]; flashcardSets: { id: string; title: string }[]; quiz: { offset: number; total: number; pageSize: number; nextOffset: number | null; previousOffset: number | null }; page: { offset: number; pageSize: number; hasMore: boolean; nextOffset: number | null }; flashcards: { offset: number; pageSize: number; nextOffset: number | null } }; selected: { articleId: string; diktatId: string; flashcardSetId: string | null }; course: DemoCourseSummary; article: PublicArticleReadModel; diktat: { title: string; sections: DemoDiktatSection[] }; flashcards: DemoFlashcard[]; quiz: DemoQuizQuestion[]; quizSetToken: string };
export type DemoExperience = { content: DemoContent; snapshot: PublicDemoSnapshot };
export type { DemoEligibility, DemoEligibilityCheck } from "@/lib/demo/legacy-eligibility";

export async function getDemoCatalogue(courseId: string) {
  const { getDemoCatalogue: load } = await import("@/lib/demo/catalogue-repository");
  return load(courseId);
}

/** Administrative eligibility remains separate from all public demo reads. */
export async function getDemoCourseEligibility(courseId: string) {
  const legacy = await import("@/lib/demo/legacy-eligibility");
  return legacy.getDemoCourseEligibility(courseId);
}

type QuizScope = { courseId: string; contentPolicy: "free-first-chapter"; contentRevision: string; questionIds: readonly string[]; questionVersions: readonly number[] };
const tokenVersion = 2;
function sign(payload: string) { return createHmac("sha256", resolveAuthSecret()).update(payload, "utf8").digest("base64url"); }
function issueToken(scope: QuizScope): string {
  const payload = Buffer.from(JSON.stringify({ version: tokenVersion, ...scope, expiresAt: Date.now() + 15 * 60 * 1000 }), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}
export function verifyDemoQuestionSetToken(token: unknown, expected: QuizScope): boolean {
  if (typeof token !== "string") return false;
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) return false;
  const actual = Buffer.from(signature, "utf8");
  const wanted = Buffer.from(sign(encoded), "utf8");
  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) return false;
  try {
    const payload: unknown = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
    const value = payload as { version?: unknown; expiresAt?: unknown; courseId?: unknown; contentPolicy?: unknown; contentRevision?: unknown; questionIds?: unknown; questionVersions?: unknown };
    return value.version === tokenVersion && typeof value.expiresAt === "number" && value.expiresAt > Date.now() && matchesDemoQuizScope(value, expected);
  } catch { return false; }
}

function safeIdentity(value: string): string {
  if (sanitizeDemoMarkdown(value) !== value) throw new Error("Invalid public demo identifier");
  return value;
}

export function sanitizeSnapshot(snapshot: PublicDemoSnapshot): PublicDemoSnapshot {
  const cleanItem = <T extends { id: string; title: string }>(item: T): T => ({ ...item, id: safeIdentity(item.id), title: sanitizeDemoMarkdown(item.title) });
  return {
    ...snapshot,
    courseId: safeIdentity(snapshot.courseId), revision: safeIdentity(snapshot.revision),
    displayName: sanitizeDemoMarkdown(snapshot.displayName),
    course: { ...snapshot.course, nextConcept: snapshot.course.nextConcept === null ? null : sanitizeDemoMarkdown(snapshot.course.nextConcept) },
    mockChapters: snapshot.mockChapters?.map(cleanItem),
    inProgressDocuments: snapshot.inProgressDocuments.map(cleanItem),
    flashcards: { ...snapshot.flashcards, recentReviews: snapshot.flashcards.recentReviews.map((item) => ({ ...item, id: safeIdentity(item.id), front: sanitizeDemoMarkdown(item.front) })) },
    weakConcepts: snapshot.weakConcepts.map(cleanItem),
    availableAssessments: snapshot.availableAssessments.map(cleanItem),
  };
}

async function loadPieces(row: DemoAllowedCourse, selection?: DemoProductSelection, kind: DemoExperienceKind = "all", includeSolutions = false, context?: DemoCourseContext) {
  try {
    const { resolvePublicFreeFirstChapter } = await import("@/lib/demo/legacy-eligibility");
    const pieces = await resolvePublicFreeFirstChapter(row.snapshot.courseId, selection, kind, includeSolutions, context);
    if (!pieces) return null;
    const cleanItems = (items: { id: string; title: string }[]) => items.map((item) => ({ id: safeIdentity(item.id), title: sanitizeDemoMarkdown(item.title) }));
    return {
      ...pieces,
      course: { ...pieces.course, id: safeIdentity(pieces.course.id), title: sanitizeDemoMarkdown(pieces.course.title), category: sanitizeDemoMarkdown(pieces.course.category), description: pieces.course.description === null ? null : sanitizeDemoMarkdown(pieces.course.description), chapterTitle: sanitizeDemoMarkdown(pieces.course.chapterTitle) },
      article: sanitizeDemoArticle(pieces.article),
      diktat: { title: sanitizeDemoMarkdown(pieces.diktat.title), sections: pieces.diktat.sections.map((section) => ({ title: sanitizeDemoMarkdown(section.title), content: sanitizeDemoMarkdown(section.content) })) },
      flashcards: pieces.flashcards.map((card) => ({ front: sanitizeDemoMarkdown(card.front), back: sanitizeDemoMarkdown(card.back), explanation: card.explanation === null ? null : sanitizeDemoMarkdown(card.explanation) })),
      quiz: pieces.quiz.map((question) => ({ ...question, id: safeIdentity(question.id), prompt: sanitizeDemoMarkdown(question.prompt), options: question.options.map(sanitizeDemoMarkdown), explanation: question.explanation === null ? null : sanitizeDemoMarkdown(question.explanation) })),
      collections: { ...pieces.collections, articles: cleanItems(pieces.collections.articles), diktats: cleanItems(pieces.collections.diktats), flashcardSets: cleanItems(pieces.collections.flashcardSets) },
      selected: { articleId: safeIdentity(pieces.selected.articleId), diktatId: safeIdentity(pieces.selected.diktatId), flashcardSetId: pieces.selected.flashcardSetId === null ? null : safeIdentity(pieces.selected.flashcardSetId) },
    };
  } catch { return null; }
}
async function makeExperience(context: DemoCourseContext, selection?: DemoProductSelection, kind: DemoExperienceKind = "all"): Promise<DemoExperience | null> {
  const row = context.row;
  const pieces = await loadPieces(row, selection, kind, false, context);
  if (!pieces || !pieces.article || !pieces.diktat) return null;
  const scope: QuizScope = { courseId: row.snapshot.courseId, contentPolicy: "free-first-chapter", contentRevision: row.snapshot.revision, questionIds: pieces.quiz.map((q) => q.id), questionVersions: pieces.quiz.map((q) => q.version) };
  let snapshot: PublicDemoSnapshot;
  try { snapshot = sanitizeSnapshot(row.snapshot); } catch { return null; }
  return { snapshot, content: {
    collections: pieces.collections, selected: pieces.selected, course: pieces.course, article: pieces.article, diktat: pieces.diktat, flashcards: pieces.flashcards,
    quiz: pieces.quiz.map(({ id, prompt, options, multiple }) => ({ id, prompt, options, multiple })), quizSetToken: pieces.quiz.length ? issueToken(scope) : "",
  } };
}
export async function getDemoExperiences(): Promise<DemoExperience[]> {
  try {
    const contexts = await getPublicDemoContexts();
    const experiences = await Promise.all([...contexts.values()].map((context) => context ? makeExperience(context) : null));
    return experiences.filter((item): item is DemoExperience => item !== null);
  } catch { return []; }
}
const getCachedDemoExperience = cache(async (courseId: string | undefined, articleId: string | undefined, diktatId: string | undefined, flashcardSetId: string | undefined, quizOffset: number | undefined, collectionOffset: number | undefined, flashcardOffset: number | undefined, kind: DemoExperienceKind): Promise<DemoExperience | null> => {
  try {
    const contexts = await getPublicDemoContexts();
    const context = courseId === undefined ? (contexts.size === 1 ? contexts.values().next().value : undefined) : contexts.get(courseId);
    return context ? makeExperience(context, { articleId, diktatId, flashcardSetId, quizOffset, collectionOffset, flashcardOffset }, kind) : null;
  } catch { return null; }
});
export async function getDemoExperience(courseId?: string, selection?: DemoProductSelection, kind: DemoExperienceKind = "all"): Promise<DemoExperience | null> {
  return getCachedDemoExperience(courseId, selection?.articleId, selection?.diktatId, selection?.flashcardSetId, selection?.quizOffset, selection?.collectionOffset, selection?.flashcardOffset, kind);
}
export async function getDemoContent(): Promise<DemoContent | null> { return (await getDemoExperience())?.content ?? null; }
export async function getDemoQuizSet(courseId?: string, offset = 0): Promise<{ courseId: string; contentPolicy: "free-first-chapter"; contentRevision: string; questions: DemoQuizQuestionPrivate[] } | null> {
  try {
    const contexts = await getPublicDemoContexts();
    const context = courseId === undefined ? (contexts.size === 1 ? contexts.values().next().value : undefined) : contexts.get(courseId);
    if (!context) return null;
    const pieces = await loadPieces(context.row, { quizOffset: offset }, "quiz", true, context);
    return pieces ? { courseId: context.row.snapshot.courseId, contentPolicy: "free-first-chapter", contentRevision: context.row.snapshot.revision, questions: pieces.quiz } : null;
  } catch { return null; }
}
export async function getDemoQuizAnswers(): Promise<DemoQuizQuestionPrivate[] | null> { return (await getDemoQuizSet())?.questions ?? null; }
export function gradeDemoAnswers(questions: readonly DemoQuizQuestionPrivate[], answers: readonly (number | readonly number[])[]) {
  const results = questions.map((question, index) => {
    const answer = answers[index];
    const selected = Array.isArray(answer) ? answer.filter((value): value is number => typeof value === "number" && Number.isInteger(value)) : typeof answer === "number" && Number.isInteger(answer) ? [answer] : [];
    const expected = [...question.correctIndices].sort((a, b) => a - b);
    const actual = [...selected].sort((a, b) => a - b);
    return { index, isCorrect: expected.length === actual.length && expected.every((value, i) => value === actual[i]), explanation: question.explanation };
  });
  return { score: results.filter((result) => result.isCorrect).length, total: results.length, results };
}
