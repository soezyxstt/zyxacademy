"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import {
  groups,
  groupMembers,
  groupCourses,
  user,
  enrollments,
  bookings,
  courses,
  enrollmentTokens,
  enrollmentTokenCourses,
} from "@/db/schema";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { eq, desc, asc, and, ilike, or, inArray, lte, sql } from "drizzle-orm";
import { getSemesterEndDate } from "@/lib/utils";
import { dualWriteEnrollment } from "@/lib/migrasi/repository-kompatibilitas";
import { PACKAGE_PRESETS, type PackageType } from "@/lib/group-constants";
import { computeWeeklySessionStats } from "@/lib/schedule-lock";

export type AdminGroupsQuery = { page?: number; search?: string; status?: string; packageType?: string; courseId?: string };
const GROUPS_PAGE_SIZE = 25;

export async function getAdminStudyGroups(input: AdminGroupsQuery = {}) {
  await assertAdmin();
  const page = Number.isSafeInteger(input.page) ? Math.max(1, Math.min(input.page!, 100000)) : 1;
  const query = (typeof input.search === "string" ? input.search : "").trim().slice(0, 200).replace(/[\\%_]/g, "\\$&");
  const pattern = `%${query}%`;
  const courseMatch = (courseCondition: ReturnType<typeof sql>) => sql`(
    exists (select 1 from ${groupCourses} inner join ${courses} on ${groupCourses.courseId} = ${courses.id}
      where ${groupCourses.groupId} = ${groups.id} and ${courseCondition})
    or exists (select 1 from ${enrollmentTokens} inner join ${enrollmentTokenCourses} on ${enrollmentTokenCourses.tokenId} = ${enrollmentTokens.id}
      inner join ${courses} on ${enrollmentTokenCourses.courseId} = ${courses.id}
      where ${enrollmentTokens.groupId} = ${groups.id} and ${courseCondition})
  )`;
  const condition = and(
    query ? or(ilike(groups.name, pattern), sql`exists (select 1 from ${groupMembers} inner join ${user} on ${groupMembers.userId} = ${user.id}
      where ${groupMembers.groupId} = ${groups.id} and (${user.name} ilike ${pattern} or ${user.email} ilike ${pattern}))`,
      courseMatch(sql`${courses.title} ilike ${pattern}`)) : undefined,
    input.status && input.status !== "all" ? sql`${groups.status} = ${input.status}` : undefined,
    input.packageType && input.packageType !== "all" ? sql`${groups.packageType} = ${input.packageType}` : undefined,
    input.courseId && input.courseId !== "all" ? courseMatch(sql`${courses.id} = ${input.courseId}`) : undefined,
  );
  const bookingCount = sql<number>`(select count(*) from ${bookings} where ${bookings.groupId} = ${groups.id})`;
  const [rows, [countRow], [summary], [membersSummary]] = await Promise.all([
    db.select({ group: groups, bookingsCount: bookingCount,
      memberCount: sql<number>`(select count(*) from ${groupMembers} where ${groupMembers.groupId} = ${groups.id})`,
    }).from(groups).where(condition).orderBy(desc(groups.createdAt), asc(groups.id)).limit(GROUPS_PAGE_SIZE).offset((page - 1) * GROUPS_PAGE_SIZE),
    db.select({ count: sql<number>`count(*)` }).from(groups).where(condition),
    db.select({ totalGroups: sql<number>`count(*)`, activeGroups: sql<number>`count(*) filter (where ${groups.status} = 'active')`,
      totalUsed: sql<number>`coalesce(sum(greatest(${groups.usedQuotaSessions}, ${bookingCount})), 0)`,
      totalQuota: sql<number>`coalesce(sum(${groups.totalQuotaSessions}), 0)`,
    }).from(groups),
    db.select({ totalMembers: sql<number>`count(distinct ${groupMembers.userId})` }).from(groupMembers),
  ]);
  const groupIds = rows.map((row) => row.group.id);
  const rankedMembers = db.select({ id: groupMembers.id, groupId: groupMembers.groupId, userId: groupMembers.userId,
    role: groupMembers.role, joinedAt: groupMembers.joinedAt,
    position: sql<number>`row_number() over (partition by ${groupMembers.groupId} order by ${groupMembers.joinedAt}, ${groupMembers.id})`.as("position"),
  }).from(groupMembers).where(inArray(groupMembers.groupId, groupIds)).as("ranked_members");
  const [relations, previews] = groupIds.length ? await Promise.all([
    db.query.groups.findMany({ where: inArray(groups.id, groupIds), columns: { id: true }, with: {
      courses: { with: { course: { columns: { id: true, title: true, category: true } } } },
      tokens: { columns: { id: true }, with: { tokenCourses: { with: { course: { columns: { id: true, title: true, category: true } } } } } },
    } }),
    db.select({ id: rankedMembers.id, groupId: rankedMembers.groupId, userId: rankedMembers.userId,
      role: rankedMembers.role, joinedAt: rankedMembers.joinedAt,
      user: { id: user.id, name: user.name, email: user.email, image: user.image, role: user.role },
    }).from(rankedMembers).innerJoin(user, eq(rankedMembers.userId, user.id)).where(lte(rankedMembers.position, 4)),
  ]) : [[], []] as const;
  const relationById = new Map(relations.map((row) => [row.id, row]));
  const result = rows.map(({ group: g, bookingsCount, memberCount }) => {
    const relation = relationById.get(g.id);
    const courseMap = new Map<string, { id: string; title: string; category: string }>();
    for (const course of [...(relation?.courses.map((entry) => entry.course) ?? []),
      ...(relation?.tokens.flatMap((token) => token.tokenCourses.map((entry) => entry.course)) ?? [])]) {
      if (!courseMap.has(course.id)) courseMap.set(course.id, course);
    }
    const usedQuotaSessions = Math.max(g.usedQuotaSessions || 0, Number(bookingsCount));
    return { ...g, usedQuotaSessions, remainingQuota: Math.max(0, g.totalQuotaSessions - usedQuotaSessions),
      bookingsCount: Number(bookingsCount), memberCount: Number(memberCount), courses: [...courseMap.values()],
      members: previews.filter((member) => member.groupId === g.id).map(({ groupId: _groupId, ...member }) => member),
    };
  });
  const quota = Number(summary.totalQuota);
  return { groups: result, total: Number(countRow.count), page, stats: {
    totalGroups: Number(summary.totalGroups), activeGroups: Number(summary.activeGroups), totalMembers: Number(membersSummary.totalMembers),
    avgQuotaUsed: quota > 0 ? Math.round(Number(summary.totalUsed) / quota * 100) : 0,
  } };
}

/**
 * Get full single study group detail for modal/drawer
 */
export async function getAdminGroupDetail(groupId: string) {
  await assertAdmin();

  const g = await db.query.groups.findFirst({
    where: eq(groups.id, groupId),
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
      },
    },
  });

  if (!g) {
    return null;
  }

  // Course resolution
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

  const bookingCount = g.bookings?.length || 0;
  const effectiveUsedQuota = Math.max(g.usedQuotaSessions || 0, bookingCount);
  const remainingQuota = Math.max(0, g.totalQuotaSessions - effectiveUsedQuota);

  return {
    id: g.id,
    name: g.name,
    packageType: g.packageType,
    packageName: g.packageName,
    totalQuotaSessions: g.totalQuotaSessions,
    weeklyQuotaSessions: g.weeklyQuotaSessions,
    usedQuotaSessions: effectiveUsedQuota,
    remainingQuota,
    weeklyUsedSessions: computeWeeklySessionStats(
      (g.bookings || []).map((b) => ({
        sessionDate: b.sessionDate,
        startTime: b.startTime,
        endTime: b.endTime,
        status: b.status,
      })),
      1
    )[0]?.booked ?? 0,
    weeklyStats: computeWeeklySessionStats(
      (g.bookings || []).map((b) => ({
        sessionDate: b.sessionDate,
        startTime: b.startTime,
        endTime: b.endTime,
        status: b.status,
      })),
      4
    ),
    academicYear: g.academicYear,
    semester: g.semester,
    startDate: g.startDate,
    endDate: g.endDate,
    status: g.status,
    notes: g.notes,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
    courses: Array.from(courseMap.values()),
    members: g.members.map((m) => ({
      id: m.id,
      userId: m.userId,
      role: m.role,
      joinedAt: m.joinedAt,
      user: {
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        image: m.user.image,
        role: m.user.role,
      },
    })),
    tokens: g.tokens.map((t) => ({
      id: t.id,
      token: t.token,
      capacity: t.capacity,
      expiresAt: t.expiresAt,
    })),
    bookings: (g.bookings || []).map((b) => ({
      id: b.id,
      bookedAt: b.bookedAt,
      student: {
        id: b.student.id,
        name: b.student.name,
        email: b.student.email,
      },
      course: {
        id: b.course.id,
        title: b.course.title,
      },
      slot: b.slot
        ? {
            id: b.slot.id,
            dayOfWeek: b.slot.dayOfWeek,
            startTime: b.slot.startTime,
            endTime: b.slot.endTime,
            tutor: b.slot.tutor
              ? {
                  id: b.slot.tutor.id,
                  name: b.slot.tutor.name,
                  email: b.slot.tutor.email,
                }
              : null,
          }
        : null,
    })),
  };
}

export type CreateGroupInput = {
  name: string;
  packageType?: PackageType;
  packageName?: string;
  totalQuotaSessions?: number;
  weeklyQuotaSessions?: number;
  academicYear?: string;
  semester?: string;
  startDate?: string | null;
  endDate?: string | null;
  status?: "active" | "completed" | "inactive" | "archived";
  notes?: string;
  courseIds?: string[];
  memberUserIds?: { userId: string; role?: "leader" | "member" }[];
};

/**
 * Create a new study group with package configuration
 */
export async function createStudyGroup(data: CreateGroupInput) {
  await assertAdmin();

  if (!data.name || !data.name.trim()) {
    return { success: false, error: "Nama kelompok belajar wajib diisi" };
  }

  const pkgType = data.packageType || "reguler_15";
  const defaultPkg = PACKAGE_PRESETS[pkgType] || PACKAGE_PRESETS.reguler_15;
  const pkgName = data.packageName?.trim() || defaultPkg.name;
  const totalQuota = data.totalQuotaSessions ?? defaultPkg.quota;
  const weeklyQuota = data.weeklyQuotaSessions ?? defaultPkg.weeklySessions;

  const now = new Date();
  const semesterEnd = getSemesterEndDate(now);
  const startDate = data.startDate ? new Date(data.startDate) : now;
  const endDate = data.endDate ? new Date(data.endDate) : semesterEnd;

  const groupId = randomUUID();

  try {
    await db.transaction(async (tx) => {
      // 1. Insert Group
      await tx.insert(groups).values({
        id: groupId,
        name: data.name.trim(),
        packageType: pkgType,
        packageName: pkgName,
        totalQuotaSessions: Math.max(1, totalQuota),
        weeklyQuotaSessions: Math.max(1, weeklyQuota),
        usedQuotaSessions: 0,
        academicYear: data.academicYear?.trim() || "2026/2027",
        semester: data.semester?.trim() || "Ganjil",
        startDate,
        endDate,
        status: data.status || "active",
        notes: data.notes?.trim() || null,
        createdAt: now,
      });

      // 2. Link Courses
      if (data.courseIds && data.courseIds.length > 0) {
        for (const cid of data.courseIds) {
          await tx.insert(groupCourses).values({
            id: randomUUID(),
            groupId,
            courseId: cid,
            createdAt: now,
          });
        }
      }

      // 3. Add initial members if any
      if (data.memberUserIds && data.memberUserIds.length > 0) {
        for (const m of data.memberUserIds) {
          const memberId = randomUUID();
          await tx.insert(groupMembers).values({
            id: memberId,
            groupId,
            userId: m.userId,
            role: m.role || "member",
            joinedAt: now,
          });

          // Enroll user in group courses
          if (data.courseIds && data.courseIds.length > 0) {
            for (const cid of data.courseIds) {
              const enrollmentId = randomUUID();
              await tx.insert(enrollments).values({
                id: enrollmentId,
                userId: m.userId,
                courseId: cid,
                enrolledAt: now,
                expiresAt: endDate,
              });
              await dualWriteEnrollment(tx, {
                id: enrollmentId,
                userId: m.userId,
                courseId: cid,
                enrolledAt: now,
                expiresAt: endDate,
              });
            }
          }
        }
      }
    });

    revalidatePath("/admin/groups");
    revalidatePath("/admin/tokens");
    revalidatePath("/dashboard/groups");
    return { success: true, groupId };
  } catch (err: any) {
    console.error("Failed to create study group:", err);
    return { success: false, error: "Gagal membuat kelompok belajar" };
  }
}

export type UpdateGroupInput = {
  name?: string;
  packageType?: PackageType;
  packageName?: string;
  totalQuotaSessions?: number;
  weeklyQuotaSessions?: number;
  usedQuotaSessions?: number;
  academicYear?: string;
  semester?: string;
  startDate?: string | null;
  endDate?: string | null;
  status?: "active" | "completed" | "inactive" | "archived";
  notes?: string;
  courseIds?: string[];
};

/**
 * Update an existing study group
 */
export async function updateStudyGroup(groupId: string, data: UpdateGroupInput) {
  await assertAdmin();

  const existing = await db.query.groups.findFirst({
    where: eq(groups.id, groupId),
  });

  if (!existing) {
    return { success: false, error: "Kelompok belajar tidak ditemukan" };
  }

  try {
    await db.transaction(async (tx) => {
      const updateData: Partial<typeof groups.$inferInsert> = {};

      if (data.name !== undefined) updateData.name = data.name.trim();
      if (data.packageType !== undefined) {
        updateData.packageType = data.packageType;
        if (!data.packageName) {
          updateData.packageName = PACKAGE_PRESETS[data.packageType]?.name || existing.packageName;
        }
      }
      if (data.packageName !== undefined) updateData.packageName = data.packageName.trim();
      if (data.totalQuotaSessions !== undefined) updateData.totalQuotaSessions = Math.max(1, data.totalQuotaSessions);
      if (data.weeklyQuotaSessions !== undefined) updateData.weeklyQuotaSessions = Math.max(1, data.weeklyQuotaSessions);
      if (data.usedQuotaSessions !== undefined) updateData.usedQuotaSessions = Math.max(0, data.usedQuotaSessions);
      if (data.academicYear !== undefined) updateData.academicYear = data.academicYear.trim();
      if (data.semester !== undefined) updateData.semester = data.semester.trim();
      if (data.startDate !== undefined) updateData.startDate = data.startDate ? new Date(data.startDate) : null;
      if (data.endDate !== undefined) updateData.endDate = data.endDate ? new Date(data.endDate) : null;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.notes !== undefined) updateData.notes = data.notes.trim() || null;

      if (Object.keys(updateData).length > 0) {
        await tx.update(groups).set(updateData).where(eq(groups.id, groupId));
      }

      // Reconcile courses if provided
      if (data.courseIds !== undefined) {
        await tx.delete(groupCourses).where(eq(groupCourses.groupId, groupId));
        for (const cid of data.courseIds) {
          await tx.insert(groupCourses).values({
            id: randomUUID(),
            groupId,
            courseId: cid,
            createdAt: new Date(),
          });
        }
      }
    });

    revalidatePath("/admin/groups");
    revalidatePath("/dashboard/groups");
    return { success: true };
  } catch (err: any) {
    console.error("Failed to update study group:", err);
    return { success: false, error: "Gagal memperbarui kelompok belajar" };
  }
}

/**
 * Delete a study group
 */
export async function deleteStudyGroup(groupId: string) {
  await assertAdmin();

  try {
    await db.delete(groups).where(eq(groups.id, groupId));
    revalidatePath("/admin/groups");
    revalidatePath("/admin/tokens");
    revalidatePath("/dashboard/groups");
    return { success: true };
  } catch (err: any) {
    console.error("Failed to delete study group:", err);
    return { success: false, error: "Gagal menghapus kelompok belajar" };
  }
}

/**
 * Add a member to a study group
 */
export async function addGroupMember(
  groupId: string,
  userId: string,
  role: "leader" | "member" = "member"
) {
  await assertAdmin();

  const groupRecord = await db.query.groups.findFirst({
    where: eq(groups.id, groupId),
    with: {
      courses: true,
      members: true,
    },
  });

  if (!groupRecord) {
    return { success: false, error: "Kelompok belajar tidak ditemukan" };
  }

  const alreadyMember = groupRecord.members.some((m) => m.userId === userId);
  if (alreadyMember) {
    return { success: false, error: "Pengguna sudah tergabung dalam kelompok ini" };
  }

  const now = new Date();
  const expiresAt = groupRecord.endDate || getSemesterEndDate(now);

  try {
    await db.transaction(async (tx) => {
      // 1. Insert member
      await tx.insert(groupMembers).values({
        id: randomUUID(),
        groupId,
        userId,
        role,
        joinedAt: now,
      });

      // 2. Auto-enroll in group courses
      for (const gc of groupRecord.courses) {
        const existingEnrollment = await tx.query.enrollments.findFirst({
          where: and(
            eq(enrollments.userId, userId),
            eq(enrollments.courseId, gc.courseId)
          ),
        });

        if (!existingEnrollment) {
          const enrollmentId = randomUUID();
          await tx.insert(enrollments).values({
            id: enrollmentId,
            userId,
            courseId: gc.courseId,
            enrolledAt: now,
            expiresAt,
          });
          await dualWriteEnrollment(tx, {
            id: enrollmentId,
            userId,
            courseId: gc.courseId,
            enrolledAt: now,
            expiresAt,
          });
        }
      }
    });

    revalidatePath("/admin/groups");
    revalidatePath("/dashboard/groups");
    return { success: true };
  } catch (err: any) {
    console.error("Failed to add group member:", err);
    return { success: false, error: "Gagal menambahkan anggota ke kelompok" };
  }
}

/**
 * Remove a member from a study group
 */
export async function removeGroupMember(groupId: string, userId: string) {
  await assertAdmin();

  try {
    await db
      .delete(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));

    revalidatePath("/admin/groups");
    revalidatePath("/dashboard/groups");
    return { success: true };
  } catch (err: any) {
    console.error("Failed to remove group member:", err);
    return { success: false, error: "Gagal menghapus anggota dari kelompok" };
  }
}

/**
 * Adjust quota sessions (set or add/subtract)
 */
export async function adjustGroupQuota(
  groupId: string,
  value: number,
  mode: "set_total" | "set_used" | "adjust_used" = "set_total"
) {
  await assertAdmin();

  const groupRecord = await db.query.groups.findFirst({
    where: eq(groups.id, groupId),
  });

  if (!groupRecord) {
    return { success: false, error: "Kelompok tidak ditemukan" };
  }

  try {
    let update: Partial<typeof groups.$inferInsert> = {};
    if (mode === "set_total") {
      update.totalQuotaSessions = Math.max(1, value);
    } else if (mode === "set_used") {
      update.usedQuotaSessions = Math.max(0, value);
    } else if (mode === "adjust_used") {
      update.usedQuotaSessions = Math.max(0, groupRecord.usedQuotaSessions + value);
    }

    await db.update(groups).set(update).where(eq(groups.id, groupId));
    revalidatePath("/admin/groups");
    revalidatePath("/dashboard/groups");
    return { success: true };
  } catch (err: any) {
    console.error("Failed to adjust quota:", err);
    return { success: false, error: "Gagal mengubah kuota sesi" };
  }
}

/**
 * Search students for member addition
 */
export async function searchStudents(query: string) {
  await assertAdmin();

  const clean = query.trim();
  if (!clean) return [];

  const found = await db.query.user.findMany({
    where: or(
      ilike(user.name, `%${clean}%`),
      ilike(user.email, `%${clean}%`)
    ),
    limit: 10,
  });

  return found.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    image: u.image,
    role: u.role,
  }));
}
