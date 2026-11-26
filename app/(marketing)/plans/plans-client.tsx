"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Check, Plus, Minus, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PlanPrice, PlanPromotion } from "@/components/pricing/plan-price";
import { usePricingDiscounts } from "@/hooks/use-pricing-discounts";
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
import { cn } from "@/lib/utils";

export default function PlansClient() {
  const t = useTranslations("marketing");
  const { settings, now } = usePricingDiscounts();
  const pricingPhase = settings && now;
  const [persons, setPersons] = useState<number>(DEFAULT_PERSONS);
  // Separate standard courses and other courses (Lain-Lain) count
  const [selectedStandardCourses, setSelectedStandardCourses] = useState<string[]>(() =>
    CORE_SUBJECTS.slice(0, DEFAULT_COURSES).filter((c) => c !== "Mata Kuliah Lain-Lain")
  );
  const [otherCoursesCount, setOtherCoursesCount] = useState<number>(() =>
    CORE_SUBJECTS.slice(0, DEFAULT_COURSES).includes("Mata Kuliah Lain-Lain") ? 1 : 0
  );
  const [showSubjects, setShowSubjects] = useState(false);
  const courseListTrigger = useRef<HTMLButtonElement>(null);

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
      <MarketingPageHero
        className="py-8 md:py-10"
        sectionId="plans"
        title={t("plans.title")}
        description={t("plans.description")}
      />

      <Collapsible
        open={showSubjects}
        onOpenChange={setShowSubjects}
        className="sticky top-(--marketing-navbar-height) z-30 w-full border-b border-border bg-background"
      >
        <div className="marketing-container py-2.5 md:py-3">
          <p className="sr-only" aria-live="polite">
            {t("plans.priceConfiguration", { people: persons, courses })}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 md:justify-end">
            <div role="group" aria-label={t("plans.peopleLabel")} className="flex items-center gap-1">
              <span className="mr-1 text-body-xs font-semibold text-foreground">
                {t("plans.group")}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={handleDecrementPersons}
                disabled={persons <= MIN_PERSONS}
                aria-label={t("plans.decreasePeople")}
              >
                <Minus aria-hidden="true" />
              </Button>
              <span className="min-w-[3.75rem] text-center font-heading text-body-sm font-semibold tabular-nums">
                {t("plans.peopleCount", { count: persons })}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={handleIncrementPersons}
                disabled={persons >= MAX_PERSONS}
                aria-label={t("plans.increasePeople")}
              >
                <Plus aria-hidden="true" />
              </Button>
            </div>
            <div role="group" aria-label={t("plans.coursesLabel")} className="flex items-center gap-1">
              <span className="mr-1 text-body-xs font-semibold text-foreground">
                {t("plans.courseShort")}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={handleDecrementCourses}
                disabled={courses <= MIN_COURSES}
                aria-label={t("plans.decreaseCourses")}
              >
                <Minus aria-hidden="true" />
              </Button>
              <span className="min-w-[3.75rem] text-center font-heading text-body-sm font-semibold tabular-nums">
                {t("plans.courseCount", { count: courses })}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={handleIncrementCourses}
                disabled={courses >= MAX_COURSES}
                aria-label={t("plans.increaseCourses")}
              >
                <Plus aria-hidden="true" />
              </Button>
            </div>
            <CollapsibleTrigger asChild>
              <Button ref={courseListTrigger} variant="secondary" size="lg">
                <BookOpen aria-hidden="true" />
                {t("plans.courseList", { count: courses })}
              </Button>
            </CollapsibleTrigger>
          </div>
        </div>

        <CollapsibleContent className="border-t border-border bg-card">
          <div className="max-h-[40dvh] overflow-y-auto overscroll-contain">
            <div className="marketing-container py-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-body-xs font-semibold">
                  {t("plans.coveredCourses", { count: courses, max: MAX_COURSES })}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowSubjects(false);
                    courseListTrigger.current?.focus();
                  }}
                >
                  {t("plans.close")}
                </Button>
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
                          className="inline-flex items-center gap-1 rounded-lg border border-primary/45 bg-primary/8 p-0.5 text-body-sm"
                        >
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => {
                              if (courses <= MIN_COURSES) return;
                              setOtherCoursesCount((prev) => Math.max(0, prev - 1));
                            }}
                            aria-label={t("plans.decreaseOtherCourse")}
                            disabled={courses <= MIN_COURSES}
                          >
                            <Minus className="size-3" aria-hidden="true" />
                          </Button>
                          <span className="font-medium">
                            {t("pricing.otherCourseCount", { count: otherCoursesCount })}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => {
                              if (courses >= MAX_COURSES) return;
                              setOtherCoursesCount((prev) => prev + 1);
                            }}
                            aria-label={t("plans.increaseOtherCourse")}
                            disabled={courses >= MAX_COURSES}
                          >
                            <Plus className="size-3" aria-hidden="true" />
                          </Button>
                        </div>
                      );
                    } else {
                      return (
                        <Button
                          key={subject}
                          variant="outline"
                          onClick={() => {
                            if (courses >= MAX_COURSES) return;
                            setOtherCoursesCount(1);
                          }}
                          disabled={courses >= MAX_COURSES}
                        >
                          {t("pricing.otherCourse")}
                        </Button>
                      );
                    }
                  }

                  // Standard Course
                  const isActive = selectedStandardCourses.includes(subject);
                  return (
                    <Button
                      key={subject}
                      variant="outline"
                      onClick={() => {
                        if (isActive) {
                          if (courses <= MIN_COURSES) return;
                          setSelectedStandardCourses((prev) => prev.filter((c) => c !== subject));
                        } else {
                          if (courses >= MAX_COURSES) return;
                          setSelectedStandardCourses((prev) => [...prev, subject]);
                        }
                      }}
                      aria-pressed={isActive}
                      disabled={isActive ? courses <= MIN_COURSES : courses >= MAX_COURSES}
                      className={cn(isActive && "border-primary/45 bg-primary/8 dark:border-primary/45 dark:bg-primary/10")}
                    >
                      {isActive && <Check className="size-3.5 text-primary" aria-hidden="true" />}
                      {subject}
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Reveal>
        <SectionContainer className="overflow-hidden border-b border-border bg-background py-6 md:py-8">
          <PageOrnaments variant="plans" />
          <PlanPromotion variant="banner" className="relative z-10 mb-5" />
          <div className="relative z-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-6 lg:gap-5">
            {planTiers.map((tier) => {
              const isCustom = tier.key === "custom";
              const isFree = tier.key === "free";
              const tierName = t(`pricing.tiers.${tier.key}.name`);
              const whatsAppUrl = pricingPhase
                ? getWhatsAppPlanUrl(tier.key, tierName, persons, courses, selectedCoursesList, undefined, settings)
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
                      undefined,
                      settings,
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
                  className={cn(
                    "flex min-w-0 flex-col rounded-xl border bg-card p-4 text-card-foreground shadow-sm lg:p-5 xl:p-6",
                    isFree || isCustom ? "lg:col-span-3" : "lg:col-span-2",
                    tier.highlighted ? "border-primary ring-1 ring-primary" : "border-border-strong/70",
                  )}
                >
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-heading text-h5 font-bold">{tierName}</h3>
                      {tier.highlighted ? <Badge>{t("pricing.recommended")}</Badge> : null}
                    </div>
                    <p className="mt-2 text-body-sm text-muted-foreground lg:min-h-10">
                      {t(`pricing.tiers.${tier.key}.note`)}
                    </p>

                    <div className="mt-3 border-t border-border pt-4">
                      {(!isFree && !isCustom) ? (
                        <PlanPrice plan={tier.key} persons={persons} courses={courses} perPerson className="text-h4 tabular-nums" />
                      ) : (
                        <p className="font-heading text-h5 font-bold">
                          {isFree ? t("plans.free") : t("plans.contactAdmin")}
                        </p>
                      )}
                    </div>

                    {!isCustom && <ul className="mt-5 flex flex-col gap-3">
                      {(t.raw(`pricing.tiers.${tier.key}.features`) as string[]).map((f) => (
                        <li key={f} className="flex items-start gap-2 text-body-sm">
                          <Check className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={2.5} aria-hidden="true" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>}
                  </div>

                  <div className="mt-5">
                    {planAction ? (
                      <Button
                        asChild
                        variant={tier.highlighted ? "default" : "outline"}
                        size="marketing"
                        className="h-auto min-h-10 w-full whitespace-normal py-2 text-center"
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
