import type { Metadata } from "next";

import { Brain } from "lucide-react";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { studentCardClass } from "@/components/course/course-surfaces";
import { pageTitle } from "@/lib/site";
import { FlashcardClient } from "./flashcard-client";
import { Reveal } from "@/components/ui/reveal";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getReviewQueue } from "@/lib/flashcard-actions";
import { EnrollmentForm } from "@/components/enrollment-form";
import { getCourse, getStudentCourseAccess } from "@/lib/course-utils";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const course = await getCourse(id);

  return {
    title: pageTitle(course ? `${course.title} - Flashcard` : "Flashcard"),
    description: "Dek belajar spaced repetition untuk konsep-konsep kelas",
  };
}

export default async function CourseFlashcardPage({ params }: Props) {
  const { id } = await params;

  const course = await getCourse(id);

  if (!course) notFound();

  // Retrieve user session
  const session = await auth.api.getSession({ headers: await headers() });
  const studentId = session?.user?.id;
  if (!studentId) {
    redirect(`/sign-in?next=${encodeURIComponent(`/courses/${id}/flashcard`)}`);
  }
  const access = studentId ? await getStudentCourseAccess(studentId, id) : null;
  const canUseFlashcards = Boolean(access);

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
      description="Hafalkan konsep-konsep kunci dengan metode pengulangan jeda."
      icon={Brain}
    >
      <Reveal>
        {!canUseFlashcards ? (
          <div className={studentCardClass("mx-auto max-w-2xl text-center")}>
            <h3 className="font-heading text-body-base font-bold text-foreground">
              Akses Terkunci
            </h3>
            <p className="mt-2 text-body-sm text-muted-foreground mb-6">
              Masuk dan aktifkan akses belajar untuk mulai berlatih dengan flashcard.
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
