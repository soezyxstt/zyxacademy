import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  enrollments,
  enrollmentTokenCourses,
  enrollmentTokens,
  groupCourses,
  groupMembers,
  groups,
  pendaftaranMurid,
} from "@/db/schema";
import { dualWriteEnrollment } from "@/lib/migrasi/repository-kompatibilitas";
import { listStudentEnrollments } from "@/lib/student/course-catalog";
import { getSemesterEndDate } from "@/lib/utils";

type ErrorCode = "empty" | "invalid" | "alreadyMember" | "capacityReached" | "expired" | "noCourses" | "alreadyEnrolled";
type Redemption = { success: true; errorCode?: never } | { success: false; errorCode: ErrorCode };

export async function redeemGroupToken(
  token: string,
  userId: string,
  surface: "dashboard" | "groups",
): Promise<Redemption> {
  const cleanToken = token.trim();
  if (!cleanToken) return { success: false, errorCode: "empty" };

  return db.transaction(async (tx): Promise<Redemption> => {
    const [target] = await tx.select({ groupId: enrollmentTokens.groupId }).from(enrollmentTokens)
      .where(eq(enrollmentTokens.token, cleanToken));
    if (!target) return { success: false, errorCode: "invalid" };

    // The group owns the seats, even when it has multiple tokens. Read its
    // membership in a separate statement after acquiring the row lock.
    const [group] = await tx.select({ endDate: groups.endDate }).from(groups)
      .where(eq(groups.id, target.groupId)).for("no key update");
    if (!group) return { success: false, errorCode: "invalid" };

    const [record] = await tx.select({
      id: enrollmentTokens.id,
      capacity: enrollmentTokens.capacity,
      expiresAt: enrollmentTokens.expiresAt,
    }).from(enrollmentTokens).where(and(
      eq(enrollmentTokens.token, cleanToken),
      eq(enrollmentTokens.groupId, target.groupId),
    )).for("share");
    if (!record) return { success: false, errorCode: "invalid" };

    const members = await tx.select({ userId: groupMembers.userId }).from(groupMembers)
      .where(eq(groupMembers.groupId, target.groupId));
    const alreadyMember = members.some(member => member.userId === userId);
    if (!alreadyMember && members.length >= record.capacity) {
      return { success: false, errorCode: "capacityReached" };
    }

    // One student can redeem tokens for different groups with overlapping courses.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`group-enrollment:${userId}`}, 0))`);
    const now = new Date();
    const expiresAt = group.endDate ?? getSemesterEndDate(now);
    if (record.expiresAt <= now || expiresAt <= now) {
      return { success: false, errorCode: "expired" };
    }

    const tokenCourses = await tx.select({ courseId: enrollmentTokenCourses.courseId }).from(enrollmentTokenCourses)
      .where(eq(enrollmentTokenCourses.tokenId, record.id));
    const courseIds = new Set(tokenCourses.map(row => row.courseId));
    if (surface === "groups") {
      const assigned = await tx.select({ courseId: groupCourses.courseId }).from(groupCourses)
        .where(eq(groupCourses.groupId, target.groupId));
      for (const row of assigned) courseIds.add(row.courseId);
    } else if (!courseIds.size) {
      return { success: false, errorCode: "noCourses" };
    } else if (!alreadyMember) {
      for (const enrollment of await listStudentEnrollments(userId, tx, now)) courseIds.delete(enrollment.id);
      if (!courseIds.size) return { success: false, errorCode: "alreadyEnrolled" };
    }

    if (!alreadyMember) {
      await tx.insert(groupMembers).values({ id: randomUUID(), groupId: target.groupId, userId, joinedAt: now });
    }

    let repaired = false;
    if (courseIds.size) {
      const existing = await tx.select({ legacy: enrollments, mirror: pendaftaranMurid }).from(enrollments)
        .leftJoin(pendaftaranMurid, eq(pendaftaranMurid.legacyEnrollmentId, enrollments.id))
        .where(and(eq(enrollments.userId, userId), inArray(enrollments.courseId, [...courseIds])))
        .orderBy(desc(enrollments.expiresAt), asc(enrollments.id))
        .for("no key update", { of: enrollments });
      const byCourse = new Map<string, (typeof existing)[number]>();
      for (const row of existing) {
        if (!byCourse.has(row.legacy.courseId)) byCourse.set(row.legacy.courseId, row);
      }

      for (const courseId of courseIds) {
        const previous = byCourse.get(courseId);
        const legacy = previous?.legacy ?? { id: randomUUID(), courseId, userId, enrolledAt: now, expiresAt };
        const grantEnd = legacy.expiresAt > expiresAt ? legacy.expiresAt : expiresAt;
        const mirror = previous?.mirror;
        const hasMirror = mirror && (mirror.status === "active" || mirror.status === "completed")
          && (mirror.endAt === null || mirror.endAt >= grantEnd);
        if (previous && legacy.expiresAt >= expiresAt && hasMirror) continue;

        if (!previous) {
          await tx.insert(enrollments).values(legacy);
        } else if (legacy.expiresAt < grantEnd) {
          await tx.update(enrollments).set({ expiresAt: grantEnd }).where(eq(enrollments.id, legacy.id));
        }
        await dualWriteEnrollment(tx, { ...legacy, expiresAt: grantEnd }, userId, { renewedAt: now });
        repaired = true;
      }
    }

    return alreadyMember && !repaired ? { success: false, errorCode: "alreadyMember" } : { success: true };
  }, { isolationLevel: "read committed" });
}
