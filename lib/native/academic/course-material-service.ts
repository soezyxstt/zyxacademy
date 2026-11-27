import "server-only";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { bab, chapters, courseMaterials, mataKuliah } from "@/db/schema";
import { cleanRemovedCoursePdf, removeCoursePdf } from "@/lib/academic/course-material-delete";
import { writeCourseMaterialMetadata } from "@/lib/academic/course-material-metadata";
import { resolveCourseIdentity, type ResolvedCourseIdentity } from "@/lib/admin/course-identity";
import { normalizeLevel1Category, isValidSubcategory, type CourseMaterialSubcategory } from "@/lib/course-materials";
import { revisionOf } from "@/lib/admin-mcp/revision";
import type { AdminEntityDeleteDraft, AdminMaterialTitleDraft, AdminMaterialTitleEdit } from "@/packages/native-parity/academic/courses/edit-contract";
import type { CourseCommandViewer } from "./course-command";
import { courseWrite, type CourseWriteTransaction } from "./course-write";

function pdfRows(source: Pick<typeof db, "select">, scope: ResolvedCourseIdentity, materialId: string) {
  return source.select().from(courseMaterials)
    .where(and(eq(courseMaterials.id, materialId), inArray(courseMaterials.courseId, scope.allIds))).limit(1);
}

export async function readCoursePdfTitleEdit(scope: ResolvedCourseIdentity, materialId: string,
  choices: readonly { id: string; title: string; legacyChapterId?: string | null }[]): Promise<AdminMaterialTitleEdit | null> {
  if (scope.status !== "active") return null;
  const [pdf] = await pdfRows(db, scope, materialId);
  if (!pdf) return null;
  const aliases = new Map(choices.filter(row => row.legacyChapterId).map(row => [row.legacyChapterId!, row.id]));
  const type = normalizeLevel1Category(pdf.type);
  return { title: pdf.title, revision: revisionOf(pdf), chapters: choices.map(({ id, title }) => ({ id, title })),
    metadata: { type, subcategory: pdf.subcategory && isValidSubcategory(type, pdf.subcategory) ? pdf.subcategory as CourseMaterialSubcategory : null,
      year: pdf.year, chapterIds: [...new Set(pdf.chapterIds.map(id => aliases.get(id) ?? id))] } };
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
      if (draft.metadata) {
        const selected = draft.metadata.chapterIds;
        const canonical = await tx.select({ id: bab.id }).from(bab).where(and(inArray(bab.id, selected),
          inArray(bab.mataKuliahId, scope.allIds), eq(bab.status, "active"))).for("share");
        const legacy = await tx.select({ id: chapters.id }).from(chapters).where(and(inArray(chapters.id, selected),
          inArray(chapters.courseId, scope.allIds))).for("share");
        const valid = new Set([...canonical, ...legacy].map(row => row.id));
        if (selected.some(id => !valid.has(id))) throw new Error("CHAPTER_NOT_FOUND");
      }
      const updated = await writeCourseMaterialMetadata(tx, materialId, pdf.courseId, { title: draft.title, ...draft.metadata }, scope.allIds);
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

  revalidatePdf(slug, materialId, result);
}

export async function deleteCoursePdfFromNative(slug: string, materialId: string, draft: AdminEntityDeleteDraft,
  requestId: string, viewer: CourseCommandViewer) {
  let cleanup: string[] = [];
  const result = await courseWrite({ slug, targetId: materialId, draft, requestId, viewer, entityType: "native_course_material", action: "delete",
    async write(tx) {
      const scope = await requireActiveCourse(tx, slug);
      const [pdf] = await pdfRows(tx, scope, materialId).for("update");
      if (!pdf) throw new Error("MATERIAL_NOT_FOUND");
      if (revisionOf(pdf) !== draft.expectedRevision) throw new Error("REVISION_CONFLICT");
      cleanup = await removeCoursePdf(tx, pdf, scope.allIds);
      return { id: pdf.id, canonicalCourseId: scope.primaryId, legacyCourseId: pdf.courseId };
    },
    async validateReplay(tx, saved) {
      const scope = await requireActiveCourse(tx, slug);
      if (scope.primaryId !== saved.canonicalCourseId || saved.id !== materialId) throw new Error("MATERIAL_NOT_FOUND");
    },
  });
  revalidatePdf(slug, materialId, result);
  await cleanRemovedCoursePdf(cleanup);
}

function revalidatePdf(slug: string, materialId: string, result: { canonicalCourseId: string; legacyCourseId?: string }) {
  revalidatePath("/admin/courses");
  for (const id of new Set([slug, result.canonicalCourseId, result.legacyCourseId].filter((value): value is string => Boolean(value)))) {
    const encoded = encodeURIComponent(id);
    revalidatePath(`/admin/courses/${encoded}`);
    revalidatePath(`/admin/courses/${encoded}/documents`);
    revalidatePath(`/admin/courses/${encoded}/documents/${encodeURIComponent(materialId)}`);
    revalidatePath(`/courses/${encoded}/material`);
  }
}
