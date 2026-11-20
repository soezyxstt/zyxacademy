"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  groupMembers,
  bookings,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { eq, desc } from "drizzle-orm";
import { getIsoWeekRange, computeWeeklySessionStats } from "@/lib/schedule-lock";
import { getGroupWeeklyUsage } from "@/lib/schedule/tutor-policy";
import { PACKAGE_PRESETS, type PackageType } from "@/lib/group-constants";
import { getVisibleStudentIdentities } from "@/lib/gamification/social";
import { redeemGroupToken } from "@/lib/groups/redeem-token";

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
 * Retrieves study group data for the authenticated student, including course associations,
 * weekly meeting counts, total package quotas, group members, and recent bookings.
 *
 * @returns Array of resolved study group records for the current user.
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

  // A roster grants access to its existing names, not to private social profiles.
  // Resolve public IDs separately through the social visibility and block boundary.
  const identities = await getVisibleStudentIdentities(currentUser.id, validGroups.flatMap(group => group.members.map(member => member.userId)))
    .catch(() => new Map());

  const { startIso, endIso } = getIsoWeekRange(new Date());
  const weeklyUsage = await getGroupWeeklyUsage(validGroups.map((g) => g.id), startIso, endIso);

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
    const usedQuotaSessions = g.usedQuotaSessions;
    const totalQuota = g.totalQuotaSessions ?? 15;
    const remainingQuota = Math.max(0, totalQuota - usedQuotaSessions);
    const usedPercentage = totalQuota > 0
      ? Math.min(100, Math.round((usedQuotaSessions / totalQuota) * 100))
      : 0;

    // Weekly quota (derived from bookings in the current Jakarta week)
    const weeklyQuotaSessions = g.weeklyQuotaSessions ?? 2;
    const weeklyUsedSessions = weeklyUsage.get(g.id) ?? 0;
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
      usedQuotaSessions,
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
        identity: identities.get(m.userId) ?? null,
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
  const errors = {
    empty: "Token tidak boleh kosong",
    invalid: "Token kelompok tidak valid",
    alreadyMember: "Anda sudah terdaftar di kelompok ini",
    capacityReached: "Kapasitas anggota kelompok ini sudah penuh",
    expired: "Masa berlaku token telah berakhir",
    noCourses: "Token tidak memiliki course yang terasosiasi",
    alreadyEnrolled: "Anda sudah terdaftar di semua course yang diaktifkan oleh token ini",
  };

  try {
    const result = await redeemGroupToken(tokenStr, currentUser.id, "groups");
    if (!result.success) return { success: false, error: errors[result.errorCode] };

    revalidatePath("/dashboard/groups");
    revalidatePath("/dashboard");
    revalidatePath("/admin/groups");
    return { success: true };
  } catch (error) {
    console.error("Failed to join group with token:", error instanceof Error ? error.name : "UnknownError");
    return { success: false, error: "Gagal bergabung ke kelompok" };
  }
}
