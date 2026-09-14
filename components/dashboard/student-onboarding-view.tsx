import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  ClipboardList,
  Flame,
  Layers,
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

interface CatalogCourse {
  id: string;
  title: string;
  category: string;
  description: string;
  materialsCount: number;
  quizzesCount: number;
  tryoutsCount: number;
}

interface StudentOnboardingViewProps {
  userName: string;
  catalogCourses: CatalogCourse[];
}

const featureHighlights = [
  {
    icon: BookOpen,
    title: "Diktat & Rangkuman",
    desc: "Materi terstruktur per bab sesuai silabus TPB ITB.",
  },
  {
    icon: ClipboardList,
    title: "Kuis & Tryout",
    desc: "Latihan soal mandiri dengan kunci dan pembahasan bertahap.",
  },
  {
    icon: Layers,
    title: "Spaced Repetition",
    desc: "Flashcard cerdas untuk mengingat rumus dan konsep kunci.",
  },
];

export function StudentOnboardingView({
  userName,
  catalogCourses,
}: StudentOnboardingViewProps) {
  const firstName = userName.split(" ")[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <>
            Halo,{" "}
            <span className="bg-gradient-to-r from-brand-primary to-brand-secondary bg-clip-text text-transparent">
              {firstName}
            </span>
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm" className="rounded-lg text-body-xs">
              <Link href="/plans">Lihat Paket</Link>
            </Button>
            <Button asChild size="sm" className="gap-1.5 rounded-lg text-body-xs">
              <Link href="/courses">
                Jelajahi Course
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-7">
          <section className="border-b border-border/70 pb-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-heading text-body-base font-bold text-foreground">
                <BookOpen className="size-4.5 text-brand-primary" />
                Pilihan Kelas TPB ITB
              </h2>
              <Link
                href="/courses"
                className="flex items-center gap-0.5 text-body-xs font-bold text-brand-primary hover:underline"
              >
                Lihat Semua
                <ArrowUpRight className="size-3.5" />
              </Link>
            </div>

            <div className="divide-y divide-border/60 border-y border-border">
              {catalogCourses.map((c) => {
                const isPka = c.id === PKA_COURSE_ID;
                return (
                  <Link
                    key={c.id}
                    href={`/courses/${c.id}`}
                    className="group -mx-3 block rounded-xl px-3 py-3.5 transition-colors hover:bg-muted/30"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex shrink-0 rounded-md bg-brand-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-primary ring-1 ring-brand-primary/20">
                            {c.category}
                          </span>
                          {isPka && (
                            <span className="inline-flex shrink-0 rounded-md bg-brand-secondary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-secondary ring-1 ring-brand-secondary/20">
                              Maba ITB
                            </span>
                          )}
                          <h3 className="truncate font-heading text-body-sm font-bold text-foreground transition-colors group-hover:text-brand-primary">
                            {c.title}
                          </h3>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-body-xs text-muted-foreground">
                          {isPka ? (
                            <span className="flex items-center gap-1.5 font-medium text-brand-secondary">
                              <Layers className="size-3.5" />
                              Simulasi 3 stage x 3 mapel
                            </span>
                          ) : (
                            <>
                              <span>{c.materialsCount} bahan belajar</span>
                              <span>•</span>
                              <span>{c.quizzesCount} kuis & tryout</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-all group-hover:border-brand-primary/40 group-hover:text-brand-primary">
                        <ArrowRight className="size-3.5" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="border-b border-border/70 pb-6">
            <h2 className="mb-4 flex items-center gap-2 font-heading text-body-base font-bold text-foreground">
              <Flame className="size-4.5 fill-brand-secondary/10 text-brand-secondary" />
              Fitur Belajar Terintegrasi
            </h2>

            <div className="grid gap-3 sm:grid-cols-3">
              {featureHighlights.map((feat) => {
                const Icon = feat.icon;
                return (
                  <Card key={feat.title} className="p-3.5">
                    <div className="flex size-7 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
                      <Icon className="size-4" />
                    </div>
                    <h3 className="mt-2.5 font-heading text-body-xs font-bold text-foreground">
                      {feat.title}
                    </h3>
                    <p className="mt-1 text-body-xs leading-snug text-muted-foreground">
                      {feat.desc}
                    </p>
                  </Card>
                );
              })}
            </div>
          </section>
        </div>

        <div className="space-y-6 lg:col-span-5">
          <Card className="p-4 sm:p-5">
            <h2 className="flex items-center gap-2 font-heading text-body-sm font-bold text-foreground">
              <span className="flex size-5 items-center justify-center rounded-full bg-brand-primary text-[10px] font-bold text-white">
                1
              </span>
              Aktivasi Token Kelas
            </h2>
            <EnrollmentForm className="mt-3.5" />
          </Card>

          <Card className="p-4 sm:p-5">
            <h2 className="flex items-center gap-2 font-heading text-body-sm font-bold text-foreground">
              <span className="flex size-5 items-center justify-center rounded-full bg-brand-secondary text-[10px] font-bold text-white">
                2
              </span>
              Paket Belajar Semester
            </h2>

            <PlanPromotion className="mb-3 mt-3.5" />
            <div className="space-y-2.5">
              {previewPlanTiers.map((tier) => (
                <div
                  key={tier.key}
                  className={cn(
                    "rounded-lg border border-border/60 bg-card/50 p-3 backdrop-blur-xs transition-colors",
                    tier.highlighted && "border-brand-primary/40 bg-brand-primary/10"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-heading text-body-xs font-bold text-foreground">
                      {tier.name}
                    </span>
                    {tier.highlighted && (
                      <span className="rounded-md bg-brand-primary/10 px-1.5 py-0.2 text-[10px] font-bold text-brand-primary">
                        Populer
                      </span>
                    )}
                  </div>
                  <div className="mt-2">
                    <PlanPrice
                      plan={tier.key}
                      persons={DEFAULT_PERSONS}
                      courses={DEFAULT_COURSES}
                      perPerson
                    />
                  </div>
                  <p className="mt-1 line-clamp-1 text-body-xs text-muted-foreground">
                    {tier.note}
                  </p>
                </div>
              ))}
            </div>

            <Button asChild variant="outline" size="sm" className="mt-4 w-full rounded-lg text-body-xs">
              <Link href="/plans" className="flex items-center justify-center gap-1.5">
                Bandingkan Semua Paket
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
