import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { Reveal } from "@/components/ui/reveal";
import { createMetadata} from "@/lib/site";
import { db } from "@/db";
import { studentQuizAttempts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { QuizAnalyticsView } from "@/components/course/quiz-analytics-view";
import { getCourse } from "@/lib/course-utils";
import { getAuthSession } from "@/lib/auth-session";
import { TranslatedText } from "@/components/i18n/translated-text";
import { getTranslations } from "@/lib/i18n/server";

type Props = {
  params: Promise<{ id: string; submissionId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, submissionId } = await params;
  const course = await getCourse(id);
  const t = await getTranslations("learning");

  return createMetadata({
    title: course ? `${t("metadata.summaryTitle")}: ${course.title}` : t("metadata.summaryTitle"),
    description: t("metadata.summaryDescription"),
    path: `/courses/${id}/my-results/${submissionId}/summary`,
  });
}


export default async function SubmissionSummaryPage({ params }: Props) {
  const { id, submissionId } = await params;

  const session = await getAuthSession();
  if (!session?.user) notFound();

  const course = await getCourse(id);

  if (!course) notFound();

  const [attempt] = await db
    .select()
    .from(studentQuizAttempts)
    .where(
      and(
        eq(studentQuizAttempts.id, submissionId),
        eq(studentQuizAttempts.studentId, session.user.id)
      )
    )
    .limit(1);

  if (!attempt) notFound();

  return (
    <CoursePageShell title={<TranslatedText namespace="learning" messageKey="summary.title" />} description={<TranslatedText namespace="learning" messageKey="summary.description" />} backHref={`/courses/${id}/my-results/${submissionId}`} backLabel={<TranslatedText namespace="learning" messageKey="summary.backToReview" />}>
      <Reveal>
        <QuizAnalyticsView attemptId={submissionId} courseId={course.legacyId ?? id} />
      </Reveal>
    </CoursePageShell>
  );
}
