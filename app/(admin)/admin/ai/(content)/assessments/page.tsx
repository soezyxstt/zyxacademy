import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";
import { db } from "@/db";
import { assessmentSources, assessmentObjects, assessmentSourceChapters, courses } from "@/db/schema";
import { desc, sql, isNull } from "drizzle-orm";
import { assertAdmin } from "@/lib/uploadthing-admin";
import { AssessmentsClient } from "./assessments-client";

export const metadata: Metadata = {
  title: pageTitle("Asesmen Historis"),
};

export default async function AssessmentsPage() {
  await assertAdmin();

  const [sources, allCourses] = await Promise.all([
    db
      .select({
        id: assessmentSources.id,
        title: assessmentSources.title,
        courseId: assessmentSources.courseId,
        origin: assessmentSources.origin,
        category: assessmentSources.category,
        year: assessmentSources.year,
        semester: assessmentSources.semester,
        ingestionStatus: assessmentSources.ingestionStatus,
        createdAt: assessmentSources.createdAt,
        questionCount: sql<number>`(SELECT COUNT(*) FROM ${assessmentObjects} WHERE ${assessmentObjects.sourceId} = ${assessmentSources.id})`,
        chapterCount: sql<number>`(SELECT COUNT(*) FROM ${assessmentSourceChapters} WHERE ${assessmentSourceChapters.assessmentSourceId} = ${assessmentSources.id})`,
      })
      .from(assessmentSources)
      .where(isNull(assessmentSources.deletedAt))
      .orderBy(desc(assessmentSources.createdAt)),
    db.select({ id: courses.id, title: courses.title }).from(courses),
  ]);

  const formattedSources = sources.map(s => ({
    ...s,
    createdAt: s.createdAt.toISOString(),
  }));

  const courseMap = Object.fromEntries(allCourses.map((c) => [c.id, c.title]));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 space-y-6">
      <div className="mb-6 text-left">
        <h1 className="font-heading text-h4 font-bold text-foreground">Asesmen Historis</h1>
        <p className="mt-1 text-body-sm text-muted-foreground">
          Kelola pustaka soal ujian sebelumnya untuk diolah oleh AI.
        </p>
      </div>
      <AssessmentsClient
        sources={formattedSources}
        courses={allCourses}
        courseMap={courseMap}
      />
    </div>
  );
}
