import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { db } from "@/db";
import { enrollmentTokenCourses, enrollmentTokens, groupCourses, groups } from "@/db/schema";
import { minutesAgo } from "@/lib/date-utils";
import { PACKAGE_PRESETS, type PackageType } from "@/lib/group-constants";
import { getSemesterEndDate } from "@/lib/utils";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function generateEnrollmentTokenCode(capacity: number, courseCount: number) {
  return `Zyx-${randomBytes(4).toString("hex").toUpperCase()}-${capacity}-${courseCount}`;
}

function tokenQuota(total: number, weekly: number, requestedPackage: PackageType) {
  if (total === 0) return { packageType: "custom" as const, packageName: "Tanpa Kuota Pertemuan (0 Sesi)", weekly: 0 };
  if (total === 15 && (weekly === 1 || weekly === 15)) return {
    packageType: "reguler_15" as const, packageName: PACKAGE_PRESETS.reguler_15.name, weekly,
  };
  if (total === 30 && (weekly === 2 || weekly === 30)) return {
    packageType: "intensif_30" as const, packageName: PACKAGE_PRESETS.intensif_30.name, weekly,
  };
  if (total === 45 && (weekly === 3 || weekly === 45)) return {
    packageType: "super_intensif_45" as const, packageName: PACKAGE_PRESETS.super_intensif_45.name, weekly,
  };
  return { packageType: requestedPackage, packageName: `Paket Kustom (${total} Sesi)`, weekly };
}

export async function issueEnrollmentTokenWithGroup(tx: Transaction, input: {
  courseIds: readonly string[]; capacity: number; totalQuotaSessions: number; weeklyQuotaSessions: number; packageType: PackageType;
}, now = new Date()) {
  const id = randomUUID();
  const groupId = randomUUID();
  const token = generateEnrollmentTokenCode(input.capacity, input.courseIds.length);
  const expiresAt = getSemesterEndDate(now);
  const quota = tokenQuota(input.totalQuotaSessions, input.weeklyQuotaSessions, input.packageType);
  await tx.insert(groups).values({
    id: groupId,
    name: `Kelompok Token ${token}`,
    packageType: quota.packageType,
    packageName: quota.packageName,
    totalQuotaSessions: input.totalQuotaSessions,
    weeklyQuotaSessions: quota.weekly,
    usedQuotaSessions: 0,
    academicYear: "2026/2027",
    semester: "Ganjil",
    startDate: now,
    endDate: expiresAt,
    status: "active",
    createdAt: now,
  });
  await tx.insert(enrollmentTokens).values({ id, token, groupId, capacity: input.capacity, expiresAt, createdAt: now });
  await tx.insert(enrollmentTokenCourses).values(input.courseIds.map((courseId) => ({ tokenId: id, courseId })));
  await tx.insert(groupCourses).values(input.courseIds.map((courseId) => ({ id: randomUUID(), groupId, courseId, createdAt: now })));
  return { id, groupId, token };
}

export async function expireEnrollmentToken(tx: Transaction, id: string, now = new Date()) {
  const [row] = await tx.update(enrollmentTokens).set({ expiresAt: minutesAgo(1, now) }).where(eq(enrollmentTokens.id, id)).returning();
  return row;
}
