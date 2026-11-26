import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { bab, chapters, courseMaterials, mataKuliah } from "@/db/schema";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";
import { archiveChapterWithLegacyDeletion, reorderChaptersWithCanonicalProjection, saveChapterWithCanonicalProjection } from "@/lib/academic/course-canonical-sync";
import { relatedRows } from "@/lib/academic/related-rows";
import { courseChapterRevision } from "@/lib/academic/course-chapter-revision";
import { revalidateChapterPaths } from "@/lib/academic/revalidate-chapter-paths";
import type { AdminChapterArchiveDraft, AdminChapterDraft, AdminChapterOrderDraft } from "@/packages/native-parity/academic/courses/edit-contract";
import type { CourseCommandViewer } from "./course-command";
import { courseWrite, type CourseWriteTransaction } from "./course-write";

async function requireActiveChapterCourse(slug: string, tx: CourseWriteTransaction, lock: "share" | "update" = "share") {
  const course = await resolveCourseIdentity(slug, tx);
  if (!course?.canonicalId || course.status !== "active") throw new Error("COURSE_NOT_FOUND");
  const [active] = await tx.select({ status: mataKuliah.status, legacyId: mataKuliah.legacyCourseId })
    .from(mataKuliah).where(eq(mataKuliah.id, course.canonicalId)).limit(1).for(lock);
  if (!active || active.status !== "active" || active.legacyId !== course.legacyId) throw new Error("COURSE_NOT_FOUND");
  return { ...course, canonicalId: course.canonicalId };
}

async function requireChapterRevision(course: Awaited<ReturnType<typeof requireActiveChapterCourse>>, revision: string, tx: CourseWriteTransaction) {
  const [canonicalRows, legacyRows] = await Promise.all([
    tx.select().from(bab).where(eq(bab.mataKuliahId, course.canonicalId)),
    tx.select().from(chapters).where(inArray(chapters.courseId, course.allIds)),
  ]);
  if (courseChapterRevision(course.canonicalId, course.legacyId, canonicalRows, legacyRows) !== revision) throw new Error("REVISION_CONFLICT");
  return { canonicalRows, legacyRows };
}

export async function saveCourseChapterFromNative(slug: string, chapterId: string | undefined, draft: AdminChapterDraft, requestId: string, viewer: CourseCommandViewer) {
  const result = await courseWrite({
    slug, targetId: chapterId, draft, requestId, viewer,
    entityType: "native_course_chapter", action: chapterId ? "update" : "create",
    async write(tx) {
      const course = await requireActiveChapterCourse(slug, tx);
      const [canonicalRows, legacyRows] = await Promise.all([
        tx.select().from(bab).where(eq(bab.mataKuliahId, course.canonicalId)),
        tx.select().from(chapters).where(inArray(chapters.courseId, [course.canonicalId, ...(course.legacyId ? [course.legacyId] : [])])),
      ]);
      if (chapterId) {
        const canonical = canonicalRows.find((row) => row.id === chapterId || row.legacyChapterId === chapterId);
        const legacy = legacyRows.find((row) => row.id === chapterId);
        if (canonical ? canonical.status !== "active" : !legacy) throw new Error("CHAPTER_NOT_FOUND");
      }
      if (courseChapterRevision(course.canonicalId, course.legacyId, canonicalRows, legacyRows) !== draft.expectedRevision) {
        throw new Error("REVISION_CONFLICT");
      }
      const saved = await saveChapterWithCanonicalProjection({
        id: chapterId, title: draft.title, description: draft.description || null, courseId: course.canonicalId,
        append: !chapterId, preserveOrder: Boolean(chapterId), orderIndex: 0, actorId: viewer.user.id,
      }, tx);
      return { id: saved.canonicalChapterId, canonicalCourseId: course.canonicalId };
    },
    async validateReplay(tx, saved) {
      const course = await requireActiveChapterCourse(slug, tx);
      if (course.canonicalId !== saved.canonicalCourseId) throw new Error("COURSE_NOT_FOUND");
      const [chapter] = await tx.select({ id: bab.id }).from(bab)
        .where(and(eq(bab.id, saved.id), eq(bab.mataKuliahId, course.canonicalId), eq(bab.status, "active")))
        .limit(1).for("share");
      if (!chapter) throw new Error("CHAPTER_NOT_FOUND");
    },
  });
  revalidateChapterPaths([slug, result.canonicalCourseId]);
}

export async function archiveCourseChapterFromNative(slug: string, chapterId: string, draft: AdminChapterArchiveDraft, requestId: string, viewer: CourseCommandViewer) {
  if (!draft.confirmed) throw new Error("CHAPTER_PROJECTION_UNAVAILABLE");
  const result = await courseWrite({
    slug, targetId: chapterId, draft, requestId, viewer, entityType: "native_chapter_management", action: "archive",
    async write(tx) {
      const course = await requireActiveChapterCourse(slug, tx, "update");
      const { canonicalRows, legacyRows } = await requireChapterRevision(course, draft.expectedRevision, tx);
      const canonical = canonicalRows.filter(row => row.id === chapterId || row.legacyChapterId === chapterId);
      if (canonical.length > 1) throw new Error("CHAPTER_IDENTITY_AMBIGUOUS");
      const current = canonical[0];
      const legacy = legacyRows.find(row => row.id === (current ? current.legacyChapterId : chapterId));
      if (current ? current.status !== "active" : !legacy) throw new Error("CHAPTER_NOT_FOUND");
      if (current) await tx.select({ id: bab.id }).from(bab).where(eq(bab.id, current.id)).for("update");
      if (legacy) await tx.select({ id: chapters.id }).from(chapters).where(eq(chapters.id, legacy.id)).for("update");
      const aliases = [...new Set([chapterId, ...(current ? [current.id] : []), ...(legacy ? [legacy.id] : [])])];
      const references = await Promise.all([
        current ? relatedRows(bab, current.id, tx) : {},
        legacy ? relatedRows(chapters, legacy.id, tx) : {},
        tx.select({ id: courseMaterials.id }).from(courseMaterials).where(and(inArray(courseMaterials.courseId, course.allIds),
          sql`${courseMaterials.chapterIds} ?| array[${sql.join(aliases.map(id => sql`${id}`), sql`, `)}]::text[]`)).limit(1),
      ]);
      if (references.some(rows => Object.keys(rows).length)) throw new Error("DEPENDENCIES_EXIST");
      const archived = await archiveChapterWithLegacyDeletion(chapterId, viewer.user.id, tx);
      if (archived.courseId !== course.canonicalId) throw new Error("CHAPTER_NOT_FOUND");
      return { id: archived.canonicalChapterId ?? chapterId, canonicalCourseId: course.canonicalId,
        legacyCourseId: course.legacyId ?? undefined, ...(legacy ? { legacyChapterId: legacy.id } : {}) };
    },
    async validateReplay(tx, saved) {
      const course = await requireActiveChapterCourse(slug, tx);
      if (course.canonicalId !== saved.canonicalCourseId) throw new Error("COURSE_NOT_FOUND");
      const [active] = await tx.select({ id: bab.id }).from(bab)
        .where(and(eq(bab.id, saved.id), eq(bab.mataKuliahId, course.canonicalId), eq(bab.status, "active"))).limit(1);
      if (active) throw new Error("REVISION_CONFLICT");
      if (saved.legacyChapterId) {
        const [legacy] = await tx.select({ id: chapters.id }).from(chapters)
          .where(and(eq(chapters.id, saved.legacyChapterId), inArray(chapters.courseId, course.allIds))).limit(1);
        if (legacy) throw new Error("REVISION_CONFLICT");
      }
    },
  });
  revalidateChapterPaths([slug, result.canonicalCourseId, ...(result.legacyCourseId ? [result.legacyCourseId] : [])]);
}

export async function reorderCourseChaptersFromNative(slug: string, draft: AdminChapterOrderDraft, requestId: string, viewer: CourseCommandViewer) {
  const result = await courseWrite({
    slug, draft, requestId, viewer, entityType: "native_chapter_management", action: "reorder",
    async write(tx) {
      const course = await requireActiveChapterCourse(slug, tx, "update");
      await requireChapterRevision(course, draft.expectedRevision, tx);
      await reorderChaptersWithCanonicalProjection(course.canonicalId, draft.chapterIds, viewer.user.id, tx);
      return { id: course.canonicalId, canonicalCourseId: course.canonicalId, legacyCourseId: course.legacyId ?? undefined };
    },
    async validateReplay(tx, saved) {
      const course = await requireActiveChapterCourse(slug, tx);
      if (course.canonicalId !== saved.canonicalCourseId) throw new Error("COURSE_NOT_FOUND");
    },
  });
  revalidateChapterPaths([slug, result.canonicalCourseId, ...(result.legacyCourseId ? [result.legacyCourseId] : [])]);
}
