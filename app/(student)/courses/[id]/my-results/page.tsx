import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Lock, History } from "lucide-react";
import { checkEnrollment } from "@/app/(student)/dashboard/actions";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { CourseMyResultsListSkeleton } from "@/components/course/course-skeletons";
import { studentCardClass } from "@/components/course/course-surfaces";
import { EnrollmentForm } from "@/components/enrollment-form";
import { Reveal } from "@/components/ui/reveal";
import { FormattedDate } from "@/components/ui/formatted-date";
import { Button } from "@/components/ui/button";
import { createMetadata } from "@/lib/site";
import { cn } from "@/lib/utils";
import { db } from "@/db";
import { studentQuizAttempts, quizTemplates, submissions, exams } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getCourse } from "@/lib/course-utils";
import { getAuthSession } from "@/lib/auth-session";
import { TranslatedText } from "@/components/i18n/translated-text";
import { getTranslations } from "@/lib/i18n/server";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const course = await getCourse(id);
  const t = await getTranslations("learning");

  return createMetadata({
    title: course ? t("metadata.resultsTitle", { course: course.title }) : t("metadata.resultsTitleFallback"),
    description: t("metadata.resultsDescription"),
    path: `/courses/${id}/my-results`,
  });
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    completed: "completed",
    pending_review: "pendingReview",
    graded: "graded",
    late: "late",
  };
  const key = map[status];
  return key ? <TranslatedText namespace="learning" messageKey={`results.status.${key}`} /> : status;
}

async function CourseMyResultsContent({
  id,
  legacyCourseId,
  studentId,
}: {
  id: string;
  legacyCourseId: string;
  studentId?: string;
}) {
  const isEnrolled = await checkEnrollment(id);

  if (!isEnrolled) {
    return (
      <div className={studentCardClass()}>
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-border">
            <Lock className="size-5" />
          </div>
          <div>
            <h3 className="font-heading text-body-base font-bold text-foreground"><TranslatedText namespace="learning" messageKey="results.needToken" /></h3>
            <p className="mt-1 text-body-sm text-muted-foreground">
              <TranslatedText namespace="learning" messageKey="results.activateToView" />
            </p>
          </div>
        </div>
        <div className="mt-4">
          <EnrollmentForm />
        </div>
      </div>
    );
  }

  let allSubmissions: Array<{
    id: string;
    courseId: string;
    examId: string;
    examTitle: string;
    examType: "quiz" | "tryout";
    status: string;
    score: number | null;
    submittedAt: string;
  }> = [];

  if (studentId) {
    const [dbAttempts, dbTryouts] = await Promise.all([
      db
        .select({
          id: studentQuizAttempts.id,
          title: quizTemplates.title,
          status: studentQuizAttempts.status,
          score: studentQuizAttempts.score,
          submittedAt: studentQuizAttempts.submittedAt,
        })
        .from(studentQuizAttempts)
        .innerJoin(quizTemplates, eq(studentQuizAttempts.templateId, quizTemplates.id))
        .where(
          and(
            eq(studentQuizAttempts.studentId, studentId),
            eq(quizTemplates.courseId, legacyCourseId),
            eq(studentQuizAttempts.status, "completed")
          )
        ),
      db
        .select({
          id: submissions.id,
          title: exams.title,
          status: submissions.status,
          score: submissions.score,
          submittedAt: submissions.submittedAt,
        })
        .from(submissions)
        .innerJoin(exams, eq(submissions.examId, exams.id))
        .where(
          and(
            eq(submissions.userId, studentId),
            eq(exams.courseId, legacyCourseId)
          )
        ),
    ]);

    allSubmissions = [
      ...dbAttempts.map(a => ({
        id: a.id,
        courseId: id,
        examId: a.id,
        examTitle: a.title,
        examType: "quiz" as const,
        status: a.status === "completed" ? "completed" as const : "pending_review" as const,
        score: a.score,
        submittedAt: a.submittedAt ? a.submittedAt.toISOString() : new Date().toISOString(),
      })),
      ...dbTryouts.map(t => ({
        id: t.id,
        courseId: id,
        examId: t.id,
        examTitle: t.title,
        examType: "tryout" as const,
        status: t.status,
        score: t.score,
        submittedAt: t.submittedAt ? t.submittedAt.toISOString() : new Date().toISOString(),
      }))
    ].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  }

  if (allSubmissions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 p-8 sm:p-12 text-center max-w-md mx-auto">
        <History className="size-10 text-muted-foreground/40 mb-3" aria-hidden />
        <h3 className="font-heading text-body-base font-bold text-foreground">
          <TranslatedText namespace="learning" messageKey="results.emptyTitle" />
        </h3>
        <p className="mt-1 text-body-xs text-muted-foreground leading-relaxed">
          <TranslatedText namespace="learning" messageKey="results.emptyDescription" />
        </p>
        <Button asChild size="sm" className="mt-5 rounded-md text-body-xs">
          <Link href={`/courses/${id}/quiz`}>
            <TranslatedText namespace="learning" messageKey="results.startPractice" />
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
      {allSubmissions.map((submission) => (
        <li key={submission.id}>
          <Link href={`/courses/${id}/my-results/${submission.id}`} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30">
            <div className="min-w-0 flex-1 text-left">
              <h2 className="truncate font-heading text-body-base font-semibold text-foreground group-hover:text-primary">
                {submission.examTitle}
              </h2>
              <p className="mt-1 text-body-sm text-muted-foreground">
                <TranslatedText namespace="learning" messageKey={submission.examType === "quiz" ? "results.quiz" : "results.tryout"} /> \u00b7{" "}
                <FormattedDate
                  date={submission.submittedAt}
                  options={{
                    dateStyle: "medium",
                    timeStyle: "short",
                  }}
                />
              </p>
              <span
                className={cn(
                  "mt-2 inline-flex rounded-md px-2.5 py-0.5 text-body-xs font-semibold ring-1 ring-border/60",
                  submission.status === "pending_review"
                    ? "bg-status-warning/12 text-status-warning"
                    : "bg-muted/80 text-muted-foreground",
                )}
              >
                {statusBadge(submission.status)}
              </span>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-heading text-h6 font-bold tabular-nums text-foreground">
                {submission.score != null ? `${submission.score}%` : <TranslatedText namespace="learning" messageKey="results.pending" />}
              </p>
            </div>
            <ChevronRight
              className="size-5 shrink-0 text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100"
              aria-hidden
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function CourseMyResultsPage({ params }: Props) {
  const { id } = await params;

  const [course, session] = await Promise.all([
    getCourse(id),
    getAuthSession(),
  ]);

  if (!course) return null;

  return (
    <CoursePageShell
      title={<TranslatedText namespace="learning" messageKey="results.title" values={{ course: course.title }} />}
      icon={History}
    >
      <Reveal>
        <Suspense fallback={<CourseMyResultsListSkeleton />}>
          <CourseMyResultsContent
            id={id}
            legacyCourseId={course.legacyId ?? id}
            studentId={session?.user?.id}
          />
        </Suspense>
      </Reveal>
    </CoursePageShell>
  );
}
