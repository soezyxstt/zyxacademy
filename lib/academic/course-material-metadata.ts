import { and, eq, inArray } from "drizzle-orm";
import type { db } from "@/db";
import { courseMaterials, sumberMateri } from "@/db/schema";
import { recordOfflineChange } from "@/lib/offline/server-events";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Pdf = typeof courseMaterials.$inferSelect;
type Metadata = Pick<Pdf, "title"> & Partial<Pick<Pdf, "type" | "subcategory" | "year" | "chapterIds">>;

export async function writeCourseMaterialMetadata(tx: Transaction, id: string, courseId: string, metadata: Metadata, projectionCourseIds?: readonly string[]) {
  const now = new Date();
  const [updated] = await tx.update(courseMaterials).set({ ...metadata, updatedAt: now })
    .where(and(eq(courseMaterials.id, id), eq(courseMaterials.courseId, courseId))).returning();
  if (!updated) return null;
  await tx.update(sumberMateri).set({ title: metadata.title, updatedAt: now }).where(and(
    eq(sumberMateri.id, `sm-legacy-${id}`),
    projectionCourseIds ? inArray(sumberMateri.mataKuliahId, projectionCourseIds) : undefined,
  ));
  await recordOfflineChange(tx, { kind: "course", courseId, action: "invalidate" });
  return updated;
}
