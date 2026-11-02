import { and, eq, inArray, notLike, or } from "drizzle-orm";
import { db } from "@/db";
import {
  aiMaterialInstances,
  artikel,
  bab,
  courseMaterials,
  diktatMateri,
  diktats,
  websiteMaterials,
} from "@/db/schema";
import type { ResolvedCourseIdentity } from "@/lib/admin/course-identity";
import {
  getCanonicalPublishedArticle,
  getCanonicalPublishedTextProduct,
} from "@/lib/articles/structured-repository";
import type { PublicArticleReadModel } from "@/lib/articles/structured-read-model";
import { storage } from "@/lib/storage";
import type { CourseMaterial } from "@/lib/student-course-fixtures";

export type AdminMaterialSource =
  | "canonical-article"
  | "canonical-diktat"
  | "legacy-article"
  | "legacy-diktat"
  | "legacy-pdf";

export type AdminMaterialPreview =
  | {
      renderer: "structured";
      article: PublicArticleReadModel;
      source: "canonical-article";
      contentMarkdown?: string;
      babId?: string | null;
      status?: "draft" | "published";
    }
  | { renderer: "material"; material: CourseMaterial; source: AdminMaterialSource };

function sanitizeMaterialTitle(rawTitle: string): string {
  return rawTitle.replace(/^\[DRAF\]\s*/i, "").trim();
}

function legacyIds(identity: ResolvedCourseIdentity): string[] {
  return Array.from(new Set([identity.legacyId, ...identity.allIds].filter((id): id is string => Boolean(id))));
}

export async function listAdminCourseMaterials(
  identity: ResolvedCourseIdentity,
): Promise<CourseMaterial[]> {
  const compatibleIds = legacyIds(identity);

  const [canonicalArticles, canonicalDiktats, compiledDiktats, webMaterials, pdfMaterials, generatedMaterials] =
    await Promise.all([
      identity.canonicalId
        ? db
            .select({
              id: artikel.id,
              title: artikel.title,
              slug: artikel.slug,
              babId: artikel.babId,
              legacyChapterId: bab.legacyChapterId,
              status: artikel.status,
            })
            .from(artikel)
            .leftJoin(bab, eq(artikel.babId, bab.id))
            .where(
              and(
                eq(artikel.mataKuliahId, identity.canonicalId),
                inArray(artikel.status, ["draft", "published", "in_review"]),
              ),
            )
        : Promise.resolve([]),
      identity.canonicalId
        ? db
            .select({
              id: diktatMateri.id,
              title: diktatMateri.title,
              babId: diktatMateri.babId,
              legacyChapterId: bab.legacyChapterId,
              status: diktatMateri.status,
            })
            .from(diktatMateri)
            .leftJoin(bab, eq(diktatMateri.babId, bab.id))
            .where(
              and(
                eq(diktatMateri.mataKuliahId, identity.canonicalId),
                inArray(diktatMateri.status, ["draft", "published", "in_review"]),
              ),
            )
        : Promise.resolve([]),
      db
        .select()
        .from(diktats)
        .where(and(inArray(diktats.courseId, compatibleIds), eq(diktats.status, "ready"))),
      db
        .select()
        .from(websiteMaterials)
        .where(
          and(
            inArray(websiteMaterials.courseId, compatibleIds),
            inArray(websiteMaterials.status, ["published", "draft"]),
          ),
        ),
      db.select().from(courseMaterials).where(inArray(courseMaterials.courseId, compatibleIds)),
      db
        .select()
        .from(aiMaterialInstances)
        .where(
          and(
            inArray(aiMaterialInstances.courseId, compatibleIds),
            notLike(aiMaterialInstances.title, "[DRAF]%"),
          ),
        ),
    ]);

  const adminHref = (id: string) =>
    `/admin/courses/${encodeURIComponent(identity.slug)}/documents/${encodeURIComponent(id)}`;
  const canonicalArticleChapterIds = new Set(
    canonicalArticles.flatMap((item) =>
      [item.legacyChapterId, item.babId].filter((id): id is string => Boolean(id)),
    ),
  );
  const canonicalDiktatChapterIds = new Set(
    canonicalDiktats.flatMap((item) =>
      [item.legacyChapterId, item.babId].filter((id): id is string => Boolean(id)),
    ),
  );

  return [
    ...canonicalArticles.map((item) => ({
      id: item.id,
      courseId: identity.primaryId,
      title: sanitizeMaterialTitle(item.title),
      kind: "article" as const,
      docCategory: "materi" as const,
      tabGroup: "materi" as const,
      completed: false,
      isPastYear: false,
      isPreview: false,
      status: (item.status === "published" ? "published" : "draft") as "draft" | "published",
      source: "canonical-article",
      chapterId: item.legacyChapterId ?? item.babId ?? undefined,
      chapterIds: [item.legacyChapterId, item.babId].filter(
        (id): id is string => Boolean(id),
      ),
      href: adminHref(item.id),
    })),
    ...canonicalDiktats.map((item) => ({
      id: item.id,
      courseId: identity.primaryId,
      title: sanitizeMaterialTitle(item.title),
      kind: "article" as const,
      docCategory: "diktat" as const,
      tabGroup: "diktat" as const,
      completed: false,
      isPastYear: false,
      isPreview: false,
      status: (item.status === "published" ? "published" : "draft") as "draft" | "published",
      source: "canonical-diktat",
      chapterId: item.legacyChapterId ?? item.babId ?? undefined,
      chapterIds: [item.legacyChapterId, item.babId].filter(
        (id): id is string => Boolean(id),
      ),
      href: adminHref(item.id),
    })),
    ...compiledDiktats
      .filter((item) => {
        const chapterIds = Array.isArray(item.chapterIds) ? item.chapterIds : [];
        return !chapterIds.some((id) => canonicalDiktatChapterIds.has(id));
      })
      .map((item) => ({
        id: item.id,
        courseId: identity.primaryId,
        title: sanitizeMaterialTitle(item.title),
        kind: "pdf" as const,
        docCategory: "diktat" as const,
        tabGroup: "diktat" as const,
        fileSize: "PDF Diktat",
        completed: false,
        isPastYear: false,
        isPreview: true,
        url: item.fileUrl ? storage.getUrl(item.fileUrl) : undefined,
        thumbnailUrl: item.thumbnailUrl
          ? storage.getUrl(item.thumbnailUrl)
          : item.fileUrl
            ? `/api/courses/${encodeURIComponent(identity.slug)}/material/${encodeURIComponent(item.id)}/thumbnail`
            : undefined,
        chapterIds: item.chapterIds as string[],
        href: adminHref(item.id),
      })),
    ...generatedMaterials
      .filter((item) => {
        const chapterIds = Array.isArray(item.chapterIds) ? item.chapterIds : [];
        return !chapterIds.some((id) => canonicalArticleChapterIds.has(id));
      })
      .map((item) => ({
        id: item.id,
        courseId: identity.primaryId,
        title: sanitizeMaterialTitle(item.title),
        kind: "article" as const,
        docCategory: "materi" as const,
        tabGroup: "materi" as const,
        fileSize: "Rangkuman Materi",
        completed: false,
        isPastYear: false,
        isPreview: true,
        thumbnailUrl: item.thumbnailUrl ? storage.getUrl(item.thumbnailUrl) : undefined,
        chapterIds: item.chapterIds as string[],
        href: adminHref(item.id),
      })),
    ...webMaterials
      .filter((item) => !canonicalArticleChapterIds.has(item.chapterId))
      .map((item) => ({
        id: item.id,
        courseId: identity.primaryId,
        title: sanitizeMaterialTitle(item.title),
        kind: "article" as const,
        docCategory: "materi" as const,
        tabGroup: "materi" as const,
        fileSize: "Artikel Web",
        body: item.canonicalMarkdown,
        completed: false,
        isPastYear: false,
        isPreview: true,
        thumbnailUrl: item.thumbnailUrl ? storage.getUrl(item.thumbnailUrl) : undefined,
        chapterId: item.chapterId,
        chapterIds: [item.chapterId],
        href: adminHref(item.id),
      })),
    ...pdfMaterials.map((item) => {
      const isQuestion = item.type === "soal" || item.type === "contoh_soal";
      const isSolution = item.type === "pembahasan_soal";
      return {
        id: item.id,
        courseId: identity.primaryId,
        title: sanitizeMaterialTitle(item.title),
        kind: "pdf" as const,
        docCategory: isSolution ? ("solusi" as const) : isQuestion ? ("soal" as const) : ("materi" as const),
        tabGroup: isQuestion || isSolution ? ("bank_soal" as const) : ("pdf" as const),
        subcategory: item.subcategory,
        year: item.year,
        fileSize: isSolution ? "Pembahasan Soal" : isQuestion ? "Lembar Soal" : "Berkas PDF ITB",
        completed: false,
        isPastYear: Boolean(item.year),
        isPreview: true,
        status: "published" as const,
        source: "legacy-pdf" as const,
        url: storage.getUrl(item.fileUrl),
        thumbnailUrl: item.thumbnailUrl
          ? storage.getUrl(item.thumbnailUrl)
          : `/api/courses/${encodeURIComponent(identity.slug)}/material/${encodeURIComponent(item.id)}/thumbnail`,
        chapterIds: item.chapterIds as string[],
        href: adminHref(item.id),
      };
    }),
  ];
}

export async function getAdminCourseMaterialPreview(
  identity: ResolvedCourseIdentity,
  materialId: string,
): Promise<AdminMaterialPreview | null> {
  const canonicalCourseId = identity.canonicalId ?? identity.primaryId;
  const structured = await getCanonicalPublishedArticle(canonicalCourseId, materialId);
  if (structured) {
    const [artRecord] = await db
      .select({
        contentMarkdown: artikel.contentMarkdown,
        babId: artikel.babId,
        status: artikel.status,
      })
      .from(artikel)
      .where(or(eq(artikel.id, structured.id), eq(artikel.slug, structured.slug)))
      .limit(1);

    const cleanMarkdown = artRecord?.contentMarkdown
      ? artRecord.contentMarkdown
          .replace(/\n*<!--__ZYX_V3_ARTICLE_VISUALS__:[A-Za-z0-9_-]+-->/g, "")
          .trim()
      : structured.sections
          .map((s) => `## ${s.title}\n\n${s.blocks.map((b) => b.content).join("\n\n")}`)
          .join("\n\n---\n\n");

    return {
      renderer: "structured",
      article: structured,
      source: "canonical-article",
      contentMarkdown: cleanMarkdown,
      babId: artRecord?.babId ?? null,
      status: artRecord?.status === "draft" ? "draft" : "published",
    };
  }

  const canonical = await getCanonicalPublishedTextProduct(canonicalCourseId, materialId);
  if (canonical) {
    return {
      renderer: "material",
      source: canonical.productType === "diktat" ? "canonical-diktat" : "canonical-article",
      material: {
        id: canonical.id,
        courseId: identity.primaryId,
        title: sanitizeMaterialTitle(canonical.title),
        kind: "article",
        docCategory: canonical.productType === "diktat" ? "diktat" : "materi",
        fileSize: canonical.productType === "diktat" ? undefined : "Rangkuman Materi",
        body: canonical.contentMarkdown,
        completed: false,
        isPastYear: false,
        isPreview: false,
        status: "published",
        source: canonical.productType === "diktat" ? "canonical-diktat" : "canonical-article",
        chapterId: canonical.babId ?? canonical.chapterId ?? undefined,
      },
    };
  }

  // Check direct artikel record (draft or published)
  const [directArticle] = await db
    .select({
      id: artikel.id,
      title: artikel.title,
      contentMarkdown: artikel.contentMarkdown,
      status: artikel.status,
      babId: artikel.babId,
      legacyChapterId: bab.legacyChapterId,
    })
    .from(artikel)
    .leftJoin(bab, eq(artikel.babId, bab.id))
    .where(or(eq(artikel.id, materialId), eq(artikel.slug, materialId)))
    .limit(1);

  if (directArticle) {
    return {
      renderer: "material",
      source: "canonical-article",
      material: {
        id: directArticle.id,
        courseId: identity.primaryId,
        title: sanitizeMaterialTitle(directArticle.title),
        kind: "article",
        docCategory: "materi",
        body: directArticle.contentMarkdown,
        status: (directArticle.status === "published" ? "published" : "draft") as "draft" | "published",
        source: "canonical-article",
        completed: false,
        isPastYear: false,
        isPreview: false,
        chapterId: directArticle.babId ?? directArticle.legacyChapterId ?? undefined,
      },
    };
  }

  // Check direct diktat record (draft or published)
  const [directDiktat] = await db
    .select({
      id: diktatMateri.id,
      title: diktatMateri.title,
      contentMarkdown: diktatMateri.contentMarkdown,
      status: diktatMateri.status,
      babId: diktatMateri.babId,
      legacyChapterId: bab.legacyChapterId,
    })
    .from(diktatMateri)
    .leftJoin(bab, eq(diktatMateri.babId, bab.id))
    .where(eq(diktatMateri.id, materialId))
    .limit(1);

  if (directDiktat) {
    return {
      renderer: "material",
      source: "canonical-diktat",
      material: {
        id: directDiktat.id,
        courseId: identity.primaryId,
        title: sanitizeMaterialTitle(directDiktat.title),
        kind: "article",
        docCategory: "diktat",
        body: directDiktat.contentMarkdown,
        status: (directDiktat.status === "published" ? "published" : "draft") as "draft" | "published",
        source: "canonical-diktat",
        completed: false,
        isPastYear: false,
        isPreview: false,
        chapterId: directDiktat.babId ?? directDiktat.legacyChapterId ?? undefined,
      },
    };
  }

  const compatibleIds = legacyIds(identity);
  const [compiled, web, pdf, generated] = await Promise.all([
    db.select().from(diktats).where(and(eq(diktats.id, materialId), inArray(diktats.courseId, compatibleIds))).limit(1),
    db.select().from(websiteMaterials).where(and(eq(websiteMaterials.id, materialId), inArray(websiteMaterials.courseId, compatibleIds))).limit(1),
    db.select().from(courseMaterials).where(and(eq(courseMaterials.id, materialId), inArray(courseMaterials.courseId, compatibleIds))).limit(1),
    db.query.aiMaterialInstances.findFirst({
      where: and(eq(aiMaterialInstances.id, materialId), inArray(aiMaterialInstances.courseId, compatibleIds), notLike(aiMaterialInstances.title, "[DRAF]%")),
      with: { sections: { orderBy: (section, { asc }) => [asc(section.orderIndex)], with: { chunks: { orderBy: (chunk, { asc }) => [asc(chunk.orderIndex)] } } } },
    }),
  ]);

  if (compiled[0]) {
    const item = compiled[0];
    return { renderer: "material", source: "legacy-diktat", material: { id: item.id, courseId: identity.primaryId, title: item.title, kind: "pdf", docCategory: "diktat", fileSize: "PDF Diktat", url: item.fileUrl ? storage.getUrl(item.fileUrl) : undefined, status: "published", source: "legacy-diktat", completed: false, isPastYear: false, isPreview: true } };
  }
  if (web[0]) {
    const item = web[0];
    return { renderer: "material", source: "legacy-article", material: { id: item.id, courseId: identity.primaryId, title: item.title, kind: "article", docCategory: "materi", body: item.canonicalMarkdown, status: (item.status === "published" ? "published" : "draft") as "draft" | "published", source: "legacy-article", completed: false, isPastYear: false, isPreview: true, chapterId: item.chapterId } };
  }
  if (pdf[0]) {
    const item = pdf[0];
    const docCategory = item.type === "pembahasan_soal" ? "solusi" : item.type === "soal" || item.type === "contoh_soal" ? "soal" : "materi";
    return {
      renderer: "material",
      source: "legacy-pdf",
      material: {
        id: item.id,
        courseId: identity.primaryId,
        title: item.title,
        kind: "pdf",
        docCategory,
        subcategory: item.subcategory,
        year: item.year,
        fileSize: "PDF File",
        url: storage.getUrl(item.fileUrl),
        chapterIds: item.chapterIds as string[],
        status: "published",
        source: "legacy-pdf",
        completed: false,
        isPastYear: Boolean(item.year),
        isPreview: true,
      },
    };
  }
  if (generated) {
    const body = generated.sections.map((section) => `${section.title ? `## ${section.title}\n\n` : ""}${section.chunks.map((chunk) => chunk.chunkText).join("\n\n")}`).join("\n\n");
    return { renderer: "material", source: "legacy-article", material: { id: generated.id, courseId: identity.primaryId, title: sanitizeMaterialTitle(generated.title), kind: "article", docCategory: "materi", fileSize: "Rangkuman Materi", body, status: "published", source: "legacy-article", completed: false, isPastYear: false, isPreview: true } };
  }
  return null;
}
