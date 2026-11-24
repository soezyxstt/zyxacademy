"use client";

import Link from "next/link";
import { CoursePricingLabel } from "@/components/course/course-pricing-label";
import type { CoursePricing } from "@/lib/student/course-pricing";
import { useStudentExperience } from "@/components/student-experience-provider";
import { LockKeyhole } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/lib/i18n/client";

export interface CatalogCourseItem {
  id: string;
  title: string;
  category: string;
  description: string;
  pricing?: CoursePricing;
  hasFullContentAccess?: boolean;
  materialsCount: number;
  quizzesCount: number;
  tryoutsCount: number;
}

export interface CourseGroup {
  jurusan: string;
  isStudentMajor: boolean;
  courses: CatalogCourseItem[];
}

interface CourseCatalogClientProps {
  groups: CourseGroup[];
  studentTargetCategory?: string | null;
  showCounts?: boolean;
  showGroupHeaders?: boolean;
}

/**
 * Converts a major name into a URL-friendly slug for tab addresses.
 */
function slugifyJurusan(jurusan: string): string {
  return jurusan
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

function getCourseBadgeInfo(course: CatalogCourseItem) {
  if (course.id === PKA_COURSE_ID) {
    return {
      initials: "PKA",
      color: "bg-purple-500/10 text-purple-600 ring-purple-500/25 dark:text-purple-400",
    };
  }
  const title = course.title.toLowerCase();
  if (title.includes("matematika") || title.includes("kalkulus")) {
    return {
      initials: title.includes("matematika lanjut") ? "ML" : "MA",
      color: "bg-blue-500/10 text-blue-600 ring-blue-500/25 dark:text-blue-400",
    };
  }
  if (title.includes("fisika")) {
    return {
      initials: "FI",
      color: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/25 dark:text-emerald-400",
    };
  }
  if (title.includes("kimia")) {
    return {
      initials: "KI",
      color: "bg-amber-500/10 text-amber-600 ring-amber-500/25 dark:text-amber-400",
    };
  }
  if (title.includes("komputasi") || title.includes("komputer") || title.includes("informatika")) {
    return {
      initials: "BK",
      color: "bg-cyan-500/10 text-cyan-600 ring-cyan-500/25 dark:text-cyan-400",
    };
  }
  const words = course.title.trim().split(/\s+/);
  const initials = words.slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "MK";
  return {
    initials,
    color: "bg-brand-primary/10 text-brand-primary ring-brand-primary/25",
  };
}

export function CourseCatalogClient({
  groups,
  showCounts = true,
  showGroupHeaders = true,
}: CourseCatalogClientProps) {
  const t = useTranslations("learning");
  const { courseHref } = useStudentExperience();
  const totalCourses = groups.reduce((acc, g) => acc + g.courses.length, 0);

  const renderRow = (c: CatalogCourseItem) => {
    const isPka = c.id === PKA_COURSE_ID;
    const badge = getCourseBadgeInfo(c);
    const hasTimedOffer = !isPka && c.pricing?.category === "limited_time_free";
    const locked = c.hasFullContentAccess === false && !hasTimedOffer;
    const counts = [
      c.materialsCount > 0 && t("courseCatalog.materialCount", { count: c.materialsCount }),
      c.quizzesCount > 0 && t("courseCatalog.quizCount", { count: c.quizzesCount }),
      c.tryoutsCount > 0 && t("courseCatalog.tryoutCount", { count: c.tryoutsCount }),
    ].filter(Boolean);
    const hasContent = isPka || counts.length > 0;

    return (
      <Link
        key={c.id}
        href={courseHref(c.id)}
        className="flex items-start gap-3 rounded-lg py-(--row-padding) transition-colors hover:bg-muted/40 active:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <span aria-hidden className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg text-body-xs font-semibold tracking-tight ring-1 ring-inset", !hasContent && "opacity-75", badge.color)}>
          {badge.initials}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className={cn("wrap-break-word font-heading text-body-sm font-semibold", hasContent ? "text-foreground" : "text-muted-foreground")}>
            {c.title}
          </h3>
          {showCounts && (
            <p className="mt-0.5 text-body-xs text-muted-foreground">
              {isPka ? t("courseCatalog.pkaSummary") : counts.join(" · ") || t("courseCatalog.noContent")}
            </p>
          )}
          {hasTimedOffer && <CoursePricingLabel pricing={c.pricing} compact />}
        </div>
        {locked && (
          <>
            <LockKeyhole className="size-4 shrink-0 self-center text-muted-foreground" aria-hidden />
            <span className="sr-only">{t(isPka ? "courseCatalog.registrationRequired" : "courseCatalog.limitedAccess")}</span>
          </>
        )}
      </Link>
    );
  };

  const renderSection = (group: CourseGroup) => (
    <section key={group.jurusan} className="space-y-1">
      {showGroupHeaders && (
        <div className="flex items-center justify-between gap-3 pb-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2">
            <h2 className="font-heading text-body-base font-bold text-foreground">
              {group.jurusan}
            </h2>
            {group.isStudentMajor && (
              <span className="text-body-xs text-muted-foreground">
                {t("courseCatalog.yourMajor")}
              </span>
            )}
          </div>
          <span className="shrink-0 text-body-xs text-muted-foreground">
            {t("courseCatalog.courseCount", { count: group.courses.length })}
          </span>
        </div>
      )}
      <div>{group.courses.map(renderRow)}</div>
    </section>
  );

  if (groups.length <= 1) {
    return (
      <div className="space-y-(--section-gap)">
        {groups.map(renderSection)}
      </div>
    );
  }

  return (
    <Tabs defaultValue="all" paramKey="jurusan" className="w-full space-y-(--related-gap)">
      <TabsList
        aria-label={t("courseCatalog.filterLabel")}
        className="[&_[data-state=active][data-slot=tabs-trigger]]:after:bg-foreground [&_[data-active=true][data-slot=tabs-more-trigger]]:after:bg-foreground"
      >
        <TabsTrigger value="all">
          {t("courseCatalog.all", { count: totalCourses })}
        </TabsTrigger>
        {groups.map((group) => {
          const tabSlug = slugifyJurusan(group.jurusan);
          return (
            <TabsTrigger key={group.jurusan} value={tabSlug} className="gap-1.5">
              <span>{group.jurusan}</span>
              {group.isStudentMajor && (
                <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground" title={t("courseCatalog.yourMajor")} />
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>

      <TabsContent value="all" className="space-y-(--section-gap) mt-0">
        {groups.map(renderSection)}
      </TabsContent>

      {groups.map((group) => {
        const tabSlug = slugifyJurusan(group.jurusan);
        return (
          <TabsContent key={group.jurusan} value={tabSlug} className="space-y-(--section-gap) mt-0">
            {renderSection(group)}
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
