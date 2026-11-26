import "server-only";
import { eq, inArray } from "drizzle-orm";
import { bab, chapters, mataKuliah } from "@/db/schema";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";
import { saveChapterWithCanonicalProjection } from "@/lib/academic/course-canonical-sync";
import { courseChapterRevision } from "@/lib/academic/course-chapter-revision";
import { revalidateChapterPaths } from "@/lib/academic/revalidate-chapter-paths";
import type { AdminChapterDraft } from "@/packages/native-parity/academic/courses/edit-contract";
import type { CourseCommandViewer } from "./course-command";
import { courseWrite } from "./course-write";

export async function saveCourseChapterFromNative(slug: string, chapterId: string | undefined, draft: AdminChapterDraft, requestId: string, viewer: CourseCommandViewer) {
  const result = await courseWrite({
    slug, targetId: chapterId, draft, requestId, viewer,
    entityType: "native_course_chapter", action: chapterId ? "update" : "create",
    async write(tx) {
      const course = await resolveCourseIdentity(slug, tx);
      if (!course?.canonicalId || course.status !== "active") throw new Error("COURSE_NOT_FOUND");
      const [active] = await tx.select({ status: mataKuliah.status, legacyId: mataKuliah.legacyCourseId })
        .from(mataKuliah).where(eq(mataKuliah.id, course.canonicalId)).limit(1).for("share");
      if (!active || active.status !== "active" || active.legacyId !== course.legacyId) throw new Error("COURSE_NOT_FOUND");
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
  });
  revalidateChapterPaths([slug, result.canonicalCourseId]);
}
