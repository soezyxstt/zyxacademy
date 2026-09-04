"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Plus, Minus, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SectionHeading } from "@/components/ui/section-heading";
import { SectionContainer } from "@/components/layout/section-container";
import { MarketingPageHero } from "@/components/marketing-page-hero";
import { Reveal } from "@/components/ui/reveal";
import { PageOrnaments } from "@/components/ui/page-ornaments";
import {
  DEFAULT_PERSONS,
  MIN_PERSONS,
  MAX_PERSONS,
  DEFAULT_COURSES,
  MIN_COURSES,
  MAX_COURSES,
  CORE_SUBJECTS,
  calculatePlanPrice,
  getWhatsAppPlanUrl,
} from "@/lib/pricing-constants";
import { planTiers } from "@/lib/plan-tiers";

export default function PlansClient() {
  const [persons, setPersons] = useState<number>(DEFAULT_PERSONS);
  // Separate standard courses and other courses (Lain-Lain) count
  const [selectedStandardCourses, setSelectedStandardCourses] = useState<string[]>(() =>
    CORE_SUBJECTS.slice(0, DEFAULT_COURSES).filter((c) => c !== "Mata Kuliah Lain-Lain")
  );
  const [otherCoursesCount, setOtherCoursesCount] = useState<number>(() =>
    CORE_SUBJECTS.slice(0, DEFAULT_COURSES).includes("Mata Kuliah Lain-Lain") ? 1 : 0
  );
  const [showSubjects, setShowSubjects] = useState<boolean>(false);

  // Total courses count
  const courses = selectedStandardCourses.length + otherCoursesCount;

  // Format list for WhatsApp and summary displays
  const selectedCoursesList = [
    ...selectedStandardCourses,
    ...(otherCoursesCount > 0
      ? [
          otherCoursesCount === 1
            ? "Mata Kuliah Lain-Lain"
            : `Mata Kuliah Lain-Lain (${otherCoursesCount})`,
        ]
      : []),
  ];

  const formatPrice = (amount: number): string => {
    return "Rp " + amount.toLocaleString("id-ID");
  };

  const handleIncrementPersons = () => {
    setPersons((prev) => Math.min(prev + 1, MAX_PERSONS));
  };

  const handleDecrementPersons = () => {
    setPersons((prev) => Math.max(prev - 1, MIN_PERSONS));
  };

  const handleIncrementCourses = () => {
    if (courses >= MAX_COURSES) return;
    // Find first standard course not selected
    const nextCourse = CORE_SUBJECTS.filter((c) => c !== "Mata Kuliah Lain-Lain").find(
      (subject) => !selectedStandardCourses.includes(subject)
    );
    if (nextCourse) {
      setSelectedStandardCourses((prev) => [...prev, nextCourse]);
    } else {
      // If all standard courses are selected, increment otherCoursesCount
      setOtherCoursesCount((prev) => prev + 1);
    }
  };

  const handleDecrementCourses = () => {
    if (courses <= MIN_COURSES) return;
    if (otherCoursesCount > 0) {
      setOtherCoursesCount((prev) => prev - 1);
    } else {
      setSelectedStandardCourses((prev) => prev.slice(0, -1));
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Reveal>
        <MarketingPageHero
          sectionId="plans"
          eyebrow="Zyx Academy"
          title="Paket & layanan"
          description="Pilih kombinasi course dan intensitas pendampingan. Pembayaran dilakukan di luar website; admin akan mengaktifkan akses sesuai paket."
        />
      </Reveal>

      {/* Sticky Configurator Bar */}
      <div className="sticky top-[52px] md:top-[56px] z-30 w-full border-y border-border bg-background/95 backdrop-blur-md py-3 shadow-xs animate-in fade-in duration-200">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            
            {/* Title / Description */}
            <div className="text-center md:text-left">
              <h2 className="font-heading text-body-base font-bold text-foreground">
                Sesuaikan Rencana Belajar
              </h2>
              <p className="hidden md:block text-body-xs text-muted-foreground mt-0.5">
                Sesuaikan anggota kelompok & mata kuliah secara real-time
              </p>
            </div>

            {/* Stepper Controls & Subject Toggle */}
            <div className="flex flex-wrap items-center justify-center md:justify-end gap-2.5">
              
              {/* Stepper 1: Persons */}
              <div className="flex items-center gap-1.5 bg-muted/40 dark:bg-card border border-border/60 rounded-md px-2.5 py-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1 select-none">
                  Grup
                </span>
                <Button
                  variant="outline"
                  size="icon-xs"
                  onClick={handleDecrementPersons}
                  disabled={persons <= MIN_PERSONS}
                  aria-label="Kurangi jumlah orang"
                  className="rounded-full size-7 bg-background"
                >
                  <Minus className="size-3" />
                </Button>
                <span className="font-heading text-body-sm font-bold text-foreground min-w-[3.5rem] text-center">
                  {persons} Orang
                </span>
                <Button
                  variant="outline"
                  size="icon-xs"
                  onClick={handleIncrementPersons}
                  disabled={persons >= MAX_PERSONS}
                  aria-label="Tambah jumlah orang"
                  className="rounded-full size-7 bg-background"
                >
                  <Plus className="size-3" />
                </Button>
              </div>

              {/* Stepper 2: Courses */}
              <div className="flex items-center gap-1.5 bg-muted/40 dark:bg-card border border-border/60 rounded-md px-2.5 py-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1 select-none">
                  Matkul
                </span>
                <Button
                  variant="outline"
                  size="icon-xs"
                  onClick={handleDecrementCourses}
                  disabled={courses <= MIN_COURSES}
                  aria-label="Kurangi mata kuliah"
                  className="rounded-full size-7 bg-background"
                >
                  <Minus className="size-3" />
                </Button>
                <span className="font-heading text-body-sm font-bold text-foreground min-w-[4rem] text-center">
                  {courses} Matkul
                </span>
                <Button
                  variant="outline"
                  size="icon-xs"
                  onClick={handleIncrementCourses}
                  disabled={courses >= MAX_COURSES}
                  aria-label="Tambah mata kuliah"
                  className="rounded-full size-7 bg-background"
                >
                  <Plus className="size-3" />
                </Button>
              </div>

              {/* Subject Toggle Button */}
              <button
                onClick={() => setShowSubjects(!showSubjects)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-body-xs font-semibold border transition-all ${
                  showSubjects
                    ? "bg-primary text-primary-foreground border-primary shadow-xs"
                    : "bg-muted/80 hover:bg-muted text-foreground border-border/80"
                }`}
                title="Lihat daftar mata kuliah yang dicover"
              >
                <BookOpen className="size-3.5" />
                <span>Mata Kuliah ({courses})</span>
              </button>

            </div>
          </div>
        </div>
      </div>

      {/* Covered Courses Panel (collapsible, scrolls naturally) */}
      {showSubjects && (
        <div className="relative z-20 w-full border-b border-border bg-card p-4 shadow-inner animate-in fade-in slide-in-from-top-3 duration-200">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Mata Kuliah Yang Dicover ({courses}/{MAX_COURSES})
              </h3>
              <button 
                onClick={() => setShowSubjects(false)}
                className="text-body-xs text-primary font-semibold hover:underline"
              >
                Tutup
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {CORE_SUBJECTS.map((subject) => {
                const isLainLain = subject === "Mata Kuliah Lain-Lain";

                if (isLainLain) {
                  const isActive = otherCoursesCount > 0;
                  if (isActive) {
                    return (
                      <div
                        key={subject}
                        className="inline-flex items-center rounded-md border border-[var(--zx-accent)]/20 bg-[var(--zx-accent)]/10 text-[var(--zx-accent)] text-body-xs font-medium overflow-hidden shadow-xs transition-all duration-300"
                      >
                        <button
                          onClick={() => {
                            if (courses <= MIN_COURSES) return;
                            setOtherCoursesCount((prev) => Math.max(0, prev - 1));
                          }}
                          className="px-2 py-1 hover:bg-[var(--zx-accent)]/20 border-r border-[var(--zx-accent)]/20 transition-all focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                          title="Kurangi Mata Kuliah Lain-Lain"
                          disabled={courses <= MIN_COURSES}
                        >
                          <Minus className="size-3" />
                        </button>
                        <span className="px-3 py-1 font-semibold select-none flex items-center gap-1.5">
                          <Check className="size-3 text-[var(--zx-accent)]" />
                          Mata Kuliah Lain-Lain ({otherCoursesCount})
                        </span>
                        <button
                          onClick={() => {
                            if (courses >= MAX_COURSES) return;
                            setOtherCoursesCount((prev) => prev + 1);
                          }}
                          className="px-2 py-1 hover:bg-[var(--zx-accent)]/20 border-l border-[var(--zx-accent)]/20 transition-all focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                          title="Tambah Mata Kuliah Lain-Lain"
                          disabled={courses >= MAX_COURSES}
                        >
                          <Plus className="size-3" />
                        </button>
                      </div>
                    );
                  } else {
                    return (
                      <button
                        key={subject}
                        onClick={() => {
                          if (courses >= MAX_COURSES) return;
                          setOtherCoursesCount(1);
                        }}
                        disabled={courses >= MAX_COURSES}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-body-xs font-medium transition-all duration-300 border border-transparent bg-muted/30 text-muted-foreground/50 hover:bg-muted/60 hover:text-foreground hover:border-border/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none"
                      >
                        {subject}
                      </button>
                    );
                  }
                }

                // Standard Course
                const isActive = selectedStandardCourses.includes(subject);
                return (
                  <button
                    key={subject}
                    onClick={() => {
                      if (isActive) {
                        if (courses <= MIN_COURSES) return;
                        setSelectedStandardCourses((prev) => prev.filter((c) => c !== subject));
                      } else {
                        if (courses >= MAX_COURSES) return;
                        setSelectedStandardCourses((prev) => [...prev, subject]);
                      }
                    }}
                    disabled={!isActive && courses >= MAX_COURSES}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-body-xs font-medium transition-all duration-300 border focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ${
                      isActive
                        ? "bg-[var(--zx-accent)]/10 text-[var(--zx-accent)] border-[var(--zx-accent)]/20 hover:bg-[var(--zx-accent)]/20 shadow-xs"
                        : "bg-muted/30 text-muted-foreground/50 border-transparent hover:bg-muted/60 hover:text-foreground hover:border-border/50"
                    }`}
                  >
                    {isActive && <Check className="size-3" />}
                    {subject}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Pricing Cards Grid */}
      <Reveal>
        <SectionContainer className="border-b border-border bg-muted/70 overflow-hidden pt-8 pb-16 md:pt-12 md:pb-24">
          <PageOrnaments variant="plans" />
          <div className="relative z-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 items-stretch">
            {planTiers.map((tier) => {
              const calculatedPrice = calculatePlanPrice(tier.key, persons, courses);
              const isCustom = tier.key === "custom";
              const isFree = tier.key === "free";
              
              // Format total price display
              const priceDisplay = isFree 
                ? "Gratis" 
                : isCustom 
                  ? "Hubungi Kami" 
                  : formatPrice(calculatedPrice);
              
              // Calculate price per person
              const pricePerPerson = (!isFree && !isCustom) 
                ? formatPrice(Math.round(calculatedPrice / persons)) 
                : null;

              // Generate WhatsApp link dynamically
              const whatsAppUrl = getWhatsAppPlanUrl(tier.key, tier.name, persons, courses, selectedCoursesList);

              return (
                <article
                  key={tier.key}
                  className={
                    tier.highlighted
                      ? "relative flex flex-col rounded-3xl border-2 border-[var(--zx-accent)] bg-card/75 backdrop-blur-md p-6 shadow-md ring-4 ring-[var(--zx-accent)]/10 md:p-7 transition-all duration-300 hover:scale-[1.02] hover:bg-card/90"
                      : "relative flex flex-col rounded-3xl border border-border/70 bg-card/70 backdrop-blur-md p-6 shadow-sm md:p-7 transition-all duration-300 hover:scale-[1.01] hover:border-border-strong hover:bg-card/90 hover:shadow-md"
                  }
                >
                  {tier.highlighted ? (
                    <Badge className="absolute -top-3 left-6 bg-[var(--zx-accent)] text-white hover:bg-[var(--zx-accent)] font-semibold shadow-xs">
                      Rekomendasi
                    </Badge>
                  ) : null}

                  <div className="flex-1">
                    <SectionHeading as="h3" tier="secondary" className="text-card-foreground font-bold font-heading">
                      {tier.name}
                    </SectionHeading>
                    
                    <p className="mt-2 text-body-xs text-muted-foreground min-h-[32px]">
                      {tier.note}
                    </p>

                    <div className="mt-4 pt-4 border-t border-border/60">
                      {(!isFree && !isCustom) ? (
                        <>
                          <div className="flex items-baseline gap-1">
                            <span className="font-heading text-h5 font-extrabold text-foreground tracking-tight transition-all duration-300">
                              {pricePerPerson}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-medium">/ orang</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Total: <span className="font-semibold text-foreground">{priceDisplay}</span> / semester
                          </p>
                        </>
                      ) : (
                        <p className="font-heading text-h5 font-extrabold text-foreground tracking-tight transition-all duration-300">
                          {priceDisplay}
                        </p>
                      )}
                    </div>

                    <ul className="mt-6 flex flex-col gap-3">
                      {tier.features.map((f) => (
                        <li key={f} className="flex gap-2 text-body-sm text-muted-foreground items-start">
                          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <Check className="size-3" strokeWidth={2.5} aria-hidden />
                          </span>
                          <span className="leading-tight">{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-8">
                    <Button
                      asChild
                      variant={tier.highlighted ? "default" : "outline"}
                      size="marketing"
                      className={`w-full group/btn transition-all duration-300 ${
                        tier.highlighted 
                          ? "bg-[var(--zx-accent)] text-white hover:bg-[var(--zx-accent)]/90 hover:shadow-lg hover:shadow-[var(--zx-accent)]/20" 
                          : ""
                      }`}
                    >
                      {isFree ? (
                        <Link href="/sign-up">
                          Daftar Sekarang
                        </Link>
                      ) : (
                        <Link href={whatsAppUrl} target="_blank" rel="noopener noreferrer">
                          {isCustom ? "Hubungi Admin" : "Pilih Paket"}
                        </Link>
                      )}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        </SectionContainer>
      </Reveal>
    </div>
  );
}
