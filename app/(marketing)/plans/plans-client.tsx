"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Plus, Minus, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlanPrice, PlanPromotion } from "@/components/pricing/plan-price";
import { usePlanPricingPhase } from "@/hooks/use-plan-pricing-phase";
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
  getWhatsAppPlanUrl,
} from "@/lib/pricing-constants";
import { planTiers } from "@/lib/plan-tiers";
import { useTranslations } from "@/lib/i18n/client";
import { LocalizedAuthLink } from "@/components/localized-auth-link";

export default function PlansClient() {
  const t = useTranslations("marketing");
  const pricingPhase = usePlanPricingPhase();
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
            ? t("pricing.otherCourse")
            : t("pricing.otherCourseCount", { count: otherCoursesCount }),
        ]
      : []),
  ];

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
    <div className="flex min-h-screen flex-col">
      <Reveal>
        <MarketingPageHero
          className="py-8 md:py-10"
          sectionId="plans"
          title={t("plans.title")}
          description={t("plans.description")}
        />
      </Reveal>

      <div className="sticky top-[52px] z-30 w-full border-y border-border bg-background py-2 md:top-[56px] md:py-3">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="sr-only" aria-live="polite">
            {t("plans.priceConfiguration", { people: persons, courses })}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 md:justify-end">
            <div
              aria-label={t("plans.peopleLabel")}
              className="flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-1.5 py-1 dark:bg-card"
            >
                <span className="px-1 text-body-xs font-semibold text-muted-foreground">
                  {t("plans.group")}
                </span>
                <Button
                  variant="outline"
                  size="icon-xs"
                  onClick={handleDecrementPersons}
                  disabled={persons <= MIN_PERSONS}
                  aria-label={t("plans.decreasePeople")}
                  className="size-7 rounded-md bg-background"
                >
                  <Minus className="size-3" />
                </Button>
                <span className="min-w-[3.75rem] text-center font-heading text-body-sm font-semibold text-foreground">
                  {t("plans.peopleCount", { count: persons })}
                </span>
                <Button
                  variant="outline"
                  size="icon-xs"
                  onClick={handleIncrementPersons}
                  disabled={persons >= MAX_PERSONS}
                  aria-label={t("plans.increasePeople")}
                  className="size-7 rounded-md bg-background"
                >
                  <Plus className="size-3" />
                </Button>
            </div>

            <div
              aria-label={t("plans.coursesLabel")}
              className="flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-1.5 py-1 dark:bg-card"
            >
                <span className="px-1 text-body-xs font-semibold text-muted-foreground">
                  {t("plans.courseShort")}
                </span>
                <Button
                  variant="outline"
                  size="icon-xs"
                  onClick={handleDecrementCourses}
                  disabled={courses <= MIN_COURSES}
                  aria-label={t("plans.decreaseCourses")}
                  className="size-7 rounded-md bg-background"
                >
                  <Minus className="size-3" />
                </Button>
                <span className="min-w-[3.75rem] text-center font-heading text-body-sm font-semibold text-foreground">
                  {t("plans.courseCount", { count: courses })}
                </span>
                <Button
                  variant="outline"
                  size="icon-xs"
                  onClick={handleIncrementCourses}
                  disabled={courses >= MAX_COURSES}
                  aria-label={t("plans.increaseCourses")}
                  className="size-7 rounded-md bg-background"
                >
                  <Plus className="size-3" />
                </Button>
            </div>

            <button
              type="button"
              onClick={() => setShowSubjects((value) => !value)}
              aria-expanded={showSubjects}
              aria-controls="plans-subjects-panel"
              className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-body-sm font-semibold transition-all ${
                showSubjects
                  ? "border-primary bg-primary text-primary-foreground shadow-xs"
                  : "border-border/80 bg-muted/80 text-foreground hover:bg-muted"
              }`}
            >
              <BookOpen className="size-3.5" aria-hidden="true" />
              <span>{t("plans.courseList", { count: courses })}</span>
            </button>
          </div>
        </div>
      </div>

      {showSubjects && (
        <div
          id="plans-subjects-panel"
          className="relative z-20 w-full border-b border-border bg-card p-4 shadow-inner animate-in fade-in slide-in-from-top-3 duration-200"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("plans.coveredCourses", { count: courses, max: MAX_COURSES })}
              </h3>
              <button 
                onClick={() => setShowSubjects(false)}
                className="text-body-xs text-primary font-semibold hover:underline"
              >
                {t("plans.close")}
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
                          title={t("plans.decreaseOtherCourse")}
                          disabled={courses <= MIN_COURSES}
                        >
                          <Minus className="size-3" />
                        </button>
                        <span className="px-3 py-1 font-semibold select-none flex items-center gap-1.5">
                          <Check className="size-3 text-[var(--zx-accent)]" />
                          {t("pricing.otherCourseCount", { count: otherCoursesCount })}
                        </span>
                        <button
                          onClick={() => {
                            if (courses >= MAX_COURSES) return;
                            setOtherCoursesCount((prev) => prev + 1);
                          }}
                          className="px-2 py-1 hover:bg-[var(--zx-accent)]/20 border-l border-[var(--zx-accent)]/20 transition-all focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                          title={t("plans.increaseOtherCourse")}
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
                        {isLainLain ? t("pricing.otherCourse") : subject}
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
                    {isLainLain ? t("pricing.otherCourse") : subject}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Pricing Cards Grid */}
      <Reveal>
        <SectionContainer className="border-b border-border bg-muted/70 overflow-hidden py-6 md:py-8">
          <PageOrnaments variant="plans" />
          <PlanPromotion className="relative z-10 mb-4" />
          <div className="relative z-10 grid items-stretch gap-5 md:grid-cols-2 lg:grid-cols-3">
            {planTiers.map((tier) => {
              const isCustom = tier.key === "custom";
              const isFree = tier.key === "free";
              const tierName = t(`pricing.tiers.${tier.key}.name`);
              const whatsAppUrl = pricingPhase
                ? getWhatsAppPlanUrl(tier.key, tierName, persons, courses, selectedCoursesList, pricingPhase)
                : null;
              const planAction = isFree ? (
                <LocalizedAuthLink href="/sign-up">{t("plans.startWithFree")}</LocalizedAuthLink>
              ) : whatsAppUrl ? (
                <Link
                  href={whatsAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => {
                    const refreshedHref = getWhatsAppPlanUrl(
                      tier.key,
                      tierName,
                      persons,
                      courses,
                      selectedCoursesList,
                    );
                    if (refreshedHref) event.currentTarget.href = refreshedHref;
                  }}
                >
                  {isCustom ? t("pricing.askWhatsapp") : t("pricing.askPlanWhatsapp")}
                </Link>
              ) : null;

              return (
                <article
                  key={tier.key}
                  className={
                    tier.highlighted
                      ? "relative flex flex-col rounded-xl border border-primary bg-card p-5 md:p-6"
                      : "relative flex flex-col rounded-xl border border-border bg-card p-5 md:p-6"
                  }
                >
                  {tier.highlighted ? (
                    <Badge className="absolute -top-3 left-5 bg-[var(--zx-accent)] font-semibold text-black-1 shadow-xs hover:bg-[var(--zx-accent)]">
                      {t("pricing.recommended")}
                    </Badge>
                  ) : null}

                  <div className="flex-1">
                    <h3 className="text-body-base font-heading font-bold text-card-foreground">
                      {tierName}
                    </h3>
                    
                    <p className="mt-2 min-h-[32px] text-body-xs text-muted-foreground">
                      {t(`pricing.tiers.${tier.key}.note`)}
                    </p>

                    <div className="mt-4 border-t border-border/60 pt-4">
                      {(!isFree && !isCustom) ? (
                        <PlanPrice plan={tier.key} persons={persons} courses={courses} perPerson className="text-h5" />
                      ) : (
                        <p className="font-heading text-h5 font-extrabold text-foreground tracking-tight transition-all duration-300">
                          {isFree ? t("plans.free") : t("plans.contactAdmin")}
                        </p>
                      )}
                    </div>

                    {!isCustom && <ul className="mt-6 flex flex-col gap-3">
                      {(t.raw(`pricing.tiers.${tier.key}.features`) as string[]).map((f) => (
                        <li key={f} className="flex gap-2 text-body-sm text-muted-foreground items-start">
                          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center text-primary">
                            <Check className="size-3" strokeWidth={2.5} aria-hidden />
                          </span>
                          <span className="leading-tight">{f}</span>
                        </li>
                      ))}
                    </ul>}
                  </div>

                  <div className="mt-8">
                    {planAction ? (
                      <Button
                        asChild
                        variant={tier.highlighted ? "default" : "outline"}
                        size="marketing"
                        className={`w-full transition-colors duration-200 ${
                          tier.highlighted
                            ? "bg-[var(--zx-accent)] text-white hover:bg-[var(--zx-accent)]/90"
                            : ""
                        }`}
                      >
                        {planAction}
                      </Button>
                    ) : (
                      <Button type="button" variant="outline" size="marketing" className="w-full" disabled>
                        {pricingPhase ? t("plans.contactUnavailable") : t("pricing.loading")}
                      </Button>
                    )}
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
