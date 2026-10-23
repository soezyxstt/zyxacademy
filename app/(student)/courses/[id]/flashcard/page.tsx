import type { Metadata } from "next";

import { Brain, Lock } from "lucide-react";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { studentCardClass } from "@/components/course/course-surfaces";
import { createMetadata, pageTitle } from "@/lib/site";
import { FlashcardClient } from "./flashcard-client";
import { Reveal } from "@/components/ui/reveal";
import { notFound, redirect } from "next/navigation";
import { getReviewQueue } from "@/lib/flashcard-actions";
import { EnrollmentForm } from "@/components/enrollment-form";
import { getCourse, getStudentCourseAccess } from "@/lib/course-utils";
import { getAuthSession } from "@/lib/auth-session";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const course = await getCourse(id);

  return createMetadata({
    title: course ? `Flashcard ${course.title}` : "Flashcard",
    description: `Dek belajar spaced repetition untuk konsep-konsep kelas ${course?.title ?? ""}.`,
    path: `/courses/${id}/flashcard`,
  });
}


export default async function CourseFlashcardPage({ params }: Props) {
  const { id } = await params;

  const course = await getCourse(id);

  if (!course) notFound();

  // Retrieve user session
  const session = await getAuthSession();
  const studentId = session?.user?.id;
  if (!studentId) {
    redirect(`/sign-in?next=${encodeURIComponent(`/courses/${id}/flashcard`)}`);
  }
  const access = studentId ? await getStudentCourseAccess(studentId, id) : null;
  const isEnrolled = access?.tier === "standard";
  const canUseFlashcards = isEnrolled;

  let queue: any[] = [];
  if (studentId && canUseFlashcards) {
    try {
      queue = await getReviewQueue(studentId, id);
    } catch (error) {
      console.error("Error fetching flashcard queue:", error);
    }
  }

  return (
    <CoursePageShell
      title={`Flashcards: ${course.title}`}

      icon={Brain}
    >
      <Reveal>
        {!canUseFlashcards ? (
          <div className={studentCardClass("mx-auto max-w-2xl text-center")}>
            <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/20">
              <Lock className="size-5" />
            </div>
            <h3 className="font-heading text-body-base font-bold text-foreground">
              Akses Terkunci
            </h3>
            <p className="mt-2 text-body-sm text-muted-foreground mb-6">
              Fitur flashcard spaced repetition memerlukan aktivasi token kelas atau paket aktif.
            </p>
            <EnrollmentForm className="mx-auto max-w-md text-left" />
          </div>
        ) : (
          <FlashcardClient
            courseId={id}
            initialQueue={queue}
            studentId={studentId || ""}
          />
        )}
      </Reveal>
    </CoursePageShell>
  );
}
