import type { Metadata } from "next";

import { ClipboardList } from "lucide-react";
import Link from "next/link";
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
import { getCourse } from "@/lib/course-utils";
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

  const filteredTemplates = templates.filter((template) => {
    if (access === "free") return template.visibility === "free";
    if (access === "premium") return template.visibility === "paid";
    return true;
  });
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
      description="Uji pemahaman materi Anda dengan kuis interaktif."
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
        <QuizListClient
          courseId={id}
          isEnrolled={isEnrolled}
          templates={filteredTemplates}
          attempts={attempts}
        />
      </Reveal>
    </CoursePageShell>
  );
}
