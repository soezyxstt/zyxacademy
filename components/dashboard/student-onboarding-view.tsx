"use client";

import Link from "next/link";
import { CoursePricingLabel } from "@/components/course/course-pricing-label";
import type { CoursePricing } from "@/lib/student/course-pricing";
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
import { useTranslations } from "@/lib/i18n/client";

export interface CatalogCourse {
  id: string;
  title: string;
  category: string;
  pricing?: CoursePricing;
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
    title: "pdfFeature",
    desc: "pdfFeatureDescription",
  },
  {
    icon: ClipboardList,
    title: "interactiveFeature",
    desc: "interactiveFeatureDescription",
  },
  {
    icon: CheckCircle2,
    title: "savedProgressFeature",
    desc: "savedProgressDescription",
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
  const t = useTranslations("student");
  const firstName = userName.trim().split(" ")[0] || t("dashboard.student");

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <>
            {t("dashboard.startLearning", { name: firstName })}
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm" className="rounded-lg text-body-sm">
              <Link href="/plans">{t("dashboard.plans")}</Link>
            </Button>
            <Button asChild size="sm" className="gap-1.5 rounded-lg text-body-sm">
              <Link href="/courses">
                {t("dashboard.exploreAllCourses")}
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
                    {t("dashboard.coursesForYou")}
                  </h2>
                  {studentTargetCategory && (
                    <span className="rounded-md bg-brand-primary/10 px-2 py-0.5 text-body-2xs font-bold uppercase tracking-wider text-brand-primary ring-1 ring-brand-primary/20">
                      {studentTargetCategory === "TPB" ? t("dashboard.recommendedTpb") : t("dashboard.recommendedFor", { category: studentTargetCategory })}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-body-xs text-muted-foreground">
                  {t("dashboard.firstChapterFree")}
                </p>
              </div>
              <span className="rounded-md bg-brand-primary/10 px-2 py-1 text-body-2xs font-semibold text-brand-primary">
                {t("dashboard.freePackage")}
              </span>
            </div>

            {catalogCourses.length > 0 ? (
              <div className="divide-y divide-border/60">
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
                    ? t("dashboard.continueLearning")
                    : t("dashboard.startChapterOne");

                  return (
                    <article key={course.id} className="py-4 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 basis-40">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md bg-brand-primary/10 px-2 py-0.5 text-body-2xs font-bold uppercase tracking-wider text-brand-primary">
                              {course.category}
                            </span>
                            {course.id === PKA_COURSE_ID ? (
                              <span className="rounded-md bg-brand-secondary/10 px-2 py-0.5 text-body-2xs font-bold text-brand-secondary">
                                {t("dashboard.newStudent")}
                              </span>
                            ) : null}
                            <h3 className="break-words font-heading text-body-sm font-bold text-foreground">
                              {course.title}
                            </h3>
                          </div>
                          <div className="mt-1"><CoursePricingLabel pricing={course.pricing} /></div>
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-xs text-muted-foreground">
                            <span>{t("dashboard.freeChapters", { count: course.freeChapters.length })}</span>
                            <span>{t("dashboard.materialsCount", { count: course.freeMaterialCount })}</span>
                            <span>{t("dashboard.quizzesCount", { count: course.freeQuizCount })}</span>
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
                          {t("dashboard.onboardingMaterialProgress", { complete: completedMaterials, total: totalMaterials })}
                        </span>
                      </div>

                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {course.freeChapters.length > 0 ? course.freeChapters.map((chapter, index) => (
                          <div
                            key={chapter.id}
                            className="flex min-w-0 items-center gap-2 py-1"
                          >
                            {chapter.completed ? (
                              <CheckCircle2 className="size-4 shrink-0 text-status-success" aria-hidden="true" />
                            ) : (
                              <span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-brand-primary/40 text-body-2xs font-semibold text-brand-primary">
                                {index + 1}
                              </span>
                            )}
                            <span className="min-w-0 break-words text-body-xs text-foreground">{chapter.title}</span>
                            <span className="ml-auto shrink-0 rounded-md bg-status-success/10 px-1.5 py-0.5 text-body-2xs font-semibold text-status-success">
                              {t("dashboard.free")}
                            </span>
                          </div>
                        )) : (
                          <p className="text-body-xs text-muted-foreground">{t("dashboard.preparingFreeMaterials")}</p>
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
                    ? t("dashboard.noCoursesForCategory", { category: studentTargetCategory })
                    : t("dashboard.noCoursesAvailable")}
                </p>
                <p className="mt-1 text-body-xs text-muted-foreground">
                  {studentTargetCategory
                    ? t("dashboard.exploreOtherCourses")
                    : t("dashboard.returnAfterPublish")}
                </p>
                <Button asChild size="sm" variant="outline" className="mt-3 rounded-lg text-body-sm">
                  <Link href="/courses">{t("dashboard.courseCatalog")}</Link>
                </Button>
              </div>
            )}
          </section>

          <section className="@container/onboarding-features border-b border-border/70 pb-6">
            <h2 className="mb-4 flex items-center gap-2 font-heading text-body-base font-bold text-foreground">
              <Flame className="size-4.5 text-brand-primary" />
              {t("dashboard.availableInFree")}
            </h2>

            <div className="grid gap-3 @min-[32rem]/onboarding-features:grid-cols-2 @min-[49rem]/onboarding-features:grid-cols-3">
              {featureHighlights.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div key={feature.title} className="py-2">
                    <div className="flex size-7 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
                      <Icon className="size-4" />
                    </div>
                    <h3 className="mt-2.5 font-heading text-body-xs font-bold text-foreground">{t(`dashboard.${feature.title}`)}</h3>
                    <p className="mt-1 text-body-xs leading-snug text-muted-foreground">{t(`dashboard.${feature.desc}`)}</p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="@container/onboarding-plans space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-3">
              <h2 className="flex items-center gap-2 font-heading text-body-base font-bold text-foreground">
                <GraduationCap className="size-4.5 text-brand-primary" />
                {t("dashboard.semesterPlans")}
              </h2>
              <Button asChild variant="outline" size="sm" className="rounded-lg text-body-sm">
                <Link href="/plans">{t("dashboard.comparePlans")}</Link>
              </Button>
            </div>

            <PlanPromotion className="mt-2" />

            <div className="grid gap-3 @min-[32rem]/onboarding-plans:grid-cols-2 @min-[49rem]/onboarding-plans:grid-cols-3">
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
                          {t("dashboard.popular")}
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
              {t("dashboard.hasClassToken")}
            </h2>
            <EnrollmentForm className="mt-3.5" />
          </Card>

          <section className="border-t border-border pt-4">
            <h2 className="font-heading text-body-sm font-bold text-foreground">{t("dashboard.planTitle")}</h2>
            <p className="mt-2 text-body-xs leading-relaxed text-muted-foreground">
              {t("dashboard.planDetails")}
            </p>
            <Button asChild className="mt-4 w-full rounded-lg text-body-sm">
              <Link href="/plans">
                {t("dashboard.planOptions")}
                <ArrowRight className="ml-1.5 size-4" />
              </Link>
            </Button>
          </section>
        </div>
      </div>
    </div>
  );
}
