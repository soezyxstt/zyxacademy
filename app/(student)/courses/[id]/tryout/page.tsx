import { StudentTryoutsView } from "@/components/course/student-tryouts-view";
import { Suspense } from "react";
import type { Metadata } from "next";

import { CourseTryoutListSkeleton } from "@/components/course/course-skeletons";
import { pageTitle } from "@/lib/site";
import { getCourse } from "@/lib/course-utils";
import { getAuthSession } from "@/lib/auth-session";
import { checkFullCourseContentAccess } from "@/app/(student)/dashboard/actions";
import { TryoutListClient } from "./tryout-list-client";
import { EnrollmentForm } from "@/components/enrollment-form";
import { Reveal } from "@/components/ui/reveal";
import { db } from "@/db";
import { exams, questions } from "@/db/schema";
import { and, count, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { TranslatedText } from "@/components/i18n/translated-text";
import { getTranslations } from "@/lib/i18n/server";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const course = await getCourse(id);
  const t = await getTranslations("learning");
  return {
    title: pageTitle(course ? t("metadata.tryoutTitle", { course: course.title }) : t("metadata.tryoutTitleFallback")),
    description: t("metadata.tryoutDescription"),
  };
}

async function CourseTryoutListContent({
  id,
  course,
}: {
  id: string;
  course: NonNullable<Awaited<ReturnType<typeof getCourse>>>;
}) {
  const hasFullContentAccess = await checkFullCourseContentAccess(id);

  // Retrieve db tryouts
  const compatibilityCourseId = course.legacyId ?? id;
  const courseIds = [...new Set([course.id, course.canonicalId, compatibilityCourseId].filter(Boolean))] as string[];

  const dbTryouts = await db
    .select()
    .from(exams)
    .where(and(inArray(exams.courseId, courseIds), eq(exams.type, "tryout"), eq(exams.status, "published")));

  const questionCounts = dbTryouts.length
    ? await db
        .select({ examId: questions.examId, count: count() })
        .from(questions)
        .where(inArray(questions.examId, dbTryouts.map((tryout) => tryout.id)))
        .groupBy(questions.examId)
    : [];
  const questionCountsByExam = new Map(questionCounts.map(({ examId, count }) => [examId, count]));

  const mappedDb = dbTryouts.map((t) => {
    const settings = typeof t.settings === "string" ? JSON.parse(t.settings) : t.settings;
    return {
      id: t.id,
      courseId: id,
      title: t.title,
      type: "tryout" as const,
      status: t.status,
      settings: settings || { timeLimitMinutes: 90, maxAttempts: 2 },
      questionCount: questionCountsByExam.get(t.id) ?? 0,
      questions: [],
      openAt: t.openAt,
      closeAt: t.closeAt,
    };
  });

  const allTryouts = mappedDb;

  return (
    <Reveal>
      {!hasFullContentAccess && (
        <div className="mb-6 rounded-lg border border-brand-secondary/25 bg-brand-secondary/5 p-4">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(280px,420px)] md:items-center">
            <div>
              <h3 className="font-heading text-body-base font-bold text-brand-secondary">
                <TranslatedText namespace="learning" messageKey="quizPage.activationTitle" />
              </h3>
              <p className="mt-1 max-w-2xl text-body-sm text-muted-foreground">
                <TranslatedText namespace="learning" messageKey="tryoutPage.activationDescription" />
              </p>
            </div>
            <EnrollmentForm className="w-full" />
          </div>
        </div>
      )}
      <TryoutListClient courseId={id} hasFullContentAccess={hasFullContentAccess} tryouts={allTryouts} />
    </Reveal>
  );
}

export default async function CourseTryoutListPage({ params }: Props) {
  const { id } = await params;
  const [course, session] = await Promise.all([
    getCourse(id),
    getAuthSession(),
  ]);
  if (!course) return null;

  const studentId = session?.user?.id;
  if (!studentId) {
    redirect(`/sign-in?next=${encodeURIComponent(`/courses/${id}/tryout`)}`);
  }

  return (
    <StudentTryoutsView courseTitle={course.title}>
      <Suspense fallback={<CourseTryoutListSkeleton />}>
        <CourseTryoutListContent id={id} course={course} />
      </Suspense>
    </StudentTryoutsView>
  );
}
