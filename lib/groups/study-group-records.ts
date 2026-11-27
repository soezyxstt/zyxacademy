import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { db } from "@/db";
import { groupCourses, groups } from "@/db/schema";
import { PACKAGE_PRESETS } from "@/lib/group-constants";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type GroupInsert = typeof groups.$inferInsert;
type GroupRecord = typeof groups.$inferSelect;

type GroupInsertFields = Pick<GroupInsert,
  "name" | "packageType" | "packageName" | "totalQuotaSessions" | "weeklyQuotaSessions"
  | "academicYear" | "semester" | "status" | "notes"
> & { startDate?: string | null; endDate?: string | null };
type GroupUpdateFields = Partial<GroupInsertFields> & { usedQuotaSessions?: number };

export async function insertStudyGroupRecord(tx: Transaction, id: string, data: GroupInsertFields, now: Date, semesterEnd: Date) {
  const packageType = data.packageType || "reguler_15";
  const preset = PACKAGE_PRESETS[packageType] ?? PACKAGE_PRESETS.reguler_15;
  await tx.insert(groups).values({
    id,
    name: data.name.trim(),
    packageType,
    packageName: data.packageName?.trim() || preset.name,
    totalQuotaSessions: Math.max(1, data.totalQuotaSessions ?? preset.quota),
    weeklyQuotaSessions: Math.max(1, data.weeklyQuotaSessions ?? preset.weeklySessions),
    usedQuotaSessions: 0,
    academicYear: data.academicYear?.trim() || "2026/2027",
    semester: data.semester?.trim() || "Ganjil",
    startDate: data.startDate ? new Date(data.startDate) : now,
    endDate: data.endDate ? new Date(data.endDate) : semesterEnd,
    status: data.status || "active",
    notes: data.notes?.trim() || null,
    createdAt: now,
  });
}

export async function updateStudyGroupRecord(tx: Transaction, group: GroupRecord, data: GroupUpdateFields) {
  const update: Partial<GroupInsert> = {};
  if (data.name !== undefined) update.name = data.name.trim();
  if (data.packageType !== undefined) {
    update.packageType = data.packageType;
    if (!data.packageName) update.packageName = PACKAGE_PRESETS[data.packageType]?.name || group.packageName;
  }
  if (data.packageName !== undefined) update.packageName = data.packageName.trim();
  if (data.totalQuotaSessions !== undefined) update.totalQuotaSessions = Math.max(1, data.totalQuotaSessions);
  if (data.weeklyQuotaSessions !== undefined) update.weeklyQuotaSessions = Math.max(1, data.weeklyQuotaSessions);
  if (data.usedQuotaSessions !== undefined) update.usedQuotaSessions = Math.max(0, data.usedQuotaSessions);
  if (data.academicYear !== undefined) update.academicYear = data.academicYear.trim();
  if (data.semester !== undefined) update.semester = data.semester.trim();
  if (data.startDate !== undefined) update.startDate = data.startDate ? new Date(data.startDate) : null;
  if (data.endDate !== undefined) update.endDate = data.endDate ? new Date(data.endDate) : null;
  if (data.status !== undefined) update.status = data.status;
  if (data.notes !== undefined) update.notes = data.notes?.trim() || null;
  if (Object.keys(update).length) await tx.update(groups).set(update).where(eq(groups.id, group.id));
}

export async function insertStudyGroupCourses(tx: Transaction, groupId: string, courseIds: readonly string[], now: Date) {
  if (!courseIds.length) return;
  await tx.insert(groupCourses).values(courseIds.map((courseId) => ({ id: randomUUID(), groupId, courseId, createdAt: now })));
}

export async function replaceStudyGroupCourses(tx: Transaction, groupId: string, courseIds: readonly string[], now: Date) {
  await tx.delete(groupCourses).where(eq(groupCourses.groupId, groupId));
  await insertStudyGroupCourses(tx, groupId, courseIds, now);
}

export async function deleteStudyGroupRecord(tx: Transaction, groupId: string) {
  const [deleted] = await tx.delete(groups).where(eq(groups.id, groupId)).returning({ id: groups.id });
  return deleted ?? null;
}
