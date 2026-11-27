import "server-only";
import { db } from "@/db";
import { aiGenerationJobs, courses, chapters, mataKuliah, bab, knowledgeObjects } from "@/db/schema";
import { desc, eq, asc } from "drizzle-orm";

export async function readGenerationJobs() {
  const [jobs, allCourses, allChapters, allKOs] = await Promise.all([
    db
      .select({
        id: aiGenerationJobs.id,
        courseId: aiGenerationJobs.courseId,
        tutorId: aiGenerationJobs.tutorId,
        status: aiGenerationJobs.status,
        promptParameters: aiGenerationJobs.promptParameters,
        targetCount: aiGenerationJobs.targetCount,
        generatedCount: aiGenerationJobs.generatedCount,
        tokenUsage: aiGenerationJobs.tokenUsage,
        errorMessage: aiGenerationJobs.errorMessage,
        createdAt: aiGenerationJobs.createdAt,
        updatedAt: aiGenerationJobs.updatedAt,
      })
      .from(aiGenerationJobs)
      .orderBy(desc(aiGenerationJobs.createdAt))
      .limit(50),
    db
      .select({ id: mataKuliah.id, title: mataKuliah.title })
      .from(mataKuliah)
      .where(eq(mataKuliah.status, "active"))
      .then((rows) => (rows.length > 0 ? rows : db.select({ id: courses.id, title: courses.title }).from(courses))),
    db
      .select({ id: bab.id, courseId: bab.mataKuliahId, title: bab.title, orderIndex: bab.orderIndex })
      .from(bab)
      .where(eq(bab.status, "active"))
      .orderBy(asc(bab.orderIndex))
      .then((rows) =>
        rows.length > 0
          ? rows
          : db
              .select({ id: chapters.id, courseId: chapters.courseId, title: chapters.title, orderIndex: chapters.orderIndex })
              .from(chapters)
              .orderBy(asc(chapters.orderIndex)),
      ),
    db
      .select({ id: knowledgeObjects.id, courseId: knowledgeObjects.courseId, chapterId: knowledgeObjects.chapterId, title: knowledgeObjects.title, conceptName: knowledgeObjects.conceptName })
      .from(knowledgeObjects)
      .where(eq(knowledgeObjects.status, "active")),
  ]);

  const courseMap = Object.fromEntries(allCourses.map((c) => [c.id, c.title]));

  return { jobs, courses: allCourses, chapters: allChapters, knowledgeObjects: allKOs, courseMap };
}
