import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, ClipboardList, Layers, MessageCircle } from "lucide-react";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import { ApplicationPage } from "@/components/application-page";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { studentCardClass, studentInteractiveCardClass } from "@/components/course/course-surfaces";
import { Reveal } from "@/components/ui/reveal";
import { env } from "@/lib/env";
import { pageTitle } from "@/lib/site";
import {
  getCourseMaterials,
  getCourseQuizzes,
  getCourseTryouts,
} from "@/lib/course-utils";
import { listStudentCourses } from "@/lib/student/course-catalog";
import { getWhatsAppAdminChatHref } from "@/lib/whatsapp-admin";

export const metadata: Metadata = {
  title: pageTitle("Katalog Course"),
  description: "Katalog course Zyx Academy, enrollment diaktifkan oleh admin sesuai paket.",
};

export default async function CoursesPage() {
  const dbCourses = await listStudentCourses();
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

  const whatsappHref = getWhatsAppAdminChatHref();

  return (
    <ApplicationPage className="pb-16">
      <Reveal duration="duration-500">
        <PageHeader
          title="Katalog Course"
          icon={BookOpen}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {whatsappHref && (
                <Button asChild variant="outline" size="sm" className="rounded-lg text-body-sm gap-1.5">
                  <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="size-3.5 text-status-success" />
                    Hubungi admin
                  </a>
                </Button>
              )}
              <Button asChild size="sm" className="rounded-lg text-body-sm">
                <Link href="/plans">Lihat paket</Link>
              </Button>
            </div>
          }
        />
      </Reveal>

      <Reveal duration="duration-700">
        {coursesWithStats.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {coursesWithStats.map((c) => {
              const isPka = c.id === PKA_COURSE_ID;
              return (
                <Link
                  key={c.id}
                  href={`/courses/${c.id}`}
                  className={studentInteractiveCardClass("justify-between p-5")}
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
                          <Layers className="size-3.5" />
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
        ) : (
          <div className={studentCardClass("py-12 text-center max-w-md mx-auto")}>
            <BookOpen className="mx-auto size-10 text-muted-foreground/40 mb-3" />
            <h2 className="font-heading text-body-base font-bold text-foreground">
              Belum ada course yang tersedia
            </h2>
            <p className="mt-1 text-body-xs text-muted-foreground">
              Course akan ditampilkan di sini setelah dipublikasikan.
            </p>
          </div>
        )}

        <p className="mt-8 text-body-sm text-muted-foreground">
          Perlu akses tambahan?{" "}
          <Link href="/plans" className="font-semibold text-primary underline-offset-4 hover:underline">
            Lihat paket
          </Link>
          {whatsappHref && (
            <>
              {" "}atau{" "}
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-primary underline-offset-4 hover:underline"
              >
                hubungi kami di WhatsApp
              </a>
            </>
          )}
          .
        </p>
      </Reveal>
    </ApplicationPage>
  );
}
