"use server";

import { headers } from "next/headers";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import {
  artikel,
  artikelIde,
  diktatIde,
  diktatMateri,
  enrollments,
  enrollmentTokens,
  groupMembers,
  mataKuliah,
  progress,
  submissions,
  websiteMaterials,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { eq, and, or } from "drizzle-orm";
import { recordLearningEvent } from "@/lib/learning-events";
import { inngest } from "@/lib/inngest";
import { getSemesterEndDate } from "@/lib/utils";
import { dualWriteEnrollment } from "@/lib/migrasi/repository-kompatibilitas";
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
  const cleanToken = tokenStr.trim();
  const now = new Date();

  if (!cleanToken) {
    return { success: false, errorCode: "empty", error: "Token tidak boleh kosong" };
  }

  // 1. Find token in DB
  const tokenRecord = await db.query.enrollmentTokens.findFirst({
    where: eq(enrollmentTokens.token, cleanToken),
    with: {
      tokenCourses: true,
      group: {
        with: {
          members: true,
        },
      },
    },
  });

  if (!tokenRecord) {
    return { success: false, errorCode: "invalid", error: "Token tidak valid" };
  }

  // 2. Check if user is already a member of the group
  const isAlreadyMember = tokenRecord.group?.members.some(
    (m) => m.userId === user.id
  );
  if (isAlreadyMember) {
    return { success: false, errorCode: "alreadyMember", error: "Anda sudah terdaftar menggunakan token ini" };
  }

  // 3. Check if group capacity is reached
  const currentMemberCount = tokenRecord.group?.members.length || 0;
  if (currentMemberCount >= tokenRecord.capacity) {
    return { success: false, errorCode: "capacityReached", error: "Token ini sudah mencapai batas kuota kelompok" };
  }

  // 4. Check if token itself is expired
  if (tokenRecord.expiresAt < now) {
    return { success: false, errorCode: "expired", error: "Token sudah kedaluwarsa untuk semester ini" };
  }

  // 5. Get course IDs associated with this token
  const courseIds = tokenRecord.tokenCourses.map((tc) => tc.courseId);
  if (courseIds.length === 0) {
    return { success: false, errorCode: "noCourses", error: "Token tidak memiliki course yang terasosiasi" };
  }

  // 6. Check if student is already enrolled in any of these courses active
  const activeEnrollments = await listStudentEnrollments(user.id);
  const enrolledCourseIds = new Set(activeEnrollments.map((enrollment) => enrollment.id));
  const coursesToEnroll = courseIds.filter((cid) => !enrolledCourseIds.has(cid));

  if (coursesToEnroll.length === 0) {
    return { success: false, errorCode: "alreadyEnrolled", error: "Anda sudah terdaftar di semua course yang diaktifkan oleh token ini" };
  }

  // 7. Calculate enrollment semester closing date
  const expiresAt = getSemesterEndDate(now);

  try {
    await db.transaction(async (tx) => {
      // Add user to the group members
      await tx.insert(groupMembers).values({
        id: randomUUID(),
        groupId: tokenRecord.groupId,
        userId: user.id,
        joinedAt: now,
      });

      // Enroll in each course the user is not yet enrolled in
      for (const courseId of coursesToEnroll) {
        const enrollmentId = randomUUID();
        await tx.insert(enrollments).values({
          id: enrollmentId,
          userId: user.id,
          courseId,
          enrolledAt: now,
          expiresAt: expiresAt,
        });
        await dualWriteEnrollment(tx, {
          id: enrollmentId,
          userId: user.id,
          courseId,
          enrolledAt: now,
          expiresAt,
        }, user.id);
      }
    });

    return { success: true };
  } catch (err: any) {
    console.error("Failed to enroll via transaction:", err);
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
export async function updateMaterialProgress(materialId: string, status: "in_progress" | "completed") {
  const user = await requireUser();
  const now = new Date();

  const materialAccess = await getStudentMaterialAccess(user.id, materialId);
  if (!materialAccess) {
    throw new Error("MATERIAL_ACCESS_DENIED");
  }
  if (
    materialAccess.access.tier === "free"
    && materialAccess.contentKind === "other"
  ) {
    throw new Error("MATERIAL_UPGRADE_REQUIRED");
  }
  if (
    materialAccess.access.tier === "free"
    && !isFreeChapterScoped(materialAccess.chapterIds, materialAccess.access.freeChapterIds)
  ) {
    throw new Error("MATERIAL_UPGRADE_REQUIRED");
  }

  // Find if progress record already exists
  const existing = await db.query.progress.findFirst({
    where: and(
      eq(progress.userId, user.id),
      eq(progress.materialId, materialId)
    ),
  });

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
    const [legacyMaterial] = await db
      .select({ courseId: websiteMaterials.courseId })
      .from(websiteMaterials)
      .where(eq(websiteMaterials.id, materialId))
      .limit(1);
    const [canonicalArticle] = legacyMaterial
      ? []
      : await db
          .select({ courseId: artikel.mataKuliahId, legacyCourseId: mataKuliah.legacyCourseId })
          .from(artikel)
          .innerJoin(mataKuliah, eq(artikel.mataKuliahId, mataKuliah.id))
          .where(and(eq(artikel.id, materialId), eq(artikel.status, "published")))
          .limit(1);
    const [canonicalDiktat] = legacyMaterial || canonicalArticle
      ? []
      : await db
          .select({ courseId: diktatMateri.mataKuliahId, legacyCourseId: mataKuliah.legacyCourseId })
          .from(diktatMateri)
          .innerJoin(mataKuliah, eq(diktatMateri.mataKuliahId, mataKuliah.id))
          .where(and(eq(diktatMateri.id, materialId), eq(diktatMateri.status, "published")))
          .limit(1);
    const courseId = legacyMaterial?.courseId
      ?? canonicalArticle?.legacyCourseId
      ?? canonicalArticle?.courseId
      ?? canonicalDiktat?.legacyCourseId
      ?? canonicalDiktat?.courseId;

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

    const ideaLinks = canonicalArticle
      ? await db.select({ ideId: artikelIde.ideId, weight: artikelIde.weight }).from(artikelIde).where(eq(artikelIde.artikelId, materialId))
      : canonicalDiktat
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
export async function checkEnrollment(courseId: string): Promise<boolean> {
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
  return access.hasCourseAccess && (access.tier === "enrolled" || access.tier === "staff");
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
    const activeQuestions = await db
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
      );

    if (activeQuestions.length === 0) return null;
    const canonicalAnchors = course?.canonicalId
      ? await db.select({ questionId: petaIdLegacy.legacyId }).from(soal)
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
      : [];
    const anchoredIds = new Set(canonicalAnchors.map((row) => row.questionId));
    const validKnowledgeObjects = await db
      .select({ id: knowledgeObjects.id })
      .from(knowledgeObjects)
      .where(eq(knowledgeObjects.courseId, questionCourseId));
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
