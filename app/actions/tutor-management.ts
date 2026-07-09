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
  user,
} from "@/db/schema";
import { eq, and, inArray, asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { randomUUID } from "crypto";
import { parseMaterialIntoSections } from "@/lib/ingestion-parser";
import { revalidatePath } from "next/cache";

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
    category: "daily" | "weekly" | "chapter" | "premium";
    visibility: "free" | "paid";
    timeLimitSeconds: number | null;
    maxAttempts: number | null;
    selectionRules: any;
  }
) {
  await verifyTutorAccess(courseId);

  const targetId = templateId || `tpl-tutor-${randomUUID()}`;

  if (templateId) {
    await db
      .update(quizTemplates)
      .set({
        title: data.title,
        category: data.category,
        visibility: data.visibility,
        timeLimitSeconds: data.timeLimitSeconds,
        maxAttempts: data.maxAttempts,
        selectionRules: data.selectionRules,
        updatedAt: new Date(),
      })
      .where(eq(quizTemplates.id, templateId));
  } else {
    await db.insert(quizTemplates).values({
      id: targetId,
      courseId,
      title: data.title,
      category: data.category,
      visibility: data.visibility,
      timeLimitSeconds: data.timeLimitSeconds,
      maxAttempts: data.maxAttempts,
      selectionRules: data.selectionRules,
    });
  }

  revalidatePath(`/tutor/${courseId}/quizzes`);
  revalidatePath(`/courses/${courseId}/quiz`);
  return { success: true, id: targetId };
}

export async function deleteQuizTemplateAction(courseId: string, templateId: string) {
  await verifyTutorAccess(courseId);
  await db.delete(quizTemplates).where(eq(quizTemplates.id, templateId));
  revalidatePath(`/tutor/${courseId}/quizzes`);
  revalidatePath(`/courses/${courseId}/quiz`);
  return { success: true };
}

export async function saveQuestionBankAction(
  courseId: string,
  questionId: string | null,
  data: {
    prompt: string;
    options: string[];
    correctIndices: number[];
    difficulty: "easy" | "medium" | "hard";
    questionType: "multiple_choice" | "multiple_choices";
    explanation: string;
    tags: string[];
  }
) {
  await verifyTutorAccess(courseId);

  const targetId = questionId || `qbk-tutor-${randomUUID()}`;

  if (questionId) {
    await db
      .update(aiQuestionBank)
      .set({
        prompt: data.prompt,
        options: data.options,
        correctIndices: data.correctIndices,
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
  const content = {
    prompt: data.prompt,
    options: data.options || [],
    correctIndex: data.correctIndex,
    correctIndices: data.correctIndices || [],
    acceptsImage: data.acceptsImage || false,
    acceptsFile: data.acceptsFile || false,
    acceptableAnswers: data.acceptableAnswers || [],
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
