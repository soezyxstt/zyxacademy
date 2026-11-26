import "server-only";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { mataKuliah } from "@/db/schema";
import { deleteAdminQuestionTx } from "@/lib/academic/admin-question-delete";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";
import { dispatchVectorSync } from "@/lib/vector-sync-dispatch";
import type { AdminEntityDeleteDraft } from "@/packages/native-parity/academic/courses/edit-contract";
import type { CourseCommandViewer } from "./course-command";
import { courseWrite, type CourseWriteTransaction } from "./course-write";

async function requireCourse(tx: CourseWriteTransaction, slug: string) {
  const scope = await resolveCourseIdentity(slug, tx);
  if (!scope || scope.status !== "active") throw new Error("COURSE_NOT_FOUND");
  if (scope.canonicalId) {
    const [record] = await tx.select({ status: mataKuliah.status, legacyId: mataKuliah.legacyCourseId }).from(mataKuliah)
      .where(eq(mataKuliah.id, scope.canonicalId)).limit(1).for("share");
    if (!record || record.status !== "active" || record.legacyId !== scope.legacyId) throw new Error("COURSE_NOT_FOUND");
  }
  return scope;
}

export async function deleteAdminCourseQuestion(slug: string, id: string, draft: AdminEntityDeleteDraft, requestId: string, viewer: CourseCommandViewer) {
  const saved = await courseWrite({
    slug, targetId: id, draft, requestId, viewer, entityType: "native_course_question", action: "delete",
    async write(tx) {
      const scope = await requireCourse(tx, slug);
      const result = await deleteAdminQuestionTx(tx, { id, actorId: viewer.user.id, courseIds: scope.allIds, expectedRevision: draft.expectedRevision });
      if (!result) throw new Error("QUESTION_NOT_FOUND");
      return { id, canonicalCourseId: scope.primaryId, legacyCourseId: result.legacyId ?? undefined };
    },
    async validateReplay(tx, saved) {
      const scope = await requireCourse(tx, slug);
      if (scope.primaryId !== saved.canonicalCourseId || saved.id !== id ||
        (saved.legacyCourseId && !scope.allIds.includes(saved.legacyCourseId))) throw new Error("QUESTION_NOT_FOUND");
    },
  });
  if (saved.legacyCourseId) await dispatchVectorSync(saved.legacyCourseId);
  revalidatePath("/admin/questions");
  for (const value of new Set([slug, saved.canonicalCourseId, saved.legacyCourseId])) {
    if (!value) continue;
    const course = encodeURIComponent(value);
    revalidatePath(`/admin/courses/${course}/questions`);
    revalidatePath(`/admin/courses/${course}/quizzes`);
    revalidatePath(`/tutor/${course}/quizzes`);
  }
}
