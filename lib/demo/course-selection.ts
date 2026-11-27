import "server-only";
import { asc, eq, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { courses, mataKuliah } from "@/db/schema";
import { recordOfflineChange } from "@/lib/offline/server-events";
import { getDemoCourseEligibility } from "@/app/(marketing)/demo/demo-data";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function inspectDemoSelection(courseId: string, enabled: boolean) {
  const cleanCourseId = courseId.trim().toLowerCase();
  if (!cleanCourseId) {
    return { success: false as const, error: "Mata kuliah tidak ditemukan." };
  }

  const matchingCanonicalCourses = await db
    .select({ id: mataKuliah.id, status: mataKuliah.status, legacyCourseId: mataKuliah.legacyCourseId })
    .from(mataKuliah)
    .where(or(eq(mataKuliah.id, cleanCourseId), eq(mataKuliah.legacyCourseId, cleanCourseId)))
    .orderBy(asc(mataKuliah.id));

  if (matchingCanonicalCourses.length === 0) {
    return { success: false as const, error: "Mata kuliah tidak ditemukan." };
  }
  if (matchingCanonicalCourses.length !== 1) {
    return { success: false as const, error: "Pemetaan mata kuliah tidak jelas." };
  }

  const canonicalCourse = matchingCanonicalCourses[0];
  if (canonicalCourse.legacyCourseId) {
    const mappedCourses = await db
      .select({ id: mataKuliah.id })
      .from(mataKuliah)
      .where(eq(mataKuliah.legacyCourseId, canonicalCourse.legacyCourseId));
    if (mappedCourses.length !== 1 || mappedCourses[0]?.id !== canonicalCourse.id) {
      return { success: false as const, error: "Pemetaan mata kuliah tidak jelas." };
    }

    const legacyCourses = await db
      .select({ id: courses.id })
      .from(courses)
      .where(eq(courses.id, canonicalCourse.legacyCourseId));
    if (legacyCourses.length !== 1) {
      return { success: false as const, error: "Pemetaan mata kuliah tidak jelas." };
    }
  }

  if (enabled) {
    if (canonicalCourse.status !== "active") {
      return { success: false as const, error: "Hanya mata kuliah aktif yang dapat dipilih sebagai demo." };
    }

    const eligibility = await getDemoCourseEligibility(canonicalCourse.id);
    if (!eligibility.eligible) {
      return {
        success: false as const,
        error: `Belum siap untuk demo: ${eligibility.issues.join("; ")}`,
        eligibility,
      };
    }
  }

  return { success: true as const, canonicalId: canonicalCourse.id };
}

export async function currentDemoCourse(tx: Pick<Transaction, "select"> = db) {
  const [current] = await tx.select({ id: mataKuliah.id, title: mataKuliah.title }).from(mataKuliah).where(eq(mataKuliah.isDemo, true));
  return current ?? null;
}

export async function writeDemoSelection(tx: Transaction, canonicalId: string, enabled: boolean) {
  const now = new Date();
  const previous = enabled
    ? await tx.update(mataKuliah)
      .set({ isDemo: false, updatedAt: now })
      .where(eq(mataKuliah.isDemo, true))
      .returning({ id: mataKuliah.id })
    : [];

  await tx
    .update(mataKuliah)
    .set({ isDemo: enabled, updatedAt: now })
    .where(eq(mataKuliah.id, canonicalId));
  for (const courseId of new Set([canonicalId, ...previous.map(course => course.id)])) {
    await recordOfflineChange(tx, { kind: "access", courseId, action: "invalidate" });
  }
}

export function revalidateDemoSelection(canonicalId: string) {
  revalidatePath("/demo");
  revalidatePath(`/demo/article`);
  revalidatePath(`/demo/diktat`);
  revalidatePath(`/demo/flashcards`);
  revalidatePath(`/demo/quiz`);
  revalidatePath(`/demo/zyra`);
  revalidatePath("/admin/courses");
  revalidatePath(`/admin/courses/${canonicalId}`);
  revalidatePath(`/admin/courses/${canonicalId}/settings`);
}
