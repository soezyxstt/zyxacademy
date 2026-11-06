import { StudentQuizListView } from "@/components/course/student-quiz-list-view";
import { Suspense } from "react";
import type { Metadata } from "next";

import { CourseQuizListSkeleton } from "@/components/course/course-skeletons";
import { pageTitle } from "@/lib/site";
import { QuizListClient } from "./quiz-list-client";
import { Reveal } from "@/components/ui/reveal";
import { db } from "@/db";
import { studentQuizAttempts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { EnrollmentForm } from "@/components/enrollment-form";
import { getCourse, getStudentCourseAccess, getStudentVisibleCourseQuizzes, isFreeQuizTemplate } from "@/lib/course-utils";
import { getAuthSession } from "@/lib/auth-session";
import { TranslatedText } from "@/components/i18n/translated-text";
import { getTranslations } from "@/lib/i18n/server";

type QuizAccessFilter = "all" | "free" | "premium";

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ access?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const course = await getCourse(id);
  const t = await getTranslations("learning");

  return {
    title: pageTitle(course ? t("metadata.quizTitle", { course: course.title }) : t("metadata.quizTitleFallback")),
    description: t("metadata.quizDescription"),
  };
}

async function CourseQuizListContent({
  id,
  studentId,
  access,
}: {
  id: string;
  studentId: string;
  access: QuizAccessFilter;
}) {
  // The server-side catalog returns all published course quizzes so students can see
  // the full curriculum. Templates outside free chapters are marked locked on the client.
  // Calls getStudentVisibleCourseQuizzes(id) with studentId scoping.
  const [studentAccess, templates, attempts] = await Promise.all([
    getStudentCourseAccess(studentId, id),
    getStudentVisibleCourseQuizzes(id, studentId),
    db
      .select({ id: studentQuizAttempts.id, templateId: studentQuizAttempts.templateId, status: studentQuizAttempts.status, score: studentQuizAttempts.score })
      .from(studentQuizAttempts)
      .where(eq(studentQuizAttempts.studentId, studentId)),
  ]);

  const accessTier = studentAccess ? studentAccess.tier : ("anonymous" as const);
  const isEnrolled = studentAccess?.tier === "standard";

  const filteredTemplates = templates.filter((template) => {
    if (access === "free") return template.visibility === "free";
    if (access === "premium") return template.visibility === "paid";
    return true;
  });
  const freeEligibleTemplateIds = studentAccess?.tier === "free"
    ? templates
        .filter((template) => isFreeQuizTemplate(template, studentAccess.freeChapterIds))
        .map((template) => template.id)
    : [];

  return (
    <Reveal>
      {!isEnrolled && (
        <div className="mb-6 rounded-lg border border-brand-secondary/25 bg-brand-secondary/5 p-4">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(280px,420px)] md:items-center">
            <div>
              <h3 className="font-heading text-body-base font-bold text-brand-secondary">
                <TranslatedText namespace="learning" messageKey="quizPage.activationTitle" />
              </h3>
              <p className="mt-1 max-w-2xl text-body-sm text-muted-foreground">
                <TranslatedText namespace="learning" messageKey="quizPage.activationDescription" />
              </p>
            </div>
            <EnrollmentForm className="w-full" />
          </div>
        </div>
      )}
      <QuizListClient
        courseId={id}
        isEnrolled={isEnrolled}
        accessTier={accessTier}
        freeEligibleTemplateIds={freeEligibleTemplateIds}
        templates={filteredTemplates}
        attempts={attempts.map(({id,templateId,status,score}) => ({id,templateId,status,score}))}
      />
    </Reveal>
  );
}

export default async function CourseQuizListPage({ params, searchParams }: Props) {
  const { id } = await params;
  const rawAccess = (await searchParams)?.access;
  const requestedAccess = Array.isArray(rawAccess) ? rawAccess[0] : rawAccess;
  const access: QuizAccessFilter = requestedAccess === "free" || requestedAccess === "premium"
    ? requestedAccess
    : "all";

  const [course, session] = await Promise.all([
    getCourse(id),
    getAuthSession(),
  ]);

  if (!course) notFound();

  const studentId = session?.user?.id;
  if (!studentId) {
    redirect(`/sign-in?next=${encodeURIComponent(`/courses/${id}/quiz`)}`);
  }

  return <StudentQuizListView id={id} courseTitle={course.title} access={access}>
    <Suspense fallback={<CourseQuizListSkeleton />}><CourseQuizListContent id={id} studentId={studentId} access={access} /></Suspense>
  </StudentQuizListView>;
}
