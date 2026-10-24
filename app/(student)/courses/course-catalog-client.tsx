"use client";

import Link from "next/link";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/lib/i18n/client";

export interface CatalogCourseItem {
  id: string;
  title: string;
  category: string;
  description: string;
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

/**
 * Interactive client component that groups and renders courses by academic major with tab navigation.
 */
function getCourseBadgeInfo(course: CatalogCourseItem) {
  if (course.id === PKA_COURSE_ID) {
    return {
      initials: "PKA",
      color: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20",
    };
  }
  const title = course.title.toLowerCase();
  if (title.includes("matematika") || title.includes("kalkulus")) {
    return {
      initials: "MA",
      color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20",
    };
  }
  if (title.includes("fisika")) {
    return {
      initials: "FI",
      color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
    };
  }
  if (title.includes("kimia")) {
    return {
      initials: "KI",
      color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20",
    };
  }
  if (title.includes("komputasional") || title.includes("komputer") || title.includes("informatika")) {
    return {
      initials: "BK",
      color: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20",
    };
  }
  const words = course.title.trim().split(/\s+/);
  const initials = words.slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "MK";
  return {
    initials,
    color: "bg-brand-primary/10 text-brand-primary border border-brand-primary/20",
  };
}

export function CourseCatalogClient({
  groups,
  studentTargetCategory,
}: CourseCatalogClientProps) {
  const t = useTranslations("learning");
  const totalCourses = groups.reduce((acc, g) => acc + g.courses.length, 0);

  const renderRow = (c: CatalogCourseItem) => {
    const isPka = c.id === PKA_COURSE_ID;
    const badge = getCourseBadgeInfo(c);

    return (
      <Link
        key={c.id}
        href={`/courses/${c.id}`}
        className="group flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-muted/30 active:bg-muted/50"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg font-bold text-body-xs", badge.color)}>
            {badge.initials}
          </span>
          <div className="min-w-0">
            <h3 className="truncate font-heading text-body-sm font-semibold text-foreground transition-colors group-hover:text-brand-primary">
              {c.title}
            </h3>
            <p className="mt-0.5 truncate text-body-xs text-muted-foreground flex items-center gap-1.5">
              {isPka ? (
                <span>{t("courseCatalog.pkaSummary")}</span>
              ) : (
                <span>
                  {t("courseCatalog.counts", { materials: c.materialsCount, quizzes: c.quizzesCount, tryouts: c.tryoutsCount })}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-primary text-body-sm">
            ›
          </span>
        </div>
      </Link>
    );
  };

  const renderSection = (group: CourseGroup) => (
    <section key={group.jurusan} className="space-y-3">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2.5">
        <div className="flex items-center gap-2">
          <h2 className="font-heading text-body-base font-bold text-foreground">
            {group.jurusan}
          </h2>
          {group.isStudentMajor && (
            <span className="rounded-md bg-brand-primary/10 px-2 py-0.5 text-body-2xs font-bold uppercase tracking-wider text-brand-primary ring-1 ring-brand-primary/20">
              {t("courseCatalog.yourMajor")}
            </span>
          )}
        </div>
        <span className="text-body-xs text-muted-foreground font-medium">
          {t("courseCatalog.courseCount", { count: group.courses.length })}
        </span>
      </div>
      <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-card/60 backdrop-blur-xs shadow-2xs">
        {group.courses.map(renderRow)}
      </div>
    </section>
  );

  if (groups.length <= 1) {
    return (
      <div className="space-y-8">
        {groups.map(renderSection)}
      </div>
    );
  }

  return (
    <Tabs defaultValue="all" paramKey="jurusan" className="w-full space-y-6">
      <TabsList aria-label={t("courseCatalog.filterLabel")}>
        <TabsTrigger value="all">
          {t("courseCatalog.all", { count: totalCourses })}
        </TabsTrigger>
        {groups.map((group) => {
          const tabSlug = slugifyJurusan(group.jurusan);
          return (
            <TabsTrigger key={group.jurusan} value={tabSlug} className="gap-1.5">
              <span>{group.jurusan}</span>
              <span className="text-muted-foreground/80 font-normal">({group.courses.length})</span>
              {group.isStudentMajor && (
                <span className="size-1.5 rounded-full bg-brand-primary shrink-0" title={t("courseCatalog.yourMajor")} />
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>

      <TabsContent value="all" className="space-y-8 mt-0">
        {groups.map(renderSection)}
      </TabsContent>

      {groups.map((group) => {
        const tabSlug = slugifyJurusan(group.jurusan);
        return (
          <TabsContent key={group.jurusan} value={tabSlug} className="space-y-8 mt-0">
            {renderSection(group)}
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
