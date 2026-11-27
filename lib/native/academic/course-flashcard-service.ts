import "server-only";
import { applyFlashcardAdminChange, requireFlashcardCourse, revalidateCourseFlashcards, type FlashcardAdminChange } from "@/lib/academic/flashcard-admin-writes";
import type { CourseCommandViewer } from "./course-command";
import { courseWrite } from "./course-write";

export async function saveAdminCourseFlashcard(slug: string, change: FlashcardAdminChange, requestId: string, viewer: CourseCommandViewer) {
  const result = await courseWrite({
    slug, targetId: change.id, draft: { change, expectedRevision: change.method === "delete" ? change.expectedRevision : change.draft.expectedRevision }, requestId, viewer,
    entityType: "native_course_flashcard", action: change.method,
    async write(tx) {
      const scope = await requireFlashcardCourse(tx, slug);
      const id = await applyFlashcardAdminChange(tx, scope, viewer.user.id, change);
      return { id, canonicalCourseId: scope.primaryId, legacyCourseId: scope.legacyId ?? undefined };
    },
    async validateReplay(tx, saved) {
      const scope = await requireFlashcardCourse(tx, slug);
      if (scope.primaryId !== saved.canonicalCourseId || (change.id && change.id !== saved.id)) throw new Error("FLASHCARD_NOT_FOUND");
    },
  });
  revalidateCourseFlashcards({ slug, primaryId: result.canonicalCourseId, legacyId: result.legacyCourseId ?? null });
}
