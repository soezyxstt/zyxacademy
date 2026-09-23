"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { enrollmentTokens, courses, groups, enrollmentTokenCourses, groupCourses } from "@/db/schema";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { eq, desc, inArray } from "drizzle-orm";
import { getSemesterEndDate } from "@/lib/utils";
import { PACKAGE_PRESETS, type PackageType } from "@/lib/group-constants";

/**
 * Get all enrollment tokens for the admin panel
 */
export async function getEnrollmentTokens() {
  await assertAdmin();

  const tokens = await db.query.enrollmentTokens.findMany({
    with: {
      tokenCourses: {
        with: {
          course: true,
        },
      },
      group: {
        with: {
          members: {
            with: {
              user: true,
            },
          },
        },
      },
    },
    orderBy: [desc(enrollmentTokens.createdAt)],
  });

  return tokens.map((t) => ({
    id: t.id,
    token: t.token,
    capacity: t.capacity,
    createdAt: t.createdAt,
    expiresAt: t.expiresAt,
    courses: t.tokenCourses.map((tc) => ({
      id: tc.course.id,
      title: tc.course.title,
    })),
    group: t.group
      ? {
          id: t.group.id,
          name: t.group.name,
          packageType: t.group.packageType,
          packageName: t.group.packageName,
          totalQuotaSessions: t.group.totalQuotaSessions,
          weeklyQuotaSessions: t.group.weeklyQuotaSessions,
          members: t.group.members.map((m) => ({
            userId: m.userId,
            joinedAt: m.joinedAt,
            user: {
              name: m.user.name,
              email: m.user.email,
            },
          })),
        }
      : null,
  }));
}

/**
 * Configuration options for token meeting quota and group tier.
 */
export type TokenQuotaOptions = {
  totalQuotaSessions?: number;
  weeklyQuotaSessions?: number;
  packageType?: PackageType;
};

/**
 * Generate a new enrollment token for multiple courses, group capacity, and meeting quota.
 * Validates that capacity is an integer between 1 and 1000 and quotas are non-negative integers.
 *
 * @param courseIds - List of course IDs to associate with the token and group.
 * @param capacity - Maximum number of students that can redeem this token (1–1000).
 * @param quotaConfig - Preset name, numeric total quota, or structured quota options.
 * @param weeklyQuotaArg - Optional weekly sessions limit when quotaConfig is a number.
 * @returns Result object containing the generated token and group ID, or an error message.
 */
export async function generateEnrollmentToken(
  courseIds: string[],
  capacity: number,
  quotaConfig: PackageType | number | TokenQuotaOptions = "reguler_15",
  weeklyQuotaArg?: number
) {
  await assertAdmin();

  if (!courseIds || courseIds.length === 0) {
    return { success: false, error: "Silakan pilih setidaknya satu course" };
  }

  if (typeof capacity !== "number" || !Number.isInteger(capacity) || capacity < 1 || capacity > 1000) {
    return { success: false, error: "Kapasitas kelompok harus bilangan bulat antara 1 dan 1000 orang" };
  }

  // Parse quota configuration
  let totalQuota = 15;
  let weeklyQuota = 1;
  let packageType: PackageType = "reguler_15";

  if (typeof quotaConfig === "number") {
    totalQuota = quotaConfig;
    weeklyQuota = typeof weeklyQuotaArg === "number" ? weeklyQuotaArg : (totalQuota === 0 ? 0 : 1);
    packageType = "custom";
  } else if (typeof quotaConfig === "object" && quotaConfig !== null) {
    totalQuota = quotaConfig.totalQuotaSessions ?? 15;
    weeklyQuota = quotaConfig.weeklyQuotaSessions ?? (totalQuota === 0 ? 0 : 1);
    packageType = "custom";
  } else if (typeof quotaConfig === "string") {
    packageType = quotaConfig;
    const preset = PACKAGE_PRESETS[packageType] || PACKAGE_PRESETS.reguler_15;
    totalQuota = preset.quota;
    weeklyQuota = preset.weeklySessions;
  }

  if (typeof totalQuota !== "number" || !Number.isInteger(totalQuota) || totalQuota < 0) {
    return { success: false, error: "Total kuota pertemuan harus bilangan bulat minimal 0" };
  }

  if (typeof weeklyQuota !== "number" || !Number.isInteger(weeklyQuota) || weeklyQuota < 0) {
    return { success: false, error: "Batas sesi per minggu harus bilangan bulat minimal 0" };
  }

  // Resolve matching package name and tier
  let packageName = `Paket Kustom (${totalQuota} Sesi)`;
  if (totalQuota === 15 && (weeklyQuota === 1 || weeklyQuota === 15)) {
    packageType = "reguler_15";
    packageName = PACKAGE_PRESETS.reguler_15.name;
  } else if (totalQuota === 30 && (weeklyQuota === 2 || weeklyQuota === 30)) {
    packageType = "intensif_30";
    packageName = PACKAGE_PRESETS.intensif_30.name;
  } else if (totalQuota === 45 && (weeklyQuota === 3 || weeklyQuota === 45)) {
    packageType = "super_intensif_45";
    packageName = PACKAGE_PRESETS.super_intensif_45.name;
  } else if (totalQuota === 0) {
    packageType = "custom";
    packageName = "Tanpa Kuota Pertemuan (0 Sesi)";
    weeklyQuota = 0;
  }

  // Verify all courses exist
  const courseRecords = await db.query.courses.findMany({
    where: inArray(courses.id, courseIds),
  });

  if (courseRecords.length !== courseIds.length) {
    return { success: false, error: "Satu atau lebih course tidak ditemukan" };
  }

  const now = new Date();
  // Calculate semester end date
  const expiresAt = getSemesterEndDate(now);

  // Generate unique 8 alphanumeric characters
  const unique8 = randomUUID().split("-")[0].toUpperCase();
  
  // Format: Zyx-{unique_8_letters_and_numbers}-{#people}-{#courses}
  const token = `Zyx-${unique8}-${capacity}-${courseIds.length}`;

  try {
    const groupId = randomUUID();
    await db.transaction(async (tx) => {
      // 1. Create a dedicated group with package configuration
      await tx.insert(groups).values({
        id: groupId,
        name: `Kelompok Token ${token}`,
        packageType,
        packageName,
        totalQuotaSessions: totalQuota,
        weeklyQuotaSessions: weeklyQuota,
        usedQuotaSessions: 0,
        academicYear: "2026/2027",
        semester: "Ganjil",
        startDate: now,
        endDate: expiresAt,
        status: "active",
        createdAt: now,
      });

      // 2. Create the token
      const tokenId = randomUUID();
      await tx.insert(enrollmentTokens).values({
        id: tokenId,
        token,
        groupId,
        capacity,
        expiresAt,
        createdAt: now,
      });

      // 3. Link courses to token and group
      for (const courseId of courseIds) {
        await tx.insert(enrollmentTokenCourses).values({
          tokenId,
          courseId,
        });

        await tx.insert(groupCourses).values({
          id: randomUUID(),
          groupId,
          courseId,
          createdAt: now,
        });
      }
    });

    revalidatePath("/admin/tokens");
    revalidatePath("/admin/groups");
    revalidatePath("/dashboard/groups");
    return { success: true, token, groupId };
  } catch (err: any) {
    console.error("Failed to generate enrollment token:", err);
    return { success: false, error: "Gagal membuat token" };
  }
}

/**
 * Delete / revoke a token and its group
 */
export async function deleteEnrollmentToken(tokenId: string) {
  await assertAdmin();

  try {
    const tokenRecord = await db.query.enrollmentTokens.findFirst({
      where: eq(enrollmentTokens.id, tokenId),
    });

    if (tokenRecord) {
      // Deleting the group will cascade to the token, courses, and bookings
      await db.delete(groups).where(eq(groups.id, tokenRecord.groupId));
    }

    revalidatePath("/admin/tokens");
    revalidatePath("/admin/groups");
    revalidatePath("/dashboard/groups");
    return { success: true };
  } catch (err: any) {
    console.error("Failed to delete token:", err);
    return { success: false, error: "Gagal menghapus token" };
  }
}
