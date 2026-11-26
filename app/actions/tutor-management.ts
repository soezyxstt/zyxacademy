"use server";

import { recordStaffCourseDisclosures } from "@/lib/gamification/question-exposure";
import { submitStudentTryout } from "@/lib/student/tryout-submit";

import { db } from "@/db";
import {
  aiMaterialInstances,
  aiMaterialInstanceSections,
  aiMaterialInstanceChunks,
  quizTemplates,
  aiQuestionBank,
  exams,
  questions,
  mataKuliah,
} from "@/db/schema";
import { eq, and, inArray, asc, or, sql, notInArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { randomUUID } from "crypto";
import { z } from "zod";
import { rejectQuestionVisualReferences } from "@/lib/authoring/question-visual-references";
import { parseMaterialIntoSections } from "@/lib/ingestion-parser";
import { revalidatePath } from "next/cache";
import { revisionOf } from "@/lib/admin-mcp/revision";
import { notifyQuizPublishedBestEffort } from "@/lib/notifications/send";
import { deleteTryoutRecord, lockTryoutExam, saveTryoutQuestionRecord, saveTryoutRecord, tryoutBankQuestionId, type TryoutQuestionFields } from "@/lib/tutor/tryout-authoring";
import { buildTryoutBankSnapshot } from "@/lib/tutor/tryout-bank-snapshot";
import {
  createAssessmentWithLegacyProjection,
  updateAssessmentWithLegacyProjection,
  deleteAssessmentWithLegacyProjection,
} from "@/lib/asesmen/quiz-canonical-sync";
import { requireTutorCourseAccess } from "@/lib/auth/tutor-access";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";
import {
  TUTOR_CAPABILITY_ERRORS,
  resolveActorRoles,
  resolveEffectiveAssessmentType,
  assertTutorQuizCapability,
  checkCourseMatch,
  recordTutorFailureAudit,
  recordTutorMutationAuditSafe,
} from "@/lib/tutor/assessment-policy";
import { recordTutorMutationAudit } from "@/lib/audit/mutasi";
import { questionBankInputSchema, QuestionBankWriteError, writeQuestionBankRecord, type QuestionBankFields } from "@/lib/tutor/question-bank-write";
import { gradeTryoutSubmission } from "@/lib/tutor/tryout-grading";

function publishedQuizQuestionCondition() {
  return and(
    eq(aiQuestionBank.reviewStatus, "published"),
    or(
      eq(aiQuestionBank.origin, "zyx_original"),
      eq(aiQuestionBank.origin, "itb_example"),
      eq(aiQuestionBank.quizEligible, true),
    ),
  );
}

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
  const identity = await resolveCourseIdentity(courseId);
  const legacyCourseId = identity?.legacyId;
  if (!legacyCourseId) throw new Error("COURSE_LEGACY_MAPPING_REQUIRED");
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
        courseId: legacyCourseId,
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
  const { access, session } = await verifyTutorAccess(courseId);

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
          publishedQuizQuestionCondition(),
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
      (tag) => sql`exists (select 1 from jsonb_array_elements_text(${aiQuestionBank.tags}::jsonb) as tag_value where tag_value = ${tag})`
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
              publishedQuizQuestionCondition(),
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
            publishedQuizQuestionCondition(),
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

  await db.transaction(tx => recordStaffCourseDisclosures(tx, { userId: session.user.id, courseId, questionIds: mappedQuestions.map(q => q.id), contextId: `template-preview:${templateId}`, requestId: randomUUID() }));
  return { success: true, questions: mappedQuestions };
}

export async function saveQuestionBankAction(courseId: string, questionId: string | null, data: QuestionBankFields) {
  const context = await verifyTutorAccess(courseId);
  rejectQuestionVisualReferences([{ prompt: typeof data?.prompt === "string" ? data.prompt : "", options: Array.isArray(data?.options) ? data.options.filter((value): value is string => typeof value === "string") : [], explanation: typeof data?.explanation === "string" ? data.explanation : "" }]);
  const parsed = questionBankInputSchema.safeParse(data);
  const id = questionId || `qbk-tutor-${randomUUID()}`;
  const mutation = questionId ? "update" : "create";
  await writeWebQuestionBank(courseId, context, mutation, id, parsed.success ? parsed.data : null,
    parsed.success ? undefined : `Validasi gagal: ${formatValidationIssues(parsed.error)}`);
  return { success: true, id };
}

export async function deleteQuestionBankAction(courseId: string, questionId: string) {
  await writeWebQuestionBank(courseId, await verifyTutorAccess(courseId), "delete", questionId, null);
  return { success: true };
}

async function writeWebQuestionBank(courseId: string, { session, access }: Awaited<ReturnType<typeof verifyTutorAccess>>,
  kind: "create" | "update" | "delete", id: string, data: QuestionBankFields | null, validationError?: string) {
  const { roles, isAdmin } = await resolveActorRoles(session.user.id, (session.user as { role?: string | null }).role);
  const audit = {
    actorId: session.user.id, actorRoles: roles, courseId: access.courseId ?? courseId,
    entityType: "question_bank", entityId: kind === "create" && validationError ? "new" : id,
    entityVersion: 1, action: `question_bank:${kind}`, requestId: newAuditRequestId(),
  } as const;

  if (validationError) {
    await recordTutorMutationAuditSafe({ ...audit, outcome: "rejected", reason: validationError });
    throw new Error(validationError);
  }
  const targetCourse = access.legacyCourseId ?? courseId;
  try {
    await db.transaction(async (tx) => {
      const { previous, current } = await writeQuestionBankRecord(tx, {
        id, courseId: targetCourse, allowedCourseIds: isAdmin ? undefined : [access.courseId!, targetCourse],
      }, kind === "delete" ? { kind } : { kind, data: data! });
      await recordTutorMutationAudit({
        ...audit, outcome: "success",
        reason: { create: "Question bank item created", update: "Question bank item updated", delete: "Question bank item deleted" }[kind],
        ...(kind === "delete" && previous ? { before: { id, prompt: previous.prompt } } : {}),
        ...(current ? { after: { prompt: current.prompt, difficulty: current.difficulty, questionType: current.questionType } } : {}),
      }, tx);
    });
  } catch (error) {
    const code = error instanceof QuestionBankWriteError ? error.code : null;
    const reason = code === "QUESTION_BANK_WRONG_COURSE" ? TUTOR_CAPABILITY_ERRORS.CROSS_COURSE_MUTATION_FORBIDDEN
      : code ?? (error instanceof Error ? error.message : "Failed to persist question bank item");
    await recordTutorMutationAuditSafe({ ...audit, outcome: code ? "rejected" : "failed", reason });
    if (code === "QUESTION_BANK_NOT_FOUND") throw new Error("Soal bank tidak ditemukan.");
    if (code === "QUESTION_BANK_WRONG_COURSE") throw new Error(reason);
    if (code === "HISTORICAL_QUESTION_IMMUTABLE") {
      throw new Error(`Soal referensi historis hanya dapat ditinjau, bukan ${kind === "delete" ? "dihapus" : "diedit"}.`);
    }
    throw error;
  }
  revalidatePath(`/tutor/${courseId}/quizzes`);
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
  const identity = await resolveCourseIdentity(courseId);
  const legacyCourseId = identity?.legacyId;
  if (!legacyCourseId) throw new Error("COURSE_LEGACY_MAPPING_REQUIRED");
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
      const previous = examId ? await lockTryoutExam(tx, legacyCourseId, examId) : null;
      if (examId && !previous) throw new Error("TRYOUT_NOT_FOUND");
      await saveTryoutRecord(tx, { id: targetId, legacyCourseId, previous }, data);

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

  const identity = await resolveCourseIdentity(courseId);
  const legacyCourseId = identity?.legacyId;
  if (!legacyCourseId) throw new Error("COURSE_LEGACY_MAPPING_REQUIRED");
  const requestId = newAuditRequestId();
  try {
    await db.transaction(async (tx) => {
      const existingExam = await lockTryoutExam(tx, legacyCourseId, examId);
      if (!existingExam) throw new Error("TRYOUT_NOT_FOUND");
      await deleteTryoutRecord(tx, existingExam);

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
        before: { id: examId, title: existingExam.title },
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
  data: TryoutQuestionFields,
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new Error("Unauthorized: Silakan masuk terlebih dahulu.");
  }
  rejectQuestionVisualReferences([{ prompt: data.prompt, options: data.options ?? [] }]);

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
  const identity = await resolveCourseIdentity(courseId);
  const legacyCourseId = identity?.legacyId;
  if (!legacyCourseId) throw new Error("COURSE_LEGACY_MAPPING_REQUIRED");

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
      const exam = await lockTryoutExam(tx, legacyCourseId, examId);
      if (!exam) throw new Error("TRYOUT_NOT_FOUND");
      await saveTryoutQuestionRecord(tx, { exam, id: targetId, updating: Boolean(questionId) }, data);

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
      outcome: err?.message === "TRYOUT_QUESTION_NOT_FOUND" ? "rejected" : "failed",
      reason: err?.message === "TRYOUT_QUESTION_NOT_FOUND" ? "Soal tryout tidak ditemukan." : err?.message || "Failed to persist tryout question",
    });
    if (err?.message === "TRYOUT_QUESTION_NOT_FOUND") throw new Error("Soal tryout tidak ditemukan.");
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

  const bankScope = and(
    inArray(aiQuestionBank.courseId, candidateCourseIds),
    publishedQuizQuestionCondition(),
    inArray(aiQuestionBank.id, uniqueIds),
  );
  const bankRows = await db.select().from(aiQuestionBank).where(bankScope);
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

  const existingQuestions = await db.select({ content: questions.content }).from(questions).where(eq(questions.examId, examId));
  const importedIds = new Set(existingQuestions.map((question) => tryoutBankQuestionId(question.content)));
  const rowsById = new Map(bankRows.map((row) => [row.id, row]));
  const candidates = uniqueIds.map((id) => rowsById.get(id)!);
  const snapshots = new Map<string, { bankRevision: string; content: Awaited<ReturnType<typeof buildTryoutBankSnapshot>> }>();
  async function buildSnapshot(row: typeof aiQuestionBank.$inferSelect) {
    try {
      return await buildTryoutBankSnapshot(exam.courseId, row);
    } catch (error) {
      if (error instanceof Error && error.message === "TRYOUT_BANK_VISUAL_UNVERIFIED") {
        throw new Error("Aset visual soal belum terverifikasi untuk mata kuliah tryout.");
      }
      throw error;
    }
  }
  for (const row of candidates) {
    if (!importedIds.has(row.id)) snapshots.set(row.id, { bankRevision: revisionOf(row), content: await buildSnapshot(row) });
  }

  const requestId = newAuditRequestId();
  let imported = 0;
  try {
    await db.transaction(async (tx) => {
      if (!await lockTryoutExam(tx, exam.courseId, examId)) throw new Error("TRYOUT_NOT_FOUND");
      const lockedBank = await tx.select().from(aiQuestionBank).where(bankScope).for("share");
      if (lockedBank.length !== uniqueIds.length) throw new Error("Sebagian soal bank tidak tersedia atau belum dipublikasi.");
      const lockedBankById = new Map(lockedBank.map((row) => [row.id, row]));
      const current = await tx.select({ content: questions.content, order: questions.order })
        .from(questions).where(eq(questions.examId, examId));
      const currentIds = new Set(current.map((question) => tryoutBankQuestionId(question.content)));
      const firstOrder = current.reduce((highest, question) => Math.max(highest, question.order), 0) + 1;
      const rowsToImport = uniqueIds.filter((id) => !currentIds.has(id)).map((id) => lockedBankById.get(id)!);
      if (rowsToImport.length) {
        const values = await Promise.all(rowsToImport.map(async (row, index) => {
          const preflight = snapshots.get(row.id);
          return {
            id: `que-bank-${randomUUID()}`, examId, type: row.questionType, order: firstOrder + index,
            content: preflight?.bankRevision === revisionOf(row) ? preflight.content : await buildSnapshot(row),
          };
        }));
        await tx.insert(questions).values(values);
      }
      imported = rowsToImport.length;

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
            importedCount: imported,
            skippedCount: uniqueIds.length - imported,
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
    imported,
    skipped: uniqueIds.length - imported,
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

export async function submitTryoutAction(courseId: string, examId: string, answers: Record<string, unknown>) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized: Silakan masuk terlebih dahulu.");
  const result = await submitStudentTryout({ courseId, examId, userId: session.user.id, answers });
  revalidatePath(`/courses/${courseId}/my-results`);
  return result;
}

export async function gradeSubmissionAction(
  courseId: string,
  submissionId: string,
  score: number,
  teacherNotes: string,
  expectedRevision?: string,
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new Error("Unauthorized: Silakan masuk terlebih dahulu.");
  }

  await gradeTryoutSubmission(
    { id: session.user.id, role: (session.user as { role?: string | null }).role },
    { courseId, submissionId, score, notes: teacherNotes ?? "", expectedRevision },
  );
  revalidatePath(`/tutor/${courseId}/grading`);
  return { success: true };
}
