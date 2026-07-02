import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { ArrowRight, BookOpen, ClipboardList, Sparkles } from "lucide-react";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import { AdminSidebar } from "@/components/admin-sidebar";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { CoursesAmbient } from "@/components/course/courses-ambient";
import { Reveal } from "@/components/ui/reveal";
import { StudentSidebar } from "@/components/student-sidebar";
import { TutorSidebar } from "@/components/tutor/tutor-sidebar";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { pageTitle } from "@/lib/site";
import {
  getCourseMaterials,
  getCourseQuizzes,
  getCourseTryouts,
} from "@/lib/course-utils";
import { db } from "@/db";
import { courses as coursesTable } from "@/db/schema";

export const metadata: Metadata = {
  title: pageTitle("Courses"),
  description: "Katalog course Zyx Academy - enrollment diaktifkan oleh admin sesuai paket.",
};

async function CoursesRoleFrame({ children }: { children: ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  const role = (session?.user as { role?: string | null } | undefined)?.role;

  if (role === "admin") {
    return (
      <div className="relative flex min-h-screen flex-row bg-background">
        <AdminSidebar />
        <main
          id="main-content"
          tabIndex={-1}
          className="relative z-10 min-w-0 flex-1 focus:outline-none"
        >
          {children}
        </main>
      </div>
    );
  }

  if (role === "teacher" && env.FEATURE_TUTOR_ANALYTICS === "1") {
    return (
      <div className="relative flex min-h-screen flex-row overflow-x-clip bg-landing-hero-shell">
        <CoursesAmbient />
        <TutorSidebar />
        <main
          id="main-content"
          tabIndex={-1}
          className="relative z-10 min-w-0 flex-1 focus:outline-none"
        >
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-row overflow-x-clip bg-landing-hero-shell">
      <CoursesAmbient />
      <StudentSidebar
        showStudyPath={env.FEATURE_STUDY_PATH === "1"}
        showMastery={env.FEATURE_MASTERY === "1"}
        showLive={env.FEATURE_LIVE === "1"}
      />
      <main
        id="main-content"
        tabIndex={-1}
        className="relative z-10 min-w-0 flex-1 focus:outline-none"
      >
        {children}
      </main>
    </div>
  );
}

export default async function CoursesPage() {
  const dbCourses = await db.select().from(coursesTable);
  const TEST_COURSE_IDS = new Set([
    "embed-test-course",
    "miscon-test-course",
    "remed-test-course",
    "term-test-course",
    "graph-test-course",
  ]);
  const courses = dbCourses.filter(
    (c) => !TEST_COURSE_IDS.has(c.id) && (c.id !== PKA_COURSE_ID || env.FEATURE_PKA === "1")
  );

  const coursesWithStats = await Promise.all(
    courses.map(async (c) => {
      // Tutorial PKA is a lean campaign course with no standard materials/quizzes/tryouts to count.
      if (c.id === PKA_COURSE_ID) {
        return { ...c, materialsCount: 0, quizzesCount: 0, tryoutsCount: 0 };
      }
      const [materials, quizzes, tryouts] = await Promise.all([
        getCourseMaterials(c.id),
        getCourseQuizzes(c.id),
        getCourseTryouts(c.id),
      ]);
      return {
        ...c,
        materialsCount: materials.length,
        quizzesCount: quizzes.length,
        tryoutsCount: tryouts.length,
      };
    })
  );

  return (
    <CoursesRoleFrame>
      <CoursePageShell
        title={
          <>
            Course yang <span className="font-bold italic text-primary">cocok</span> untuk ritmemu
          </>
        }
        description="Pilih kelas, buka dokumen gratis, lalu aktifkan token untuk fitur premium."
      >
        <Reveal>
          <div className="divide-y divide-border border-y border-border">
            {coursesWithStats.map((c) => {
              const isPka = c.id === PKA_COURSE_ID;
              return (
                <Link
                  key={c.id}
                  href={isPka ? "/pka" : `/courses/${c.id}`}
                  className="group grid gap-4 py-5 transition-colors duration-150 hover:bg-muted/35 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-brand-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-primary ring-1 ring-brand-primary/20">
                        {c.category}
                      </span>
                      {isPka ? (
                        <span className="rounded-md bg-brand-secondary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-secondary ring-1 ring-brand-secondary/20">
                          Gratis
                        </span>
                      ) : (
                        <span className="text-body-xs font-medium text-muted-foreground">
                          ITB TPB
                        </span>
                      )}
                    </div>
                    <h2 className="mt-2 font-heading text-h5 font-bold text-foreground transition-colors group-hover:text-brand-primary">
                      {c.title}
                    </h2>
                    <p className="mt-1.5 max-w-3xl text-body-sm leading-relaxed text-muted-foreground">
                      {c.description}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-4 sm:min-w-[220px]">
                    {isPka ? (
                      <div className="grid gap-1 text-body-xs text-muted-foreground">
                        <span className="flex items-center gap-2">
                          <Sparkles className="size-3.5 text-brand-secondary" />
                          Simulasi 3 stage x 3 mapel
                        </span>
                      </div>
                    ) : (
                      <div className="grid gap-1 text-body-xs text-muted-foreground">
                        <span className="flex items-center gap-2">
                          <BookOpen className="size-3.5 text-brand-primary" />
                          {c.materialsCount} bahan belajar
                        </span>
                        <span className="flex items-center gap-2">
                          <ClipboardList className="size-3.5 text-tertiary-1" />
                          {c.quizzesCount} kuis, {c.tryoutsCount} tryout
                        </span>
                      </div>
                    )}
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors group-hover:border-brand-primary/40 group-hover:text-brand-primary">
                      <ArrowRight className="size-4" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>

          <p className="mt-8 text-body-sm text-muted-foreground">
            Perlu akses?{" "}
            <Link href="/plans" className="font-semibold text-primary underline-offset-4 hover:underline">
              Lihat paket
            </Link>{" "}
            atau{" "}
            <Link href="/feedback" className="font-semibold text-primary underline-offset-4 hover:underline">
              hubungi kami
            </Link>
            .
          </p>
        </Reveal>
      </CoursePageShell>
    </CoursesRoleFrame>
  );
}
