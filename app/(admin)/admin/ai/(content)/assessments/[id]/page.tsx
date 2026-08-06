import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";
import { db } from "@/db";
import {
  assessmentSources,
  assessmentObjects,
  assessmentSourceChapters,
  assessmentObjectConcepts,
  conceptLocalizations,
  courses,
  chapters,
} from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { assertAdmin } from "@/lib/uploadthing-admin";
import { notFound } from "next/navigation";
import { AssessmentDetailClient } from "./detail-client";

export const metadata: Metadata = {
  title: pageTitle("Detail Asesmen Historis"),
};

export default async function AssessmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await assertAdmin();
  const { id } = await params;

  // Query assessment source details
  const [source] = await db
    .select()
    .from(assessmentSources)
    .where(eq(assessmentSources.id, id));

  if (!source) {
    notFound();
  }

  const [course] = await db
    .select({ id: courses.id, title: courses.title })
    .from(courses)
    .where(eq(courses.id, source.courseId));

  const [questions, conceptMappings, resolvedChapters] = await Promise.all([
    db
      .select({
        id: assessmentObjects.id,
        questionOrder: assessmentObjects.questionOrder,
        sourceQuestionNumber: assessmentObjects.sourceQuestionNumber,
        questionType: assessmentObjects.questionType,
        difficulty: assessmentObjects.difficulty,
        applicationLevel: assessmentObjects.applicationLevel,
        pattern: assessmentObjects.pattern,
        reasoningType: assessmentObjects.reasoningType,
        estimatedSteps: assessmentObjects.estimatedSteps,
        questionMarkdown: assessmentObjects.questionMarkdown,
        answerMarkdown: assessmentObjects.answerMarkdown,
        options: assessmentObjects.options,
        canonicalQuestionHash: assessmentObjects.canonicalQuestionHash,
      })
      .from(assessmentObjects)
      .where(eq(assessmentObjects.sourceId, id))
      .orderBy(asc(assessmentObjects.questionOrder)),

    db
      .select({
        assessmentObjectId: assessmentObjectConcepts.assessmentObjectId,
        conceptId: assessmentObjectConcepts.conceptId,
        displayName: conceptLocalizations.displayName,
      })
      .from(assessmentObjectConcepts)
      .innerJoin(conceptLocalizations, eq(assessmentObjectConcepts.conceptId, conceptLocalizations.conceptId))
      .innerJoin(assessmentObjects, eq(assessmentObjectConcepts.assessmentObjectId, assessmentObjects.id))
      .where(eq(assessmentObjects.sourceId, id)),

    db
      .select({
        id: chapters.id,
        title: chapters.title,
      })
      .from(assessmentSourceChapters)
      .innerJoin(chapters, eq(assessmentSourceChapters.chapterId, chapters.id))
      .where(eq(assessmentSourceChapters.assessmentSourceId, id)),
  ]);

  return (
    <div className="space-y-8">
      <AssessmentDetailClient
        source={source}
        course={course || { id: source.courseId, title: "Mata Kuliah Tidak Diketahui" }}
        questions={questions}
        conceptMappings={conceptMappings}
        resolvedChapters={resolvedChapters}
      />
    </div>
  );
}
