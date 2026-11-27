import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { artikel, bab, chapters, diktatMateri, mataKuliah, websiteMaterials } from "@/db/schema";
import { writeCourseTextDocument } from "@/lib/academic/course-text-document";
import { resolveCourseIdentity, type ResolvedCourseIdentity } from "@/lib/admin/course-identity";
import { getAdminCourseMaterialPreview } from "@/lib/admin/course-material-preview";
import { revisionOf } from "@/lib/admin-mcp/revision";
import { assertNativeAdminTransaction } from "@/lib/auth/native-admin-session";
import type { TextDocumentDraft, TextDocumentEdit } from "@/packages/native-parity/academic/courses/text-document";
import type { CourseCommandViewer } from "./course-command";
import { courseWrite, type CourseWriteTransaction } from "./course-write";

type Reader = Pick<typeof db, "select">;

async function textRow(tx: Reader, scope: ResolvedCourseIdentity, id: string, lock?: "update" | "share") {
  const canonical = scope.canonicalId;
  const canonicalArticle = canonical ? tx.select({
    id: artikel.id, title: artikel.title, chapterId: artikel.babId, markdown: artikel.contentMarkdown,
    version: artikel.version, status: artikel.status, updatedAt: artikel.updatedAt, courseId: artikel.mataKuliahId,
  }).from(artikel).where(and(eq(artikel.id, id), eq(artikel.mataKuliahId, canonical))).limit(1) : null;
  const canonicalDiktat = canonical ? tx.select({
    id: diktatMateri.id, title: diktatMateri.title, chapterId: diktatMateri.babId, markdown: diktatMateri.contentMarkdown,
    version: diktatMateri.version, status: diktatMateri.status, updatedAt: diktatMateri.updatedAt, courseId: diktatMateri.mataKuliahId,
  }).from(diktatMateri).where(and(eq(diktatMateri.id, id), eq(diktatMateri.mataKuliahId, canonical))).limit(1) : null;
  const legacyArticle = tx.select({
    id: websiteMaterials.id, title: websiteMaterials.title, chapterId: websiteMaterials.chapterId, markdown: websiteMaterials.canonicalMarkdown,
    version: websiteMaterials.contentVersion, status: websiteMaterials.status, updatedAt: websiteMaterials.updatedAt, courseId: websiteMaterials.courseId,
  }).from(websiteMaterials).where(and(eq(websiteMaterials.id, id), inArray(websiteMaterials.courseId, scope.allIds))).limit(1);
  const [article] = canonicalArticle ? await (lock ? canonicalArticle.for(lock) : canonicalArticle) : [];
  const [diktat] = canonicalDiktat ? await (lock ? canonicalDiktat.for(lock) : canonicalDiktat) : [];
  const [legacy] = await (lock ? legacyArticle.for(lock) : legacyArticle);
  const matched = [
    ...(article ? [{ ...article, source: "canonical-article" as const }] : []),
    ...(diktat ? [{ ...diktat, source: "canonical-diktat" as const }] : []),
    ...(legacy ? [{ ...legacy, source: "legacy-article" as const }] : []),
  ];
  if (matched.length > 1) throw new Error("MATERIAL_NOT_FOUND");
  return matched[0] ?? null;
}

const writableStatus = (row: NonNullable<Awaited<ReturnType<typeof textRow>>>) =>
  row.status === "draft" || row.status === "published" || (row.source !== "legacy-article" && row.status === "in_review");

async function chapterOptions(tx: Reader, row: NonNullable<Awaited<ReturnType<typeof textRow>>>) {
  return row.source === "legacy-article"
    ? tx.select({ id: chapters.id, title: chapters.title }).from(chapters).where(eq(chapters.courseId, row.courseId))
        .orderBy(asc(chapters.orderIndex), asc(chapters.id))
    : tx.select({ id: bab.id, title: bab.title }).from(bab).where(and(eq(bab.mataKuliahId, row.courseId), eq(bab.status, "active")))
        .orderBy(asc(bab.orderIndex), asc(bab.id));
}

function readingData(id: string, courseId: string, title: string, markdown: string, version = 1, chapterId: string | null = null) {
  return { id, courseId, title, version, chapterId, sections: [{
    id: `${id}:text`, slug: "text", title: "", blocks: [{ id: `${id}:markdown`, blockType: "explanation", content: markdown }],
  }] };
}

export async function readNativeCourseTextDocument(slug: string, materialId: string, viewer: CourseCommandViewer) {
  const { scope, row, edit } = await db.transaction(async tx => {
    await assertNativeAdminTransaction(tx, viewer);
    const scope = await resolveCourseIdentity(slug, tx);
    if (!scope) throw new Error("COURSE_NOT_FOUND");
    const row = await textRow(tx, scope, materialId, "share");
    const edit: TextDocumentEdit | null = row && writableStatus(row) && scope.status === "active" ? {
      source: row.source, revision: revisionOf(row), title: row.title, markdown: row.markdown, chapterId: row.chapterId,
      chapters: await chapterOptions(tx, row), status: row.status === "published" ? "published" : "draft",
    } : null;
    return { scope, row, edit };
  });
  const preview = !row || row.source === "canonical-article" ? await getAdminCourseMaterialPreview(scope, materialId) : null;
  if (row && preview?.renderer === "structured" && row.source === "canonical-article" && preview.article.id === row.id) {
    const { progress: _progress, ...article } = preview.article;
    return { edit, kind: "article" as const, data: { ...article, courseId: scope.primaryId } };
  }
  if (row?.source === "canonical-diktat") {
    return { edit, kind: "diktat" as const, data: {
      id: row.id, courseId: scope.primaryId, title: row.title, kind: "article" as const,
      docCategory: "diktat" as const, contentVersion: row.version, body: row.markdown,
    } };
  }
  if (row) return { edit, kind: "article" as const, data: readingData(row.id, scope.primaryId, row.title, row.markdown, row.version, row.chapterId) };
  if (preview?.renderer === "material" && preview.material.kind === "article" && preview.material.id === materialId) {
    return { edit: null, kind: "article" as const, data: readingData(materialId, scope.primaryId, preview.material.title, preview.material.body ?? "") };
  }
  throw new Error("MATERIAL_NOT_FOUND");
}

async function activeScope(tx: CourseWriteTransaction, slug: string) {
  const scope = await resolveCourseIdentity(slug, tx);
  if (!scope || scope.status !== "active") throw new Error("COURSE_NOT_FOUND");
  if (scope.canonicalId) {
    const [current] = await tx.select({ status: mataKuliah.status, legacyId: mataKuliah.legacyCourseId })
      .from(mataKuliah).where(eq(mataKuliah.id, scope.canonicalId)).limit(1).for("share");
    if (current?.status !== "active" || current.legacyId !== scope.legacyId) throw new Error("COURSE_NOT_FOUND");
  }
  return scope;
}

async function checkChapter(tx: CourseWriteTransaction, row: NonNullable<Awaited<ReturnType<typeof textRow>>>, chapterId: string | null) {
  if (!chapterId) {
    if (row.source === "legacy-article") throw new Error("INVALID_TEXT_CHAPTER");
    return;
  }
  const [chapter] = row.source === "legacy-article"
    ? await tx.select({ id: chapters.id }).from(chapters)
        .where(and(eq(chapters.courseId, row.courseId), eq(chapters.id, chapterId))).limit(1).for("share")
    : await tx.select({ id: bab.id }).from(bab)
        .where(and(eq(bab.mataKuliahId, row.courseId), eq(bab.id, chapterId), chapterId === row.chapterId ? undefined : eq(bab.status, "active"))).limit(1).for("share");
  if (!chapter) throw new Error("INVALID_TEXT_CHAPTER");
}

export async function writeNativeCourseTextDocument(slug: string, materialId: string, draft: TextDocumentDraft, requestId: string, viewer: CourseCommandViewer) {
  const result = await courseWrite({
    slug, targetId: materialId, draft: { ...draft, session: revisionOf(viewer.session.id) }, requestId, viewer,
    entityType: "native_course_material", action: "update",
    async write(tx) {
      const scope = await activeScope(tx, slug);
      const row = await textRow(tx, scope, materialId, "update");
      if (!row || row.source !== draft.source || !writableStatus(row)) throw new Error("MATERIAL_NOT_FOUND");
      if (revisionOf(row) !== draft.expectedRevision) throw new Error("REVISION_CONFLICT");
      if (draft.action === "content") await checkChapter(tx, row, draft.chapterId);
      const changed = await writeCourseTextDocument(tx, { id: row.id, source: row.source, courseIds: [row.courseId] }, draft);
      if (changed.length !== 1) throw new Error("MATERIAL_NOT_FOUND");
      return { id: row.id, canonicalCourseId: scope.primaryId, legacyCourseId: scope.legacyId ?? undefined };
    },
    async validateReplay(tx, saved) {
      const scope = await activeScope(tx, slug);
      const row = await textRow(tx, scope, saved.id, "share");
      if (!row || row.source !== draft.source || saved.canonicalCourseId !== scope.primaryId) throw new Error("MATERIAL_NOT_FOUND");
    },
  });

  revalidatePath("/admin/courses");
  for (const id of new Set([slug, result.canonicalCourseId, result.legacyCourseId])) {
    if (!id) continue;
    const key = encodeURIComponent(id);
    revalidatePath(`/admin/courses/${key}/documents`);
    revalidatePath(`/admin/courses/${key}/documents/${encodeURIComponent(materialId)}`);
    revalidatePath(`/courses/${key}/material`);
    revalidatePath(`/courses/${key}/material/${encodeURIComponent(materialId)}`);
  }
}
