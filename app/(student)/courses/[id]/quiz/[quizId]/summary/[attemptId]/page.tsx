import { StudentQuizSummaryView } from "@/components/course/student-quiz-summary-view";
import type { Metadata } from "next";
import { canViewAttemptDiscussion } from "@/lib/quiz/review-release";
import { notFound, redirect } from "next/navigation";
import { createMetadata} from "@/lib/site";
import { db } from "@/db";
import { studentQuizAttempts, quizTemplates } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { QuizAnalyticsView } from "@/components/course/quiz-analytics-view";
import { getCourse } from "@/lib/course-utils";
import { getAuthSession } from "@/lib/auth-session";
import { getTranslations } from "@/lib/i18n/server";

type Props = {
  params: Promise<{ id: string; quizId: string; attemptId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, quizId, attemptId } = await params;
  const [template] = await db
    .select({ title: quizTemplates.title })
    .from(quizTemplates)
    .where(eq(quizTemplates.id, quizId))
    .limit(1);
  const t = await getTranslations("learning");

  return createMetadata({
    title: template ? `${t("metadata.diagnosisTitle")} ${template.title}` : t("metadata.summaryTitle"),
    description: t("metadata.quizSummaryDescription"),
    path: `/courses/${id}/quiz/${quizId}/summary/${attemptId}`,
  });
}


export default async function QuizSummaryPage({ params }: Props) {
  const { id, quizId, attemptId } = await params;

  const session = await getAuthSession();
  if (!session?.user) notFound();

  const course = await getCourse(id);

  if (!course) notFound();

  const [attempt] = await db
    .select()
    .from(studentQuizAttempts)
    .where(
      and(
        eq(studentQuizAttempts.id, attemptId),
        eq(studentQuizAttempts.studentId, session.user.id)
      )
    )
    .limit(1);

  if (!attempt) notFound();

  const [template] = await db
    .select()
    .from(quizTemplates)
    .where(eq(quizTemplates.id, quizId))
    .limit(1);

  if (!template || attempt.templateId !== quizId || ![course.id, course.canonicalId, course.legacyId, id].includes(template.courseId)) notFound();
  if (!canViewAttemptDiscussion(template, attempt.status)) redirect(`/courses/${id}/quiz/${quizId}?attemptId=${encodeURIComponent(attemptId)}`);

  return <StudentQuizSummaryView title={template?.title || course.title} reviewHref={`/courses/${id}/quiz/${quizId}?attemptId=${attemptId}`} historyHref={`/courses/${id}/my-results`} retryHref={`/courses/${id}/quiz/${quizId}`} pending={attempt.gradingStatus === "pending"}><QuizAnalyticsView attemptId={attemptId} courseId={course.legacyId ?? id} /></StudentQuizSummaryView>;
}
