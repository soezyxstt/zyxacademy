import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { db } from "@/db";
import { enrollments, groupCourses, groupMembers, groups } from "@/db/schema";
import { dualWriteEnrollment } from "@/lib/migrasi/repository-kompatibilitas";
import { getSemesterEndDate } from "@/lib/utils";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Serialize member changes and changes to the group's course access terms. */
export async function lockStudyGroupMembership(tx: Transaction, groupId: string) {
  const [group] = await tx.select().from(groups).where(eq(groups.id, groupId)).limit(1).for("update");
  return group ?? null;
}

export async function insertStudyGroupMember(tx: Transaction, groupId: string, userId: string,
  role: "leader" | "member", joinedAt: Date) {
  await tx.insert(groupMembers).values({ id: randomUUID(), groupId, userId, role, joinedAt });
  await tx.update(groups).set({ updatedAt: joinedAt }).where(eq(groups.id, groupId));
}

export async function addStudyGroupMember(tx: Transaction, group: typeof groups.$inferSelect, userId: string,
  role: "leader" | "member" = "member") {
  const existing = await tx.select({ id: groupMembers.id }).from(groupMembers)
    .where(and(eq(groupMembers.groupId, group.id), eq(groupMembers.userId, userId))).limit(1);
  if (existing.length) throw new Error("ALREADY_MEMBER");

  const assignments = await tx.select({ id: groupCourses.courseId }).from(groupCourses)
    .where(eq(groupCourses.groupId, group.id)).orderBy(asc(groupCourses.courseId));
  const courseIds = [...new Set(assignments.map(({ id }) => id))];
  const now = new Date();
  const expiresAt = group.endDate ?? getSemesterEndDate(now);
  await insertStudyGroupMember(tx, group.id, userId, role, now);
  if (!courseIds.length) return;

  // Use the same per-user enrollment lock as token redemption for overlapping courses.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`group-enrollment:${userId}`}, 0))`);
  const enrolled = await tx.select({ courseId: enrollments.courseId }).from(enrollments)
    .where(and(eq(enrollments.userId, userId), inArray(enrollments.courseId, courseIds)));
  const existingCourses = new Set(enrolled.map(({ courseId }) => courseId));
  for (const courseId of courseIds) {
    if (existingCourses.has(courseId)) continue;
    const enrollment = { id: randomUUID(), userId, courseId, enrolledAt: now, expiresAt };
    await tx.insert(enrollments).values(enrollment);
    await dualWriteEnrollment(tx, enrollment);
  }
}

/** Membership and course access have independent lifecycles. */
export async function removeStudyGroupMember(tx: Transaction, groupId: string, userId: string) {
  const deleted = await tx.delete(groupMembers).where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
    .returning({ id: groupMembers.id });
  if (deleted.length) await tx.update(groups).set({ updatedAt: new Date() }).where(eq(groups.id, groupId));
  return deleted;
}
