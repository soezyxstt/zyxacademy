import "server-only";

import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import {
  artikel,
  asesmen,
  cakupanAsesmen,
  itemAsesmen,
  quizTemplates,
  bab,
  courses,
  diktatMateri,
  flashcard,
  mataKuliah,
  pembahasanSoal,
  setFlashcard,
  soal,
} from "@/db/schema";
import { db } from "@/lib/db";
import { getAuthorizedFreeQuestionIds } from "@/lib/demo/free-quiz-policy";
import { selectFreeChapters, hasChapterScopeWithin } from "@/lib/student/course-access";
import {
  fetchSharedCanonicalArticle,
} from "@/lib/articles/structured-repository";
import { buildPublicArticleReadModel, type PublicArticleReadModel } from "@/lib/articles/structured-read-model";


const demoColumn = mataKuliah.isDemo;

export type DemoDiktatSection = {
  title: string;
  content: string;
};

export type DemoFlashcard = {
  front: string;
  back: string;
  explanation: string | null;
};

export type DemoQuizQuestion = {
  id: string;
  prompt: string;
  options: string[];
  multiple: boolean;
};

type DemoQuizQuestionPrivate = DemoQuizQuestion & {
  version: number;
  correctIndices: number[];
  explanation: string | null;
};

export type DemoCourseSummary = {
  id: string;
  title: string;
  category: string;
  description: string | null;
  chapterTitle: string;
  chapterNumber: number;
};

export type DemoContent = {
  course: DemoCourseSummary;
  article: PublicArticleReadModel;
  diktat: {
    title: string;
    sections: DemoDiktatSection[];
  };
  flashcards: DemoFlashcard[];
  quiz: DemoQuizQuestion[];
  quizSetToken: string;
};

export type DemoEligibilityCheck = {
  key: "article" | "diktat" | "flashcards" | "quiz";
  label: string;
  ready: boolean;
  count: number;
};

export type DemoEligibility = {
  courseId: string | null;
  eligible: boolean;
  checks: DemoEligibilityCheck[];
  issues: string[];
};

type CanonicalCourse = typeof mataKuliah.$inferSelect & {
  isDemo?: boolean;
};

type DemoPieces = {
  course: DemoCourseSummary;
  article: PublicArticleReadModel | null;
  diktat: { title: string; sections: DemoDiktatSection[] } | null;
  flashcards: DemoFlashcard[];
  quiz: DemoQuizQuestionPrivate[];
  checks: DemoEligibilityCheck[];
};

function asCanonicalCourse(row: typeof mataKuliah.$inferSelect): CanonicalCourse {
  return row as CanonicalCourse;
}

async function resolveCanonicalCourse(courseId: string): Promise<CanonicalCourse | null> {
  const cleanId = courseId.trim().toLowerCase();
  if (!cleanId) return null;

  const rows = await db
    .select()
    .from(mataKuliah)
    .where(
      and(
        eq(mataKuliah.status, "active"),
        or(eq(mataKuliah.id, cleanId), eq(mataKuliah.legacyCourseId, cleanId)),
      ),
    )
    .orderBy(asc(mataKuliah.title), asc(mataKuliah.id));

  // A legacy ID must resolve to exactly one active canonical course. Never
  // pick the first row when a migration or manual edit left an ambiguous map.
  if (rows.length !== 1) return null;
  const row = rows[0];

  if (row.legacyCourseId) {
    const mappedRows = await db
      .select({ id: mataKuliah.id })
      .from(mataKuliah)
      .where(eq(mataKuliah.legacyCourseId, row.legacyCourseId));
    if (mappedRows.length !== 1 || mappedRows[0]?.id !== row.id) return null;

    const legacyRows = await db
      .select({ id: courses.id })
      .from(courses)
      .where(eq(courses.id, row.legacyCourseId));
    if (legacyRows.length !== 1) return null;
  }

  return row ? asCanonicalCourse(row) : null;
}

async function getSelectedCourse(): Promise<CanonicalCourse | null> {
  try {
    const rows = await db
      .select()
      .from(mataKuliah)
      .where(eq(demoColumn, true))
      .orderBy(asc(mataKuliah.title), asc(mataKuliah.id));

    // The public boundary is intentionally unavailable unless there is one,
    // and only one, active demo marker. Re-resolve through the legacy alias so
    // duplicate canonical mappings also fail closed.
    if (rows.length !== 1) return null;
    const selected = rows[0];
    if (selected.status !== "active") return null;
    return resolveCanonicalCourse(selected.legacyCourseId ?? selected.id);
  } catch {
    // A database that has not applied the additive demo migration fails closed
    // to the public empty state.
    return null;
  }
}

async function buildCourseSummary(course: CanonicalCourse, chapter: typeof bab.$inferSelect): Promise<DemoCourseSummary> {
  const legacyId = course.legacyCourseId ?? course.id;
  const [legacy] = await db
    .select({ category: courses.category, description: courses.description })
    .from(courses)
    .where(eq(courses.id, legacyId))
    .limit(1);

  return {
    id: course.id,
    title: course.title,
    category: legacy?.category ?? "Umum",
    description: legacy?.description ?? null,
    chapterTitle: chapter.title,
    chapterNumber: chapter.orderIndex,
  };
}

async function getFirstActiveChapter(course: CanonicalCourse) {
  const [chapter] = await db
    .select()
    .from(bab)
    .where(and(eq(bab.mataKuliahId, course.id), eq(bab.status, "active")))
    .orderBy(asc(bab.orderIndex), asc(bab.id))
    .limit(1);
  return chapter ?? null;
}

async function resolveArticle(course: CanonicalCourse, chapter: typeof bab.$inferSelect, selectedId?: string, publicVisuals = false) {
  const [record] = await db
    .select({ id: artikel.id })
    .from(artikel)
    .where(
      and(
        eq(artikel.mataKuliahId, course.id),
        eq(artikel.babId, chapter.id),
        eq(artikel.structureStatus, "structured"),
        eq(artikel.status, "published"),
        selectedId ? eq(artikel.id, selectedId) : undefined,
      ),
    )
    .orderBy(
      desc(artikel.version),
      desc(artikel.publishedAt),
      desc(artikel.updatedAt),
      asc(artikel.id),
    )
    .limit(1);

  if (!record) return null;
  const shared = await fetchSharedCanonicalArticle(course.id, record.id);
  if (!shared || shared.articleRecord.mataKuliahId !== course.id || shared.articleRecord.babId !== chapter.id || (!publicVisuals && shared.articleVisuals.length)) return null;
  const article = buildPublicArticleReadModel({
    id: shared.articleRecord.id, courseId: course.id, babId: chapter.id, slug: shared.articleRecord.slug,
    title: shared.articleRecord.title, version: shared.articleRecord.version, status: shared.articleRecord.status,
    visuals: publicVisuals ? shared.articleVisuals : [], updatedAt: shared.articleRecord.updatedAt,
  }, shared.parsedSections, shared.parsedBlocks, null, {
    id: chapter.id, title: chapter.title, number: chapter.orderIndex, courseTitle: course.title,
  });
  if (article.sections.length === 0) return null;

  // A demo Article must be readable as a complete structured product. A
  // section without published blocks is treated as incomplete, not silently
  // omitted from the public preview.
  if (article.sections.some((section) => section.blocks.length === 0)) return null;
  return article;
}

export function splitDiktatPreview(markdown: string): DemoDiktatSection[] {
  const clean = markdown.replace(/\r/g, "").trim();
  if (!clean) return [];

  const headings = Array.from(clean.matchAll(/^(#{1,3})[ \t]+(.+?)\s*$/gm));
  if (headings.length >= 2) {
    return headings.slice(0, 2).map((match, index) => {
      const start = match.index ?? 0;
      const nextStart = headings[index + 1]?.index ?? clean.length;
      const headingEnd = start + match[0].length;
      const leadingText = index === 0 ? clean.slice(0, start).trim() : "";
      const body = [leadingText, clean.slice(headingEnd, nextStart).trim()]
        .filter(Boolean)
        .join("\n\n");
      return {
        title: match[2]?.trim() || `Bagian ${index + 1}`,
        content: body,
      };
    });
  }

  const paragraphs = clean.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  if (paragraphs.length >= 2) {
    const midpoint = Math.max(1, Math.ceil(paragraphs.length / 2));
    return [
      { title: "Bagian 1", content: paragraphs.slice(0, midpoint).join("\n\n") },
      { title: "Bagian 2", content: paragraphs.slice(midpoint).join("\n\n") },
    ].filter((section) => section.content.length > 0);
  }

  // Very short or single-paragraph Diktat content does not satisfy the
  // two-section demo contract. Leave it as one section so the admin checklist
  // can explain why the course is not eligible.
  return [{ title: "Bagian 1", content: clean }];
}

async function resolveDiktat(course: CanonicalCourse, chapter: typeof bab.$inferSelect, selectedId?: string, full = false) {
  const [record] = await db
    .select({ title: diktatMateri.title, contentMarkdown: diktatMateri.contentMarkdown })
    .from(diktatMateri)
    .where(
      and(
        eq(diktatMateri.mataKuliahId, course.id),
        eq(diktatMateri.babId, chapter.id),
        eq(diktatMateri.status, "published"),
        selectedId ? eq(diktatMateri.id, selectedId) : undefined,
      ),
    )
    .orderBy(
      desc(diktatMateri.version),
      desc(diktatMateri.publishedAt),
      desc(diktatMateri.updatedAt),
      asc(diktatMateri.id),
    )
    .limit(1);

  if (!record || !record.contentMarkdown.trim()) return null;
  const sections = full ? [{ title: record.title, content: record.contentMarkdown }] : splitDiktatPreview(record.contentMarkdown);
  return sections.length >= (full ? 1 : 2) && sections.every((section) => section.content.trim().length > 0)
    ? { title: record.title, sections }
    : null;
}

async function resolveFlashcards(course: CanonicalCourse, chapter: typeof bab.$inferSelect, selectedId?: string, offset = 0, limit = 5) {
  const rows = await db
    .select({
      front: flashcard.front,
      back: flashcard.back,
      explanation: flashcard.explanation,
    })
    .from(flashcard)
    .innerJoin(setFlashcard, eq(flashcard.setFlashcardId, setFlashcard.id))
    .where(
      and(
        eq(setFlashcard.mataKuliahId, course.id),
        eq(setFlashcard.babId, chapter.id),
        eq(setFlashcard.status, "published"),
        selectedId ? eq(setFlashcard.id, selectedId) : undefined,
        eq(flashcard.status, "published"),
      ),
    )
    .orderBy(
      desc(setFlashcard.version),
      desc(setFlashcard.updatedAt),
      asc(setFlashcard.id),
      asc(flashcard.createdAt),
      asc(flashcard.id),
    )
    .limit(limit).offset(offset);

  return rows;
}

function parseOptionsSnapshot(raw: unknown): {
  options: string[];
  correctIndices: number[];
} | null {
  const parsed = typeof raw === "string" ? parseJson(raw) : raw;
  if (!Array.isArray(parsed)) return null;

  const options: string[] = [];
  const correctIndices: number[] = [];
  for (const [index, option] of parsed.entries()) {
    if (typeof option === "string") {
      options.push(option.trim());
      continue;
    }
    if (!option || typeof option !== "object" || Array.isArray(option)) return null;
    const record = option as Record<string, unknown>;
    const text = typeof record.text === "string"
      ? record.text
      : typeof record.label === "string"
        ? record.label
        : typeof record.value === "string"
          ? record.value
          : "";
    options.push(text.trim());
    if (record.isCorrect === true || record.correct === true) correctIndices.push(index);
  }

  if (options.length < 2 || options.some((option) => option.length === 0) || correctIndices.length === 0) {
    return null;
  }
  return { options, correctIndices };
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function resolveQuiz(course: CanonicalCourse, chapter: typeof bab.$inferSelect) {
  const rows = await db
    .select({
      id: soal.id,
      version: soal.version,
      prompt: soal.prompt,
      questionType: soal.questionType,
      optionsSnapshot: soal.optionsSnapshot,
    })
    .from(soal)
    .where(
      and(
        eq(soal.mataKuliahId, course.id),
        eq(soal.babId, chapter.id),
        eq(soal.status, "published"),
        or(
          eq(soal.origin, "zyx_original"),
          eq(soal.origin, "itb_example"),
          eq(soal.quizEligible, true),
        ),
        or(eq(soal.questionType, "multiple_choice"), eq(soal.questionType, "multiple_choices")),
      ),
    )
    .orderBy(
      desc(soal.version),
      desc(soal.publishedAt),
      desc(soal.updatedAt),
      asc(soal.id),
    )
    .limit(50);

  const parsed = rows.flatMap((row) => {
    const options = parseOptionsSnapshot(row.optionsSnapshot);
    return options
      ? [{
          id: row.id,
          version: row.version,
          prompt: row.prompt,
          multiple: row.questionType === "multiple_choices",
          ...options,
        }]
      : [];
  }).slice(0, 3);

  if (parsed.length < 3) return [];

  const questionIds = parsed.map((question) => question.id);
  const solutions = await db
    .select({
      soalId: pembahasanSoal.soalId,
      content: pembahasanSoal.content,
    })
    .from(pembahasanSoal)
    .where(and(inArray(pembahasanSoal.soalId, questionIds), eq(pembahasanSoal.status, "published")))
    .orderBy(
      desc(pembahasanSoal.version),
      desc(pembahasanSoal.publishedAt),
      desc(pembahasanSoal.updatedAt),
      asc(pembahasanSoal.id),
    );
  const explanationByQuestion = new Map<string, string>();
  for (const solution of solutions) {
    if (!explanationByQuestion.has(solution.soalId)) {
      explanationByQuestion.set(solution.soalId, solution.content);
    }
  }

  return parsed.map(({ id, version, prompt, options, multiple, correctIndices }) => ({
    id,
    version,
    prompt,
    options,
    multiple,
    correctIndices,
    explanation: explanationByQuestion.get(id) ?? null,
  }));
}

async function resolvePieces(course: CanonicalCourse): Promise<DemoPieces | null> {
  const chapter = await getFirstActiveChapter(course);
  if (!chapter) return null;

  const [courseSummary, article, diktat, flashcards, quiz] = await Promise.all([
    buildCourseSummary(course, chapter),
    resolveArticle(course, chapter),
    resolveDiktat(course, chapter),
    resolveFlashcards(course, chapter),
    resolveQuiz(course, chapter),
  ]);

  const checks: DemoEligibilityCheck[] = [
    {
      key: "article",
      label: "Artikel terbit dengan struktur lengkap",
      ready: Boolean(article),
      count: article?.sections.length ?? 0,
    },
    {
      key: "diktat",
      label: "Diktat terbit dengan dua bagian",
      ready: Boolean(diktat),
      count: diktat?.sections.length ?? 0,
    },
    {
      key: "flashcards",
      label: "Sedikitnya lima flashcard terbit",
      ready: flashcards.length >= 5,
      count: flashcards.length,
    },
    {
      key: "quiz",
      label: "Sedikitnya tiga soal kuis terbit",
      ready: quiz.length >= 3,
      count: quiz.length,
    },
  ];

  return {
    course: courseSummary,
    article,
    diktat,
    flashcards,
    quiz,
    checks,
  };
}

export async function getDemoCourseEligibility(courseId: string): Promise<DemoEligibility> {
  const course = await resolveCanonicalCourse(courseId);
  if (!course) {
    return {
      courseId: null,
      eligible: false,
      checks: [],
      issues: ["Mata kuliah aktif tidak ditemukan."],
    };
  }

  const pieces = await resolvePieces(course);
  if (!pieces) {
    return {
      courseId: course.id,
      eligible: false,
      checks: [
        {
          key: "article",
          label: "Artikel terbit dengan struktur lengkap",
          ready: false,
          count: 0,
        },
        {
          key: "diktat",
          label: "Diktat terbit dengan dua bagian",
          ready: false,
          count: 0,
        },
        {
          key: "flashcards",
          label: "Sedikitnya lima flashcard terbit",
          ready: false,
          count: 0,
        },
        {
          key: "quiz",
          label: "Sedikitnya tiga soal kuis terbit",
          ready: false,
          count: 0,
        },
      ],
      issues: ["Mata kuliah belum memiliki bab aktif."],
    };
  }

  const issues = pieces.checks.filter((check) => !check.ready).map((check) => check.label);
  return {
    courseId: course.id,
    eligible: issues.length === 0,
    checks: pieces.checks,
    issues,
  };
}


export type PublicDemoSelection = { articleId?: string; diktatId?: string; flashcardSetId?: string; quizOffset?: number; collectionOffset?: number; flashcardOffset?: number };
const COLLECTION_PAGE_SIZE = 500;
const FLASHCARD_PAGE_SIZE = 100;
const QUIZ_PAGE_SIZE = 3;

function validOffset(offset: number, step: number): boolean {
  return Number.isSafeInteger(offset) && offset >= 0 && offset % step === 0;
}

/** Use the canonical projection only when it still agrees with the Free template. */
async function authorizedQuizQuestionIds(course: CanonicalCourse, chapter: typeof bab.$inferSelect): Promise<string[]> {
  if (!course.legacyCourseId) return [];
  const allowedChapters = [chapter.id, ...(chapter.legacyChapterId ? [chapter.legacyChapterId] : [])];
  const templates = await db.select({ template: quizTemplates, assessmentId: asesmen.id })
    .from(quizTemplates).innerJoin(asesmen, eq(asesmen.id, quizTemplates.id))
    .where(and(eq(quizTemplates.courseId, course.legacyCourseId), eq(asesmen.mataKuliahId, course.id),
      eq(asesmen.status, "published"), eq(asesmen.assessmentType, "quiz")));
  const authorized = new Set<string>();
  for (const { template, assessmentId } of templates) {
    const [coverage, items] = await Promise.all([
      db.select({ chapterId: cakupanAsesmen.babId }).from(cakupanAsesmen).where(eq(cakupanAsesmen.asesmenId, assessmentId)),
      db.select({ questionId: soal.id, courseId: soal.mataKuliahId, chapterId: soal.babId, status: soal.status, version: soal.version, contentVersion: itemAsesmen.contentVersion })
        .from(itemAsesmen).innerJoin(soal, eq(itemAsesmen.soalId, soal.id)).where(eq(itemAsesmen.asesmenId, assessmentId)),
    ]);
    for (const id of getAuthorizedFreeQuestionIds({ template, courseId: course.id, chapterIds: allowedChapters, coverage: coverage.map((item) => item.chapterId), items })) authorized.add(id);
  }
  return [...authorized];
}

/** Read eligible questions in bounded batches and retain only the requested page. */
async function resolvePublicQuiz(course: CanonicalCourse, chapter: typeof bab.$inferSelect, offset: number) {
  if (!validOffset(offset, QUIZ_PAGE_SIZE)) return null;
  const authorizedIds = await authorizedQuizQuestionIds(course, chapter);
  if (!authorizedIds.length) return null;
  let total = 0;
  let dbOffset = 0;
  const page: Array<{ id: string; version: number; prompt: string; multiple: boolean; options: string[]; correctIndices: number[] }> = [];
  while (true) {
    const rows = await db.select({ id: soal.id, version: soal.version, prompt: soal.prompt, questionType: soal.questionType, optionsSnapshot: soal.optionsSnapshot })
      .from(soal).where(and(eq(soal.mataKuliahId, course.id), eq(soal.babId, chapter.id), eq(soal.status, "published"), inArray(soal.id, authorizedIds),
        or(eq(soal.origin, "zyx_original"), eq(soal.origin, "itb_example"), eq(soal.quizEligible, true)),
        or(eq(soal.questionType, "multiple_choice"), eq(soal.questionType, "multiple_choices"))))
      .orderBy(asc(soal.id)).limit(100).offset(dbOffset);
    for (const row of rows) {
      const parsed = parseOptionsSnapshot(row.optionsSnapshot);
      if (!parsed) continue;
      if (total >= offset && total < offset + QUIZ_PAGE_SIZE) page.push({ id: row.id, version: row.version, prompt: row.prompt, multiple: row.questionType === "multiple_choices", ...parsed });
      total++;
    }
    dbOffset += rows.length;
    if (rows.length < 100) break;
  }
  if (offset >= total) return null;
  const solutions = await db.select({ soalId: pembahasanSoal.soalId, content: pembahasanSoal.content }).from(pembahasanSoal)
    .where(and(inArray(pembahasanSoal.soalId, page.map((q) => q.id)), eq(pembahasanSoal.status, "published")))
    .orderBy(desc(pembahasanSoal.version), desc(pembahasanSoal.publishedAt), desc(pembahasanSoal.updatedAt), asc(pembahasanSoal.id));
  const explanations = new Map<string, string>();
  for (const solution of solutions) if (!explanations.has(solution.soalId)) explanations.set(solution.soalId, solution.content);
  return { questions: page.map((q) => ({ ...q, explanation: explanations.get(q.id) ?? null })),
    metadata: { offset, total, pageSize: QUIZ_PAGE_SIZE, nextOffset: offset + QUIZ_PAGE_SIZE < total ? offset + QUIZ_PAGE_SIZE : null, previousOffset: offset > 0 ? offset - QUIZ_PAGE_SIZE : null } };
}

/** Resolve products only inside the allowlisted course's first Free chapter. */
export async function resolvePublicFreeFirstChapter(courseId: string, selection: PublicDemoSelection = {}) {
  const course = await resolveCanonicalCourse(courseId);
  if (!course || course.id !== courseId) return null;
  if ([selection.articleId, selection.diktatId, selection.flashcardSetId].some((id) => id !== undefined && (typeof id !== "string" || !id.trim() || id !== id.trim() || id.length > 128))) return null;
  const collectionOffset = selection.collectionOffset ?? 0;
  const flashcardOffset = selection.flashcardOffset ?? 0;
  if (!validOffset(collectionOffset, COLLECTION_PAGE_SIZE) || !validOffset(flashcardOffset, FLASHCARD_PAGE_SIZE)) return null;
  const chapters = await db.select().from(bab).where(and(eq(bab.mataKuliahId, course.id), eq(bab.status, "active"))).orderBy(asc(bab.orderIndex), asc(bab.id));
  const free = selectFreeChapters(chapters.map((chapter) => ({ id: chapter.id, title: chapter.title, orderIndex: chapter.orderIndex, canonicalId: chapter.id, legacyId: chapter.legacyChapterId, source: "canonical" as const })));
  const first = chapters.find((chapter) => chapter.id === free[0]?.canonicalId);
  if (!first || !hasChapterScopeWithin([first.id], free.flatMap((chapter) => [chapter.id, chapter.canonicalId, chapter.legacyId].filter((id): id is string => Boolean(id))))) return null;
  const [articles, diktats, flashcardSets, initialArticles, initialDiktats, initialSets, quizPage] = await Promise.all([
    db.select({ id: artikel.id, title: artikel.title }).from(artikel).where(and(eq(artikel.mataKuliahId, course.id), eq(artikel.babId, first.id), eq(artikel.structureStatus, "structured"), eq(artikel.status, "published"))).orderBy(asc(artikel.id)).limit(COLLECTION_PAGE_SIZE + 1).offset(collectionOffset),
    db.select({ id: diktatMateri.id, title: diktatMateri.title }).from(diktatMateri).where(and(eq(diktatMateri.mataKuliahId, course.id), eq(diktatMateri.babId, first.id), eq(diktatMateri.status, "published"))).orderBy(asc(diktatMateri.id)).limit(COLLECTION_PAGE_SIZE + 1).offset(collectionOffset),
    db.select({ id: setFlashcard.id, title: setFlashcard.title }).from(setFlashcard).where(and(eq(setFlashcard.mataKuliahId, course.id), eq(setFlashcard.babId, first.id), eq(setFlashcard.status, "published"))).orderBy(asc(setFlashcard.id)).limit(COLLECTION_PAGE_SIZE + 1).offset(collectionOffset),
    db.select({ id: artikel.id }).from(artikel).where(and(eq(artikel.mataKuliahId, course.id), eq(artikel.babId, first.id), eq(artikel.structureStatus, "structured"), eq(artikel.status, "published"))).orderBy(asc(artikel.id)).limit(1),
    db.select({ id: diktatMateri.id }).from(diktatMateri).where(and(eq(diktatMateri.mataKuliahId, course.id), eq(diktatMateri.babId, first.id), eq(diktatMateri.status, "published"))).orderBy(asc(diktatMateri.id)).limit(1),
    db.select({ id: setFlashcard.id }).from(setFlashcard).where(and(eq(setFlashcard.mataKuliahId, course.id), eq(setFlashcard.babId, first.id), eq(setFlashcard.status, "published"))).orderBy(asc(setFlashcard.id)).limit(1),
    resolvePublicQuiz(course, first, selection.quizOffset ?? 0),
  ]);
  const articleId = selection.articleId ?? initialArticles[0]?.id;
  const diktatId = selection.diktatId ?? initialDiktats[0]?.id;
  const flashcardSetId = selection.flashcardSetId ?? initialSets[0]?.id ?? null;
  if (!articleId || !diktatId || !quizPage || (selection.flashcardSetId && !flashcardSetId)) return null;
  if (selection.flashcardSetId) {
    const [match] = await db.select({ id: setFlashcard.id }).from(setFlashcard).where(and(eq(setFlashcard.id, selection.flashcardSetId), eq(setFlashcard.mataKuliahId, course.id), eq(setFlashcard.babId, first.id), eq(setFlashcard.status, "published"))).limit(1);
    if (!match) return null;
  }
  const [courseSummary, article, diktat, cardRows] = await Promise.all([
    buildCourseSummary(course, first), resolveArticle(course, first, articleId, true), resolveDiktat(course, first, diktatId, true),
    flashcardSetId ? resolveFlashcards(course, first, flashcardSetId, flashcardOffset, FLASHCARD_PAGE_SIZE + 1) : Promise.resolve([]),
  ]);
  if (!article || !diktat || (flashcardOffset > 0 && cardRows.length === 0)) return null;
  const pieces = { course: courseSummary, article, diktat, flashcards: cardRows.slice(0, FLASHCARD_PAGE_SIZE), quiz: quizPage.questions,
    collections: { articles: articles.slice(0, COLLECTION_PAGE_SIZE), diktats: diktats.slice(0, COLLECTION_PAGE_SIZE), flashcardSets: flashcardSets.slice(0, COLLECTION_PAGE_SIZE), quiz: quizPage.metadata,
      page: { offset: collectionOffset, pageSize: COLLECTION_PAGE_SIZE, hasMore: articles.length > COLLECTION_PAGE_SIZE || diktats.length > COLLECTION_PAGE_SIZE || flashcardSets.length > COLLECTION_PAGE_SIZE, nextOffset: articles.length > COLLECTION_PAGE_SIZE || diktats.length > COLLECTION_PAGE_SIZE || flashcardSets.length > COLLECTION_PAGE_SIZE ? collectionOffset + COLLECTION_PAGE_SIZE : null },
      flashcards: { offset: flashcardOffset, pageSize: FLASHCARD_PAGE_SIZE, nextOffset: cardRows.length > FLASHCARD_PAGE_SIZE ? flashcardOffset + FLASHCARD_PAGE_SIZE : null } },
    selected: { articleId, diktatId, flashcardSetId } };
  return pieces;
}
