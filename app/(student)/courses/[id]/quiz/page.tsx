import type { Metadata } from "next";

import { ClipboardList } from "lucide-react";
import Link from "next/link";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { pageTitle } from "@/lib/site";
import { QuizListClient } from "./quiz-list-client";
import { Reveal } from "@/components/ui/reveal";
import { db } from "@/db";
import { studentQuizAttempts } from "@/db/schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { EnrollmentForm } from "@/components/enrollment-form";
import { getCourse, getStudentCourseAccess, getStudentVisibleCourseQuizzes, isFreeQuizTemplate } from "@/lib/course-utils";
import { cn } from "@/lib/utils";

type QuizAccessFilter = "all" | "free" | "premium";

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ access?: string | string[] }>;
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

export default async function CourseQuizListPage({ params, searchParams }: Props) {
  const { id } = await params;
  const rawAccess = (await searchParams)?.access;
  const requestedAccess = Array.isArray(rawAccess) ? rawAccess[0] : rawAccess;
  const access: QuizAccessFilter = requestedAccess === "free" || requestedAccess === "premium"
    ? requestedAccess
    : "all";

  const course = await getCourse(id);

  if (!course) notFound();

  // Retrieve previous attempts
  const session = await auth.api.getSession({ headers: await headers() });
  const studentId = session?.user?.id;
  if (!studentId) {
    redirect(`/sign-in?next=${encodeURIComponent(`/courses/${id}/quiz`)}`);
  }
  const studentAccess = studentId ? await getStudentCourseAccess(studentId, id) : null;

  // The server-side catalog returns all published course quizzes so students can see
  // the full curriculum. Templates outside free chapters are marked locked on the client.
  // Calls getStudentVisibleCourseQuizzes(id) with studentId scoping.
  const templates = await getStudentVisibleCourseQuizzes(id, studentId);
  const accessTier = !studentId
    ? "anonymous" as const
    : studentAccess
      ? studentAccess.tier
      : "anonymous" as const;
  const isEnrolled = studentAccess?.tier === "standard";
  const attempts = studentId
    ? await db
        .select()
        .from(studentQuizAttempts)
        .where(eq(studentQuizAttempts.studentId, studentId))
    : [];

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
  const counts = {
    all: templates.length,
    free: templates.filter((template) => template.visibility === "free").length,
    premium: templates.filter((template) => template.visibility === "paid").length,
  };
  const filters: Array<{ value: QuizAccessFilter; label: string }> = [
    { value: "all", label: "Semua" },
    { value: "free", label: "Gratis" },
    { value: "premium", label: "Premium" },
  ];

  return (
    <CoursePageShell
      title={`Kuis Latihan: ${course.title}`}

      icon={ClipboardList}
      actions={(
        <nav className="flex max-w-full items-center gap-1 overflow-x-auto" aria-label="Filter akses kuis">
          {filters.map((filter) => (
            <Link
              key={filter.value}
              href={filter.value === "all" ? `/courses/${id}/quiz` : `/courses/${id}/quiz?access=${filter.value}`}
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-body-sm font-semibold transition-colors",
                access === filter.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              aria-current={access === filter.value ? "page" : undefined}
            >
              {filter.label}
              <span className={cn("text-body-xs", access === filter.value && "text-primary-foreground/80")}>{counts[filter.value]}</span>
            </Link>
          ))}
        </nav>
      )}
    >
      <Reveal>
        {!isEnrolled && (
          <div className="mb-6 rounded-lg border border-brand-secondary/25 bg-brand-secondary/5 p-4">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(280px,420px)] md:items-center">
              <div>
                <h3 className="font-heading text-body-base font-bold text-brand-secondary">
                  Aktivasi token kelas
                </h3>
                <p className="mt-1 max-w-2xl text-body-sm text-muted-foreground">
                  Materi artikel, diktat, dan kuis bab pertama terbuka gratis. Masukkan token kelas untuk membuka seluruh materi, kuis, tryout ujian, dan flashcard.
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
          attempts={attempts}
        />
      </Reveal>
    </CoursePageShell>
  );
}
