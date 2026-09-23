import { asc, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  artikel,
  bab,
  bagianPembelajaran,
  courses as legacyCourses,
  diktatMateri,
  ide,
  itemImporBundle,
  mataKuliah,
  user,
} from "@/db/schema";
import { listIdeaBundleImports } from "@/lib/bundle/staging";
import { listProductBundleImports, productBundleLifecycleStatus } from "@/lib/bundle/product-staging";
import { normalizeDate } from "@/lib/date-utils";
import type { BundleRow as IdeaBundleRow } from "@/components/admin/idea-bundle-v2-panel";
import type { MaterialBundleRow as ProductBundleRow } from "@/components/admin/material-workflow-ui";

export type MaterialWorkspaceData = {
  initialIdeaImports: IdeaBundleRow[];
  initialProductImports: ProductBundleRow[];
  courseLabels: Record<string, string>;
  chapterLabels: Record<string, string>;
  authorLabels: Record<string, string>;
  ideaEnabled: boolean;
  productEnabled: boolean;
};

function cleanCourseCode(code: string | null | undefined): string {
  if (!code) return "";
  const stripped = code.replace(/^legacy-/i, "").trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(stripped) || /^test-/i.test(stripped)) {
    return "";
  }
  return stripped.toUpperCase();
}

function formatChapterLabel(title: string, orderIndex: number, code?: string | null): string {
  const cleanCode = code ? cleanCourseCode(code) : "";
  const trimmedTitle = title.trim();
  if (/^bab\s+\d+/i.test(trimmedTitle)) {
    return cleanCode && !trimmedTitle.toUpperCase().includes(cleanCode) ? `${cleanCode} · ${trimmedTitle}` : trimmedTitle;
  }
  if (orderIndex > 0) {
    return `Bab ${orderIndex} · ${trimmedTitle}`;
  }
  return cleanCode ? `${cleanCode} · ${trimmedTitle}` : trimmedTitle;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function extractReportChapterId(report: Record<string, unknown> | null | undefined): string | null {
  if (!report) return null;
  if (typeof report.chapterId === "string" && report.chapterId.trim()) return report.chapterId.trim();
  if (Array.isArray(report.chapterIds) && typeof report.chapterIds[0] === "string" && report.chapterIds[0].trim()) {
    return report.chapterIds[0].trim();
  }
  return null;
}

function extractReportTitle(report: Record<string, unknown> | null | undefined): string | null {
  if (!report) return null;
  if (typeof report.bundleTitle === "string" && report.bundleTitle.trim()) return report.bundleTitle.trim();
  if (typeof report.chapterTitle === "string" && report.chapterTitle.trim()) return report.chapterTitle.trim();
  if (typeof report.name === "string" && report.name.trim()) return report.name.trim();
  if (typeof report.unitTitle === "string" && report.unitTitle.trim()) return report.unitTitle.trim();
  return null;
}

export async function loadMaterialWorkspaceData(options?: { courseIds?: string[] }): Promise<MaterialWorkspaceData> {
  const courseIds = options?.courseIds?.filter(Boolean);
  const bundleOptions = courseIds && courseIds.length > 0 ? { limit: 50, courseIds } : 50;
  const [ideaRows, productRows, legacyCourseRows, canonicalCourseRows, chapterRows] = await Promise.all([
    listIdeaBundleImports(bundleOptions),
    listProductBundleImports(bundleOptions),
    db.select({ id: legacyCourses.id, title: legacyCourses.title }).from(legacyCourses).orderBy(asc(legacyCourses.title)),
    db.select({ id: mataKuliah.id, code: mataKuliah.code, title: mataKuliah.title, legacyCourseId: mataKuliah.legacyCourseId }).from(mataKuliah).orderBy(asc(mataKuliah.title)),
    db.select({ id: bab.id, code: bab.code, title: bab.title, orderIndex: bab.orderIndex, mataKuliahId: bab.mataKuliahId, legacyChapterId: bab.legacyChapterId }).from(bab).orderBy(asc(bab.orderIndex)),
  ]);

  const requestedByIds = [...new Set(
    [...ideaRows, ...productRows]
      .map((row) => row.requestedBy)
      .filter((id): id is string => Boolean(id)),
  )];
  const authorRows = requestedByIds.length > 0
    ? await db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(inArray(user.id, requestedByIds))
    : [];

  const courseLabels: Record<string, string> = Object.fromEntries(legacyCourseRows.map((course) => [course.id, course.title]));
  for (const course of canonicalCourseRows) {
    const cleanCode = cleanCourseCode(course.code);
    const label = cleanCode ? `${cleanCode} · ${course.title}` : course.title;
    courseLabels[course.id] = label;
    if (course.legacyCourseId) courseLabels[course.legacyCourseId] = label;
  }

  const chapterLabels: Record<string, string> = {};
  for (const ch of chapterRows) {
    const label = formatChapterLabel(ch.title, ch.orderIndex, ch.code);
    chapterLabels[ch.id] = label;
    if (ch.legacyChapterId) chapterLabels[ch.legacyChapterId] = label;
  }

  const allImportIds = [...ideaRows.map((r) => r.id), ...productRows.map((r) => r.id)];
  const resolvedChapterByImportId: Record<string, { chapterId?: string; title?: string }> = {};

  if (allImportIds.length > 0) {
    const itemBatches = await Promise.all(
      chunkArray(allImportIds, 100).map((batch) =>
        db
          .select({
            imporBundleId: itemImporBundle.imporBundleId,
            entityType: itemImporBundle.entityType,
            entityId: itemImporBundle.entityId,
          })
          .from(itemImporBundle)
          .where(inArray(itemImporBundle.imporBundleId, batch))
      )
    );
    const itemRows = itemBatches.flat();

    const sectionItems = itemRows.filter((i) => i.entityType === "learning_section");
    const ideaItems = itemRows.filter((i) => i.entityType === "idea");
    const articleItems = itemRows.filter((i) => i.entityType === "article");
    const diktatItems = itemRows.filter((i) => i.entityType === "diktat");

    if (sectionItems.length > 0) {
      const sectionIds = [...new Set(sectionItems.map((i) => i.entityId))];
      const sectionBatches = await Promise.all(
        chunkArray(sectionIds, 100).map((batch) =>
          db
            .select({ id: bagianPembelajaran.id, babId: bagianPembelajaran.babId, title: bagianPembelajaran.title })
            .from(bagianPembelajaran)
            .where(inArray(bagianPembelajaran.id, batch))
        )
      );
      const sections = sectionBatches.flat();
      const sectionMap = new Map(sections.map((s) => [s.id, s]));
      for (const item of sectionItems) {
        const sec = sectionMap.get(item.entityId);
        if (sec && !resolvedChapterByImportId[item.imporBundleId]) {
          resolvedChapterByImportId[item.imporBundleId] = { chapterId: sec.babId, title: sec.title };
        }
      }
    }

    if (ideaItems.length > 0) {
      const ideaIds = [...new Set(ideaItems.map((i) => i.entityId))];
      const ideaBatches = await Promise.all(
        chunkArray(ideaIds, 100).map((batch) =>
          db
            .select({ id: ide.id, babId: ide.babId })
            .from(ide)
            .where(inArray(ide.id, batch))
        )
      );
      const ideas = ideaBatches.flat();
      const ideaMap = new Map(ideas.map((i) => [i.id, i.babId]));
      for (const item of ideaItems) {
        const babId = ideaMap.get(item.entityId);
        if (babId && !resolvedChapterByImportId[item.imporBundleId]) {
          resolvedChapterByImportId[item.imporBundleId] = { chapterId: babId };
        }
      }
    }

    if (articleItems.length > 0) {
      const articleIds = [...new Set(articleItems.map((i) => i.entityId))];
      const articleBatches = await Promise.all(
        chunkArray(articleIds, 100).map((batch) =>
          db
            .select({ id: artikel.id, babId: artikel.babId, title: artikel.title })
            .from(artikel)
            .where(inArray(artikel.id, batch))
        )
      );
      const articles = articleBatches.flat();
      const articleMap = new Map(articles.map((a) => [a.id, a]));
      for (const item of articleItems) {
        const art = articleMap.get(item.entityId);
        if (art && art.babId && !resolvedChapterByImportId[item.imporBundleId]) {
          resolvedChapterByImportId[item.imporBundleId] = { chapterId: art.babId, title: art.title };
        }
      }
    }

    if (diktatItems.length > 0) {
      const diktatIds = [...new Set(diktatItems.map((i) => i.entityId))];
      const diktatBatches = await Promise.all(
        chunkArray(diktatIds, 100).map((batch) =>
          db
            .select({ id: diktatMateri.id, babId: diktatMateri.babId, title: diktatMateri.title })
            .from(diktatMateri)
            .where(inArray(diktatMateri.id, batch))
        )
      );
      const diktats = diktatBatches.flat();
      const diktatMap = new Map(diktats.map((d) => [d.id, d]));
      for (const item of diktatItems) {
        const dik = diktatMap.get(item.entityId);
        if (dik && dik.babId && !resolvedChapterByImportId[item.imporBundleId]) {
          resolvedChapterByImportId[item.imporBundleId] = { chapterId: dik.babId, title: dik.title };
        }
      }
    }
  }

  return {
    initialIdeaImports: ideaRows.map((row) => {
      const chapterId = extractReportChapterId(row.validationReport) ?? resolvedChapterByImportId[row.id]?.chapterId ?? null;
      const bundleTitle = extractReportTitle(row.validationReport) ?? resolvedChapterByImportId[row.id]?.title ?? null;
      const chapterLabel = chapterId ? (chapterLabels[chapterId] ?? null) : null;
      return {
        id: row.id,
        bundleId: row.bundleId,
        checksum: row.checksum,
        courseId: row.courseId,
        chapterId,
        chapterLabel,
        bundleTitle,
        requestedBy: row.requestedBy,
        status: row.status,
        validationReport: row.validationReport,
        createdAt: normalizeDate(row.createdAt).toISOString(),
      };
    }),
    initialProductImports: productRows.map((row) => {
      const chapterId = extractReportChapterId(row.validationReport) ?? resolvedChapterByImportId[row.id]?.chapterId ?? null;
      const bundleTitle = extractReportTitle(row.validationReport) ?? resolvedChapterByImportId[row.id]?.title ?? null;
      const chapterLabel = chapterId ? (chapterLabels[chapterId] ?? null) : null;
      return {
        id: row.id,
        bundleId: row.bundleId,
        checksum: row.checksum,
        courseId: row.courseId,
        chapterId,
        chapterLabel,
        bundleTitle,
        requestedBy: row.requestedBy,
        status: productBundleLifecycleStatus(row.status),
        validationReport: row.validationReport,
        createdAt: normalizeDate(row.createdAt).toISOString(),
      };
    }),
    courseLabels,
    chapterLabels,
    authorLabels: Object.fromEntries(authorRows.map((author) => [author.id, author.name || author.email])),
    ideaEnabled: true,
    productEnabled: true,
  };
}
