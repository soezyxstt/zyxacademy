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
import { PageHeader } from "@/components/page-header";
import { EnrollmentForm } from "@/components/enrollment-form";
import { planTiers } from "@/lib/plan-tiers";
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

const previewTiers = planTiers.filter((tier) =>
  ["minimal", "essential", "premium"].includes(tier.key)
);

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
      {/* Top Header */}
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
              <Link href="/plans">
                Lihat Paket
              </Link>
            </Button>
            <Button asChild size="sm" className="rounded-lg text-body-xs gap-1.5">
              <Link href="/courses">
                Jelajahi Course
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </div>
        }
      />

      {/* Main 2-column layout: space-efficient & dense */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Column (7 cols): Available Courses & Learning Capabilities */}
        <div className="space-y-6 lg:col-span-7">
          {/* Section 1: Catalog Preview */}
          <section className="border-b border-border/70 pb-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2">
                <BookOpen className="size-4.5 text-brand-primary" />
                Pilihan Kelas TPB ITB
              </h2>
              <Link
                href="/courses"
                className="text-body-xs font-bold text-brand-primary hover:underline flex items-center gap-0.5"
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
                    className="group block py-3.5 px-3 -mx-3 rounded-xl transition-colors hover:bg-muted/30"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex rounded-md bg-brand-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-primary ring-1 ring-brand-primary/20 shrink-0">
                            {c.category}
                          </span>
                          {isPka && (
                            <span className="inline-flex rounded-md bg-brand-secondary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-secondary ring-1 ring-brand-secondary/20 shrink-0">
                              Maba ITB
                            </span>
                          )}
                          <h3 className="font-heading text-body-sm font-bold text-foreground group-hover:text-brand-primary transition-colors truncate">
                            {c.title}
                          </h3>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-body-xs text-muted-foreground">
                          {isPka ? (
                            <span className="flex items-center gap-1.5 text-brand-secondary font-medium">
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

                      <div className="flex size-7 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground group-hover:border-brand-primary/40 group-hover:text-brand-primary transition-all shrink-0">
                        <ArrowRight className="size-3.5" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          {/* Section 2: Key Learning Features */}
          <section className="border-b border-border/70 pb-6">
            <h2 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2 mb-4">
              <Flame className="size-4.5 text-brand-secondary fill-brand-secondary/10" />
              Fitur Belajar Terintegrasi
            </h2>

            <div className="grid gap-3 sm:grid-cols-3">
              {featureHighlights.map((feat) => {
                const Icon = feat.icon;
                return (
                  <div
                    key={feat.title}
                    className="rounded-xl border border-border bg-background/50 p-3.5"
                  >
                    <div className="flex size-7 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
                      <Icon className="size-4" />
                    </div>
                    <h3 className="font-heading text-body-xs font-bold text-foreground mt-2.5">
                      {feat.title}
                    </h3>
                    <p className="text-body-xs text-muted-foreground mt-1 leading-snug">
                      {feat.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Right Column (5 cols): Activation Form & Subscription Plans */}
        <div className="space-y-6 lg:col-span-5">
          {/* Section 1: Activation Box */}
          <section className="rounded-xl border border-border bg-background/50 p-4 sm:p-5">
            <h2 className="font-heading text-body-sm font-bold text-foreground flex items-center gap-2">
              <span className="flex size-5 items-center justify-center rounded-full bg-brand-primary text-[10px] font-bold text-white">
                1
              </span>
              Aktivasi Token Kelas
            </h2>
            <p className="text-body-xs text-muted-foreground mt-1 mb-3.5">
              Masukkan token kelas dari pendaftaran paket atau dari tutor/admin.
            </p>

            <EnrollmentForm />
          </section>

          {/* Section 2: Subscription Plans Preview */}
          <section className="rounded-xl border border-border bg-background/50 p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3.5">
              <div>
                <h2 className="font-heading text-body-sm font-bold text-foreground flex items-center gap-2">
                  <span className="flex size-5 items-center justify-center rounded-full bg-brand-secondary text-[10px] font-bold text-white">
                    2
                  </span>
                  Paket Belajar Semester
                </h2>
                <p className="text-body-xs text-muted-foreground mt-0.5">
                  Akses modul, video pembahasan, dan sesi tutorial tatap muka.
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              {previewTiers.map((tier) => (
                <div
                  key={tier.key}
                  className={cn(
                    "rounded-lg border border-border bg-background p-3 transition-colors",
                    tier.highlighted && "border-brand-primary/40 bg-brand-primary/5"
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
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
                    <span className="font-heading text-body-xs font-bold text-foreground">
                      {tier.price}
                    </span>
                  </div>
                  <p className="text-body-xs text-muted-foreground mt-1 line-clamp-1">
                    {tier.note}
                  </p>
                </div>
              ))}
            </div>

            <Button asChild variant="outline" size="sm" className="w-full mt-4 rounded-lg text-body-xs">
              <Link href="/plans" className="flex items-center justify-center gap-1.5">
                Bandingkan Semua Paket
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </section>
        </div>
      </div>
    </div>
  );
}
