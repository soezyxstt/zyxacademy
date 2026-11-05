import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { artikel, bab, chapters as legacyChapters, courseMaterials, diktatMateri, mataKuliah, websiteMaterials } from "@/db/schema";
import { db } from "@/lib/db";
import { sanitizeDemoMarkdown } from "@/lib/demo/public-content-sanitizer";
import { padDemoCatalogue, type DemoCatalogue } from "@/lib/demo/catalogue";

/** Metadata only. Body, storage and answer fields are never selected. */
export async function getDemoCatalogue(courseId: string): Promise<DemoCatalogue | null> {
  const [course] = await db.select({ id: mataKuliah.id, title: mataKuliah.title, legacyId: mataKuliah.legacyCourseId }).from(mataKuliah).where(and(eq(mataKuliah.id, courseId), eq(mataKuliah.status, "active"))).limit(1);
  if (!course) return null;
  const chapters = await db.select({ id: bab.id, title: bab.title, orderIndex: bab.orderIndex, legacyId: bab.legacyChapterId }).from(bab).where(and(eq(bab.mataKuliahId, courseId), eq(bab.status, "active"))).orderBy(asc(bab.orderIndex), asc(bab.id));
  if (!chapters.length) return null;
  const legacyIds = chapters.flatMap(chapter => chapter.legacyId ? [chapter.legacyId] : []);
  const [articles, diktats, websites, uploads, legacyRows, legacyMappings] = await Promise.all([
    db.select({ id: artikel.id, title: artikel.title, chapterId: artikel.babId }).from(artikel).where(and(eq(artikel.mataKuliahId, courseId), eq(artikel.status, "published"), eq(artikel.structureStatus, "structured"))).orderBy(asc(artikel.id)),
    db.select({ id: diktatMateri.id, title: diktatMateri.title, chapterId: diktatMateri.babId }).from(diktatMateri).where(and(eq(diktatMateri.mataKuliahId, courseId), eq(diktatMateri.status, "published"))).orderBy(asc(diktatMateri.id)),
    course.legacyId ? db.select({ id: websiteMaterials.id, title: websiteMaterials.title, chapterId: websiteMaterials.chapterId }).from(websiteMaterials).where(and(eq(websiteMaterials.courseId, course.legacyId), eq(websiteMaterials.status, "published"))).orderBy(asc(websiteMaterials.id)) : Promise.resolve([]),
    course.legacyId ? db.select({ id: courseMaterials.id, title: courseMaterials.title, type: courseMaterials.type, subcategory: courseMaterials.subcategory, year: courseMaterials.year, chapterIds: courseMaterials.chapterIds }).from(courseMaterials).where(eq(courseMaterials.courseId, course.legacyId)).orderBy(asc(courseMaterials.id)) : Promise.resolve([]),
    legacyIds.length ? db.select({ id: legacyChapters.id, courseId: legacyChapters.courseId }).from(legacyChapters).where(inArray(legacyChapters.id, legacyIds)) : Promise.resolve([]),
    legacyIds.length ? db.select({ id: bab.id, legacyId: bab.legacyChapterId }).from(bab).where(inArray(bab.legacyChapterId, legacyIds)) : Promise.resolve([]),
  ]);
  const activeIds = new Set(chapters.map(chapter => chapter.id));
  const legacyMap = new Map<string, string | null>();
  for (const chapter of chapters) if (chapter.legacyId) {
    const rows = legacyRows.filter(row => row.id === chapter.legacyId && row.courseId === course.legacyId);
    const mappings = legacyMappings.filter(row => row.legacyId === chapter.legacyId);
    if (rows.length === 1 && mappings.length === 1 && mappings[0].id === chapter.id) legacyMap.set(chapter.legacyId, chapter.id);
  }
  const materials: DemoCatalogue["materials"] = [];
  for (const [kind, rows] of [["article", articles], ["diktat", diktats], ["website", websites]] as const) {
    for (const row of rows) {
      const chapterId = kind === "website" ? legacyMap.get(row.chapterId ?? "") : row.chapterId;
      if (!chapterId || !activeIds.has(chapterId)) continue;
      const title = sanitizeDemoMarkdown(row.title);
      if (title && sanitizeDemoMarkdown(row.id) === row.id) materials.push({ id: row.id, title, chapterId, kind });
    }
  }
  for (const row of uploads) {
    if (/^\s*\[(?:DRAF|DRAFT|PRIVATE|INTERNAL)\]/i.test(row.title) || sanitizeDemoMarkdown(row.id) !== row.id) continue;
    const chapterIds = Array.isArray(row.chapterIds) ? row.chapterIds.filter((id): id is string => typeof id === "string") : [];
    const mapped = [...new Set(chapterIds.map(id => activeIds.has(id) ? id : legacyMap.get(id)).filter((id): id is string => Boolean(id)))];
    const title = sanitizeDemoMarkdown(row.title);
    if (!title) continue;
    materials.push({ id: row.id, title, chapterId: mapped[0] ?? "", chapterIds: mapped, kind: "pdf", category: row.type === "soal" ? "soal" : row.type === "pembahasan_soal" ? "solusi" : "materi", subcategory: row.subcategory, year: row.year });
  }
  return padDemoCatalogue(course.title, chapters.map(({ id, title, orderIndex }) => ({ id, title: sanitizeDemoMarkdown(title), orderIndex })), materials);
}
