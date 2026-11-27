import "server-only";
import { eq } from "drizzle-orm";
import { courses, mataKuliah } from "@/db/schema";
import { archiveCourseWithLegacyDeletion, saveCourseWithCanonicalProjection } from "@/lib/academic/course-canonical-sync";
import { relatedRows } from "@/lib/academic/related-rows";
import { parseCoursePricingInput } from "@/lib/student/course-pricing";
import type { AdminCourseArchiveDraft, AdminCourseCreateDraft } from "@/packages/native-parity/academic/courses/edit-contract";
import type { CourseCommandViewer } from "./course-command";
import { readCourseSettingsInTransaction, revalidateNativeCoursePaths } from "./course-settings-service";
import { courseWrite } from "./course-write";

export async function createCourseFromNative(draft: AdminCourseCreateDraft, requestId: string, viewer: CourseCommandViewer) {
  // Validate serialized pricing before taking transaction locks.
  const pricing = parseCoursePricingInput(draft.pricing);
  const { id, title, description } = draft;
  const created = await courseWrite({
    slug: id, draft, requestId, viewer, entityType: "native_course_management", action: "create",
    write: tx => saveCourseWithCanonicalProjection({
      id, title, description, pricing, isNew: true, actorId: viewer.user.id,
      category: draft.category as Parameters<typeof saveCourseWithCanonicalProjection>[0]["category"],
    }, tx),
    async validateReplay(tx, saved) {
      const current = await readCourseSettingsInTransaction(id, tx);
      if (!current || current.canonicalId !== saved.canonicalCourseId) throw new Error("COURSE_NOT_FOUND");
    },
  });
  revalidateNativeCoursePaths([id, created.canonicalCourseId]);
}

export async function archiveCourseFromNative(slug: string, draft: AdminCourseArchiveDraft, requestId: string, viewer: CourseCommandViewer) {
  if (!draft.confirmed) throw new Error("COURSE_PROJECTION_UNAVAILABLE");
  const archived = await courseWrite({
    slug, draft, requestId, viewer, entityType: "native_course_management", action: "archive",
    async write(tx) {
      const current = await readCourseSettingsInTransaction(slug, tx);
      if (!current) throw new Error("COURSE_NOT_FOUND");
      if (current.revision !== draft.expectedRevision) throw new Error("REVISION_CONFLICT");
      if (current.canonicalId) await tx.select({ id: mataKuliah.id }).from(mataKuliah).where(eq(mataKuliah.id, current.canonicalId)).for("update");
      if (current.legacyId) await tx.select({ id: courses.id }).from(courses).where(eq(courses.id, current.legacyId)).for("update");
      const [legacy, canonical] = await Promise.all([
        current.legacyId ? relatedRows(courses, current.legacyId, tx) : {},
        current.canonicalId ? relatedRows(mataKuliah, current.canonicalId, tx) : {},
      ]);
      if (Object.keys(legacy).length || Object.keys(canonical).length) throw new Error("DEPENDENCIES_EXIST");
      await archiveCourseWithLegacyDeletion(current.primaryId, viewer.user.id, tx);
      return { id: current.primaryId, canonicalCourseId: current.canonicalId ?? current.primaryId, legacyCourseId: current.legacyId ?? undefined };
    },
    async validateReplay(tx, saved) {
      const [current] = await tx.select({ status: mataKuliah.status }).from(mataKuliah)
        .where(eq(mataKuliah.id, saved.canonicalCourseId)).limit(1);
      if (current && current.status !== "archived") throw new Error("REVISION_CONFLICT");
      if (saved.legacyCourseId) {
        const [legacy] = await tx.select({ id: courses.id }).from(courses).where(eq(courses.id, saved.legacyCourseId)).limit(1);
        if (legacy) throw new Error("REVISION_CONFLICT");
      }
    },
  });
  revalidateNativeCoursePaths([slug, archived.canonicalCourseId, ...(archived.legacyCourseId ? [archived.legacyCourseId] : [])]);
}
