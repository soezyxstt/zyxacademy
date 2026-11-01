import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { db } from "@/db";

function stableId(prefix: string, raw: string): string {
  const digest = createHash("sha256").update(`${prefix}:${raw}`).digest("hex").slice(0, 24);
  return `${prefix}-${digest}`;
}
import {
  auditMutasi,
  bab,
  courses,
  itemAsesmen,
  mataKuliah,
  quizTemplates,
  soal,
} from "@/db/schema";
import {
  createAssessmentWithLegacyProjection,
  updateAssessmentWithLegacyProjection,
} from "@/lib/asesmen/quiz-canonical-sync";
import {
  readMcpChapterChoice,
  readMcpCourseChoice,
} from "@/lib/authoring/mcp-workflows";
import { normalizeDate } from "@/lib/date-utils";

export interface CreateQuizInput {
  courseKey: string;
  chapterKey?: string;
  title: string;
  category?: "chapter" | "weekly" | "daily" | "simulation" | "premium";
  questionIds: string[];
  timeLimitSeconds?: number | null;
  maxAttempts?: number | null;
  visibility?: "free" | "paid";
  status?: "draft" | "published";
  manualStatus?: "open" | "closed" | "scheduled";
  showDiscussion?: boolean;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  canGoBack?: boolean;
  requireAllAnswered?: boolean;
  passingScore?: number | null;
  runToken?: string;
}

export interface UpdateQuizInput {
  quizId: string;
  title?: string;
  category?: "chapter" | "weekly" | "daily" | "simulation" | "premium";
  timeLimitSeconds?: number | null;
  maxAttempts?: number | null;
  status?: "draft" | "published";
  visibility?: "free" | "paid";
  manualStatus?: "open" | "closed" | "scheduled";
  showDiscussion?: boolean;
}

export interface ListQuizzesInput {
  courseKey: string;
  category?: "chapter" | "weekly" | "daily" | "simulation" | "premium";
  status?: "draft" | "published";
  limit?: number;
  offset?: number;
}

function extractCourseIdentifier(courseKey: string): string {
  const trimmed = courseKey.trim();
  if (trimmed.includes(".")) {
    return readMcpCourseChoice(trimmed).courseId;
  }
  return trimmed;
}

function extractChapterIdentifier(chapterKey: string, canonicalCourseId: string): string {
  const trimmed = chapterKey.trim();
  if (trimmed.includes(".")) {
    const choice = readMcpChapterChoice(trimmed);
    if (choice.courseId !== canonicalCourseId) {
      throw new Error("AUTHORING_MCP_SCOPE_MISMATCH: Bab tidak berasal dari mata kuliah yang dipilih.");
    }
    return choice.chapterId;
  }
  return trimmed;
}

async function resolveCourseIds(courseKey: string): Promise<{
  canonicalCourseId: string;
  legacyCourseId: string;
  title: string;
}> {
  const resolvedKey = extractCourseIdentifier(courseKey);
  const [canonicalCourse] = await db
    .select({
      id: mataKuliah.id,
      legacyCourseId: mataKuliah.legacyCourseId,
      title: mataKuliah.title,
    })
    .from(mataKuliah)
    .where(
      or(
        eq(mataKuliah.id, resolvedKey),
        eq(mataKuliah.legacyCourseId, resolvedKey),
        eq(mataKuliah.code, resolvedKey),
      ),
    )
    .limit(1);

  if (canonicalCourse) {
    return {
      canonicalCourseId: canonicalCourse.id,
      legacyCourseId: canonicalCourse.legacyCourseId ?? canonicalCourse.id,
      title: canonicalCourse.title,
    };
  }

  const [legacyCourse] = await db
    .select({ id: courses.id, title: courses.title })
    .from(courses)
    .where(eq(courses.id, resolvedKey))
    .limit(1);

  if (!legacyCourse) {
    throw new Error("QUIZ_ASSEMBLY_COURSE_NOT_FOUND: Mata kuliah tidak ditemukan.");
  }

  return {
    canonicalCourseId: legacyCourse.id,
    legacyCourseId: legacyCourse.id,
    title: legacyCourse.title,
  };
}

async function resolveChapterId(chapterKey: string, canonicalCourseId: string): Promise<string> {
  const resolvedKey = extractChapterIdentifier(chapterKey, canonicalCourseId);
  const [chapter] = await db
    .select({ id: bab.id })
    .from(bab)
    .where(
      and(
        or(eq(bab.id, resolvedKey), eq(bab.legacyChapterId, resolvedKey), eq(bab.code, resolvedKey)),
        eq(bab.mataKuliahId, canonicalCourseId),
      ),
    )
    .limit(1);

  if (!chapter) {
    throw new Error("QUIZ_ASSEMBLY_CHAPTER_NOT_FOUND: Bab tidak ditemukan untuk mata kuliah ini.");
  }

  return chapter.id;
}

async function validateAndFetchQuestions(questionIds: string[], canonicalCourseId: string) {
  if (!questionIds || questionIds.length === 0) {
    throw new Error("QUIZ_ASSEMBLY_EMPTY_QUESTIONS: Daftar questionIds minimal harus berisi 1 soal.");
  }

  const uniqueIds = Array.from(new Set(questionIds.map((id) => id.trim()).filter(Boolean)));
  if (uniqueIds.length !== questionIds.length) {
    throw new Error("QUIZ_ASSEMBLY_DUPLICATE_QUESTION_IDS: Terdapat ID soal duplikat pada daftar input.");
  }

  const rows = await db
    .select({
      id: soal.id,
      mataKuliahId: soal.mataKuliahId,
      babId: soal.babId,
      prompt: soal.prompt,
      difficulty: soal.difficulty,
      cognitiveLevel: soal.cognitiveLevel,
      questionType: soal.questionType,
      optionsSnapshot: soal.optionsSnapshot,
      origin: soal.origin,
      quizEligible: soal.quizEligible,
      version: soal.version,
      generationHash: soal.generationHash,
      status: soal.status,
    })
    .from(soal)
    .where(inArray(soal.id, uniqueIds));

  const foundMap = new Map(rows.map((r) => [r.id, r]));
  const missingIds = uniqueIds.filter((id) => !foundMap.has(id));
  if (missingIds.length > 0) {
    throw new Error(
      `QUIZ_ASSEMBLY_QUESTION_NOT_FOUND: ${missingIds.length} soal tidak ditemukan di bank soal: ${missingIds.slice(0, 5).join(", ")}${missingIds.length > 5 ? "..." : ""}`,
    );
  }

  // Cek kecocokan mata kuliah
  const courseMismatches = rows.filter((r) => r.mataKuliahId !== canonicalCourseId);
  if (courseMismatches.length > 0) {
    throw new Error(
      `QUIZ_ASSEMBLY_QUESTION_COURSE_MISMATCH: Soal '${courseMismatches[0].id}' terdaftar di mata kuliah '${courseMismatches[0].mataKuliahId}', bukan '${canonicalCourseId}'.`,
    );
  }

  // Hanya soal berstatus published yang diizinkan untuk perakitan kuis
  const unPublished = rows.filter((r) => r.status !== "published");
  if (unPublished.length > 0) {
    throw new Error(
      `QUIZ_ASSEMBLY_QUESTION_NOT_PUBLISHED: Soal '${unPublished[0].id}' berstatus '${unPublished[0].status}'. Hanya soal berstatus 'published' yang dapat dimasukkan ke kuis.`,
    );
  }

  // Soal referensi historis wajib bertanda quiz-eligible
  const ineligibleRef = rows.filter(
    (r) => r.origin === "historical_reference" && !r.quizEligible,
  );
  if (ineligibleRef.length > 0) {
    throw new Error(
      `QUIZ_ASSEMBLY_QUESTION_NOT_ELIGIBLE: Soal referensi historis '${ineligibleRef[0].id}' belum ditandai quiz-eligible.`,
    );
  }

  return uniqueIds.map((id) => foundMap.get(id)!);
}

export async function createQuizWithQuestions(input: CreateQuizInput, actorId?: string) {
  const { canonicalCourseId, legacyCourseId, title: courseTitle } = await resolveCourseIds(input.courseKey);
  const resolvedChapterId = input.chapterKey
    ? await resolveChapterId(input.chapterKey, canonicalCourseId)
    : undefined;

  const validQuestions = await validateAndFetchQuestions(input.questionIds, canonicalCourseId);
  const questionCount = validQuestions.length;

  const category = input.category ?? "chapter";
  const visibility = input.visibility ?? "free";
  const status = input.status ?? "draft";
  const manualStatus = input.manualStatus ?? "scheduled";
  const timeLimitSeconds = input.timeLimitSeconds ?? 1800;
  const showDiscussion = input.showDiscussion ?? true;

  const selectionRules: Record<string, unknown> = {
    count: questionCount,
    fixedQuestionIds: input.questionIds,
    chapterIds: resolvedChapterId ? [resolvedChapterId] : [],
    tags: resolvedChapterId ? [resolvedChapterId] : [],
    canGoBack: input.canGoBack ?? true,
    requireAllAnswered: input.requireAllAnswered ?? false,
    explanationRelease: showDiscussion ? "after_close" : "never",
    shuffleQuestions: input.shuffleQuestions ?? false,
    shuffleOptions: input.shuffleOptions ?? false,
    showScoreImmediate: true,
    passingScore: input.passingScore ?? 70,
  };

  const syncResult = await createAssessmentWithLegacyProjection({
    courseId: legacyCourseId,
    title: input.title.trim(),
    category,
    visibility,
    status,
    manualStatus,
    timeLimitSeconds,
    maxAttempts: input.maxAttempts ?? null,
    selectionRules,
    showDiscussion,
    creatorId: actorId ?? null,
  });

  return {
    ok: true,
    quizId: syncResult.id,
    title: input.title.trim(),
    courseId: legacyCourseId,
    canonicalCourseId,
    courseTitle,
    chapterId: resolvedChapterId ?? null,
    category,
    status,
    questionCount,
    timeLimitSeconds,
    questionIds: input.questionIds,
    next: status === "published" ? "ready_for_students" : "admin_review",
  };
}

export async function getQuizDetail(quizId: string) {
  const trimmed = quizId.trim();
  const [template] = await db
    .select()
    .from(quizTemplates)
    .where(eq(quizTemplates.id, trimmed))
    .limit(1);

  if (!template) {
    throw new Error(`QUIZ_ASSEMBLY_QUIZ_NOT_FOUND: Kuis dengan ID '${trimmed}' tidak ditemukan.`);
  }

  const rules =
    typeof template.selectionRules === "string"
      ? JSON.parse(template.selectionRules)
      : (template.selectionRules as Record<string, unknown> | null);

  const fixedQuestionIds: string[] = Array.isArray(rules?.fixedQuestionIds)
    ? rules.fixedQuestionIds
    : [];

  let questions: Array<{
    id: string;
    prompt: string;
    difficulty: string;
    cognitiveLevel: string;
    questionType: string;
    origin: string;
  }> = [];

  if (fixedQuestionIds.length > 0) {
    const rawQuestions = await db
      .select({
        id: soal.id,
        prompt: soal.prompt,
        difficulty: soal.difficulty,
        cognitiveLevel: soal.cognitiveLevel,
        questionType: soal.questionType,
        origin: soal.origin,
      })
      .from(soal)
      .where(inArray(soal.id, fixedQuestionIds));

    const qMap = new Map(rawQuestions.map((q) => [q.id, q]));
    questions = fixedQuestionIds
      .map((id) => qMap.get(id))
      .filter((q): q is NonNullable<typeof q> => Boolean(q));
  }

  return {
    ok: true,
    quiz: {
      id: template.id,
      title: template.title,
      courseId: template.courseId,
      category: template.category,
      visibility: template.visibility,
      status: template.status,
      manualStatus: template.manualStatus,
      timeLimitSeconds: template.timeLimitSeconds,
      maxAttempts: template.maxAttempts,
      showDiscussion: template.showDiscussion,
      questionCount: fixedQuestionIds.length,
      selectionRules: rules,
      createdAt: normalizeDate(template.createdAt).toISOString(),
      updatedAt: normalizeDate(template.updatedAt).toISOString(),
    },
    questions,
  };
}

export async function listQuizzes(filter: ListQuizzesInput) {
  const { legacyCourseId, canonicalCourseId } = await resolveCourseIds(filter.courseKey);
  const limit = Math.min(Math.max(filter.limit ?? 20, 1), 100);
  const offset = Math.max(filter.offset ?? 0, 0);

  const conditions = [
    or(
      eq(quizTemplates.courseId, legacyCourseId),
      eq(quizTemplates.courseId, canonicalCourseId),
    ),
  ];

  if (filter.category) {
    conditions.push(eq(quizTemplates.category, filter.category));
  }
  if (filter.status) {
    conditions.push(eq(quizTemplates.status, filter.status));
  }

  const rows = await db
    .select()
    .from(quizTemplates)
    .where(and(...conditions))
    .orderBy(desc(quizTemplates.createdAt))
    .limit(limit)
    .offset(offset);

  const items = rows.map((r) => {
    const rules =
      typeof r.selectionRules === "string"
        ? JSON.parse(r.selectionRules)
        : (r.selectionRules as Record<string, unknown> | null);
    const fixedIds: string[] = Array.isArray(rules?.fixedQuestionIds) ? rules.fixedQuestionIds : [];
    const count = typeof rules?.count === "number" ? rules.count : fixedIds.length;

    return {
      id: r.id,
      title: r.title,
      courseId: r.courseId,
      category: r.category,
      visibility: r.visibility,
      status: r.status,
      manualStatus: r.manualStatus,
      timeLimitSeconds: r.timeLimitSeconds,
      questionCount: count,
      createdAt: normalizeDate(r.createdAt).toISOString(),
    };
  });

  const [countRow] = await db
    .select({ total: sql<number>`count(*)` })
    .from(quizTemplates)
    .where(and(...conditions));
  const total = Number(countRow?.total ?? 0);

  return {
    ok: true,
    courseId: legacyCourseId,
    canonicalCourseId,
    courseKey: canonicalCourseId,
    total,
    quizzes: items,
  };
}

export async function updateQuizMeta(input: UpdateQuizInput, actorId?: string) {
  const trimmed = input.quizId.trim();
  const [existing] = await db
    .select()
    .from(quizTemplates)
    .where(eq(quizTemplates.id, trimmed))
    .limit(1);

  if (!existing) {
    throw new Error(`QUIZ_ASSEMBLY_QUIZ_NOT_FOUND: Kuis dengan ID '${trimmed}' tidak ditemukan.`);
  }

  const patch: Parameters<typeof updateAssessmentWithLegacyProjection>[1] = {
    actorId: actorId ?? null,
  };

  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.category !== undefined) patch.category = input.category;
  if (input.timeLimitSeconds !== undefined) patch.timeLimitSeconds = input.timeLimitSeconds;
  if (input.maxAttempts !== undefined) patch.maxAttempts = input.maxAttempts;
  if (input.status !== undefined) patch.status = input.status;
  if (input.visibility !== undefined) patch.visibility = input.visibility;
  if (input.manualStatus !== undefined) patch.manualStatus = input.manualStatus;
  if (input.showDiscussion !== undefined) patch.showDiscussion = input.showDiscussion;

  await updateAssessmentWithLegacyProjection(trimmed, patch);

  return {
    ok: true,
    quizId: trimmed,
    updated: true,
  };
}

export async function setQuizQuestions(
  quizId: string,
  questionIds: string[],
  actorId?: string,
) {
  const trimmed = quizId.trim();
  const [existing] = await db
    .select()
    .from(quizTemplates)
    .where(eq(quizTemplates.id, trimmed))
    .limit(1);

  if (!existing) {
    throw new Error(`QUIZ_ASSEMBLY_QUIZ_NOT_FOUND: Kuis dengan ID '${trimmed}' tidak ditemukan.`);
  }

  const { canonicalCourseId } = await resolveCourseIds(existing.courseId);
  const validQuestions = await validateAndFetchQuestions(questionIds, canonicalCourseId);

  const existingRules =
    typeof existing.selectionRules === "string"
      ? JSON.parse(existing.selectionRules)
      : (existing.selectionRules as Record<string, unknown> | null) ?? {};

  const updatedRules: Record<string, unknown> = {
    ...existingRules,
    fixedQuestionIds: questionIds,
    count: questionIds.length,
  };

  const now = new Date();

  await db.transaction(async (tx) => {
    await updateAssessmentWithLegacyProjection(
      trimmed,
      {
        selectionRules: updatedRules,
        actorId: actorId ?? null,
      },
      tx,
    );

    // Sinkronkan item_asesmen
    await tx.delete(itemAsesmen).where(eq(itemAsesmen.asesmenId, trimmed));

    for (const [orderIndex, q] of validQuestions.entries()) {
      await tx
        .insert(itemAsesmen)
        .values({
          id: stableId("item", `${trimmed}:${q.id}`),
          asesmenId: trimmed,
          soalId: q.id,
          orderIndex,
          renderedQuestionSnapshot: q as unknown as Record<string, unknown>,
          optionOrderSnapshot: Array.isArray(q.optionsSnapshot)
            ? q.optionsSnapshot.map((_, idx) => String(idx))
            : [],
          gradingPolicySnapshot: { source: "mcp_assembly", questionId: q.id },
          contentVersion: q.version ?? 1,
          generationHash: q.generationHash ?? `hash-${q.id}`,
          createdAt: now,
        });
    }

    await tx
      .insert(auditMutasi)
      .values({
        id: `audit-set-questions-${randomUUID().slice(0, 16)}`,
        actorId: actorId ?? null,
        entityType: "asesmen",
        entityId: trimmed,
        action: "quiz_set_questions",
        beforeSnapshot: { count: existingRules.count },
        afterSnapshot: { count: questionIds.length, fixedQuestionIds: questionIds },
        correlationId: trimmed,
      })
      .onConflictDoNothing();
  });

  return {
    ok: true,
    quizId: trimmed,
    questionCount: questionIds.length,
    questionIds,
  };
}
