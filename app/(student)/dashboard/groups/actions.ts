"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import {
  groupMembers,
  enrollments,
  enrollmentTokens,
  bookings,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { eq, and, desc } from "drizzle-orm";
import { getJakartaNow, getIsoWeekRange, computeWeeklySessionStats } from "@/lib/schedule-lock";
import { getSemesterEndDate } from "@/lib/utils";
import { PACKAGE_PRESETS, type PackageType } from "@/lib/group-constants";
import { dualWriteEnrollment } from "@/lib/migrasi/repository-kompatibilitas";

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
 * Get study group(s) data for the current authenticated student
 */
export async function getStudentStudyGroups() {
  const currentUser = await requireUser();

  // Find all memberships of this student
  const memberships = await db.query.groupMembers.findMany({
    where: eq(groupMembers.userId, currentUser.id),
    with: {
      group: {
        with: {
          courses: {
            with: {
              course: true,
            },
          },
          members: {
            with: {
              user: true,
            },
          },
          tokens: {
            with: {
              tokenCourses: {
                with: {
                  course: true,
                },
              },
            },
          },
          bookings: {
            with: {
              student: true,
              course: true,
              slot: {
                with: {
                  tutor: true,
                },
              },
            },
            orderBy: [desc(bookings.bookedAt)],
          },
        },
      },
    },
  });

  const validGroups = memberships
    .map((m) => m.group)
    .filter(Boolean);

  return validGroups.map((g) => {
    // 1. Resolve Courses
    const directCourses = g.courses.map((gc) => ({
      id: gc.course.id,
      title: gc.course.title,
      category: gc.course.category,
    }));

    const tokenCourses = g.tokens.flatMap((t) =>
      t.tokenCourses.map((tc) => ({
        id: tc.course.id,
        title: tc.course.title,
        category: tc.course.category,
      }))
    );

    const courseMap = new Map<string, { id: string; title: string; category: string }>();
    for (const c of [...directCourses, ...tokenCourses]) {
      if (!courseMap.has(c.id)) {
        courseMap.set(c.id, c);
      }
    }
    const resolvedCourses = Array.from(courseMap.values());

    // 2. Quota & Session Stats
    const bookingCount = g.bookings?.length || 0;
    const effectiveUsed = Math.max(g.usedQuotaSessions || 0, bookingCount);
    const totalQuota = g.totalQuotaSessions ?? 15;
    const remainingQuota = Math.max(0, totalQuota - effectiveUsed);
    const usedPercentage = totalQuota > 0
      ? Math.min(100, Math.round((effectiveUsed / totalQuota) * 100))
      : 0;

    // Weekly quota (derived from bookings in the current Jakarta week)
    const { startIso: weekStartIso, endIso: weekEndIso } = getIsoWeekRange(getJakartaNow());
    const weeklyQuotaSessions = g.weeklyQuotaSessions ?? 2;
    const weeklyUsedSessions = (g.bookings || []).filter(
      (b) =>
        b.sessionDate &&
        b.sessionDate >= weekStartIso &&
        b.sessionDate <= weekEndIso
    ).length;
    const weeklyRemainingQuota = Math.max(0, weeklyQuotaSessions - weeklyUsedSessions);

    // Weekly attendance traceability (last 4 weeks)
    const weeklyStats = computeWeeklySessionStats(
      (g.bookings || []).map((b) => ({
        sessionDate: b.sessionDate,
        startTime: b.startTime,
        endTime: b.endTime,
        status: b.status,
      })),
      4
    );

    // Frequency estimate
    const pkgType = (g.packageType as PackageType) || "reguler_15";
    const preset = PACKAGE_PRESETS[pkgType] || PACKAGE_PRESETS.reguler_15;
    const frequencyLabel = preset.frequencyLabel;

    // 3. Current user role in group
    const myMembership = g.members.find((m) => m.userId === currentUser.id);
    const isLeader = myMembership?.role === "leader";

    // 4. Token info
    const primaryToken = g.tokens[0] || null;

    return {
      id: g.id,
      name: g.name,
      packageType: g.packageType,
      packageName: g.packageName,
      frequencyLabel,
      totalQuotaSessions: totalQuota,
      usedQuotaSessions: effectiveUsed,
      remainingQuota,
      usedPercentage,
      weeklyQuotaSessions,
      weeklyUsedSessions,
      weeklyRemainingQuota,
      weeklyStats,
      academicYear: g.academicYear,
      semester: g.semester,
      startDate: g.startDate,
      endDate: g.endDate,
      status: g.status,
      notes: g.notes,
      isLeader,
      myRole: myMembership?.role || "member",
      joinedAt: myMembership?.joinedAt || g.createdAt,
      courses: resolvedCourses,
      members: g.members.map((m) => ({
        id: m.id,
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        image: m.user.image,
        role: m.role,
        isMe: m.userId === currentUser.id,
        joinedAt: m.joinedAt,
      })),
      token: primaryToken
        ? {
            id: primaryToken.id,
            token: primaryToken.token,
            capacity: primaryToken.capacity,
            membersCount: g.members.length,
            expiresAt: primaryToken.expiresAt,
          }
        : null,
      recentBookings: (g.bookings || []).slice(0, 10).map((b) => ({
        id: b.id,
        bookedAt: b.bookedAt,
        studentName: b.student.name,
        isMyBooking: b.student.id === currentUser.id,
        courseTitle: b.course.title,
        slot: b.slot
          ? {
              dayOfWeek: b.slot.dayOfWeek,
              startTime: b.slot.startTime,
              endTime: b.slot.endTime,
              tutorName: b.slot.tutor?.name || "Tutor",
            }
          : null,
      })),
    };
  });
}

/**
 * Join a group using an activation token directly from the groups page
 */
export async function joinGroupWithToken(tokenStr: string) {
  const currentUser = await requireUser();
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
          courses: true,
        },
      },
    },
  });

  if (!tokenRecord || !tokenRecord.group) {
    return { success: false, error: "Token kelompok tidak valid" };
  }

  // 2. Check if user is already a member of the group
  const isAlreadyMember = tokenRecord.group.members.some(
    (m) => m.userId === currentUser.id
  );
  if (isAlreadyMember) {
    return { success: false, error: "Anda sudah terdaftar di kelompok ini" };
  }

  // 3. Check capacity
  const currentMemberCount = tokenRecord.group.members.length;
  if (currentMemberCount >= tokenRecord.capacity) {
    return { success: false, error: "Kapasitas anggota kelompok ini sudah penuh" };
  }

  // 4. Check token expiration
  if (tokenRecord.expiresAt < now) {
    return { success: false, error: "Masa berlaku token telah berakhir" };
  }

  // 5. Gather courses from token or group
  const tokenCourseIds = tokenRecord.tokenCourses.map((tc) => tc.courseId);
  const groupCourseIds = tokenRecord.group.courses.map((gc) => gc.courseId);
  const allCourseIds = Array.from(new Set([...tokenCourseIds, ...groupCourseIds]));

  const expiresAt = tokenRecord.group.endDate || getSemesterEndDate(now);

  try {
    await db.transaction(async (tx) => {
      // Add member
      await tx.insert(groupMembers).values({
        id: randomUUID(),
        groupId: tokenRecord.groupId,
        userId: currentUser.id,
        role: "member",
        joinedAt: now,
      });

      // Enroll in courses
      for (const courseId of allCourseIds) {
        const existing = await tx.query.enrollments.findFirst({
          where: and(
            eq(enrollments.userId, currentUser.id),
            eq(enrollments.courseId, courseId)
          ),
        });

        if (!existing) {
          const enrollmentId = randomUUID();
          await tx.insert(enrollments).values({
            id: enrollmentId,
            userId: currentUser.id,
            courseId,
            enrolledAt: now,
            expiresAt,
          });
          await dualWriteEnrollment(tx, {
            id: enrollmentId,
            userId: currentUser.id,
            courseId,
            enrolledAt: now,
            expiresAt,
          });
        }
      }
    });

    revalidatePath("/dashboard/groups");
    revalidatePath("/dashboard");
    revalidatePath("/admin/groups");
    return { success: true };
  } catch (err: any) {
    console.error("Failed to join group with token:", err);
    return { success: false, error: "Gagal bergabung ke kelompok" };
  }
}
