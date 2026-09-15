import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import {
  artikel,
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
import {
  getCanonicalPublishedArticle,
} from "@/lib/articles/structured-repository";
import type { PublicArticleReadModel } from "@/lib/articles/structured-read-model";
import { resolveAuthSecret } from "@/lib/auth-secret";

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

const DEMO_QUESTION_SET_TOKEN_VERSION = 1;
const DEMO_QUESTION_SET_TOKEN_TTL_MS = 15 * 60 * 1000;

type DemoQuestionSetTokenPayload = {
  version: typeof DEMO_QUESTION_SET_TOKEN_VERSION;
  courseId: string;
  questionIds: string[];
  questionVersions: number[];
  expiresAt: number;
};

function signDemoQuestionSetToken(encodedPayload: string): string {
  return createHmac("sha256", resolveAuthSecret())
    .update(encodedPayload, "utf8")
    .digest("base64url");
}

function sameQuestionOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function sameQuestionVersions(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((version, index) => version === right[index]);
}

function issueDemoQuestionSetToken(input: {
  courseId: string;
  questionIds: readonly string[];
  questionVersions: readonly number[];
}): string {
  const payload: DemoQuestionSetTokenPayload = {
    version: DEMO_QUESTION_SET_TOKEN_VERSION,
    courseId: input.courseId,
    questionIds: [...input.questionIds],
    questionVersions: [...input.questionVersions],
    expiresAt: Date.now() + DEMO_QUESTION_SET_TOKEN_TTL_MS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${signDemoQuestionSetToken(encodedPayload)}`;
}

export function verifyDemoQuestionSetToken(
  token: unknown,
  expected: { courseId: string; questionIds: readonly string[]; questionVersions: readonly number[] },
): boolean {
  if (typeof token !== "string") return false;
  const [encodedPayload, encodedSignature, extra] = token.split(".");
  if (!encodedPayload || !encodedSignature || extra) return false;

  const expectedSignature = Buffer.from(signDemoQuestionSetToken(encodedPayload), "utf8");
  const receivedSignature = Buffer.from(encodedSignature, "utf8");
  if (expectedSignature.length !== receivedSignature.length
    || !timingSafeEqual(expectedSignature, receivedSignature)) {
    return false;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;

  const payload = parsed as Partial<DemoQuestionSetTokenPayload>;
  return payload.version === DEMO_QUESTION_SET_TOKEN_VERSION
    && payload.courseId === expected.courseId
    && typeof payload.expiresAt === "number"
    && payload.expiresAt > Date.now()
    && Array.isArray(payload.questionIds)
    && payload.questionIds.every((id): id is string => typeof id === "string" && id.length > 0)
    && sameQuestionOrder(payload.questionIds, expected.questionIds)
    && Array.isArray(payload.questionVersions)
    && payload.questionVersions.every((version): version is number => Number.isInteger(version) && version > 0)
    && sameQuestionVersions(payload.questionVersions, expected.questionVersions);
}

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

async function resolveArticle(course: CanonicalCourse, chapter: typeof bab.$inferSelect) {
  const [record] = await db
    .select({ id: artikel.id })
    .from(artikel)
    .where(
      and(
        eq(artikel.mataKuliahId, course.id),
        eq(artikel.babId, chapter.id),
        eq(artikel.structureStatus, "structured"),
        eq(artikel.status, "published"),
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
  const article = await getCanonicalPublishedArticle(course.id, record.id);
  if (!article || article.sections.length === 0) return null;

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

async function resolveDiktat(course: CanonicalCourse, chapter: typeof bab.$inferSelect) {
  const [record] = await db
    .select({ title: diktatMateri.title, contentMarkdown: diktatMateri.contentMarkdown })
    .from(diktatMateri)
    .where(
      and(
        eq(diktatMateri.mataKuliahId, course.id),
        eq(diktatMateri.babId, chapter.id),
        eq(diktatMateri.status, "published"),
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
  const sections = splitDiktatPreview(record.contentMarkdown);
  return sections.length >= 2 && sections.every((section) => section.content.trim().length > 0)
    ? { title: record.title, sections }
    : null;
}

async function resolveFlashcards(course: CanonicalCourse, chapter: typeof bab.$inferSelect) {
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
    .limit(5);

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

async function resolveSelectedPieces(): Promise<DemoPieces | null> {
  const selected = await getSelectedCourse();
  if (!selected) return null;
  const pieces = await resolvePieces(selected);
  if (!pieces || pieces.checks.some((check) => !check.ready)) return null;
  return pieces;
}

function toPublicContent(pieces: DemoPieces): DemoContent {
  const questionIds = pieces.quiz.map((question) => question.id);
  const questionVersions = pieces.quiz.map((question) => question.version);
  return {
    course: pieces.course,
    article: pieces.article!,
    diktat: pieces.diktat!,
    flashcards: pieces.flashcards,
    quiz: pieces.quiz.map(({ id, prompt, options, multiple }) => ({ id, prompt, options, multiple })),
    quizSetToken: issueDemoQuestionSetToken({ courseId: pieces.course.id, questionIds, questionVersions }),
  };
}

export async function getDemoContent(): Promise<DemoContent | null> {
  try {
    const pieces = await resolveSelectedPieces();
    return pieces ? toPublicContent(pieces) : null;
  } catch {
    // Content lookup is a public boundary. Any incomplete or unavailable
    // dependency must render the empty state instead of a partial response.
    return null;
  }
}

export async function getDemoQuizSet(): Promise<{ courseId: string; questions: DemoQuizQuestionPrivate[] } | null> {
  try {
    const pieces = await resolveSelectedPieces();
    return pieces ? { courseId: pieces.course.id, questions: pieces.quiz } : null;
  } catch {
    return null;
  }
}

export async function getDemoQuizAnswers(): Promise<DemoQuizQuestionPrivate[] | null> {
  const quizSet = await getDemoQuizSet();
  return quizSet?.questions ?? null;
}

export function gradeDemoAnswers(
  questions: readonly DemoQuizQuestionPrivate[],
  answers: readonly (number | readonly number[])[],
) {
  const results = questions.map((question, index) => {
    const answer = answers[index];
    const selected: number[] = Array.isArray(answer)
      ? answer.filter((value): value is number => typeof value === "number" && Number.isInteger(value))
      : typeof answer === "number" && Number.isInteger(answer)
        ? [answer]
        : [];
    const expected = [...question.correctIndices].sort((a, b) => a - b);
    const actual = [...selected].sort((a, b) => a - b);
    const isCorrect = expected.length === actual.length && expected.every((value, i) => value === actual[i]);
    return {
      index,
      isCorrect,
      explanation: question.explanation,
    };
  });
  return {
    score: results.filter((result) => result.isCorrect).length,
    total: results.length,
    results,
  };
}
