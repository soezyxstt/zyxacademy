import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { aiMaterialInstances, artikel, bab, chapters, courseMaterials, diktatMateri, diktats, exams, quizTemplates, websiteMaterials } from "@/db/schema";
import { canAccessCourseContent, resolveCourseAccessBatch } from "@/lib/student/course-access";
import { canAccessStudentQuizTemplate } from "@/lib/quiz/student-access";

export type StudentSearchCandidate = { courseId: string; entityId: string; type: string };

/** Return current titles only. Index metadata is never an authorization source. */
export async function resolveStudentSearchCandidates(studentId: string, candidates: readonly StudentSearchCandidate[], now = new Date()): Promise<Map<StudentSearchCandidate, string>> {
  const ids = [...new Set(candidates.map((item) => item.entityId).filter(Boolean))];
  if (!ids.length) return new Map();
  const [access, chapterRows, canonicalChapters, ai, manual, legacyDiktat, web, articles, canonicalDiktat, quizzes, examRows] = await Promise.all([
    resolveCourseAccessBatch(studentId, candidates.map((item) => item.courseId), { now }),
    db.select().from(chapters).where(inArray(chapters.id, ids)),
    db.select().from(bab).where(inArray(bab.id, ids)),
    db.select().from(aiMaterialInstances).where(inArray(aiMaterialInstances.id, ids)),
    db.select().from(courseMaterials).where(inArray(courseMaterials.id, ids)),
    db.select().from(diktats).where(inArray(diktats.id, ids)),
    db.select().from(websiteMaterials).where(inArray(websiteMaterials.id, ids)),
    db.select().from(artikel).where(inArray(artikel.id, ids)),
    db.select().from(diktatMateri).where(inArray(diktatMateri.id, ids)),
    db.select().from(quizTemplates).where(inArray(quizTemplates.id, ids)),
    db.select().from(exams).where(inArray(exams.id, ids)),
  ]);
  const result = new Map<StudentSearchCandidate, string>();
  for (const item of candidates) {
    const policy = access.get(item.courseId);
    if (!policy?.hasCourseAccess) continue;
    if (item.type === "course") {
      if ([policy.courseId, policy.canonicalCourseId, policy.legacyCourseId].includes(item.entityId)) result.set(item, policy.courseTitle ?? "");
      continue;
    }
    const matches: string[] = [];
    const allowed = (courseId: string, chapterIds: readonly (string | null | undefined)[], kind: "article" | "diktat" | "quiz" = "article") =>
      [policy.canonicalCourseId, policy.legacyCourseId, policy.courseId].includes(courseId) && canAccessCourseContent(policy, kind, chapterIds);
    if (item.type === "chapter") {
      for (const row of chapterRows) if (row.id === item.entityId && row.status === "published" && allowed(row.courseId, [row.id])) matches.push(row.title);
      for (const row of canonicalChapters) if (row.id === item.entityId && row.status === "active" && allowed(row.mataKuliahId, [row.id])) matches.push(row.title);
    }
    if (item.type === "material") {
      for (const row of ai) if (row.id === item.entityId && !row.title.startsWith("[DRAF]") && allowed(row.courseId, row.chapterIds ?? [])) matches.push(row.title);
      for (const row of manual) if (row.id === item.entityId && policy.hasFullContentAccess && allowed(row.courseId, row.chapterIds)) matches.push(row.title);
      for (const row of legacyDiktat) if (row.id === item.entityId && row.status === "ready" && !row.isStale && Array.isArray(row.chapterIds) && allowed(row.courseId, row.chapterIds as string[], "diktat")) matches.push(row.title);
      for (const row of web) if (row.id === item.entityId && row.status === "published" && !row.isStale && allowed(row.courseId, [row.chapterId])) matches.push(row.title);
      for (const row of articles) if (row.id === item.entityId && row.status === "published" && allowed(row.mataKuliahId, [row.babId])) matches.push(row.title);
      for (const row of canonicalDiktat) if (row.id === item.entityId && row.status === "published" && allowed(row.mataKuliahId, [row.babId], "diktat")) matches.push(row.title);
    }
    if (item.type === "quiz") {
      for (const row of quizzes) {
        if (row.id === item.entityId && [policy.canonicalCourseId, policy.legacyCourseId, policy.courseId].includes(row.courseId) && canAccessStudentQuizTemplate(policy, row)) matches.push(row.title);
      }
    }
    if (item.type === "exam") {
      for (const row of examRows) if (row.id === item.entityId && row.type === "tryout" && row.status === "published" && policy.hasFullContentAccess && [policy.canonicalCourseId, policy.legacyCourseId, policy.courseId].includes(row.courseId)) matches.push(row.title);
    }
    if (matches.length === 1) result.set(item, matches[0]);
  }
  return result;
}
