import { StudentCourseResultsList } from "@/components/course/student-course-results-list";
import { Suspense } from "react";
import type { Metadata } from "next";
import { Lock, History } from "lucide-react";
import { checkFullCourseContentAccess } from "@/app/(student)/dashboard/actions";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { CourseMyResultsListSkeleton } from "@/components/course/course-skeletons";
import { studentCardClass } from "@/components/course/course-surfaces";
import { EnrollmentForm } from "@/components/enrollment-form";
import { Reveal } from "@/components/ui/reveal";
import { createMetadata } from "@/lib/site";
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



async function CourseMyResultsContent({
  id,
  legacyCourseId,
  studentId,
}: {
  id: string;
  legacyCourseId: string;
  studentId?: string;
}) {
  const hasFullContentAccess = await checkFullCourseContentAccess(id);

  if (!hasFullContentAccess) {
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

  return <StudentCourseResultsList id={id} allSubmissions={allSubmissions} />;
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
