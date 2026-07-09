"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { enrollmentTokens, courses, groups, enrollmentTokenCourses } from "@/db/schema";
import { assertAdmin } from "@/lib/uploadthing-admin";
import { eq, desc, inArray } from "drizzle-orm";
import { getSemesterEndDate } from "@/lib/utils";

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
 * Generate a new enrollment token for multiple courses and group size capacity
 */
export async function generateEnrollmentToken(courseIds: string[], capacity: number) {
  await assertAdmin();

  if (!courseIds || courseIds.length === 0) {
    return { success: false, error: "Silakan pilih setidaknya satu course" };
  }

  if (capacity < 1 || capacity > 5) {
    return { success: false, error: "Kapasitas kelompok harus di antara 1 dan 5 orang" };
  }

  // Verify all courses exist
  const courseRecords = await db.query.courses.findMany({
    where: inArray(courses.id, courseIds),
  });

  if (courseRecords.length !== courseIds.length) {
    return { success: false, error: "Satu atau lebih course tidak ditemukan" };
  }

  // Calculate semester end date
  const expiresAt = getSemesterEndDate(new Date());

  // Generate unique 8 alphanumeric characters
  const unique8 = randomUUID().split("-")[0].toUpperCase();
  
  // Format: Zyx-{unique_8_letters_and_numbers}-{#people}-{#courses}
  const token = `Zyx-${unique8}-${capacity}-${courseIds.length}`;

  try {
    await db.transaction(async (tx) => {
      // 1. Create a dedicated group
      const groupId = randomUUID();
      await tx.insert(groups).values({
        id: groupId,
        name: `Kelompok Token ${token}`,
      });

      // 2. Create the token
      const tokenId = randomUUID();
      await tx.insert(enrollmentTokens).values({
        id: tokenId,
        token,
        groupId,
        capacity,
        expiresAt,
      });

      // 3. Link courses
      for (const courseId of courseIds) {
        await tx.insert(enrollmentTokenCourses).values({
          tokenId,
          courseId,
        });
      }
    });

    revalidatePath("/admin/tokens");
    return { success: true, token };
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
      // Deleting the group will cascade to the token and course links
      await db.delete(groups).where(eq(groups.id, tokenRecord.groupId));
    }

    revalidatePath("/admin/tokens");
    return { success: true };
  } catch (err: any) {
    console.error("Failed to delete token:", err);
    return { success: false, error: "Gagal menghapus token" };
  }
}
