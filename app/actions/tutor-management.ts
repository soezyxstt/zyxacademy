"use server";

import { db } from "@/db";
import {
  aiMaterialInstances,
  aiMaterialInstanceSections,
  aiMaterialInstanceChunks,
  quizTemplates,
  aiQuestionBank,
  exams,
  questions,
  submissions,
  tutorCourses,
} from "@/db/schema";
import { eq, and, inArray, asc, or, sql, notInArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { randomUUID } from "crypto";
import { parseMaterialIntoSections } from "@/lib/ingestion-parser";
import { revalidatePath } from "next/cache";
import { notifyQuizPublishedBestEffort } from "@/lib/notifications/send";
import { normalizeQuestionProvenance, questionProvenanceSnapshot } from "@/lib/asesmen/question-provenance";
import {
  createAssessmentWithLegacyProjection,
  updateAssessmentWithLegacyProjection,
  deleteAssessmentWithLegacyProjection,
} from "@/lib/asesmen/quiz-canonical-sync";

// Helper to verify tutor role and course access
export async function verifyTutorAccess(courseId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new Error("Unauthorized: Silakan masuk terlebih dahulu.");
  }

  const role = (session.user as { role?: string | null }).role;
  if (role !== "teacher" && role !== "admin") {
    throw new Error("Forbidden: Hanya pengajar atau admin yang dapat melakukan tindakan ini.");
  }

  if (role === "teacher") {
    const [assigned] = await db
      .select({ id: tutorCourses.id })
      .from(tutorCourses)
      .where(
        and(eq(tutorCourses.tutorId, session.user.id), eq(tutorCourses.courseId, courseId))
      )
      .limit(1);
    if (!assigned) {
      throw new Error("Forbidden: Anda tidak ditugaskan untuk kelas ini.");
    }
  }

  return { session, role, user: session.user };
}

// ─────────────────────────────────────────────────────────────────────────────
// MATERIALS CRUD
// ─────────────────────────────────────────────────────────────────────────────

export async function saveTutorMaterialAction(
  courseId: string,
  materialId: string | null,
  title: string,
  summary: string,
  rawText: string
) {
  await verifyTutorAccess(courseId);

  const parsedSections = parseMaterialIntoSections(rawText);
  const targetId = materialId || `mat-tutor-${randomUUID()}`;

  await db.transaction(async (tx) => {
    // 1. Insert or update the material instance
    if (materialId) {
      await tx
        .update(aiMaterialInstances)
        .set({
          title,
          summary,
          updatedAt: new Date(),
        })
        .where(eq(aiMaterialInstances.id, materialId));
      
      // Delete old sections and chunks
      const oldSections = await tx
        .select({ id: aiMaterialInstanceSections.id })
        .from(aiMaterialInstanceSections)
        .where(eq(aiMaterialInstanceSections.materialInstanceId, materialId));
      
      if (oldSections.length > 0) {
        const sectionIds = oldSections.map((s) => s.id);
        await tx
          .delete(aiMaterialInstanceChunks)
          .where(inArray(aiMaterialInstanceChunks.sectionId, sectionIds));
        await tx
          .delete(aiMaterialInstanceSections)
          .where(eq(aiMaterialInstanceSections.materialInstanceId, materialId));
      }
    } else {
      await tx.insert(aiMaterialInstances).values({
        id: targetId,
        courseId,
        title,
        sourceType: "markdown",
        summary,
        learningObjectives: [],
        keywords: [],
        pineconeSyncStatus: "pending",
      });
    }

    // 2. Insert sections and chunks
    for (const section of parsedSections) {
      const sectionId = `sec-tutor-${randomUUID()}`;
      await tx.insert(aiMaterialInstanceSections).values({
        id: sectionId,
        materialInstanceId: targetId,
        title: section.title,
        orderIndex: section.orderIndex,
      });

      for (const chunk of section.chunks) {
        const chunkId = `chk-tutor-${randomUUID()}`;
        await tx.insert(aiMaterialInstanceChunks).values({
          id: chunkId,
          sectionId,
          chunkText: chunk.chunkText,
          orderIndex: chunk.orderIndex,
          pineconeVectorId: `vec-tutor-${chunkId}`,
          isSynced: false,
        });
      }
    }
  });

  revalidatePath(`/tutor/${courseId}/materials`);
  revalidatePath(`/courses/${courseId}/material`);
  return { success: true, id: targetId };
}

export async function deleteTutorMaterialAction(courseId: string, materialId: string) {
  await verifyTutorAccess(courseId);

  await db.transaction(async (tx) => {
    const sections = await tx
      .select({ id: aiMaterialInstanceSections.id })
      .from(aiMaterialInstanceSections)
      .where(eq(aiMaterialInstanceSections.materialInstanceId, materialId));

    if (sections.length > 0) {
      const sectionIds = sections.map((s) => s.id);
      await tx
        .delete(aiMaterialInstanceChunks)
        .where(inArray(aiMaterialInstanceChunks.sectionId, sectionIds));
      await tx
        .delete(aiMaterialInstanceSections)
        .where(eq(aiMaterialInstanceSections.materialInstanceId, materialId));
    }

    await tx.delete(aiMaterialInstances).where(eq(aiMaterialInstances.id, materialId));
  });

  revalidatePath(`/tutor/${courseId}/materials`);
  revalidatePath(`/courses/${courseId}/material`);
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// QUIZZES & QUESTION BANK CRUD
// ─────────────────────────────────────────────────────────────────────────────

export async function saveQuizTemplateAction(
  courseId: string,
  templateId: string | null,
  data: {
    title: string;
    category: "daily" | "weekly" | "chapter" | "premium" | "simulation";
    visibility: "free" | "paid";
    timeLimitSeconds: number | null;
    maxAttempts: number | null;
    selectionRules: any;
    openAt?: string | null;
    closeAt?: string | null;
    manualStatus?: "open" | "closed" | "scheduled";
    status?: "draft" | "published";
    showDiscussion?: boolean;
  }
) {
  const { session } = await verifyTutorAccess(courseId);

  const targetId = templateId || `tpl-tutor-${randomUUID()}`;

  const openDate = data.openAt ? new Date(data.openAt) : null;
  const closeDate = data.closeAt ? new Date(data.closeAt) : null;

  // Notify enrolled students only when a quiz transitions to published.
  let shouldNotify = false;
  let existingStatus: "draft" | "published" | null = null;

  if (templateId) {
    const existing = await db
      .select({ status: quizTemplates.status })
      .from(quizTemplates)
      .where(eq(quizTemplates.id, templateId))
      .limit(1);
    existingStatus = existing[0]?.status ?? null;
    shouldNotify = data.status === "published" && existingStatus !== "published";

    await updateAssessmentWithLegacyProjection(templateId, {
      title: data.title,
      category: data.category,
      visibility: data.visibility,
      timeLimitSeconds: data.timeLimitSeconds,
      maxAttempts: data.maxAttempts,
      selectionRules: data.selectionRules,
      openAt: openDate,
      closeAt: closeDate,
      manualStatus: data.manualStatus ?? "scheduled",
      status: data.status ?? "published",
      showDiscussion: data.showDiscussion ?? false,
      actorId: session.user.id,
    });
  } else {
    shouldNotify = data.status === "published";
    await createAssessmentWithLegacyProjection({
      id: targetId,
      courseId,
      title: data.title,
      category: data.category,
      visibility: data.visibility,
      timeLimitSeconds: data.timeLimitSeconds,
      maxAttempts: data.maxAttempts,
      selectionRules: data.selectionRules,
      openAt: openDate,
      closeAt: closeDate,
      manualStatus: data.manualStatus ?? "scheduled",
      status: data.status ?? "draft",
      showDiscussion: data.showDiscussion ?? false,
      creatorId: session.user.id,
    });
  }

  if (shouldNotify) {
    await notifyQuizPublishedBestEffort({
      templateId: targetId,
      quizTitle: data.title,
      courseId,
      quizUrl: `/courses/${courseId}/quiz`,
    });
  }

  revalidatePath(`/tutor/${courseId}/quizzes`);
  revalidatePath(`/courses/${courseId}/quiz`);
  return { success: true, id: targetId };
}

export async function deleteQuizTemplateAction(courseId: string, templateId: string) {
  await verifyTutorAccess(courseId);
  await deleteAssessmentWithLegacyProjection(templateId);
  revalidatePath(`/tutor/${courseId}/quizzes`);
  revalidatePath(`/courses/${courseId}/quiz`);
  return { success: true };
}

export async function getQuizTemplatePreviewAction(courseId: string, templateId: string) {
  await verifyTutorAccess(courseId);

  const [template] = await db
    .select()
    .from(quizTemplates)
    .where(eq(quizTemplates.id, templateId))
    .limit(1);

  if (!template) {
    throw new Error("Template kuis tidak ditemukan.");
  }

  const rules = typeof template.selectionRules === "string" 
    ? JSON.parse(template.selectionRules) 
    : template.selectionRules as Record<string, any>;
  const fixedQuestionIds = rules?.fixedQuestionIds as string[] | undefined;

  let selected: any[] = [];

  if (fixedQuestionIds && fixedQuestionIds.length > 0) {
    selected = await db
      .select()
      .from(aiQuestionBank)
      .where(
        and(
          eq(aiQuestionBank.courseId, template.courseId),
          eq(aiQuestionBank.reviewStatus, 'published'),
          inArray(aiQuestionBank.id, fixedQuestionIds)
        )
      );
    // Sort selected questions in the order of fixedQuestionIds
    selected.sort((a, b) => fixedQuestionIds.indexOf(a.id) - fixedQuestionIds.indexOf(b.id));
  } else {
    const totalCount = rules?.count || 10;
    const explicitProportions = rules?.difficulty_proportions as
      | { easy: number; medium: number; hard: number }
      | undefined;
    const proportions =
      explicitProportions ??
      {
        easy: Math.round(totalCount * 0.3),
        medium: Math.round(totalCount * 0.5),
        hard: totalCount - Math.round(totalCount * 0.3) - Math.round(totalCount * 0.5),
      };

    const tags = (rules?.tags as string[] | undefined) || [];
    const tagConditions = tags.map(
      (tag) => sql`exists (select 1 from json_each(${aiQuestionBank.tags}) where json_each.value = ${tag})`
    );
    const tagCondition = tags.length > 0 ? or(...tagConditions) : undefined;

    // Build question set from bank using difficulty proportions
    const questionsByDifficulty = await Promise.all(
      Object.entries(proportions).map(([diff, count]) =>
        db
          .select()
          .from(aiQuestionBank)
          .where(
            and(
              eq(aiQuestionBank.courseId, template.courseId),
              eq(aiQuestionBank.reviewStatus, 'published'),
              eq(aiQuestionBank.difficulty, diff as 'easy' | 'medium' | 'hard'),
              tagCondition,
            ),
          )
          .orderBy(asc(aiQuestionBank.useCount))
          .limit(count),
      ),
    );

    selected = questionsByDifficulty.flat();

    // Fallback: If under-fetched due to difficulty proportions count mismatch, fill from remaining questions matching tags
    if (selected.length < totalCount) {
      const selectedIds = selected.map((q) => q.id);
      const extraNeeded = totalCount - selected.length;

      const extraQuestions = await db
        .select()
        .from(aiQuestionBank)
        .where(
          and(
            eq(aiQuestionBank.courseId, template.courseId),
            eq(aiQuestionBank.reviewStatus, 'published'),
            selectedIds.length > 0 ? notInArray(aiQuestionBank.id, selectedIds) : undefined,
            tagCondition,
          ),
        )
        .orderBy(asc(aiQuestionBank.useCount))
        .limit(extraNeeded);

      selected = [...selected, ...extraQuestions];
    }
  }

  // Parse options and correctIndices properly before returning
  const mappedQuestions = selected.map((q) => {
    let opts = q.options;
    if (typeof opts === "string") {
      try {
        opts = JSON.parse(opts);
      } catch {
        opts = [];
      }
    }
    let corrects = q.correctIndices;
    if (typeof corrects === "string") {
      try {
        corrects = JSON.parse(corrects);
      } catch {
        corrects = [];
      }
    }
    return {
      id: q.id,
      prompt: q.prompt,
      options: Array.isArray(opts) ? opts : [],
      correctIndices: Array.isArray(corrects) ? corrects : [],
      difficulty: q.difficulty,
      questionType: q.questionType,
      explanation: q.explanation,
    };
  });

  return { success: true, questions: mappedQuestions };
}

export async function saveQuestionBankAction(
  courseId: string,
  questionId: string | null,
  data: {
    prompt: string;
    options: string[];
    correctIndices: number[];
    acceptableAnswers?: string[];
    difficulty: "easy" | "medium" | "hard";
    questionType: "multiple_choice" | "multiple_choices" | "short_answer" | "essay";
    explanation: string;
    tags: string[];
  }
) {
  await verifyTutorAccess(courseId);

  const targetId = questionId || `qbk-tutor-${randomUUID()}`;
  const acceptableAnswers = data.acceptableAnswers || [];

  if (questionId) {
    await db
      .update(aiQuestionBank)
      .set({
        prompt: data.prompt,
        options: data.options,
        correctIndices: data.correctIndices,
        acceptableAnswers: acceptableAnswers,
        difficulty: data.difficulty,
        questionType: data.questionType,
        explanation: data.explanation,
        tags: data.tags,
      })
      .where(eq(aiQuestionBank.id, questionId));
  } else {
    await db.insert(aiQuestionBank).values({
      id: targetId,
      courseId,
      prompt: data.prompt,
      options: data.options,
      correctIndices: data.correctIndices,
      acceptableAnswers: acceptableAnswers,
      difficulty: data.difficulty,
      questionType: data.questionType,
      explanation: data.explanation,
      tags: data.tags,
      status: "active",
      reviewStatus: "published",
    });
  }

  revalidatePath(`/tutor/${courseId}/quizzes`);
  return { success: true, id: targetId };
}

export async function deleteQuestionBankAction(courseId: string, questionId: string) {
  await verifyTutorAccess(courseId);
  await db.delete(aiQuestionBank).where(eq(aiQuestionBank.id, questionId));
  revalidatePath(`/tutor/${courseId}/quizzes`);
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// TRYOUTS CRUD
// ─────────────────────────────────────────────────────────────────────────────

export async function saveTryoutAction(
  courseId: string,
  examId: string | null,
  data: {
    title: string;
    status: "draft" | "published" | "ended";
    timeLimitMinutes: number;
    maxAttempts: number;
    openAt?: string | null;
    closeAt?: string | null;
  }
) {
  await verifyTutorAccess(courseId);

  const targetId = examId || `exm-tutor-${randomUUID()}`;
  const settings = {
    timeLimitMinutes: data.timeLimitMinutes,
    maxAttempts: data.maxAttempts,
  };

  const dbData = {
    title: data.title,
    status: data.status,
    settings: settings,
    openAt: data.openAt ? new Date(data.openAt) : null,
    closeAt: data.closeAt ? new Date(data.closeAt) : null,
  };

  if (examId) {
    await db
      .update(exams)
      .set(dbData)
      .where(eq(exams.id, examId));
  } else {
    await db.insert(exams).values({
      id: targetId,
      courseId,
      type: "tryout",
      ...dbData,
    });
  }

  revalidatePath(`/tutor/${courseId}/tryouts`);
  revalidatePath(`/courses/${courseId}/tryout`);
  return { success: true, id: targetId };
}

export async function deleteTryoutAction(courseId: string, examId: string) {
  await verifyTutorAccess(courseId);

  await db.transaction(async (tx) => {
    await tx.delete(questions).where(eq(questions.examId, examId));
    await tx.delete(exams).where(eq(exams.id, examId));
  });

  revalidatePath(`/tutor/${courseId}/tryouts`);
  revalidatePath(`/courses/${courseId}/tryout`);
  return { success: true };
}

export async function saveTryoutQuestionAction(
  courseId: string,
  examId: string,
  questionId: string | null,
  data: {
    type: "multiple_choice" | "multiple_choices" | "short_answer" | "essay";
    order: number;
    prompt: string;
    options?: string[];
    correctIndex?: number;
    correctIndices?: number[];
    acceptsImage?: boolean;
    acceptsFile?: boolean;
    acceptableAnswers?: string[];
  }
) {
  await verifyTutorAccess(courseId);

  const targetId = questionId || `que-tutor-${randomUUID()}`;
  let existingProvenance = normalizeQuestionProvenance(null);
  if (questionId) {
    const [existingQuestion] = await db.select({ examId: questions.examId, content: questions.content }).from(questions).where(eq(questions.id, questionId)).limit(1);
    if (!existingQuestion || existingQuestion.examId !== examId) throw new Error("Soal tryout tidak ditemukan.");
    const existingContent = typeof existingQuestion.content === "string" ? JSON.parse(existingQuestion.content) : existingQuestion.content;
    existingProvenance = normalizeQuestionProvenance(existingContent);
  }
  const content = {
    prompt: data.prompt,
    options: data.options || [],
    correctIndex: data.correctIndex,
    correctIndices: data.correctIndices || [],
    acceptsImage: data.acceptsImage || false,
    acceptsFile: data.acceptsFile || false,
    acceptableAnswers: data.acceptableAnswers || [],
    ...existingProvenance,
  };

  if (questionId) {
    await db
      .update(questions)
      .set({
        type: data.type,
        order: data.order,
        content: content,
      })
      .where(eq(questions.id, questionId));
  } else {
    await db.insert(questions).values({
      id: targetId,
      examId,
      type: data.type,
      order: data.order,
      content: content,
    });
  }

  revalidatePath(`/tutor/${courseId}/tryouts`);
  return { success: true, id: targetId };
}

export async function importQuestionBankToTryoutAction(courseId: string, examId: string, questionBankIds: string[]) {
  await verifyTutorAccess(courseId);
  const uniqueIds = [...new Set(questionBankIds)];
  if (uniqueIds.length === 0) throw new Error("Pilih minimal satu soal dari bank soal.");

  const [exam] = await db.select({ id: exams.id, courseId: exams.courseId, type: exams.type }).from(exams).where(eq(exams.id, examId)).limit(1);
  if (!exam || exam.courseId !== courseId || exam.type !== "tryout") throw new Error("Tryout tidak ditemukan.");

  const [bankRows, existingQuestions] = await Promise.all([
    db.select().from(aiQuestionBank).where(and(eq(aiQuestionBank.courseId, courseId), eq(aiQuestionBank.reviewStatus, "published"), inArray(aiQuestionBank.id, uniqueIds))),
    db.select({ content: questions.content, order: questions.order }).from(questions).where(eq(questions.examId, examId)),
  ]);
  if (bankRows.length !== uniqueIds.length) throw new Error("Sebagian soal bank tidak tersedia atau belum dipublikasi.");

  const importedIds = new Set(existingQuestions.flatMap((question) => {
    const content = typeof question.content === "string" ? JSON.parse(question.content) : question.content;
    return typeof content?.bankQuestionId === "string" ? [content.bankQuestionId] : [];
  }));
  const rowsToImport = uniqueIds.map((questionId) => bankRows.find((row) => row.id === questionId)!).filter((row) => !importedIds.has(row.id));
  const firstOrder = existingQuestions.reduce((highest, question) => Math.max(highest, question.order), 0) + 1;

  if (rowsToImport.length > 0) {
    await db.insert(questions).values(rowsToImport.map((row, index) => ({
      id: `que-bank-${randomUUID()}`,
      examId,
      type: row.questionType,
      order: firstOrder + index,
      content: {
        bankQuestionId: row.id,
        prompt: row.prompt,
        options: Array.isArray(row.options) ? row.options.map(String) : [],
        correctIndex: Array.isArray(row.correctIndices) ? row.correctIndices[0] : undefined,
        correctIndices: Array.isArray(row.correctIndices) ? row.correctIndices : [],
        acceptsImage: false,
        acceptsFile: false,
        acceptableAnswers: Array.isArray(row.acceptableAnswers) ? row.acceptableAnswers : [],
        explanation: row.explanation,
        ...questionProvenanceSnapshot(row),
      },
    })));
  }

  revalidatePath(`/tutor/${courseId}/tryouts`);
  revalidatePath(`/courses/${courseId}/tryout/${examId}`);
  return { success: true, imported: rowsToImport.length, skipped: uniqueIds.length - rowsToImport.length };
}

export async function deleteTryoutQuestionAction(courseId: string, questionId: string) {
  await verifyTutorAccess(courseId);
  await db.delete(questions).where(eq(questions.id, questionId));
  revalidatePath(`/tutor/${courseId}/tryouts`);
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// GRADING & SUBMISSIONS
// ─────────────────────────────────────────────────────────────────────────────

export async function submitTryoutAction(courseId: string, examId: string, answers: any) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new Error("Unauthorized: Silakan masuk terlebih dahulu.");
  }

  // Fetch Tryout and questions to take snapshots
  const [examRecord] = await db.select().from(exams).where(eq(exams.id, examId)).limit(1);
  if (!examRecord) throw new Error("Tryout tidak ditemukan.");

  const dbQuestions = await db
    .select()
    .from(questions)
    .where(eq(questions.examId, examId))
    .orderBy(asc(questions.order));

  // Determine if it has essays
  const hasEssay = dbQuestions.some((q) => q.type === "essay");
  const status = hasEssay ? "pending_review" : "completed";

  // Calculate score for MC & Short Answer questions
  let correctCount = 0;
  let autoGradedCount = 0;

  const questionsSnapshot = dbQuestions.map((q) => {
    const qContent = typeof q.content === "string" ? JSON.parse(q.content) : q.content;
    const answer = answers[q.id];

    if (q.type === "multiple_choice") {
      autoGradedCount++;
      const isCorrect = answer && answer.index === qContent.correctIndex;
      if (isCorrect) correctCount++;
    } else if (q.type === "multiple_choices") {
      autoGradedCount++;
      const submitted = answer?.indices || [];
      const correct = qContent.correctIndices || [];
      const isCorrect =
        submitted.length === correct.length &&
        submitted.every((idx: number) => correct.includes(idx));
      if (isCorrect) correctCount++;
    } else if (q.type === "short_answer") {
      autoGradedCount++;
      const submittedText = (answer?.text || "").trim().toLowerCase();
      const acceptable = (qContent.acceptableAnswers || []).map((a: string) =>
        a.trim().toLowerCase()
      );
      const isCorrect = acceptable.includes(submittedText);
      if (isCorrect) correctCount++;
    }

    return {
      id: q.id,
      order: q.order,
      type: q.type,
      prompt: qContent.prompt,
      options: qContent.options || [],
      correctIndex: qContent.correctIndex,
      correctIndices: qContent.correctIndices || [],
      acceptsImage: qContent.acceptsImage,
      acceptsFile: qContent.acceptsFile,
      acceptableAnswers: qContent.acceptableAnswers || [],
      explanation: qContent.explanation || "",
      ...normalizeQuestionProvenance(qContent),
    };
  });

  const autoGradedScore = autoGradedCount > 0 ? Math.round((correctCount / autoGradedCount) * 100) : 100;
  const score = hasEssay ? null : autoGradedScore; // Essays leave score null until teacher grades

  const submissionId = `sub-tutor-${randomUUID()}`;

  await db.insert(submissions).values({
    id: submissionId,
    userId: session.user.id,
    examId: examId,
    status: status,
    score: score,
    answersSnapshot: answers,
    questionsSnapshot: questionsSnapshot,
    submittedAt: new Date(),
  });

  revalidatePath(`/courses/${courseId}/my-results`);
  return { success: true, submissionId };
}

export async function gradeSubmissionAction(
  courseId: string,
  submissionId: string,
  score: number,
  teacherNotes: string
) {
  await verifyTutorAccess(courseId);

  await db
    .update(submissions)
    .set({
      score,
      teacherNotes,
      status: "graded",
    })
    .where(eq(submissions.id, submissionId));

  revalidatePath(`/tutor/${courseId}/grading`);
  return { success: true };
}
