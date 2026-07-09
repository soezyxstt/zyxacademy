"use server";

import { headers } from "next/headers";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { enrollments, enrollmentTokens, progress, courses, submissions, groupMembers, websiteMaterials } from "@/db/schema";
import { auth } from "@/lib/auth";
import { eq, and, gt } from "drizzle-orm";
import { recordLearningEvent } from "@/lib/learning-events";
import { inngest } from "@/lib/inngest";
import { getSemesterEndDate } from "@/lib/utils";

async function requireUser() {
  const h = await headers();
  const session = await auth.api.getSession({
    headers: h,
  });
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  return session.user;
}

/**
 * Get active enrollments for the logged in student
 */
export async function getStudentEnrollments() {
  const user = await requireUser();
  const now = new Date();

  if (process.env.NODE_ENV === "development" && user.role === "admin") {
    const allCourses = await db.select().from(courses);
    return allCourses.map((c) => ({
      id: c.id,
      title: c.title,
      category: c.category,
      description: c.description,
      enrolledAt: now,
      expiresAt: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
    }));
  }

  return db
    .select({
      id: courses.id,
      title: courses.title,
      category: courses.category,
      description: courses.description,
      enrolledAt: enrollments.enrolledAt,
      expiresAt: enrollments.expiresAt,
    })
    .from(enrollments)
    .innerJoin(courses, eq(enrollments.courseId, courses.id))
    .where(
      and(
        eq(enrollments.userId, user.id),
        gt(enrollments.expiresAt, now)
      )
    );
}

/**
 * Enroll in a course using a token
 */
export async function enrollWithToken(tokenStr: string) {
  const user = await requireUser();
  const cleanToken = tokenStr.trim();
  const now = new Date();

  if (!cleanToken) {
    return { success: false, error: "Token tidak boleh kosong" };
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
    return { success: false, error: "Token tidak valid" };
  }

  // 2. Check if user is already a member of the group
  const isAlreadyMember = tokenRecord.group?.members.some(
    (m) => m.userId === user.id
  );
  if (isAlreadyMember) {
    return { success: false, error: "Anda sudah terdaftar menggunakan token ini" };
  }

  // 3. Check if group capacity is reached
  const currentMemberCount = tokenRecord.group?.members.length || 0;
  if (currentMemberCount >= tokenRecord.capacity) {
    return { success: false, error: "Token ini sudah mencapai batas kuota kelompok" };
  }

  // 4. Check if token itself is expired
  if (tokenRecord.expiresAt < now) {
    return { success: false, error: "Token sudah kedaluwarsa untuk semester ini" };
  }

  // 5. Get course IDs associated with this token
  const courseIds = tokenRecord.tokenCourses.map((tc) => tc.courseId);
  if (courseIds.length === 0) {
    return { success: false, error: "Token tidak memiliki course yang terasosiasi" };
  }

  // 6. Check if student is already enrolled in any of these courses active
  const activeEnrollments = await db.query.enrollments.findMany({
    where: and(
      eq(enrollments.userId, user.id),
      gt(enrollments.expiresAt, now)
    ),
  });

  const enrolledCourseIds = new Set(activeEnrollments.map((e) => e.courseId));
  const coursesToEnroll = courseIds.filter((cid) => !enrolledCourseIds.has(cid));

  if (coursesToEnroll.length === 0) {
    return { success: false, error: "Anda sudah terdaftar di semua course yang diaktifkan oleh token ini" };
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
        await tx.insert(enrollments).values({
          id: randomUUID(),
          userId: user.id,
          courseId,
          enrolledAt: now,
          expiresAt: expiresAt,
        });
      }
    });

    return { success: true };
  } catch (err: any) {
    console.error("Failed to enroll via transaction:", err);
    return { success: false, error: "Terjadi kesalahan internal. Silakan coba lagi." };
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
    const [mat] = await db
      .select({ courseId: websiteMaterials.courseId })
      .from(websiteMaterials)
      .where(eq(websiteMaterials.id, materialId))
      .limit(1);

    if (mat) {
      const recomputePromise = inngest
        .send({
          name: "mastery/recompute.requested",
          data: { studentId: user.id, courseId: mat.courseId },
        })
        .catch((err) => {
          console.error("Failed to trigger mastery recompute:", err);
        });

      await Promise.all([
        recordLearningEvent({
          studentId: user.id,
          courseId: mat.courseId,
          eventType: "material_completed",
        }),
        recomputePromise,
      ]);
    }
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

  if (user.role === "admin") {
    return true;
  }

  const now = new Date();
  const activeEnrollment = await db.query.enrollments.findFirst({
    where: and(
      eq(enrollments.userId, user.id),
      eq(enrollments.courseId, courseId),
      gt(enrollments.expiresAt, now)
    ),
  });
  return !!activeEnrollment;
}

/**
 * Get today's trivia question for a course from the AI Question Bank
 */
export async function getDailyTrivia(courseId: string) {
  try {
    const { aiQuestionBank } = await import("@/db/schema");
    const activeQuestions = await db
      .select()
      .from(aiQuestionBank)
      .where(
        and(
          eq(aiQuestionBank.courseId, courseId),
          eq(aiQuestionBank.status, "active"),
          eq(aiQuestionBank.reviewStatus, "published")
        )
      );

    if (activeQuestions.length === 0) {
      return null;
    }

    // Deterministic selection based on today's date
    const today = new Date();
    const dayOfYear = Math.floor(
      (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000
    );
    const index = dayOfYear % activeQuestions.length;
    const q = activeQuestions[index];

    let options: string[] = [];
    if (typeof q.options === "string") {
      try {
        options = JSON.parse(q.options);
      } catch {
        options = [];
      }
    } else if (Array.isArray(q.options)) {
      options = q.options as string[];
    }

    let correctIndex = 0;
    if (typeof q.correctIndices === "string") {
      try {
        const arr = JSON.parse(q.correctIndices);
        correctIndex = arr[0] ?? 0;
      } catch {}
    } else if (Array.isArray(q.correctIndices)) {
      correctIndex = (q.correctIndices as number[])[0] ?? 0;
    }

    return {
      id: q.id,
      question: q.prompt,
      options,
      correctIndex,
      explanation: q.explanation,
    };
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


