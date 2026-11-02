import { Suspense } from "react";
import type { Metadata } from "next";

import { Brain, Lock } from "lucide-react";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { CourseFlashcardSkeleton } from "@/components/course/course-skeletons";
import { studentCardClass } from "@/components/course/course-surfaces";
import { createMetadata } from "@/lib/site";
import { FlashcardClient } from "./flashcard-client";
import { Reveal } from "@/components/ui/reveal";
import { notFound, redirect } from "next/navigation";
import { getReviewQueue } from "@/lib/flashcard-actions";
import { EnrollmentForm } from "@/components/enrollment-form";
import { getCourse, getStudentCourseAccess } from "@/lib/course-utils";
import { getAuthSession } from "@/lib/auth-session";
import { TranslatedText } from "@/components/i18n/translated-text";
import { getTranslations } from "@/lib/i18n/server";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const course = await getCourse(id);
  const t = await getTranslations("learning");

  return createMetadata({
    title: course ? t("metadata.flashcardTitle", { course: course.title }) : t("metadata.flashcardTitleFallback"),
    description: t("metadata.flashcardDescription"),
    path: `/courses/${id}/flashcard`,
  });
}

async function CourseFlashcardContent({
  id,
  studentId,
}: {
  id: string;
  studentId: string;
}) {
  const access = await getStudentCourseAccess(studentId, id);
  const isEnrolled = access?.tier === "standard";
  const canUseFlashcards = isEnrolled;

  let queue: any[] = [];
  if (canUseFlashcards) {
    try {
      queue = await getReviewQueue(studentId, id);
    } catch (error) {
      console.error("Error fetching flashcard queue:", error);
    }
  }

  return (
    <Reveal>
      {!canUseFlashcards ? (
        <div className={studentCardClass("mx-auto max-w-2xl text-center")}>
          <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/20">
            <Lock className="size-5" />
          </div>
          <h3 className="font-heading text-body-base font-bold text-foreground">
            <TranslatedText namespace="learning" messageKey="flashcards.lockedTitle" />
          </h3>
          <p className="mt-2 text-body-sm text-muted-foreground mb-6">
            <TranslatedText namespace="learning" messageKey="flashcards.lockedDescription" />
          </p>
          <EnrollmentForm className="mx-auto max-w-md text-left" />
        </div>
      ) : (
        <FlashcardClient
          courseId={id}
          initialQueue={queue}
          studentId={studentId}
        />
      )}
    </Reveal>
  );
}

export default async function CourseFlashcardPage({ params }: Props) {
  const { id } = await params;

  const [course, session] = await Promise.all([
    getCourse(id),
    getAuthSession(),
  ]);

  if (!course) notFound();

  const studentId = session?.user?.id;
  if (!studentId) {
    redirect(`/sign-in?next=${encodeURIComponent(`/courses/${id}/flashcard`)}`);
  }

  return (
    <CoursePageShell
      title={<TranslatedText namespace="learning" messageKey="flashcards.pageTitle" values={{ course: course.title }} />}
      icon={Brain}
    >
      <Suspense fallback={<CourseFlashcardSkeleton />}>
        <CourseFlashcardContent id={id} studentId={studentId} />
      </Suspense>
    </CoursePageShell>
  );
}
