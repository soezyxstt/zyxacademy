import type { Metadata } from "next";

import { ClipboardList, Target } from "lucide-react";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { pageTitle } from "@/lib/site";
import { checkEnrollment } from "@/app/(student)/dashboard/actions";
import { QuizListClient } from "./quiz-list-client";
import { Reveal } from "@/components/ui/reveal";
import { db } from "@/db";
import { quizTemplates, studentQuizAttempts } from "@/db/schema";
import { auth } from "@/lib/auth";
import { eq, desc, and, ne } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getWeakestConcepts } from "@/lib/learning-analytics";
import { getCourse } from "@/lib/course-utils";

type Props = { params: Promise<{ id: string }> };

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

  // Retrieve templates
  const templates = await db
    .select()
    .from(quizTemplates)
    .where(
      and(
        eq(quizTemplates.courseId, course.legacyId ?? id),
        eq(quizTemplates.status, 'published'),
        ne(quizTemplates.category, 'simulation')
      )
    )
    .orderBy(desc(quizTemplates.createdAt));

  // Retrieve previous attempts
  const session = await auth.api.getSession({ headers: await headers() });
  const studentId = session?.user?.id;
  const attempts = studentId
    ? await db
        .select()
        .from(studentQuizAttempts)
        .where(eq(studentQuizAttempts.studentId, studentId))
    : [];

  // Weakest concepts steer targeted practice, mirroring the landing "latihan terarah" promise.
  const weakConcepts = studentId && isEnrolled
    ? (await getWeakestConcepts(studentId, course.legacyId ?? id, 3)).map((c) => c.conceptName)
    : [];

  return (
    <CoursePageShell
      title={`Kuis Latihan: ${course.title}`}
      description="Uji pemahaman materi Anda dengan kuis interaktif."
      icon={ClipboardList}
    >
      <Reveal>
        {weakConcepts.length > 0 && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-brand-primary/20 bg-brand-primary/5 p-4">
            <Target className="mt-0.5 size-5 shrink-0 text-brand-primary" aria-hidden />
            <div>
              <p className="text-body-sm font-semibold text-foreground">
                Fokuskan latihan di konsep terlemahmu
              </p>
              <p className="mt-1 text-body-sm text-muted-foreground">
                {weakConcepts.join(", ")}
              </p>
            </div>
          </div>
        )}
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
