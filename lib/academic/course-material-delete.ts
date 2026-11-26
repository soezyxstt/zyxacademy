import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { blokArtikelSumber, courseMaterials, sumberMateri } from "@/db/schema";
import { recordOfflineChange } from "@/lib/offline/server-events";
import { storage } from "@/lib/storage";
import { buildCourseThumbnailKey, isSafeKey, slugifySegment } from "@/lib/storage/keys";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Pdf = typeof courseMaterials.$inferSelect;

/** The caller holds the document row lock and has checked the owning course. */
export async function removeCoursePdf(tx: Tx, pdf: Pdf, courseIds: readonly string[]) {
  const projectionId = "sm-legacy-" + pdf.id;
  const [projection] = await tx.select({ courseId: sumberMateri.mataKuliahId }).from(sumberMateri)
    .where(eq(sumberMateri.id, projectionId)).limit(1).for("update");
  if (projection && !courseIds.includes(projection.courseId)) throw new Error("DEPENDENCIES_EXIST");
  const [linked] = await tx.select({ id: blokArtikelSumber.id }).from(blokArtikelSumber)
    .where(eq(blokArtikelSumber.sumberMateriId, projectionId)).limit(1);
  if (linked) throw new Error("DEPENDENCIES_EXIST");
  await tx.delete(sumberMateri).where(and(eq(sumberMateri.id, projectionId), inArray(sumberMateri.mataKuliahId, courseIds)));
  await tx.delete(courseMaterials).where(and(eq(courseMaterials.id, pdf.id), eq(courseMaterials.courseId, pdf.courseId)));
  await recordOfflineChange(tx, { kind: "course", courseId: pdf.courseId, action: "invalidate" });
  const prefix = "courses/" + slugifySegment(pdf.courseId) + "/materials/";
  const keys: string[] = [];
  if (isSafeKey(pdf.fileUrl) && pdf.fileUrl.startsWith(prefix) && pdf.fileUrl.toLowerCase().endsWith(".pdf")) keys.push(pdf.fileUrl);
  if (pdf.thumbnailUrl && (["webp", "png", "jpg"] as const).some(extension =>
    pdf.thumbnailUrl === buildCourseThumbnailKey({ courseSlug: pdf.courseId, materialId: pdf.id, extension }))) keys.push(pdf.thumbnailUrl);
  return keys;
}

/** Only clean up uploaded objects after their catalog transaction commits. Legacy links are externally owned. */
export async function cleanRemovedCoursePdf(keys: string[]) {
  for (const key of keys) {
    try {
      const [catalog] = await db.select({ id: courseMaterials.id }).from(courseMaterials)
        .where(or(eq(courseMaterials.fileUrl, key), eq(courseMaterials.thumbnailUrl, key))).limit(1);
      const [source] = await db.select({ id: sumberMateri.id }).from(sumberMateri).where(eq(sumberMateri.canonicalUriOrR2Key, key)).limit(1);
      if (!catalog && !source) await storage.delete(key);
    } catch {
      console.warn("Course PDF cleanup could not be completed.");
    }
  }
}
