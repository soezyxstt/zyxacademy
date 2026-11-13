import { db } from "@/db";
import {
  quizTemplates,
  aiQuestionBank,
  studentQuizAttempts,
  courses,
} from "@/db/schema";
import { eq, desc, and, inArray, ilike } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { dispatchVectorSync } from "@/lib/vector-sync-dispatch";
import { enqueueQuestionReviewVectorTx, transitionQuestionReviewTx } from "@/lib/question-review-lifecycle";

export interface ListQuizzesInput {
  courseId?: string;
  status?: string;
  search?: string;
  limit?: number;
}

export interface QuizCourseCandidate {
  id: string;
  title: string;
}

/**
 * Normalizes a human-entered entity reference without assuming it is a database ID.
 * This is intentionally shared by course and quiz lookup so short references such as
 * "PKA", "kuis 3.2", and minor punctuation differences remain resolvable.
 */
export function normalizeQuizLookupText(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + substitutionCost
      );
    }
    for (let j = 0; j <= b.length; j++) previous[j] = current[j];
  }

  return previous[b.length];
}

/**
 * Scores a quiz title against a human query. Exact and substring matches always win,
 * while token overlap and edit distance provide a bounded fallback for small typos.
 */
export function scoreQuizTitleMatch(query: string, title: string): number {
  const q = normalizeQuizLookupText(query);
  const t = normalizeQuizLookupText(title);
  if (!q || !t) return 0;
  if (q === t) return 100;
  if (t.includes(q)) return 92;
  if (q.includes(t)) return 88;

  const queryTokens = new Set(q.split(" ").filter(Boolean));
  const titleTokens = new Set(t.split(" ").filter(Boolean));
  const overlap = [...queryTokens].filter((token) => titleTokens.has(token)).length;
  const overlapRatio = overlap / Math.max(queryTokens.size, 1);
  const tokenScore = overlapRatio >= 0.5 ? 55 + Math.round(overlapRatio * 25) : 0;

  if (Math.max(q.length, t.length) < 4) return tokenScore;
  const editDistance = levenshteinDistance(q, t);
  const similarity = 1 - editDistance / Math.max(q.length, t.length);
  const editScore = similarity >= 0.55 ? Math.round(similarity * 80) : 0;

  return Math.max(tokenScore, editScore);
}

/**
 * Resolves a course reference supplied by a human. The input may be a canonical ID,
 * a complete title, or a distinctive title fragment such as "PKA".
 */
export function resolveQuizCourseReference(
  candidates: QuizCourseCandidate[],
  reference: string
): string[] {
  const ref = normalizeQuizLookupText(reference);
  if (!ref) return [];

  const exactId = candidates.filter((course) => normalizeQuizLookupText(course.id) === ref);
  if (exactId.length > 0) return exactId.map((course) => course.id);

  const exactTitle = candidates.filter((course) => normalizeQuizLookupText(course.title) === ref);
  if (exactTitle.length > 0) return exactTitle.map((course) => course.id);

  return candidates
    .filter((course) => {
      const id = normalizeQuizLookupText(course.id);
      const title = normalizeQuizLookupText(course.title);
      return id.includes(ref) || title.includes(ref);
    })
    .map((course) => course.id);
}

export async function executeListQuizzes(input: ListQuizzesInput) {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const courseRows = await db
    .select({ id: courses.id, title: courses.title })
    .from(courses);
  const courseTitleMap = new Map(courseRows.map((course) => [course.id, course.title]));

  const conditions = [];
  let resolvedCourseIds: string[] | undefined;
  if (input.courseId?.trim()) {
    resolvedCourseIds = resolveQuizCourseReference(courseRows, input.courseId);

    // Keep exact-ID compatibility for data that may exist before the legacy course
    // projection is present in `courses`.
    if (resolvedCourseIds.length === 0) {
      resolvedCourseIds = [input.courseId.trim().toLowerCase()];
    }

    conditions.push(
      resolvedCourseIds.length === 1
        ? eq(quizTemplates.courseId, resolvedCourseIds[0])
        : inArray(quizTemplates.courseId, resolvedCourseIds)
    );
  }
  if (input.status) {
    conditions.push(eq(quizTemplates.status, input.status as "draft" | "published"));
  }

  const search = input.search?.trim();
  let rows;
  let usedFuzzyFallback = false;

  if (search) {
    // Search exact/substring matches in SQL first so the full filtered scope is
    // considered before the result limit is applied. Only use the bounded newest
    // set when no direct match exists and typo-tolerant fuzzy scoring is needed.
    const directConditions = [...conditions, ilike(quizTemplates.title, `%${search}%`)];
    rows = await db
      .select()
      .from(quizTemplates)
      .where(and(...directConditions))
      .orderBy(desc(quizTemplates.createdAt))
      .limit(limit);

    if (rows.length === 0) {
      usedFuzzyFallback = true;
      rows = await db
        .select()
        .from(quizTemplates)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(quizTemplates.createdAt))
        .limit(100);
    }
  } else {
    rows = await db
      .select()
      .from(quizTemplates)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(quizTemplates.createdAt))
      .limit(limit);
  }

  const rankedRows = search && usedFuzzyFallback
    ? rows
        .map((quiz) => ({ quiz, score: scoreQuizTitleMatch(search, quiz.title) }))
        .filter(({ score }) => score >= 52)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ quiz }) => quiz)
    : rows.slice(0, limit);

  const scopeParts: string[] = [];
  if (input.courseId?.trim()) {
    scopeParts.push(`mata kuliah '${input.courseId.trim()}'`);
  }
  if (search) scopeParts.push(`pencarian '${search}'`);

  return {
    summary: `Ditemukan ${rankedRows.length} kuis${scopeParts.length > 0 ? ` untuk ${scopeParts.join(" dan ")}` : ""}.`,
    data: rankedRows.map((q) => ({
      id: q.id,
      title: q.title,
      courseId: q.courseId,
      courseTitle: courseTitleMap.get(q.courseId) ?? q.courseId,
      category: q.category,
      visibility: q.visibility,
      status: q.status,
      manualStatus: q.manualStatus,
      timeLimitMinutes: q.timeLimitSeconds ? Math.round(q.timeLimitSeconds / 60) : null,
      maxAttempts: q.maxAttempts,
      showDiscussion: q.showDiscussion,
      selectionRules: q.selectionRules,
      createdAt: q.createdAt,
    })),
  };
}

export interface CreateQuizInput {
  courseId: string;
  title: string;
  durationMinutes?: number;
  category?: "daily" | "weekly" | "chapter" | "premium" | "simulation";
  visibility?: "free" | "paid";
  status?: "draft" | "published";
  questionIds?: string[];
}

export async function executeCreateQuiz(input: CreateQuizInput, _actorId?: string) {
  const cleanCourseId = input.courseId.trim().toLowerCase();
  const cleanTitle = input.title.trim();
  if (!cleanCourseId) throw new Error("ID Mata Kuliah wajib diisi.");
  if (!cleanTitle) throw new Error("Judul kuis wajib diisi.");

  const quizId = `qz-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const timeLimitSeconds = input.durationMinutes ? input.durationMinutes * 60 : 1800;
  const category = input.category || "chapter";
  const visibility = input.visibility || "free";
  const status = input.status || "draft";

  const selectionRules = input.questionIds && input.questionIds.length > 0
    ? { mode: "fixed", questionIds: input.questionIds }
    : { mode: "random", count: 10 };

  await db.insert(quizTemplates).values({
    id: quizId,
    courseId: cleanCourseId,
    title: cleanTitle,
    category,
    visibility,
    status,
    timeLimitSeconds,
    maxAttempts: 3,
    selectionRules,
    manualStatus: status === "published" ? "open" : "scheduled",
    showDiscussion: true,
  });

  return {
    summary: `Kuis '${cleanTitle}' (ID: ${quizId}) berhasil dibuat untuk mata kuliah '${cleanCourseId}' dengan status '${status}'.`,
    data: { id: quizId, courseId: cleanCourseId, title: cleanTitle, status, category },
  };
}

export interface UpdateQuizInput {
  quizId: string;
  patch: {
    title?: string;
    durationMinutes?: number;
    status?: "draft" | "published";
    manualStatus?: "open" | "closed" | "scheduled";
    showDiscussion?: boolean;
  };
}

export async function executeUpdateQuiz(input: UpdateQuizInput, _actorId?: string) {
  const quizId = input.quizId.trim();
  if (!quizId) throw new Error("ID Kuis wajib diisi.");

  const existing = await db.query.quizTemplates.findFirst({ where: eq(quizTemplates.id, quizId) });
  if (!existing) throw new Error(`Kuis dengan ID '${quizId}' tidak ditemukan.`);

  const updates: Partial<typeof quizTemplates.$inferInsert> = {};
  if (input.patch.title) updates.title = input.patch.title.trim();
  if (input.patch.durationMinutes !== undefined) updates.timeLimitSeconds = input.patch.durationMinutes * 60;
  if (input.patch.status) updates.status = input.patch.status;
  if (input.patch.manualStatus) updates.manualStatus = input.patch.manualStatus;
  if (input.patch.showDiscussion !== undefined) updates.showDiscussion = input.patch.showDiscussion;

  await db.update(quizTemplates).set(updates).where(eq(quizTemplates.id, quizId));

  return {
    summary: `Kuis '${existing.title}' (${quizId}) berhasil diperbarui.`,
    data: { id: quizId, ...updates },
  };
}

export interface ListQuestionsInput {
  courseId?: string;
  tag?: string;
  difficulty?: "easy" | "medium" | "hard";
  reviewStatus?: string;
  search?: string;
  limit?: number;
}

export async function executeListQuestions(input: ListQuestionsInput) {
  const conditions = [];
  if (input.courseId) conditions.push(eq(aiQuestionBank.courseId, input.courseId.trim().toLowerCase()));
  if (input.difficulty) conditions.push(eq(aiQuestionBank.difficulty, input.difficulty));
  if (input.reviewStatus) conditions.push(eq(aiQuestionBank.reviewStatus, input.reviewStatus as any));
  if (input.search) conditions.push(ilike(aiQuestionBank.prompt, `%${input.search.trim()}%`));

  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
  const rows = await db
    .select({
      id: aiQuestionBank.id,
      courseId: aiQuestionBank.courseId,
      prompt: aiQuestionBank.prompt,
      difficulty: aiQuestionBank.difficulty,
      reviewStatus: aiQuestionBank.reviewStatus,
      tags: aiQuestionBank.tags,
      createdAt: aiQuestionBank.createdAt,
    })
    .from(aiQuestionBank)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(aiQuestionBank.createdAt))
    .limit(limit);

  return {
    summary: `Ditemukan ${rows.length} soal dalam bank soal.`,
    data: rows,
  };
}

export interface CreateQuestionInput {
  courseId: string;
  prompt: string;
  options: string[];
  correctAnswer: string;
  difficulty?: "easy" | "medium" | "hard";
  explanation?: string;
  tags?: string[];
}

export async function executeCreateQuestion(input: CreateQuestionInput, _actorId?: string) {
  const cleanCourseId = input.courseId.trim().toLowerCase();
  const cleanPrompt = input.prompt.trim();
  if (!cleanCourseId) throw new Error("ID Mata Kuliah wajib diisi.");
  if (!cleanPrompt) throw new Error("Teks soal (prompt) tidak boleh kosong.");
  if (!input.options || input.options.length < 2) throw new Error("Pilihan jawaban minimal harus 2 opsi.");

  const questionId = randomUUID();
  const difficulty = input.difficulty || "medium";

  const correctIdx = input.options.findIndex(
    (opt) => opt.trim() === input.correctAnswer.trim() || opt.startsWith(input.correctAnswer.trim())
  );
  const correctIndices = [correctIdx >= 0 ? correctIdx : 0];

  await db.transaction(async (tx) => {
    await tx.insert(aiQuestionBank).values({
      id: questionId,
      courseId: cleanCourseId,
      prompt: cleanPrompt,
      options: input.options,
      correctIndices,
      distractorMap: [],
      explanation: input.explanation?.trim() || `Kunci jawaban benar adalah opsi ${input.correctAnswer}.`,
      difficulty,
      questionType: "multiple_choice",
      reviewStatus: "published",
      origin: "zyx_original",
      tags: input.tags || [],
    });
    await enqueueQuestionReviewVectorTx(tx, { id: questionId, courseId: cleanCourseId, version: 1, reviewStatus: "published", prompt: cleanPrompt });
  });
  await dispatchVectorSync(cleanCourseId);

  return {
    summary: `Soal baru berhasil dibuat di bank soal (ID: ${questionId}) untuk '${cleanCourseId}' dengan tingkat kesulitan '${difficulty}'.`,
    data: { id: questionId, courseId: cleanCourseId, prompt: cleanPrompt, difficulty },
  };
}

export interface PublishQuestionInput {
  questionId: string;
}

export async function executePublishQuestion(input: PublishQuestionInput, actorId?: string) {
  const cleanId = input.questionId.trim();
  if (!cleanId) throw new Error("ID Soal wajib diisi.");

  const result = await db.transaction((tx) => transitionQuestionReviewTx(tx, { id: cleanId, reviewStatus: "published", actorId }));
  if (!result) throw new Error(`Soal '${cleanId}' tidak ditemukan.`);
  await dispatchVectorSync(result.courseId);

  return {
    summary: `Soal '${cleanId}' berhasil dipublikasikan ('published').`,
    data: { id: cleanId, reviewStatus: "published" },
  };
}

export interface GetQuizInsightsInput {
  quizId: string;
}

export async function executeGetQuizInsights(input: GetQuizInsightsInput) {
  const cleanId = input.quizId.trim();
  if (!cleanId) throw new Error("ID Kuis wajib diisi.");

  const quiz = await db.query.quizTemplates.findFirst({ where: eq(quizTemplates.id, cleanId) });
  if (!quiz) throw new Error(`Kuis '${cleanId}' tidak ditemukan.`);

  const attempts = await db
    .select()
    .from(studentQuizAttempts)
    .where(eq(studentQuizAttempts.templateId, cleanId));

  const totalAttempts = attempts.length;
  const averageScore = totalAttempts > 0
    ? Math.round(attempts.reduce((sum, a) => sum + (a.score ?? 0), 0) / totalAttempts)
    : 0;

  return {
    summary: `Statistik Kuis '${quiz.title}': ${totalAttempts} percobaan, rata-rata skor ${averageScore}%.`,
    data: {
      quizId: cleanId,
      title: quiz.title,
      totalAttempts,
      averageScore,
      category: quiz.category,
      status: quiz.status,
    },
  };
}

export interface ResetQuizAttemptInput {
  attemptId?: string;
  userId?: string;
  quizId?: string;
  reason: string;
}

export async function executeResetQuizAttempt(input: ResetQuizAttemptInput, actorId?: string) {
  const reason = input.reason.trim();
  if (!reason) throw new Error("Alasan reset percobaan kuis wajib disertakan.");

  let attemptToReset = null;

  if (input.attemptId) {
    attemptToReset = await db.query.studentQuizAttempts.findFirst({
      where: eq(studentQuizAttempts.id, input.attemptId.trim()),
    });
  } else if (input.userId && input.quizId) {
    const cleanUserId = input.userId.trim();
    const cleanQuizId = input.quizId.trim().toLowerCase();
    attemptToReset = await db.query.studentQuizAttempts.findFirst({
      where: and(
        eq(studentQuizAttempts.studentId, cleanUserId),
        eq(studentQuizAttempts.templateId, cleanQuizId)
      ),
      orderBy: [desc(studentQuizAttempts.startedAt)],
    });
  } else if (input.userId) {
    const cleanUserId = input.userId.trim();
    attemptToReset = await db.query.studentQuizAttempts.findFirst({
      where: eq(studentQuizAttempts.studentId, cleanUserId),
      orderBy: [desc(studentQuizAttempts.startedAt)],
    });
  }

  if (!attemptToReset) {
    throw new Error("Percobaan kuis yang ingin direset tidak ditemukan.");
  }

  await db.delete(studentQuizAttempts).where(eq(studentQuizAttempts.id, attemptToReset.id));

  return {
    summary: `Percobaan kuis '${attemptToReset.id}' milik siswa '${attemptToReset.studentId}' berhasil direset. Alasan: ${reason}. Siswa kini dapat memulai kuis kembali.`,
    data: {
      attemptId: attemptToReset.id,
      studentId: attemptToReset.studentId,
      templateId: attemptToReset.templateId,
      resetAt: new Date().toISOString(),
      resetBy: actorId ?? "admin",
      reason,
    },
  };
}
