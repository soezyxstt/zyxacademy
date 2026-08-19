import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, ClipboardList, Sparkles } from "lucide-react";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { Reveal } from "@/components/ui/reveal";
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
  description: "Katalog course Zyx Academy, enrollment diaktifkan oleh admin sesuai paket.",
};

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
    <CoursePageShell
      title={
        <>
          Course yang <span className="font-bold italic text-primary">cocok</span> untuk ritmemu
        </>
      }
      description="Pilih kelas, buka dokumen gratis, lalu aktifkan token untuk fitur premium."
    >
      <Reveal>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {coursesWithStats.map((c) => {
            const isPka = c.id === PKA_COURSE_ID;
            return (
              <Link
                key={c.id}
                href={`/courses/${c.id}`}
                className="group relative flex flex-col justify-between rounded-2xl border border-border/70 bg-card/60 p-5 shadow-xs backdrop-blur-md transition-all duration-200 hover:-translate-y-1 hover:border-brand-primary/40 hover:bg-card/90 hover:shadow-md hover:shadow-brand-primary/5"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-md bg-brand-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-primary ring-1 ring-brand-primary/20">
                        {c.category}
                      </span>
                      {isPka ? (
                        <span className="rounded-md bg-brand-secondary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-secondary ring-1 ring-brand-secondary/20">
                          Maba ITB
                        </span>
                      ) : (
                        <span className="rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          ITB TPB
                        </span>
                      )}
                    </div>
                    <span className="flex size-7 items-center justify-center rounded-lg border border-border/60 bg-background/50 text-muted-foreground transition-all duration-200 group-hover:border-brand-primary/30 group-hover:bg-brand-primary/10 group-hover:text-brand-primary shrink-0">
                      <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                    </span>
                  </div>

                  <h2 className="mt-3.5 font-heading text-body-base font-bold text-foreground transition-colors group-hover:text-brand-primary">
                    {c.title}
                  </h2>
                  <p className="mt-1.5 line-clamp-2 text-body-xs leading-relaxed text-muted-foreground">
                    {c.description || "Kelas persiapan dan modul terstruktur ITB TPB."}
                  </p>
                </div>

                <div className="mt-5 border-t border-border/50 pt-3.5 text-body-xs text-muted-foreground">
                  {isPka ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-brand-secondary font-medium">
                        <Sparkles className="size-3.5" />
                        Simulasi 3 stage x 3 mapel
                      </span>
                      <span className="font-semibold text-brand-primary">Mulai</span>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="flex items-center gap-1.5">
                        <BookOpen className="size-3.5 text-brand-primary shrink-0" />
                        <span>{c.materialsCount} materi</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <ClipboardList className="size-3.5 text-tertiary-1 shrink-0" />
                        <span>{c.quizzesCount} kuis, {c.tryoutsCount} tryout</span>
                      </span>
                    </div>
                  )}
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
  );
}
