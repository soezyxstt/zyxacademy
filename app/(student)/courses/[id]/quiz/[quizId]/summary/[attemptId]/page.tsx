import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { createMetadata, pageTitle } from "@/lib/site";
import { db } from "@/db";
import { studentQuizAttempts, quizTemplates } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { QuizAnalyticsView } from "@/components/course/quiz-analytics-view";
import { ArrowLeft, BookOpen, ChevronRight } from "lucide-react";
import { getCourse } from "@/lib/course-utils";
import { getAuthSession } from "@/lib/auth-session";
import { TranslatedText } from "@/components/i18n/translated-text";
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

  return (
    <CoursePageShell
      title={<TranslatedText namespace="learning" messageKey="summary.title" />}
      description={template?.title || course.title}
      hideHeader
    >
      <Reveal>
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-border/60">
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline" size="sm" className="rounded-md border-border/80 text-muted-foreground hover:text-foreground">
                <Link href={`/courses/${id}/quiz/${quizId}?attemptId=${attemptId}`}>
                  <ArrowLeft className="mr-1.5 size-4" />
                  <TranslatedText namespace="learning" messageKey="summary.viewReview" />
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm" className="rounded-md text-body-sm text-muted-foreground hover:text-foreground">
                <Link href={`/courses/${id}/my-results`}>
                  <TranslatedText namespace="learning" messageKey="summary.examHistory" />
                </Link>
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button asChild variant="secondary" size="sm" className="rounded-md">
                <Link href={`/courses/${id}/quiz/${quizId}`}>
                  <BookOpen className="mr-1.5 size-4" />
                  <TranslatedText namespace="learning" messageKey="summary.retryQuiz" />
                </Link>
              </Button>
            </div>
          </div>

          {attempt.gradingStatus === "pending" ? (
            <div className="rounded-xl border border-border bg-card p-6 text-center space-y-4">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <BookOpen className="size-6" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="font-heading text-body-base font-bold text-foreground">
                  <TranslatedText namespace="learning" messageKey="summary.pendingTitle" />
                </h3>
                <p className="text-body-sm text-muted-foreground">
                  <TranslatedText namespace="learning" messageKey="summary.pendingDescription" />
                </p>
              </div>
            </div>
          ) : (
            <QuizAnalyticsView attemptId={attemptId} courseId={course.legacyId ?? id} />
          )}
        </div>
      </Reveal>
    </CoursePageShell>
  );
}
