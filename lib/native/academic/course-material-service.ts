import "server-only";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { courseMaterials, mataKuliah } from "@/db/schema";
import { writeCourseMaterialMetadata } from "@/lib/academic/course-material-metadata";
import { resolveCourseIdentity, type ResolvedCourseIdentity } from "@/lib/admin/course-identity";
import { revisionOf } from "@/lib/admin-mcp/revision";
import type { AdminMaterialTitleDraft, AdminMaterialTitleEdit } from "@/packages/native-parity/academic/courses/edit-contract";
import type { CourseCommandViewer } from "./course-command";
import { courseWrite, type CourseWriteTransaction } from "./course-write";

function pdfRows(source: Pick<typeof db, "select">, scope: ResolvedCourseIdentity, materialId: string) {
  return source.select().from(courseMaterials)
    .where(and(eq(courseMaterials.id, materialId), inArray(courseMaterials.courseId, scope.allIds))).limit(1);
}

export async function readCoursePdfTitleEdit(scope: ResolvedCourseIdentity, materialId: string): Promise<AdminMaterialTitleEdit | null> {
  if (scope.status !== "active") return null;
  const [pdf] = await pdfRows(db, scope, materialId);
  return pdf ? { title: pdf.title, revision: revisionOf(pdf) } : null;
}

async function requireActiveCourse(tx: CourseWriteTransaction, slug: string) {
  const scope = await resolveCourseIdentity(slug, tx);
  if (!scope || scope.status !== "active") throw new Error("COURSE_NOT_FOUND");
  if (scope.canonicalId) {
    const [current] = await tx.select({ status: mataKuliah.status, legacyId: mataKuliah.legacyCourseId })
      .from(mataKuliah).where(eq(mataKuliah.id, scope.canonicalId)).limit(1).for("share");
    if (!current || current.status !== "active" || current.legacyId !== scope.legacyId) throw new Error("COURSE_NOT_FOUND");
  }
  return scope;
}

export async function updateCoursePdfTitleFromNative(slug: string, materialId: string, draft: AdminMaterialTitleDraft, requestId: string, viewer: CourseCommandViewer) {
  const result = await courseWrite({
    slug, targetId: materialId, draft, requestId, viewer, entityType: "native_course_material", action: "update",
    async write(tx) {
      const scope = await requireActiveCourse(tx, slug);
      const [pdf] = await pdfRows(tx, scope, materialId).for("update");
      if (!pdf) throw new Error("MATERIAL_NOT_FOUND");
      if (revisionOf(pdf) !== draft.expectedRevision) throw new Error("REVISION_CONFLICT");
      const updated = await writeCourseMaterialMetadata(tx, materialId, pdf.courseId, { title: draft.title }, scope.allIds);
      if (!updated) throw new Error("MATERIAL_NOT_FOUND");
      return { id: updated.id, canonicalCourseId: scope.primaryId, legacyCourseId: pdf.courseId };
    },
    async validateReplay(tx, saved) {
      const scope = await requireActiveCourse(tx, slug);
      if (scope.primaryId !== saved.canonicalCourseId || saved.id !== materialId) throw new Error("MATERIAL_NOT_FOUND");
      const [pdf] = await pdfRows(tx, scope, saved.id).for("share");
      if (!pdf) throw new Error("MATERIAL_NOT_FOUND");
    },
  });

  revalidatePath("/admin/courses");
  for (const id of new Set([slug, result.canonicalCourseId, result.legacyCourseId].filter((value): value is string => Boolean(value)))) {
    const encoded = encodeURIComponent(id);
    revalidatePath(`/admin/courses/${encoded}`);
    revalidatePath(`/admin/courses/${encoded}/documents`);
    revalidatePath(`/admin/courses/${encoded}/documents/${encodeURIComponent(materialId)}`);
    revalidatePath(`/courses/${encoded}/material`);
  }
}
