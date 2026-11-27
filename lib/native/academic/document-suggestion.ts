import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { artikel, bab, chapters, courseMaterials, diktatMateri, websiteMaterials } from "@/db/schema";

import { resolveCourseIdentity } from "@/lib/admin/course-identity";
import { assertNativeAdminTransaction, type NativeAdminViewer } from "@/lib/auth/native-admin-session";
import { materialFilename, type DocumentSource, type MetadataValues } from "@/packages/native-parity/academic/courses/document-suggestion";

export async function suggestCourseDocument(viewer: NativeAdminViewer, slug: string, id: string, source: DocumentSource, currentValues: MetadataValues) {
  const context = await db.transaction(async tx => {
    await assertNativeAdminTransaction(tx, viewer);
    const course = await resolveCourseIdentity(slug, tx);
    if (!course || course.status !== "active") throw new Error("NOT_FOUND");

    let filename = currentValues.title.trim();
    if (source === "pdf") {
      const [pdf] = await tx.select({ fileUrl: courseMaterials.fileUrl }).from(courseMaterials)
        .where(and(eq(courseMaterials.id, id), inArray(courseMaterials.courseId, course.allIds))).limit(1);
      if (!pdf) throw new Error("NOT_FOUND");
      filename = materialFilename(pdf.fileUrl, filename);
    } else if (source === "legacy-article") {
      const [article] = await tx.select({ id: websiteMaterials.id }).from(websiteMaterials)
        .where(and(eq(websiteMaterials.id, id), inArray(websiteMaterials.courseId, course.allIds),
          inArray(websiteMaterials.status, ["draft", "published"]))).limit(1);
      if (!article) throw new Error("NOT_FOUND");
    } else {
      if (!course.canonicalId) throw new Error("NOT_FOUND");
      const table = source === "canonical-article" ? artikel : diktatMateri;
      const [row] = await tx.select({ id: table.id }).from(table).where(and(eq(table.id, id),
        eq(table.mataKuliahId, course.canonicalId), inArray(table.status, ["draft", "published", "in_review"]))).limit(1);
      if (!row) throw new Error("NOT_FOUND");
    }

    let options = course.canonicalId && source !== "legacy-article" ? await tx.select({ id: bab.id, title: bab.title, orderIndex: bab.orderIndex })
      .from(bab).where(and(eq(bab.mataKuliahId, course.canonicalId), eq(bab.status, "active"))).orderBy(asc(bab.orderIndex), asc(bab.id)) : [];
    if ((source === "legacy-article" || source === "pdf") && !options.length && course.legacyId) {
      options = await tx.select({ id: chapters.id, title: chapters.title, orderIndex: chapters.orderIndex })
        .from(chapters).where(eq(chapters.courseId, course.legacyId)).orderBy(asc(chapters.orderIndex), asc(chapters.id));
    }
    return { filename, courseCode: course.primaryId, courseTitle: course.title, chapters: options };
  });
  const { standardizeDocumentMetadataWithAi } = await import("@/lib/academic/ai-document-standardizer");
  const result = await standardizeDocumentMetadataWithAi({ ...context, currentValues, userId: viewer.user.id });
  return { title: result.title.slice(0, 500), category: result.category, subcategory: result.subcategory,
    year: Number.isInteger(result.year) ? result.year : null, chapterIds: result.chapterIds };
}
