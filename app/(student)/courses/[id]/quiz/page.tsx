import type { Metadata } from "next";

import { ClipboardList } from "lucide-react";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { pageTitle } from "@/lib/site";
import { checkEnrollment } from "@/app/(student)/dashboard/actions";
import { QuizListClient } from "./quiz-list-client";
import { Reveal } from "@/components/ui/reveal";
import { db } from "@/db";
import { studentQuizAttempts } from "@/db/schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getCourse, getStudentVisibleCourseQuizzes } from "@/lib/course-utils";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const course = await getCourse(id);

  return {
    title: pageTitle(course ? `${course.title} - Kuis` : "Kuis"),
    description: course
      ? `Daftar kuis ${course.title}; latihan soal interaktif untuk mengukur pemahaman.`
      : "Daftar kuis; latihan soal interaktif untuk mengukur pemahaman.",
  };
}

export default async function CourseQuizListPage({ params }: Props) {
  const { id } = await params;
  const course = await getCourse(id);

  if (!course) notFound();

  const isEnrolled = await checkEnrollment(id);
  const templates = await getStudentVisibleCourseQuizzes(id);

  const session = await auth.api.getSession({ headers: await headers() });
  const studentId = session?.user?.id;
  const attempts = studentId
    ? await db
        .select()
        .from(studentQuizAttempts)
        .where(eq(studentQuizAttempts.studentId, studentId))
    : [];

  return (
    <CoursePageShell
      title={`Kuis Latihan: ${course.title}`}
      description="Uji pemahaman materi Anda dengan kuis interaktif."
      icon={ClipboardList}
    >
      <Reveal>
        <QuizListClient
          courseId={id}
          isEnrolled={isEnrolled}
          templates={templates}
          attempts={attempts}
        />
      </Reveal>
    </CoursePageShell>
  );
}
