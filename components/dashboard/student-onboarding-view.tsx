import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Flame,
  GraduationCap,
  LockKeyhole,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { EnrollmentForm } from "@/components/enrollment-form";
import { previewPlanTiers } from "@/lib/plan-tiers";
import { PlanPrice, PlanPromotion } from "@/components/pricing/plan-price";
import { DEFAULT_COURSES, DEFAULT_PERSONS } from "@/lib/pricing-constants";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import { cn } from "@/lib/utils";

export interface CatalogCourse {
  id: string;
  title: string;
  category: string;
  description: string;
  materialsCount: number;
  quizzesCount: number;
  tryoutsCount: number;
  freeChapters: Array<{
    id: string;
    title: string;
    completed: boolean;
    completionPercent: number;
    materialId: string | null;
  }>;
  freeMaterialCount: number;
  completedFreeMaterialCount: number;
  freeQuizCount: number;
  firstIncompleteMaterialId: string | null;
}

interface StudentOnboardingViewProps {
  userName: string;
  catalogCourses: CatalogCourse[];
  studentTargetCategory?: string | null;
}

const featureHighlights = [
  {
    icon: BookOpen,
    title: "Dokumen dan soal PDF",
    desc: "Akses berkas PDF materi kuliah dan arsip soal latihan secara gratis.",
  },
  {
    icon: ClipboardList,
    title: "Kuis dan materi interaktif",
    desc: "Aktivasi token kelas untuk membuka kuis, flashcard, dan artikel lengkap.",
  },
  {
    icon: CheckCircle2,
    title: "Progres tersimpan",
    desc: "Lanjutkan belajar dari posisi terakhir setelah login.",
  },
];

/**
 * Onboarding preview view displayed on the student dashboard before enrolling in classes.
 */
export function StudentOnboardingView({
  userName,
  catalogCourses,
  studentTargetCategory,
}: StudentOnboardingViewProps) {
  const firstName = userName.split(" ")[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <>
            Mulai belajar,{" "}
            <span className="text-brand-primary">
              {firstName}
            </span>
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm" className="rounded-lg text-body-sm">
              <Link href="/plans">Lihat paket</Link>
            </Button>
            <Button asChild size="sm" className="gap-1.5 rounded-lg text-body-sm">
              <Link href="/courses">
                Jelajahi semua course
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-border/60 pb-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="flex items-center gap-2 font-heading text-body-base font-bold text-foreground">
                    <BookOpen className="size-4.5 text-brand-primary" />
                    Course untukmu
                  </h2>
                  {studentTargetCategory && (
                    <span className="rounded-md bg-brand-primary/10 px-2 py-0.5 text-body-2xs font-bold uppercase tracking-wider text-brand-primary ring-1 ring-brand-primary/20">
                      {studentTargetCategory === "TPB" ? "Rekomendasi TPB" : `Rekomendasi ${studentTargetCategory}`}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-body-xs text-muted-foreground">
                  Bab pertama gratis di setiap mata kuliah.
                </p>
              </div>
              <span className="rounded-md bg-brand-primary/10 px-2 py-1 text-body-2xs font-semibold text-brand-primary">
                Paket Free
              </span>
            </div>

            {catalogCourses.length > 0 ? (
              <div className="space-y-3">
                {catalogCourses.map((course) => {
                  const totalMaterials = course.freeMaterialCount;
                  const completedMaterials = course.completedFreeMaterialCount;
                  const progressPercent = totalMaterials > 0
                    ? Math.round((completedMaterials / totalMaterials) * 100)
                    : 0;
                  const nextHref = course.firstIncompleteMaterialId
                    ? `/courses/${course.id}/material/${course.firstIncompleteMaterialId}`
                    : `/courses/${course.id}`;
                  const nextLabel = completedMaterials > 0 && completedMaterials < totalMaterials
                    ? "Lanjutkan belajar"
                    : "Mulai Bab 1";

                  return (
                    <article key={course.id} className="rounded-xl border border-border/70 bg-muted/15 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md bg-brand-primary/10 px-2 py-0.5 text-body-2xs font-bold uppercase tracking-wider text-brand-primary">
                              {course.category}
                            </span>
                            {course.id === PKA_COURSE_ID ? (
                              <span className="rounded-md bg-brand-secondary/10 px-2 py-0.5 text-body-2xs font-bold text-brand-secondary">
                                Maba ITB
                              </span>
                            ) : null}
                            <h3 className="truncate font-heading text-body-sm font-bold text-foreground">
                              {course.title}
                            </h3>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-xs text-muted-foreground">
                            <span>{course.freeChapters.length} bab gratis</span>
                            <span>{course.freeMaterialCount} materi</span>
                            <span>{course.freeQuizCount} kuis</span>
                          </div>
                        </div>
                        <Button asChild size="sm" className="shrink-0 rounded-lg text-body-sm">
                          <Link href={nextHref}>
                            {nextLabel}
                            <ArrowRight className="ml-1.5 size-3.5" />
                          </Link>
                        </Button>
                      </div>

                      <div className="mt-4 flex items-center gap-3">
                        <div className="h-1.5 flex-1 overflow-hidden rounded bg-muted">
                          <div
                            className="h-full rounded bg-brand-primary"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                        <span className="text-body-xs font-semibold text-foreground">{progressPercent}%</span>
                        <span className="text-body-xs text-muted-foreground">
                          {completedMaterials}/{totalMaterials} materi
                        </span>
                      </div>

                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {course.freeChapters.length > 0 ? course.freeChapters.map((chapter, index) => (
                          <div
                            key={chapter.id}
                            className="flex min-w-0 items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2"
                          >
                            {chapter.completed ? (
                              <CheckCircle2 className="size-4 shrink-0 text-status-success" aria-hidden="true" />
                            ) : (
                              <span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-brand-primary/40 text-body-2xs font-semibold text-brand-primary">
                                {index + 1}
                              </span>
                            )}
                            <span className="truncate text-body-xs text-foreground">{chapter.title}</span>
                            <span className="ml-auto shrink-0 rounded-md bg-status-success/10 px-1.5 py-0.5 text-body-2xs font-semibold text-status-success">
                              Gratis
                            </span>
                          </div>
                        )) : (
                          <p className="text-body-xs text-muted-foreground">Materi bab gratis sedang disiapkan.</p>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border/70 bg-muted/15 px-4 py-8 text-center">
                <BookOpen className="mx-auto size-7 text-muted-foreground/60" />
                <p className="mt-2 text-body-sm font-semibold text-foreground">
                  {studentTargetCategory
                    ? `Belum ada course untuk ${studentTargetCategory}`
                    : "Belum ada course yang tersedia"}
                </p>
                <p className="mt-1 text-body-xs text-muted-foreground">
                  {studentTargetCategory
                    ? "Mata kuliah untuk jurusan Anda akan segera tersedia. Anda juga dapat menjelajahi seluruh mata kuliah di katalog."
                    : "Kembali lagi setelah materi gratis dipublikasikan."}
                </p>
                <Button asChild size="sm" variant="outline" className="mt-3 rounded-lg text-body-sm">
                  <Link href="/courses">Lihat semua course di katalog</Link>
                </Button>
              </div>
            )}
          </section>

          <section className="border-b border-border/70 pb-6">
            <h2 className="mb-4 flex items-center gap-2 font-heading text-body-base font-bold text-foreground">
              <Flame className="size-4.5 text-brand-primary" />
              Yang tersedia di Free
            </h2>

            <div className="grid gap-3 sm:grid-cols-3">
              {featureHighlights.map((feature) => {
                const Icon = feature.icon;
                return (
                  <Card key={feature.title} className="p-3.5">
                    <div className="flex size-7 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
                      <Icon className="size-4" />
                    </div>
                    <h3 className="mt-2.5 font-heading text-body-xs font-bold text-foreground">{feature.title}</h3>
                    <p className="mt-1 text-body-xs leading-snug text-muted-foreground">{feature.desc}</p>
                  </Card>
                );
              })}
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-3">
              <h2 className="flex items-center gap-2 font-heading text-body-base font-bold text-foreground">
                <GraduationCap className="size-4.5 text-brand-primary" />
                Paket belajar semester
              </h2>
              <Button asChild variant="outline" size="sm" className="rounded-lg text-body-sm">
                <Link href="/plans">Bandingkan semua paket</Link>
              </Button>
            </div>

            <PlanPromotion className="mt-2" />

            <div className="grid gap-3 sm:grid-cols-3">
              {previewPlanTiers.map((tier) => (
                <Card
                  key={tier.key}
                  className={cn(
                    "p-4 flex flex-col justify-between",
                    tier.highlighted && "border-brand-primary/40 bg-brand-primary/5",
                  )}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-heading text-body-sm font-bold text-foreground">{tier.name}</span>
                      {tier.highlighted ? (
                        <span className="rounded-md bg-brand-primary/10 px-1.5 py-0.5 text-body-2xs font-bold text-brand-primary">
                          Populer
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2.5">
                      <PlanPrice
                        plan={tier.key}
                        persons={DEFAULT_PERSONS}
                        courses={DEFAULT_COURSES}
                        perPerson
                      />
                    </div>
                    <p className="mt-2 text-body-xs text-muted-foreground">{tier.note}</p>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-6 lg:col-span-4">
          <Card className="p-4 sm:p-5">
            <h2 className="flex items-center gap-2 font-heading text-body-sm font-bold text-foreground">
              <LockKeyhole className="size-4 text-muted-foreground" />
              Sudah punya token kelas?
            </h2>
            <EnrollmentForm className="mt-3.5" />
          </Card>

          <Card className="p-4 sm:p-5">
            <h2 className="font-heading text-body-sm font-bold text-foreground">Ingin akses lebih banyak?</h2>
            <p className="mt-2 text-body-xs leading-relaxed text-muted-foreground">
              Buka kuis interaktif, tryout, artikel lengkap, flashcard, dan fitur belajar lanjutan dengan paket berbayar.
            </p>
            <Button asChild className="mt-4 w-full rounded-lg text-body-sm">
              <Link href="/plans">
                Lihat pilihan paket
                <ArrowRight className="ml-1.5 size-4" />
              </Link>
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
