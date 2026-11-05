import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { artikel, bab, conceptLocalizations, diktatMateri, ide } from "@/db/schema";
import { db } from "@/lib/db";
import { sanitizeDemoMarkdown } from "@/lib/demo/public-content-sanitizer";
import { buildDemoMastery, type DemoMasteryRow } from "./mastery";

/** Call with course IDs already authorized by the demo snapshot repository. */
export async function getDemoMastery(courseIds: string[]) {
  if (!courseIds.length) return {};
  try {
    const byCourse = await Promise.all(courseIds.map(async courseId => {
      const ideas = await db.select({ courseId: ide.mataKuliahId, chapterId: bab.id, chapterTitle: bab.title, chapterOrder: bab.orderIndex, conceptName: conceptLocalizations.displayName })
          .from(ide).innerJoin(bab, and(eq(ide.babId, bab.id), eq(ide.mataKuliahId, bab.mataKuliahId)))
          .innerJoin(conceptLocalizations, and(eq(ide.conceptId, conceptLocalizations.conceptId), eq(conceptLocalizations.lang, "id")))
          .where(and(eq(ide.mataKuliahId, courseId), eq(ide.status, "published"), eq(bab.status, "active")))
          .orderBy(asc(bab.orderIndex), asc(bab.id), asc(ide.code)).limit(200);
      if (ideas.some(row => sanitizeDemoMarkdown(row.conceptName).trim())) return ideas;
      // Published material titles serve as fictional topic labels when no concept names exist.
      const [articles, diktats] = await Promise.all([
        db.select({ courseId: artikel.mataKuliahId, chapterId: bab.id, chapterTitle: bab.title, chapterOrder: bab.orderIndex, conceptName: artikel.title })
          .from(artikel).innerJoin(bab, and(eq(artikel.babId, bab.id), eq(artikel.mataKuliahId, bab.mataKuliahId)))
          .where(and(eq(artikel.mataKuliahId, courseId), eq(artikel.status, "published"), eq(artikel.structureStatus, "structured"), eq(bab.status, "active")))
          .orderBy(asc(bab.orderIndex), asc(bab.id), asc(artikel.id)).limit(100),
        db.select({ courseId: diktatMateri.mataKuliahId, chapterId: bab.id, chapterTitle: bab.title, chapterOrder: bab.orderIndex, conceptName: diktatMateri.title })
          .from(diktatMateri).innerJoin(bab, and(eq(diktatMateri.babId, bab.id), eq(diktatMateri.mataKuliahId, bab.mataKuliahId)))
          .where(and(eq(diktatMateri.mataKuliahId, courseId), eq(diktatMateri.status, "published"), eq(bab.status, "active")))
          .orderBy(asc(bab.orderIndex), asc(bab.id), asc(diktatMateri.id)).limit(100),
      ]);
      return [...articles, ...diktats];
    }));
    const rows: DemoMasteryRow[] = byCourse.flat().map(row => ({ ...row, chapterTitle: sanitizeDemoMarkdown(row.chapterTitle), conceptName: sanitizeDemoMarkdown(row.conceptName) }));
    rows.sort((a, b) => a.courseId.localeCompare(b.courseId) || a.chapterOrder - b.chapterOrder || a.chapterId.localeCompare(b.chapterId));
    return buildDemoMastery(rows);
  } catch {
    return {};
  }
}
