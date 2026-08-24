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
  mataKuliah,
  enrollments,
} from "@/db/schema";
import { eq, and, inArray, asc, or, sql, notInArray, gt } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { randomUUID } from "crypto";
import { z } from "zod";
import { parseMaterialIntoSections } from "@/lib/ingestion-parser";
import { revalidatePath } from "next/cache";
import { notifyQuizPublishedBestEffort } from "@/lib/notifications/send";
import { normalizeQuestionProvenance, questionProvenanceSnapshot } from "@/lib/asesmen/question-provenance";
import {
  createAssessmentWithLegacyProjection,
  updateAssessmentWithLegacyProjection,
  deleteAssessmentWithLegacyProjection,
} from "@/lib/asesmen/quiz-canonical-sync";
import { requireTutorCourseAccess } from "@/lib/auth/tutor-access";
import {
  TUTOR_CAPABILITY_ERRORS,
  resolveActorRoles,
  resolveEffectiveAssessmentType,
  assertTutorQuizCapability,
  checkCourseMatch,
  buildGradingSnapshots,
  isReviewableSubmissionStatus,
  isSqliteBusyError,
  isUniqueConstraintError,
  recordTutorFailureAudit,
  recordTutorMutationAuditSafe,
} from "@/lib/tutor/assessment-policy";
import { recordTutorMutationAudit } from "@/lib/audit/mutasi";

const quizTemplateInputSchema = z.object({
  title: z.string().min(1).max(255),
  category: z.enum(["daily", "weekly", "chapter", "premium", "simulation"]),
  visibility: z.enum(["free", "paid"]),
  timeLimitSeconds: z.number().int().positive().nullable().optional(),
  maxAttempts: z.number().int().positive().nullable().optional(),
  selectionRules: z
    .object({
      count: z.number().int().min(1),
    })
    .passthrough(),
  openAt: z.string().nullable().optional(),
  closeAt: z.string().nullable().optional(),
  manualStatus: z.enum(["open", "closed", "scheduled"]).optional(),
  status: z.enum(["draft", "published"]).optional(),
  showDiscussion: z.boolean().optional(),
});

const questionBankInputSchema = z.object({
  prompt: z.string().min(1).max(4000),
  options: z.array(z.string().max(2000)).min(1),
  correctIndices: z.array(z.number().int()).min(1),
  acceptableAnswers: z.array(z.string().max(2000)).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  questionType: z.enum(["multiple_choice", "multiple_choices", "short_answer", "essay"]),
  explanation: z.string().max(8000),
  tags: z.array(z.string().max(64)).max(50),
});

function formatValidationIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
}

function newAuditRequestId(): string {
  return `req-${randomUUID()}`;
}

// Helper to verify tutor role and course access using canonical policy
export async function verifyTutorAccess(courseId: string, options?: { allowAdmin?: boolean }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new Error("Unauthorized: Silakan masuk terlebih dahulu.");
  }

  const role = (session.user as { role?: string | null }).role;
  const allowAdmin = options?.allowAdmin ?? (role === "admin");
  const access = await requireTutorCourseAccess(session.user.id, courseId, { allowAdmin });

  return { session, role, user: session.user, access };
}

// ─────────────────────────────────────────────────────────────────────────────
// MATERIALS CRUD (Tutor forbidden; admin override only)
// ─────────────────────────────────────────────────────────────────────────────

export async function saveTutorMaterialAction(
  courseId: string,
  materialId: string | null,
  title: string,
  summary: string,
  rawText: string,
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new Error("Unauthorized: Silakan masuk terlebih dahulu.");
  }

  const { roles, isAdmin } = await resolveActorRoles(
    session.user.id,
    (session.user as { role?: string | null }).role,
  );

  if (!isAdmin) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId,
      entityType: "material",
      entityId: materialId || "new",
      entityVersion: 1,
      action: materialId ? "material:update" : "material:create",
      outcome: "rejected",
      reason: TUTOR_CAPABILITY_ERRORS.MATERIALS_AUTHORING_DISABLED,
    });
    throw new Error(TUTOR_CAPABILITY_ERRORS.MATERIALS_AUTHORING_DISABLED);
  }

  const parsedSections = parseMaterialIntoSections(rawText);
  const targetId = materialId || `mat-tutor-${randomUUID()}`;

  await db.transaction(async (tx) => {
    if (materialId) {
      await tx
        .update(aiMaterialInstances)
        .set({
          title,
          summary,
          updatedAt: new Date(),
        })
        .where(eq(aiMaterialInstances.id, materialId));

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
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new Error("Unauthorized: Silakan masuk terlebih dahulu.");
  }

  const { roles, isAdmin } = await resolveActorRoles(
    session.user.id,
    (session.user as { role?: string | null }).role,
  );

  if (!isAdmin) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId,
      entityType: "material",
      entityId: materialId,
      entityVersion: 1,
      action: "material:delete",
      outcome: "rejected",
      reason: TUTOR_CAPABILITY_ERRORS.MATERIALS_AUTHORING_DISABLED,
    });
    throw new Error(TUTOR_CAPABILITY_ERRORS.MATERIALS_AUTHORING_DISABLED);
  }

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
// QUIZZES & QUESTION BANK CRUD (Tutor quiz-only for assigned course)
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
  },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new Error("Unauthorized: Silakan masuk terlebih dahulu.");
  }

  const { roles, isAdmin } = await resolveActorRoles(
    session.user.id,
    (session.user as { role?: string | null }).role,
  );

  let access;
  try {
    access = await requireTutorCourseAccess(session.user.id, courseId, { allowAdmin: isAdmin });
  } catch (err: any) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId,
      entityType: "quiz_template",
      entityId: templateId || "new",
      entityVersion: 1,
      action: templateId ? "quiz:update" : "quiz:create",
      outcome: "rejected",
      reason: err?.message || TUTOR_CAPABILITY_ERRORS.ACCESS_DENIED,
    });
    throw err;
  }

  if (!isAdmin) {
    try {
      assertTutorQuizCapability(data.category, data.selectionRules);
    } catch (err: any) {
      await recordTutorMutationAuditSafe({
        actorId: session.user.id,
        actorRoles: roles,
        courseId: access.courseId ?? courseId,
        entityType: "quiz_template",
        entityId: templateId || "new",
        entityVersion: 1,
        action: templateId ? "quiz:update" : "quiz:create",
        outcome: "rejected",
        reason: err?.message || TUTOR_CAPABILITY_ERRORS.SIMULATION_MUTATION_FORBIDDEN,
      });
      throw err;
    }

    if (templateId) {
      const [existingTemplate] = await db
        .select()
        .from(quizTemplates)
        .where(eq(quizTemplates.id, templateId))
        .limit(1);

      if (!existingTemplate) {
        await recordTutorMutationAuditSafe({
          actorId: session.user.id,
          actorRoles: roles,
          courseId: access.courseId ?? courseId,
          entityType: "quiz_template",
          entityId: templateId,
          entityVersion: 1,
          action: "quiz:update",
          outcome: "rejected",
          reason: "QUIZ_TEMPLATE_NOT_FOUND",
        });
        throw new Error("Template kuis tidak ditemukan.");
      }

      if (!checkCourseMatch(existingTemplate.courseId, access.courseId!, access.legacyCourseId)) {
        await recordTutorMutationAuditSafe({
          actorId: session.user.id,
          actorRoles: roles,
          courseId: access.courseId ?? courseId,
          entityType: "quiz_template",
          entityId: templateId,
          entityVersion: 1,
          action: "quiz:update",
          outcome: "rejected",
          reason: TUTOR_CAPABILITY_ERRORS.CROSS_COURSE_MUTATION_FORBIDDEN,
        });
        throw new Error(TUTOR_CAPABILITY_ERRORS.CROSS_COURSE_MUTATION_FORBIDDEN);
      }

      const existingType = resolveEffectiveAssessmentType(
        existingTemplate.category,
        existingTemplate.selectionRules,
      );

      if (existingTemplate.category === "simulation") {
        await recordTutorMutationAuditSafe({
          actorId: session.user.id,
          actorRoles: roles,
          courseId: access.courseId ?? courseId,
          entityType: "quiz_template",
          entityId: templateId,
          entityVersion: 1,
          action: "quiz:update",
          outcome: "rejected",
          reason: TUTOR_CAPABILITY_ERRORS.SIMULATION_MUTATION_FORBIDDEN,
        });
        throw new Error(TUTOR_CAPABILITY_ERRORS.SIMULATION_MUTATION_FORBIDDEN);
      }

      if (existingType === "tryout") {
        await recordTutorMutationAuditSafe({
          actorId: session.user.id,
          actorRoles: roles,
          courseId: access.courseId ?? courseId,
          entityType: "quiz_template",
          entityId: templateId,
          entityVersion: 1,
          action: "quiz:update",
          outcome: "rejected",
          reason: TUTOR_CAPABILITY_ERRORS.TRYOUT_CATEGORY_FORBIDDEN,
        });
        throw new Error(TUTOR_CAPABILITY_ERRORS.TRYOUT_CATEGORY_FORBIDDEN);
      }
    }
  }

  const parsedInput = quizTemplateInputSchema.safeParse(data);
  if (!parsedInput.success) {
    const validationError = `Validasi gagal: ${formatValidationIssues(parsedInput.error)}`;
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: access.courseId ?? courseId,
      entityType: "quiz_template",
      entityId: templateId || "new",
      entityVersion: 1,
      action: templateId ? "quiz:update" : "quiz:create",
      outcome: "rejected",
      reason: validationError,
    });
    throw new Error(validationError);
  }

  const targetId = templateId || `tpl-tutor-${randomUUID()}`;
  const openDate = data.openAt ? new Date(data.openAt) : null;
  const closeDate = data.closeAt ? new Date(data.closeAt) : null;

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
  } else {
    shouldNotify = data.status === "published";
  }

  const requestId = newAuditRequestId();
  const auditBase = {
    actorId: session.user.id,
    actorRoles: roles,
    courseId: access.courseId ?? courseId,
    entityType: "quiz_template",
    entityId: targetId,
    entityVersion: 1,
    requestId,
  } as const;

  try {
    await db.transaction(async (tx) => {
      if (templateId) {
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
        }, tx);
      } else {
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
        }, tx);
      }

      await recordTutorMutationAudit({
        ...auditBase,
        action: templateId ? "quiz:update" : "quiz:create",
        outcome: "success",
        reason: templateId ? "Quiz template updated" : "Quiz template created",
        after: {
          title: data.title,
          category: data.category,
          status: data.status ?? (templateId ? "published" : "draft"),
        },
      }, tx);
    });
  } catch (err: any) {
    await recordTutorMutationAuditSafe({
      ...auditBase,
      action: templateId ? "quiz:update" : "quiz:create",
      outcome: "failed",
      reason: err?.message || "Failed to persist quiz template",
    });
    throw err;
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
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new Error("Unauthorized: Silakan masuk terlebih dahulu.");
  }

  const { roles, isAdmin } = await resolveActorRoles(
    session.user.id,
    (session.user as { role?: string | null }).role,
  );

  let access;
  try {
    access = await requireTutorCourseAccess(session.user.id, courseId, { allowAdmin: isAdmin });
  } catch (err: any) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId,
      entityType: "quiz_template",
      entityId: templateId,
      entityVersion: 1,
      action: "quiz:delete",
      outcome: "rejected",
      reason: err?.message || TUTOR_CAPABILITY_ERRORS.ACCESS_DENIED,
    });
    throw err;
  }

  const [existingTemplate] = await db
    .select()
    .from(quizTemplates)
    .where(eq(quizTemplates.id, templateId))
    .limit(1);

  if (!existingTemplate) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: access.courseId ?? courseId,
      entityType: "quiz_template",
      entityId: templateId,
      entityVersion: 1,
      action: "quiz:delete",
      outcome: "rejected",
      reason: "QUIZ_TEMPLATE_NOT_FOUND",
    });
    throw new Error("Template kuis tidak ditemukan.");
  }

  if (!isAdmin) {
    if (!checkCourseMatch(existingTemplate.courseId, access.courseId!, access.legacyCourseId)) {
      await recordTutorMutationAuditSafe({
        actorId: session.user.id,
        actorRoles: roles,
        courseId: access.courseId ?? courseId,
        entityType: "quiz_template",
        entityId: templateId,
        entityVersion: 1,
        action: "quiz:delete",
        outcome: "rejected",
        reason: TUTOR_CAPABILITY_ERRORS.CROSS_COURSE_MUTATION_FORBIDDEN,
      });
      throw new Error(TUTOR_CAPABILITY_ERRORS.CROSS_COURSE_MUTATION_FORBIDDEN);
    }

    if (existingTemplate.category === "simulation") {
      await recordTutorMutationAuditSafe({
        actorId: session.user.id,
        actorRoles: roles,
        courseId: access.courseId ?? courseId,
        entityType: "quiz_template",
        entityId: templateId,
        entityVersion: 1,
        action: "quiz:delete",
        outcome: "rejected",
        reason: TUTOR_CAPABILITY_ERRORS.SIMULATION_MUTATION_FORBIDDEN,
      });
      throw new Error(TUTOR_CAPABILITY_ERRORS.SIMULATION_MUTATION_FORBIDDEN);
    }

    if (
      resolveEffectiveAssessmentType(existingTemplate.category, existingTemplate.selectionRules) ===
      "tryout"
    ) {
      await recordTutorMutationAuditSafe({
        actorId: session.user.id,
        actorRoles: roles,
        courseId: access.courseId ?? courseId,
        entityType: "quiz_template",
        entityId: templateId,
        entityVersion: 1,
        action: "quiz:delete",
        outcome: "rejected",
        reason: TUTOR_CAPABILITY_ERRORS.TRYOUT_CATEGORY_FORBIDDEN,
      });
      throw new Error(TUTOR_CAPABILITY_ERRORS.TRYOUT_CATEGORY_FORBIDDEN);
    }
  }

  const requestId = newAuditRequestId();
  try {
    await db.transaction(async (tx) => {
      await deleteAssessmentWithLegacyProjection(templateId, tx);

      await recordTutorMutationAudit({
        actorId: session.user.id,
        actorRoles: roles,
        courseId: access.courseId ?? courseId,
        entityType: "quiz_template",
        entityId: templateId,
        entityVersion: 1,
        requestId,
        action: "quiz:delete",
        outcome: "success",
        reason: "Quiz template deleted",
        before: {
          id: templateId,
          title: existingTemplate.title,
          category: existingTemplate.category,
        },
      }, tx);
    });
  } catch (err: any) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: access.courseId ?? courseId,
      entityType: "quiz_template",
      entityId: templateId,
      entityVersion: 1,
      requestId,
      action: "quiz:delete",
      outcome: "failed",
      reason: err?.message || "Failed to delete quiz template",
    });
    throw err;
  }

  revalidatePath(`/tutor/${courseId}/quizzes`);
  revalidatePath(`/courses/${courseId}/quiz`);
  return { success: true };
}

export async function toggleQuizTemplateStatusAction(
  courseId: string,
  templateId: string,
  status: "draft" | "published",
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new Error("Unauthorized: Silakan masuk terlebih dahulu.");
  }

  const { roles, isAdmin } = await resolveActorRoles(
    session.user.id,
    (session.user as { role?: string | null }).role,
  );

  let access;
  try {
    access = await requireTutorCourseAccess(session.user.id, courseId, { allowAdmin: isAdmin });
  } catch (err: any) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId,
      entityType: "quiz_template",
      entityId: templateId,
      entityVersion: 1,
      action: "quiz:toggle_status",
      outcome: "rejected",
      reason: err?.message || TUTOR_CAPABILITY_ERRORS.ACCESS_DENIED,
    });
    throw err;
  }

  const [existingTemplate] = await db
    .select()
    .from(quizTemplates)
    .where(eq(quizTemplates.id, templateId))
    .limit(1);

  if (!existingTemplate) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: access.courseId ?? courseId,
      entityType: "quiz_template",
      entityId: templateId,
      entityVersion: 1,
      action: "quiz:toggle_status",
      outcome: "rejected",
      reason: "QUIZ_TEMPLATE_NOT_FOUND",
    });
    throw new Error("Template kuis tidak ditemukan.");
  }

  if (status !== "draft" && status !== "published") {
    const reason = "Validasi gagal: status harus draft atau published.";
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: access.courseId ?? courseId,
      entityType: "quiz_template",
      entityId: templateId,
      entityVersion: 1,
      action: "quiz:toggle_status",
      outcome: "rejected",
      reason,
    });
    throw new Error(reason);
  }

  if (!isAdmin) {
    if (!checkCourseMatch(existingTemplate.courseId, access.courseId!, access.legacyCourseId)) {
      await recordTutorMutationAuditSafe({
        actorId: session.user.id,
        actorRoles: roles,
        courseId: access.courseId ?? courseId,
        entityType: "quiz_template",
        entityId: templateId,
        entityVersion: 1,
        action: "quiz:toggle_status",
        outcome: "rejected",
        reason: TUTOR_CAPABILITY_ERRORS.CROSS_COURSE_MUTATION_FORBIDDEN,
      });
      throw new Error(TUTOR_CAPABILITY_ERRORS.CROSS_COURSE_MUTATION_FORBIDDEN);
    }

    if (existingTemplate.category === "simulation") {
      await recordTutorMutationAuditSafe({
        actorId: session.user.id,
        actorRoles: roles,
        courseId: access.courseId ?? courseId,
        entityType: "quiz_template",
        entityId: templateId,
        entityVersion: 1,
        action: "quiz:toggle_status",
        outcome: "rejected",
        reason: TUTOR_CAPABILITY_ERRORS.SIMULATION_MUTATION_FORBIDDEN,
      });
      throw new Error(TUTOR_CAPABILITY_ERRORS.SIMULATION_MUTATION_FORBIDDEN);
    }

    if (
      resolveEffectiveAssessmentType(existingTemplate.category, existingTemplate.selectionRules) ===
      "tryout"
    ) {
      await recordTutorMutationAuditSafe({
        actorId: session.user.id,
        actorRoles: roles,
        courseId: access.courseId ?? courseId,
        entityType: "quiz_template",
        entityId: templateId,
        entityVersion: 1,
        action: "quiz:toggle_status",
        outcome: "rejected",
        reason: TUTOR_CAPABILITY_ERRORS.TRYOUT_CATEGORY_FORBIDDEN,
      });
      throw new Error(TUTOR_CAPABILITY_ERRORS.TRYOUT_CATEGORY_FORBIDDEN);
    }
  }

  const requestId = newAuditRequestId();
  try {
    await db.transaction(async (tx) => {
      await updateAssessmentWithLegacyProjection(templateId, {
        status,
        actorId: session.user.id,
      }, tx);

      await recordTutorMutationAudit({
        actorId: session.user.id,
        actorRoles: roles,
        courseId: access.courseId ?? courseId,
        entityType: "quiz_template",
        entityId: templateId,
        entityVersion: 1,
        requestId,
        action: "quiz:toggle_status",
        outcome: "success",
        reason: `Quiz template status updated to ${status}`,
        after: {
          id: templateId,
          status,
        },
      }, tx);
    });
  } catch (err: any) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: access.courseId ?? courseId,
      entityType: "quiz_template",
      entityId: templateId,
      entityVersion: 1,
      requestId,
      action: "quiz:toggle_status",
      outcome: "failed",
      reason: err?.message || "Failed to toggle quiz template status",
    });
    throw err;
  }

  if (status === "published" && existingTemplate.status !== "published") {
    await notifyQuizPublishedBestEffort({
      templateId,
      quizTitle: existingTemplate.title,
      courseId,
      quizUrl: `/courses/${courseId}/quiz`,
    });
  }

  revalidatePath(`/tutor/${courseId}/quizzes`);
  revalidatePath(`/courses/${courseId}/quiz`);
  return { success: true, status };
}

export async function getQuizTemplatePreviewAction(courseId: string, templateId: string) {
  const { access } = await verifyTutorAccess(courseId);

  const [template] = await db
    .select()
    .from(quizTemplates)
    .where(eq(quizTemplates.id, templateId))
    .limit(1);

  if (!template) {
    throw new Error("Template kuis tidak ditemukan.");
  }

  if (!checkCourseMatch(template.courseId, access.courseId!, access.legacyCourseId)) {
    throw new Error("Template kuis tidak sesuai dengan kelas.");
  }

  const rules = typeof template.selectionRules === "string" 
    ? JSON.parse(template.selectionRules) 
    : (template.selectionRules as Record<string, any>);
  const fixedQuestionIds = rules?.fixedQuestionIds as string[] | undefined;

  const candidateCourseIds = [template.courseId, access.courseId, access.legacyCourseId].filter(
    (v): v is string => Boolean(v),
  );

  let selected: any[] = [];

  if (fixedQuestionIds && fixedQuestionIds.length > 0) {
    selected = await db
      .select()
      .from(aiQuestionBank)
      .where(
        and(
          inArray(aiQuestionBank.courseId, candidateCourseIds),
          eq(aiQuestionBank.reviewStatus, 'published'),
          inArray(aiQuestionBank.id, fixedQuestionIds)
        )
      );
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

    const questionsByDifficulty = await Promise.all(
      Object.entries(proportions).map(([diff, count]) =>
        db
          .select()
          .from(aiQuestionBank)
          .where(
            and(
              inArray(aiQuestionBank.courseId, candidateCourseIds),
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

    if (selected.length < totalCount) {
      const selectedIds = selected.map((q) => q.id);
      const extraNeeded = totalCount - selected.length;

      const extraQuestions = await db
        .select()
        .from(aiQuestionBank)
        .where(
          and(
            inArray(aiQuestionBank.courseId, candidateCourseIds),
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
  },
) {
  const { session, access } = await verifyTutorAccess(courseId);
  const { roles, isAdmin } = await resolveActorRoles(
    session.user.id,
    (session.user as { role?: string | null }).role,
  );

  const parsedInput = questionBankInputSchema.safeParse(data);
  if (!parsedInput.success) {
    const validationError = `Validasi gagal: ${formatValidationIssues(parsedInput.error)}`;
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: access.courseId ?? courseId,
      entityType: "question_bank",
      entityId: questionId || "new",
      entityVersion: 1,
      action: questionId ? "question_bank:update" : "question_bank:create",
      outcome: "rejected",
      reason: validationError,
    });
    throw new Error(validationError);
  }

  const targetCourseId = access.legacyCourseId ?? courseId;
  const targetId = questionId || `qbk-tutor-${randomUUID()}`;
  const acceptableAnswers = data.acceptableAnswers || [];

  if (questionId) {
    const [existing] = await db
      .select()
      .from(aiQuestionBank)
      .where(eq(aiQuestionBank.id, questionId))
      .limit(1);

    if (!existing) {
      await recordTutorMutationAuditSafe({
        actorId: session.user.id,
        actorRoles: roles,
        courseId: access.courseId ?? courseId,
        entityType: "question_bank",
        entityId: questionId,
        entityVersion: 1,
        action: "question_bank:update",
        outcome: "rejected",
        reason: "QUESTION_BANK_NOT_FOUND",
      });
      throw new Error("Soal bank tidak ditemukan.");
    }

    if (!isAdmin && !checkCourseMatch(existing.courseId, access.courseId!, access.legacyCourseId)) {
      await recordTutorMutationAuditSafe({
        actorId: session.user.id,
        actorRoles: roles,
        courseId: access.courseId ?? courseId,
        entityType: "question_bank",
        entityId: questionId,
        entityVersion: 1,
        action: "question_bank:update",
        outcome: "rejected",
        reason: TUTOR_CAPABILITY_ERRORS.CROSS_COURSE_MUTATION_FORBIDDEN,
      });
      throw new Error(TUTOR_CAPABILITY_ERRORS.CROSS_COURSE_MUTATION_FORBIDDEN);
    }
  }

  const requestId = newAuditRequestId();
  try {
    await db.transaction(async (tx) => {
      if (questionId) {
        await tx
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
        await tx.insert(aiQuestionBank).values({
          id: targetId,
          courseId: targetCourseId,
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

      await recordTutorMutationAudit({
        actorId: session.user.id,
        actorRoles: roles,
        courseId: access.courseId ?? courseId,
        entityType: "question_bank",
        entityId: targetId,
        entityVersion: 1,
        requestId,
        action: questionId ? "question_bank:update" : "question_bank:create",
        outcome: "success",
        reason: questionId ? "Question bank item updated" : "Question bank item created",
        after: {
          prompt: data.prompt,
          difficulty: data.difficulty,
          questionType: data.questionType,
        },
      }, tx);
    });
  } catch (err: any) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: access.courseId ?? courseId,
      entityType: "question_bank",
      entityId: targetId,
      entityVersion: 1,
      requestId,
      action: questionId ? "question_bank:update" : "question_bank:create",
      outcome: "failed",
      reason: err?.message || "Failed to persist question bank item",
    });
    throw err;
  }

  revalidatePath(`/tutor/${courseId}/quizzes`);
  return { success: true, id: targetId };
}

export async function deleteQuestionBankAction(courseId: string, questionId: string) {
  const { session, access } = await verifyTutorAccess(courseId);
  const { roles, isAdmin } = await resolveActorRoles(
    session.user.id,
    (session.user as { role?: string | null }).role,
  );

  const [existing] = await db
    .select()
    .from(aiQuestionBank)
    .where(eq(aiQuestionBank.id, questionId))
    .limit(1);

  if (!existing) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: access.courseId ?? courseId,
      entityType: "question_bank",
      entityId: questionId,
      entityVersion: 1,
      action: "question_bank:delete",
      outcome: "rejected",
      reason: "QUESTION_BANK_NOT_FOUND",
    });
    throw new Error("Soal bank tidak ditemukan.");
  }

  if (!isAdmin && !checkCourseMatch(existing.courseId, access.courseId!, access.legacyCourseId)) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: access.courseId ?? courseId,
      entityType: "question_bank",
      entityId: questionId,
      entityVersion: 1,
      action: "question_bank:delete",
      outcome: "rejected",
      reason: TUTOR_CAPABILITY_ERRORS.CROSS_COURSE_MUTATION_FORBIDDEN,
    });
    throw new Error(TUTOR_CAPABILITY_ERRORS.CROSS_COURSE_MUTATION_FORBIDDEN);
  }

  const requestId = newAuditRequestId();
  try {
    await db.transaction(async (tx) => {
      await tx.delete(aiQuestionBank).where(eq(aiQuestionBank.id, questionId));

      await recordTutorMutationAudit({
        actorId: session.user.id,
        actorRoles: roles,
        courseId: access.courseId ?? courseId,
        entityType: "question_bank",
        entityId: questionId,
        entityVersion: 1,
        requestId,
        action: "question_bank:delete",
        outcome: "success",
        reason: "Question bank item deleted",
        before: {
          id: questionId,
          prompt: existing.prompt,
        },
      }, tx);
    });
  } catch (err: any) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: access.courseId ?? courseId,
      entityType: "question_bank",
      entityId: questionId,
      entityVersion: 1,
      requestId,
      action: "question_bank:delete",
      outcome: "failed",
      reason: err?.message || "Failed to delete question bank item",
    });
    throw err;
  }

  revalidatePath(`/tutor/${courseId}/quizzes`);
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// TRYOUTS CRUD (Tutor tryout authoring forbidden; admin override only)
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
  },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new Error("Unauthorized: Silakan masuk terlebih dahulu.");
  }

  const { roles, isAdmin } = await resolveActorRoles(
    session.user.id,
    (session.user as { role?: string | null }).role,
  );

  if (!isAdmin) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId,
      entityType: "exam",
      entityId: examId || "new",
      entityVersion: 1,
      action: examId ? "tryout:update" : "tryout:create",
      outcome: "rejected",
      reason: TUTOR_CAPABILITY_ERRORS.TRYOUT_AUTHORING_DISABLED,
    });
    throw new Error(TUTOR_CAPABILITY_ERRORS.TRYOUT_AUTHORING_DISABLED);
  }

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

  const requestId = newAuditRequestId();
  const auditBase = {
    actorId: session.user.id,
    actorRoles: roles,
    courseId,
    entityType: "exam",
    entityId: targetId,
    entityVersion: 1,
    requestId,
  } as const;

  try {
    await db.transaction(async (tx) => {
      if (examId) {
        await tx
          .update(exams)
          .set(dbData)
          .where(eq(exams.id, examId));
      } else {
        await tx.insert(exams).values({
          id: targetId,
          courseId,
          type: "tryout",
          ...dbData,
        });
      }

      await recordTutorMutationAudit({
        ...auditBase,
        action: examId ? "tryout:update" : "tryout:create",
        outcome: "success",
        reason: examId ? "Tryout exam updated by admin" : "Tryout exam created by admin",
        after: {
          title: data.title,
          status: data.status,
          timeLimitMinutes: data.timeLimitMinutes,
          maxAttempts: data.maxAttempts,
        },
      }, tx);
    });
  } catch (err: any) {
    await recordTutorMutationAuditSafe({
      ...auditBase,
      action: examId ? "tryout:update" : "tryout:create",
      outcome: "failed",
      reason: err?.message || "Failed to persist tryout exam",
    });
    throw err;
  }

  revalidatePath(`/tutor/${courseId}/tryouts`);
  revalidatePath(`/courses/${courseId}/tryout`);
  return { success: true, id: targetId };
}

export async function deleteTryoutAction(courseId: string, examId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new Error("Unauthorized: Silakan masuk terlebih dahulu.");
  }

  const { roles, isAdmin } = await resolveActorRoles(
    session.user.id,
    (session.user as { role?: string | null }).role,
  );

  if (!isAdmin) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId,
      entityType: "exam",
      entityId: examId,
      entityVersion: 1,
      action: "tryout:delete",
      outcome: "rejected",
      reason: TUTOR_CAPABILITY_ERRORS.TRYOUT_AUTHORING_DISABLED,
    });
    throw new Error(TUTOR_CAPABILITY_ERRORS.TRYOUT_AUTHORING_DISABLED);
  }

  const requestId = newAuditRequestId();
  try {
    await db.transaction(async (tx) => {
      const [existingExam] = await tx
        .select()
        .from(exams)
        .where(eq(exams.id, examId))
        .limit(1);

      await tx.delete(questions).where(eq(questions.examId, examId));
      await tx.delete(exams).where(eq(exams.id, examId));

      await recordTutorMutationAudit({
        actorId: session.user.id,
        actorRoles: roles,
        courseId,
        entityType: "exam",
        entityId: examId,
        entityVersion: 1,
        requestId,
        action: "tryout:delete",
        outcome: "success",
        reason: "Tryout exam deleted by admin",
        before: existingExam ? { id: examId, title: existingExam.title } : { id: examId },
      }, tx);
    });
  } catch (err: any) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId,
      entityType: "exam",
      entityId: examId,
      entityVersion: 1,
      requestId,
      action: "tryout:delete",
      outcome: "failed",
      reason: err?.message || "Failed to delete tryout exam",
    });
    throw err;
  }

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
  },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new Error("Unauthorized: Silakan masuk terlebih dahulu.");
  }

  const { roles, isAdmin } = await resolveActorRoles(
    session.user.id,
    (session.user as { role?: string | null }).role,
  );

  if (!isAdmin) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId,
      entityType: "question",
      entityId: questionId || `que-exam-${examId}`,
      entityVersion: 1,
      action: questionId ? "tryout_question:update" : "tryout_question:create",
      outcome: "rejected",
      reason: TUTOR_CAPABILITY_ERRORS.TRYOUT_AUTHORING_DISABLED,
    });
    throw new Error(TUTOR_CAPABILITY_ERRORS.TRYOUT_AUTHORING_DISABLED);
  }

  const targetId = questionId || `que-tutor-${randomUUID()}`;
  let existingProvenance = normalizeQuestionProvenance(null);
  if (questionId) {
    const [existingQuestion] = await db
      .select({ examId: questions.examId, content: questions.content })
      .from(questions)
      .where(eq(questions.id, questionId))
      .limit(1);
    if (!existingQuestion || existingQuestion.examId !== examId) {
      const reason = "Soal tryout tidak ditemukan.";
      await recordTutorFailureAudit({
        actorId: session.user.id,
        actorRoles: roles,
        courseId,
        entityType: "question",
        entityId: questionId,
        entityVersion: 1,
        action: "tryout_question:update",
        outcome: "rejected",
        requestId: newAuditRequestId(),
        reason,
      });
      throw new Error(reason);
    }
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

  const requestId = newAuditRequestId();
  const auditBase = {
    actorId: session.user.id,
    actorRoles: roles,
    courseId,
    entityType: "question",
    entityId: targetId,
    entityVersion: 1,
    requestId,
  } as const;

  try {
    await db.transaction(async (tx) => {
      if (questionId) {
        await tx
          .update(questions)
          .set({
            type: data.type,
            order: data.order,
            content: content,
          })
          .where(eq(questions.id, questionId));
      } else {
        await tx.insert(questions).values({
          id: targetId,
          examId,
          type: data.type,
          order: data.order,
          content: content,
        });
      }

      await recordTutorMutationAudit({
        ...auditBase,
        action: questionId ? "tryout_question:update" : "tryout_question:create",
        outcome: "success",
        reason: questionId ? "Tryout question updated by admin" : "Tryout question created by admin",
        after: {
          examId,
          type: data.type,
          order: data.order,
        },
      }, tx);
    });
  } catch (err: any) {
    await recordTutorMutationAuditSafe({
      ...auditBase,
      action: questionId ? "tryout_question:update" : "tryout_question:create",
      outcome: "failed",
      reason: err?.message || "Failed to persist tryout question",
    });
    throw err;
  }

  revalidatePath(`/tutor/${courseId}/tryouts`);
  return { success: true, id: targetId };
}

export async function importQuestionBankToTryoutAction(
  courseId: string,
  examId: string,
  questionBankIds: string[],
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new Error("Unauthorized: Silakan masuk terlebih dahulu.");
  }

  const { roles, isAdmin } = await resolveActorRoles(
    session.user.id,
    (session.user as { role?: string | null }).role,
  );

  if (!isAdmin) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId,
      entityType: "question",
      entityId: examId,
      entityVersion: 1,
      action: "tryout_question:import",
      outcome: "rejected",
      reason: TUTOR_CAPABILITY_ERRORS.TRYOUT_AUTHORING_DISABLED,
    });
    throw new Error(TUTOR_CAPABILITY_ERRORS.TRYOUT_AUTHORING_DISABLED);
  }

  const uniqueIds = [...new Set(questionBankIds)];
  if (uniqueIds.length === 0) {
    const reason = "Pilih minimal satu soal dari bank soal.";
    await recordTutorFailureAudit({
      actorId: session.user.id,
      actorRoles: roles,
      courseId,
      entityType: "question",
      entityId: examId,
      entityVersion: 1,
      action: "tryout_question:import",
      outcome: "rejected",
      requestId: newAuditRequestId(),
      reason,
    });
    throw new Error(reason);
  }

  const [exam] = await db
    .select({ id: exams.id, courseId: exams.courseId, type: exams.type })
    .from(exams)
    .where(eq(exams.id, examId))
    .limit(1);

  const [canonicalCourse] = await db
    .select({ id: mataKuliah.id, legacyCourseId: mataKuliah.legacyCourseId })
    .from(mataKuliah)
    .where(or(eq(mataKuliah.id, courseId), eq(mataKuliah.legacyCourseId, courseId)))
    .limit(1);

  const candidateCourseIds = [courseId];
  if (canonicalCourse?.id && !candidateCourseIds.includes(canonicalCourse.id)) {
    candidateCourseIds.push(canonicalCourse.id);
  }
  if (canonicalCourse?.legacyCourseId && !candidateCourseIds.includes(canonicalCourse.legacyCourseId)) {
    candidateCourseIds.push(canonicalCourse.legacyCourseId);
  }

  if (!exam || !candidateCourseIds.includes(exam.courseId) || exam.type !== "tryout") {
    const reason = "Tryout tidak ditemukan.";
    await recordTutorFailureAudit({
      actorId: session.user.id,
      actorRoles: roles,
      courseId,
      entityType: "question",
      entityId: examId,
      entityVersion: 1,
      action: "tryout_question:import",
      outcome: "rejected",
      requestId: newAuditRequestId(),
      reason,
    });
    throw new Error(reason);
  }

  const [bankRows, existingQuestions] = await Promise.all([
    db
      .select()
      .from(aiQuestionBank)
      .where(
        and(
          inArray(aiQuestionBank.courseId, candidateCourseIds),
          eq(aiQuestionBank.reviewStatus, "published"),
          inArray(aiQuestionBank.id, uniqueIds),
        ),
      ),
    db
      .select({ content: questions.content, order: questions.order })
      .from(questions)
      .where(eq(questions.examId, examId)),
  ]);
  if (bankRows.length !== uniqueIds.length) {
    const reason = "Sebagian soal bank tidak tersedia atau belum dipublikasi.";
    await recordTutorFailureAudit({
      actorId: session.user.id,
      actorRoles: roles,
      courseId,
      entityType: "question",
      entityId: examId,
      entityVersion: 1,
      action: "tryout_question:import",
      outcome: "rejected",
      requestId: newAuditRequestId(),
      reason,
    });
    throw new Error(reason);
  }

  const importedIds = new Set(
    existingQuestions.flatMap((question) => {
      const content = typeof question.content === "string" ? JSON.parse(question.content) : question.content;
      return typeof content?.bankQuestionId === "string" ? [content.bankQuestionId] : [];
    }),
  );
  const rowsToImport = uniqueIds
    .map((qId) => bankRows.find((row) => row.id === qId)!)
    .filter((row) => !importedIds.has(row.id));
  const firstOrder =
    existingQuestions.reduce((highest, question) => Math.max(highest, question.order), 0) + 1;

  const requestId = newAuditRequestId();
  try {
    await db.transaction(async (tx) => {
      if (rowsToImport.length > 0) {
        await tx.insert(questions).values(
          rowsToImport.map((row, index) => ({
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
          })),
        );
      }

      await recordTutorMutationAudit(
        {
          actorId: session.user.id,
          actorRoles: roles,
          courseId,
          entityType: "question",
          entityId: examId,
          entityVersion: 1,
          requestId,
          action: "tryout_question:import",
          outcome: "success",
          reason: "Question bank items imported to tryout by admin",
          after: {
            examId,
            importedCount: rowsToImport.length,
            skippedCount: uniqueIds.length - rowsToImport.length,
          },
        },
        tx,
      );
    });
  } catch (err: any) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId,
      entityType: "question",
      entityId: examId,
      entityVersion: 1,
      requestId,
      action: "tryout_question:import",
      outcome: "failed",
      reason: err?.message || "Failed to import questions to tryout",
    });
    throw err;
  }

  revalidatePath(`/tutor/${courseId}/tryouts`);
  revalidatePath(`/courses/${courseId}/tryout/${examId}`);
  return {
    success: true,
    imported: rowsToImport.length,
    skipped: uniqueIds.length - rowsToImport.length,
  };
}

export async function deleteTryoutQuestionAction(courseId: string, questionId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new Error("Unauthorized: Silakan masuk terlebih dahulu.");
  }

  const { roles, isAdmin } = await resolveActorRoles(
    session.user.id,
    (session.user as { role?: string | null }).role,
  );

  if (!isAdmin) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId,
      entityType: "question",
      entityId: questionId,
      entityVersion: 1,
      action: "tryout_question:delete",
      outcome: "rejected",
      reason: TUTOR_CAPABILITY_ERRORS.TRYOUT_AUTHORING_DISABLED,
    });
    throw new Error(TUTOR_CAPABILITY_ERRORS.TRYOUT_AUTHORING_DISABLED);
  }

  const requestId = newAuditRequestId();
  try {
    await db.transaction(async (tx) => {
      await tx.delete(questions).where(eq(questions.id, questionId));

      await recordTutorMutationAudit(
        {
          actorId: session.user.id,
          actorRoles: roles,
          courseId,
          entityType: "question",
          entityId: questionId,
          entityVersion: 1,
          requestId,
          action: "tryout_question:delete",
          outcome: "success",
          reason: "Tryout question deleted by admin",
          before: { id: questionId },
        },
        tx,
      );
    });
  } catch (err: any) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId,
      entityType: "question",
      entityId: questionId,
      entityVersion: 1,
      requestId,
      action: "tryout_question:delete",
      outcome: "failed",
      reason: err?.message || "Failed to delete tryout question",
    });
    throw err;
  }

  revalidatePath(`/tutor/${courseId}/tryouts`);
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// GRADING & SUBMISSIONS (Course-scoped Tryout Grading)
// ─────────────────────────────────────────────────────────────────────────────

export async function submitTryoutAction(courseId: string, examId: string, answers: any) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new Error("Unauthorized: Silakan masuk terlebih dahulu.");
  }

  const [examRecord] = await db.select().from(exams).where(eq(exams.id, examId)).limit(1);
  if (!examRecord) throw new Error("Tryout tidak ditemukan.");

  const [canonicalCourse] = await db
    .select({ id: mataKuliah.id, legacyCourseId: mataKuliah.legacyCourseId })
    .from(mataKuliah)
    .where(or(eq(mataKuliah.id, courseId), eq(mataKuliah.legacyCourseId, courseId)))
    .limit(1);

  const canonicalId = canonicalCourse?.id ?? courseId;
  const legacyId = canonicalCourse?.legacyCourseId ?? courseId;

  if (!checkCourseMatch(examRecord.courseId, canonicalId, legacyId) || examRecord.type !== "tryout") {
    throw new Error("Tryout tidak sesuai dengan kelas.");
  }

  const { isAdmin } = await resolveActorRoles(
    session.user.id,
    (session.user as { role?: string | null }).role,
  );

  if (!isAdmin) {
    const enrollmentCourseIds = [courseId];
    if (canonicalCourse?.id && !enrollmentCourseIds.includes(canonicalCourse.id)) {
      enrollmentCourseIds.push(canonicalCourse.id);
    }
    if (canonicalCourse?.legacyCourseId && !enrollmentCourseIds.includes(canonicalCourse.legacyCourseId)) {
      enrollmentCourseIds.push(canonicalCourse.legacyCourseId);
    }

    const [enrollment] = await db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.userId, session.user.id),
          inArray(enrollments.courseId, enrollmentCourseIds),
          gt(enrollments.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!enrollment) {
      throw new Error("Pendaftaran kelas tidak aktif atau sudah berakhir.");
    }
  }

  if (examRecord.status !== "published") {
    throw new Error("Tryout belum dipublikasikan atau sudah ditutup.");
  }

  const now = new Date();
  if (examRecord.openAt && now < new Date(examRecord.openAt)) {
    throw new Error("Tryout belum dibuka.");
  }
  if (examRecord.closeAt && now > new Date(examRecord.closeAt)) {
    throw new Error("Tryout sudah ditutup.");
  }

  const settings = typeof examRecord.settings === "string"
    ? JSON.parse(examRecord.settings)
    : (examRecord.settings as Record<string, any> | null);
  const maxAttempts = settings?.maxAttempts;

  const dbQuestions = await db
    .select()
    .from(questions)
    .where(eq(questions.examId, examId))
    .orderBy(asc(questions.order));

  const hasEssay = dbQuestions.some((q) => q.type === "essay");
  const status = hasEssay ? "pending_review" : "completed";

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
  const score = hasEssay ? null : autoGradedScore;

  const submissionId = `sub-tutor-${randomUUID()}`;

  let attemptNumber = 1;
  const maxSubmitRetries = 6;
  for (let retry = 0; retry < maxSubmitRetries; retry++) {
    try {
      await db.transaction(async (tx) => {
        const [attemptsResult] = await tx
          .select({ count: sql<number>`count(*)` })
          .from(submissions)
          .where(
            and(
              eq(submissions.userId, session.user.id),
              eq(submissions.examId, examId),
            ),
          );
        const attemptCount = Number(attemptsResult?.count ?? 0);
        if (typeof maxAttempts === "number" && maxAttempts > 0 && attemptCount >= maxAttempts) {
          throw new Error("Batas maksimum percobaan tryout telah tercapai.");
        }

        attemptNumber = attemptCount + 1;
        if (typeof maxAttempts === "number" && maxAttempts > 0 && attemptNumber > maxAttempts) {
          throw new Error("Batas maksimum percobaan tryout telah tercapai.");
        }

        await tx.insert(submissions).values({
          id: submissionId,
          userId: session.user.id,
          examId: examId,
          status: status,
          score: score,
          answersSnapshot: answers,
          questionsSnapshot: questionsSnapshot,
          submittedAt: new Date(),
          attemptNumber,
        });
      });
      break;
    } catch (err: any) {
      const isRetryable = isUniqueConstraintError(err) || isSqliteBusyError(err);
      if (isRetryable && retry < maxSubmitRetries - 1) {
        const jitter = Math.floor(Math.random() * 20);
        await new Promise((resolve) => setTimeout(resolve, 15 * 2 ** retry + jitter));
        continue;
      }
      if (isUniqueConstraintError(err)) {
        throw new Error("Batas maksimum percobaan tryout telah tercapai.");
      }
      throw err;
    }
  }

  revalidatePath(`/courses/${courseId}/my-results`);
  return { success: true, submissionId };
}

export async function gradeSubmissionAction(
  courseId: string,
  submissionId: string,
  score: number,
  teacherNotes: string,
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new Error("Unauthorized: Silakan masuk terlebih dahulu.");
  }

  const { roles, isAdmin } = await resolveActorRoles(
    session.user.id,
    (session.user as { role?: string | null }).role,
  );

  let access;
  try {
    access = await requireTutorCourseAccess(session.user.id, courseId, { allowAdmin: isAdmin });
  } catch (err: any) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId,
      entityType: "submission",
      entityId: submissionId,
      entityVersion: 1,
      action: "submission:grade",
      outcome: "rejected",
      reason: err?.message || TUTOR_CAPABILITY_ERRORS.ACCESS_DENIED,
    });
    throw err;
  }

  const gradingInput = z
    .object({
      score: z.number().min(0).max(100),
      teacherNotes: z.string().max(4000).optional(),
    })
    .safeParse({ score, teacherNotes });
  if (!gradingInput.success) {
    const validationError = `Validasi gagal: ${formatValidationIssues(gradingInput.error)}`;
    await recordTutorFailureAudit({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: access.courseId ?? courseId,
      entityType: "submission",
      entityId: submissionId,
      entityVersion: 1,
      action: "submission:grade",
      outcome: "rejected",
      requestId: newAuditRequestId(),
      reason: validationError,
    });
    throw new Error(validationError);
  }

  const [submissionWithExam] = await db
    .select({
      id: submissions.id,
      status: submissions.status,
      score: submissions.score,
      examId: submissions.examId,
      examCourseId: exams.courseId,
      examType: exams.type,
    })
    .from(submissions)
    .innerJoin(exams, eq(submissions.examId, exams.id))
    .where(eq(submissions.id, submissionId))
    .limit(1);

  if (!submissionWithExam) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: access.courseId ?? courseId,
      entityType: "submission",
      entityId: submissionId,
      entityVersion: 1,
      action: "submission:grade",
      outcome: "rejected",
      reason: TUTOR_CAPABILITY_ERRORS.SUBMISSION_NOT_FOUND,
    });
    throw new Error(TUTOR_CAPABILITY_ERRORS.SUBMISSION_NOT_FOUND);
  }

  const isCourseMatch = checkCourseMatch(
    submissionWithExam.examCourseId,
    access.courseId!,
    access.legacyCourseId,
  );

  if (!isCourseMatch) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: access.courseId ?? courseId,
      entityType: "submission",
      entityId: submissionId,
      entityVersion: 1,
      action: "submission:grade",
      outcome: "rejected",
      reason: TUTOR_CAPABILITY_ERRORS.GRADING_COURSE_MISMATCH,
    });
    throw new Error(TUTOR_CAPABILITY_ERRORS.GRADING_COURSE_MISMATCH);
  }

  if (submissionWithExam.examType !== "tryout") {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: access.courseId ?? courseId,
      entityType: "submission",
      entityId: submissionId,
      entityVersion: 1,
      action: "submission:grade",
      outcome: "rejected",
      reason: TUTOR_CAPABILITY_ERRORS.GRADING_NON_TRYOUT_FORBIDDEN,
    });
    throw new Error(TUTOR_CAPABILITY_ERRORS.GRADING_NON_TRYOUT_FORBIDDEN);
  }

  if (!isReviewableSubmissionStatus(submissionWithExam.status)) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: access.courseId ?? courseId,
      entityType: "submission",
      entityId: submissionId,
      entityVersion: 1,
      action: "submission:grade",
      outcome: "rejected",
      reason: TUTOR_CAPABILITY_ERRORS.GRADING_NOT_REVIEWABLE,
    });
    throw new Error(TUTOR_CAPABILITY_ERRORS.GRADING_NOT_REVIEWABLE);
  }

  const { beforeSnapshot, afterSnapshot } = buildGradingSnapshots(
    submissionWithExam,
    score,
    teacherNotes,
  );

  const requestId = newAuditRequestId();
  try {
    await db.transaction(async (tx) => {
      const updatedRows = await tx
        .update(submissions)
        .set({
          score,
          teacherNotes: teacherNotes || "",
          status: "graded",
        })
        .where(
          and(
            eq(submissions.id, submissionId),
            eq(submissions.status, submissionWithExam.status),
          ),
        )
        .returning({ id: submissions.id });

      if (updatedRows.length === 0) {
        throw new Error(TUTOR_CAPABILITY_ERRORS.GRADING_CONCURRENT_CONFLICT);
      }

      await recordTutorMutationAudit({
        actorId: session.user.id,
        actorRoles: roles,
        courseId: access.courseId ?? courseId,
        entityType: "submission",
        entityId: submissionId,
        entityVersion: 1,
        requestId,
        action: "submission:grade",
        outcome: "success",
        reason: "Tryout submission graded",
        before: beforeSnapshot,
        after: afterSnapshot,
      }, tx);
    });
  } catch (err: any) {
    await recordTutorMutationAuditSafe({
      actorId: session.user.id,
      actorRoles: roles,
      courseId: access.courseId ?? courseId,
      entityType: "submission",
      entityId: submissionId,
      entityVersion: 1,
      requestId,
      action: "submission:grade",
      outcome: "failed",
      reason: err?.message || "Failed to update submission",
      before: beforeSnapshot,
      after: afterSnapshot,
    });
    throw err;
  }

  revalidatePath(`/tutor/${courseId}/grading`);
  return { success: true };
}
