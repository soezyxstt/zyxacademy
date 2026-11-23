"use server";

import { headers } from "next/headers";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import {
  artikel,
  artikelIde,
  diktatIde,
  diktatMateri,
  mataKuliah,
  progress,
  submissions,
  websiteMaterials,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { eq, and, or } from "drizzle-orm";
import { recordLearningEvent } from "@/lib/learning-events";
import { inngest } from "@/lib/inngest";
import { redeemGroupToken } from "@/lib/groups/redeem-token";
import { listStudentEnrollments, resolveStudentCourse } from "@/lib/student/course-catalog";
import { getStudentMaterialAccess, isFreeChapterScoped } from "@/lib/course-utils";
import { resolveCourseAccess } from "@/lib/student/course-access";
import { recordLearningEvidence } from "@/lib/pemahaman/evidence";
import { requireAuthUser } from "@/lib/auth-session";

async function requireUser() {
  return requireAuthUser();
}

/**
 * Get active enrollments for the logged in student
 */
export async function getStudentEnrollments(expectedUserId?: string) {
  const user = await requireUser();
  if (expectedUserId && expectedUserId !== user.id) throw new Error("ACCOUNT_CHANGED");
  return listStudentEnrollments(user.id);
}

/**
 * Enroll in a course using a token
 */
export async function enrollWithToken(tokenStr: string) {
  const user = await requireUser();
  const errors = {
    empty: "Token tidak boleh kosong",
    invalid: "Token tidak valid",
    alreadyMember: "Anda sudah terdaftar menggunakan token ini",
    capacityReached: "Token ini sudah mencapai batas kuota kelompok",
    expired: "Token sudah kedaluwarsa untuk semester ini",
    noCourses: "Token tidak memiliki course yang terasosiasi",
    alreadyEnrolled: "Anda sudah terdaftar di semua course yang diaktifkan oleh token ini",
  };

  try {
    const result = await redeemGroupToken(tokenStr, user.id, "dashboard");
    if (result.success) return { success: true };
    return { ...result, error: errors[result.errorCode] };
  } catch (error) {
    console.error("Failed to redeem enrollment token:", error instanceof Error ? error.name : "UnknownError");
    return { success: false, errorCode: "internal", error: "Terjadi kesalahan internal. Silakan coba lagi." };
  }
}

/**
 * Get progress records for a student
 */
export async function getMaterialsProgress() {
  const user = await requireUser();
  return db
    .select()
    .from(progress)
    .where(eq(progress.userId, user.id));
}

/**
 * Set progress status for a specific material
 */
export async function updateMaterialProgress(materialId: string, status: "in_progress" | "completed", expectedUserId?: string) {
  const user = await requireUser();
  if (expectedUserId && expectedUserId !== user.id) throw new Error("Account changed");
  const now = new Date();

  const [materialAccess, existing] = await Promise.all([
    getStudentMaterialAccess(user.id, materialId),
    db.query.progress.findFirst({
      where: and(
        eq(progress.userId, user.id),
        eq(progress.materialId, materialId)
      ),
    }),
  ]);
  if (!materialAccess) {
    throw new Error("MATERIAL_ACCESS_DENIED");
  }
  if (
    materialAccess.access.tier === "free" && !materialAccess.access.hasFullContentAccess
    && materialAccess.contentKind === "other"
  ) {
    throw new Error("MATERIAL_UPGRADE_REQUIRED");
  }
  if (
    materialAccess.access.tier === "free"
    && !isFreeChapterScoped(materialAccess.chapterIds, materialAccess.access.hasFullContentAccess ? materialAccess.access.policy.scopedChapterIds : materialAccess.access.freeChapterIds)
  ) {
    throw new Error("MATERIAL_UPGRADE_REQUIRED");
  }

  if (existing) {
    // If it is already completed, do not revert to in_progress
    if (existing.status === "completed" && status === "in_progress") {
      return { success: true };
    }

    await db
      .update(progress)
      .set({
        status,
        completedAt: status === "completed" ? now : existing.completedAt,
      })
      .where(eq(progress.id, existing.id));
  } else {
    await db.insert(progress).values({
      id: randomUUID(),
      userId: user.id,
      materialId,
      status,
      completedAt: status === "completed" ? now : null,
    });
  }

  // Fire learning event on completion
  if (status === "completed") {
    const [[legacyMaterial], [canonicalArticle], [canonicalDiktat]] = await Promise.all([
      db
        .select({ courseId: websiteMaterials.courseId })
        .from(websiteMaterials)
        .where(eq(websiteMaterials.id, materialId))
        .limit(1),
      db
        .select({ courseId: artikel.mataKuliahId, legacyCourseId: mataKuliah.legacyCourseId })
        .from(artikel)
        .innerJoin(mataKuliah, eq(artikel.mataKuliahId, mataKuliah.id))
        .where(and(eq(artikel.id, materialId), eq(artikel.status, "published")))
        .limit(1),
      db
        .select({ courseId: diktatMateri.mataKuliahId, legacyCourseId: mataKuliah.legacyCourseId })
        .from(diktatMateri)
        .innerJoin(mataKuliah, eq(diktatMateri.mataKuliahId, mataKuliah.id))
        .where(and(eq(diktatMateri.id, materialId), eq(diktatMateri.status, "published")))
        .limit(1),
    ]);
    const resolvedCanonicalArticle = legacyMaterial ? undefined : canonicalArticle;
    const resolvedCanonicalDiktat = legacyMaterial || resolvedCanonicalArticle ? undefined : canonicalDiktat;
    const courseId = legacyMaterial?.courseId
      ?? resolvedCanonicalArticle?.legacyCourseId
      ?? resolvedCanonicalArticle?.courseId
      ?? resolvedCanonicalDiktat?.legacyCourseId
      ?? resolvedCanonicalDiktat?.courseId;

    if (courseId) {
      const recomputePromise = inngest
        .send({
          name: "mastery/recompute.requested",
          data: { studentId: user.id, courseId },
        })
        .catch((err) => {
          console.error("Failed to trigger mastery recompute:", err);
        });

      await Promise.all([
        recordLearningEvent({
          studentId: user.id,
          courseId,
          eventType: "material_completed",
        }),
        recomputePromise,
      ]);
    }

    const ideaLinks = resolvedCanonicalArticle
      ? await db.select({ ideId: artikelIde.ideId, weight: artikelIde.weight }).from(artikelIde).where(eq(artikelIde.artikelId, materialId))
      : resolvedCanonicalDiktat
        ? await db.select({ ideId: diktatIde.ideId, weight: diktatIde.weight }).from(diktatIde).where(eq(diktatIde.diktatMateriId, materialId))
        : [];
    await Promise.all(ideaLinks.map((link) => recordLearningEvidence({
      penggunaId: user.id,
      ideId: link.ideId,
      evidenceSource: "material_completed",
      sourceId: materialId,
      scoreContribution: 0.65 * link.weight,
      confidence: 60,
      derivationStatus: "deterministic",
      affectsMastery: true,
      occurredAt: now,
    })));
  }

  // Update user last activity
  const h = await headers();
  await auth.api.updateUser({
    headers: h,
    body: {
      lastActivityAt: now,
    }
  });

  return { success: true };
}

/**
 * Get exam submissions for a student
 */
export async function getStudentSubmissions() {
  const user = await requireUser();
  return db
    .select()
    .from(submissions)
    .where(eq(submissions.userId, user.id));
}

/**
 * Check if the student is actively enrolled in a specific course
 */
export async function checkFullCourseContentAccess(courseId: string): Promise<boolean> {
  let user;
  try {
    user = await requireUser();
  } catch {
    return false;
  }

  const access = await resolveCourseAccess({
    courseId,
    userId: user.id,
    roleHint: (user as { role?: string | null }).role,
  });
  return access.hasFullContentAccess;
}

export async function checkEnrollment(courseId: string): Promise<boolean> {
  let user;
  try { user = await requireUser(); } catch { return false; }
  const access = await resolveCourseAccess({ courseId, userId: user.id });
  return access.hasCourseAccess && (access.isEnrolled || access.tier === "staff");
}

/**
 * Get today's trivia question for a course from the AI Question Bank
 */
export async function getDailyTrivia(courseId: string) {
  try {
    const { aiQuestionBank, soal, soalIde, ide, petaIdLegacy, knowledgeObjects } = await import("@/db/schema");
    const { validateDailyTriviaCandidate, selectDailyTrivia } = await import("@/lib/daily-trivia");
    const course = await resolveStudentCourse(courseId);
    const questionCourseId = course?.legacyId ?? courseId;
    const [activeQuestions, canonicalAnchors, validKnowledgeObjects] = await Promise.all([
      db
        .select()
        .from(aiQuestionBank)
        .where(
          and(
            eq(aiQuestionBank.courseId, questionCourseId),
            eq(aiQuestionBank.status, "active"),
            eq(aiQuestionBank.reviewStatus, "published"),
            or(
              eq(aiQuestionBank.origin, "zyx_original"),
              eq(aiQuestionBank.origin, "itb_example"),
              eq(aiQuestionBank.quizEligible, true),
            ),
          )
        ),
      course?.canonicalId
        ? db.select({ questionId: petaIdLegacy.legacyId }).from(soal)
            .innerJoin(soalIde, eq(soalIde.soalId, soal.id))
            .innerJoin(ide, and(eq(ide.id, soalIde.ideId), eq(ide.status, "published")))
            .innerJoin(
              petaIdLegacy,
              and(
                eq(petaIdLegacy.targetId, soal.id),
                eq(petaIdLegacy.legacyTable, "ai_question_bank"),
                eq(petaIdLegacy.targetTable, "soal"),
              ),
            )
            .where(and(eq(soal.mataKuliahId, course.canonicalId), eq(soal.status, "published")))
        : Promise.resolve([]),
      db
        .select({ id: knowledgeObjects.id })
        .from(knowledgeObjects)
        .where(eq(knowledgeObjects.courseId, questionCourseId)),
    ]);

    if (activeQuestions.length === 0) return null;
    const anchoredIds = new Set(canonicalAnchors.map((row) => row.questionId));
    const validKnowledgeObjectIds = new Set(validKnowledgeObjects.map((row) => row.id));
    const eligible = activeQuestions.flatMap((question) => {
      const validated = validateDailyTriviaCandidate(
        {
          ...question,
          knowledgeObjectId: question.knowledgeObjectId && validKnowledgeObjectIds.has(question.knowledgeObjectId)
            ? question.knowledgeObjectId
            : null,
        },
        anchoredIds.has(question.id),
      );
      return validated ? [validated] : [];
    });
    return selectDailyTrivia(eligible, course?.canonicalId ?? questionCourseId);
  } catch (error) {
    console.error("Failed to get daily trivia:", error);
    return null;
  }
}

/**
 * Fetch a course by ID (checks database and fallbacks to fixtures)
 */
export async function getCourseAction(courseId: string) {
  await requireUser();
  const { getCourse } = await import("@/lib/course-utils");
  return getCourse(courseId);
}
