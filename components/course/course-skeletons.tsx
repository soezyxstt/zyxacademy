import Link from "next/link";
import { ArrowLeft, ChevronDown, ChevronRight, Filter, Maximize2, Menu, PanelRightClose, RotateCw, Search, Trophy } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { StudyStatisticsSkeleton } from "@/components/course/study-statistics-card";
import { RecentActivitySkeleton } from "@/components/course/recent-activity-card";
import { studentCardClass } from "@/components/course/course-surfaces";
import { tabListClassName, tabTriggerClassName, tabTriggerActiveClassName } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/**
 * Tailored skeleton for the Course Overview primary action strip (3-column divided card).
 */
export function CourseOverviewPrimaryActionsSkeleton() {
  return (
    <div
      data-testid="course-overview-highlights-skeleton"
      className="mb-6 grid grid-cols-1 divide-y divide-border/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0 overflow-hidden rounded-xl border border-border/70 bg-card"
    >
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex min-w-0 items-center gap-2 p-2.5">
          <Skeleton className="hidden size-7 shrink-0 rounded-lg sm:flex" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Tailored skeleton for the Course Overview chapter outline list (`ChapterOutline`).
 */
export function CourseChapterOutlineSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <section data-testid="course-chapter-outline-skeleton" className="space-y-3">
      <div className="flex items-center justify-between gap-4 border-b border-border pb-2">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-20" />
      </div>

      <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card/70 shadow-xs">
        {Array.from({ length: rows }).map((_, idx) => (
          <li key={idx} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Skeleton className="size-8 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-4 w-3/5 max-w-xs" />
                <Skeleton className="h-3.5 w-24" />
              </div>
            </div>
            <Skeleton className="size-4 shrink-0 rounded-sm" />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Tailored skeleton for the full Course Overview dynamic body (primary action strip + chapter outline).
 */
export function CourseOverviewContentSkeleton() {
  return (
    <div data-testid="course-overview-content-skeleton">
      <CourseOverviewPrimaryActionsSkeleton />
      <div className="mb-6">
        <CourseChapterOutlineSkeleton rows={4} />
      </div>
    </div>
  );
}

/**
 * Tailored skeleton for the Course Materials (`CourseDocumentsClient`) view:
 * 5-tab category strip + collapsible chapter/exam accordion with 16:10 document thumbnails.
 */
export function CourseMaterialListSkeleton() {
  return (
    <div data-testid="course-material-list-skeleton" className="space-y-3 font-sans">
      {/* Category tab strip matching TabsList in CourseDocumentsClient */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className={cn(tabListClassName, "max-w-full justify-start")}>
          <div className={cn(tabTriggerClassName, tabTriggerActiveClassName, "pointer-events-none")}>
            <Skeleton className="size-3.5 rounded-sm" />
            <Skeleton className="h-3.5 w-12" />
          </div>
          {[16, 14, 20, 20].map((w, idx) => (
            <div key={idx} className={cn(tabTriggerClassName, "pointer-events-none")}>
              <Skeleton className="size-3.5 rounded-sm opacity-60" />
              <Skeleton className="h-3.5 opacity-60" style={{ width: `${w * 4}px` }} />
            </div>
          ))}
        </div>
      </div>

      {/* Collapsible Chapter & Exam Accordion matching CollapsibleDocumentSection + HierarchyDocumentCard */}
      <div className="overflow-hidden rounded-xl border border-border/55 bg-card">
        {/* Expanded first chapter */}
        <div className="border-b border-border/45">
          <div className="flex w-full items-center gap-3 px-3 py-2.5 sm:px-3.5">
            <Skeleton className="h-3.5 w-12 shrink-0 sm:w-14" />
            <Skeleton className="h-4 w-56 max-w-[55%]" />
            <div className="ml-auto flex items-center gap-2 shrink-0">
              <Skeleton className="h-3.5 w-16" />
              <ChevronDown className="size-4 rotate-180 text-muted-foreground/40" aria-hidden />
            </div>
          </div>

          <div className="divide-y divide-border/40 border-t border-border/40 bg-card/25">
            {[
              "border-l-blue-500/60",
              "border-l-indigo-500/60",
              "border-l-amber-500/60",
            ].map((accentClass, row) => (
              <div
                key={row}
                className="flex min-w-0 items-center justify-between gap-3 px-3.5 py-2.5"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {/* 16:10 thumbnail matching HierarchyDocumentCard */}
                  <Skeleton
                    className={cn(
                      "aspect-[16/10] w-24 sm:w-32 shrink-0 rounded-md border border-border/60 border-l-[3px]",
                      accentClass,
                    )}
                  />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-3/4 max-w-md" />
                    <Skeleton className="h-3 w-40 max-w-[70%]" />
                  </div>
                </div>
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/40" aria-hidden />
              </div>
            ))}
          </div>
        </div>

        {/* Collapsed subsequent chapters / exam sections */}
        {[1, 2, 3, 4].map((row) => (
          <div
            key={row}
            className="flex w-full items-center gap-3 border-b border-border/45 px-3 py-2.5 last:border-b-0 sm:px-3.5"
          >
            <Skeleton className="h-3.5 w-12 shrink-0 sm:w-14" />
            <Skeleton className="h-4 w-48 max-w-[50%]" />
            <div className="ml-auto flex items-center gap-2 shrink-0">
              <Skeleton className="h-3.5 w-14" />
              <ChevronDown className="size-4 text-muted-foreground/40" aria-hidden />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Tailored skeleton for the Material / Structured Article Reader (`StructuredArticleReader` / `MaterialViewer`):
 * Sticky reader header with real back link & course title (when available) + 2-column 75ch article canvas & right TOC sidebar.
 */
export function MaterialReaderContentSkeleton({
  courseId,
  courseTitle,
  backHref,
  showHeader = true,
}: {
  courseId?: string;
  courseTitle?: string;
  backHref?: string;
  showHeader?: boolean;
}) {
  const resolvedBackHref = backHref ?? (courseId ? `/courses/${courseId}/material` : undefined);

  return (
    <div
      data-testid="material-reader-skeleton"
      className="min-h-screen w-full min-w-0 flex-1 bg-background text-foreground flex flex-col"
    >
      {showHeader && (
        <header className="sticky top-0 z-30 border-b border-border/80 bg-background/95 backdrop-blur-sm">
          <div className="flex items-center justify-between px-4 py-2 gap-3 max-w-7xl mx-auto w-full">
            <div className="flex items-center gap-2.5 min-w-0">
              {resolvedBackHref ? (
                <Link
                  href={resolvedBackHref}
                  className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground shrink-0"
                  aria-label="Kembali ke Materi"
                >
                  <ArrowLeft className="size-4" />
                </Link>
              ) : (
                <div className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground/50 shrink-0">
                  <ArrowLeft className="size-4" />
                </div>
              )}

              <div className="h-4 w-px bg-border/70 shrink-0" />

              <div className="min-w-0 space-y-1">
                {courseTitle ? (
                  <p className="truncate text-body-2xs font-medium text-muted-foreground uppercase tracking-wider">
                    {courseTitle}
                  </p>
                ) : (
                  <Skeleton className="h-3 w-28" />
                )}
                <Skeleton className="h-4 w-48 sm:w-64" />
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="hidden sm:flex items-center gap-2 pr-1">
                <Skeleton className="h-1.5 w-20 rounded-full" />
                <Skeleton className="h-3.5 w-7" />
              </div>
              <div className="hidden sm:block h-4 w-px bg-border/70 mx-1" />
              <div className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground/40">
                <Maximize2 className="size-4" />
              </div>
              <div className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground/40 md:hidden">
                <Menu className="size-4" />
              </div>
              <div className="hidden md:inline-flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary/60">
                <PanelRightClose className="size-4" />
              </div>
            </div>
          </div>
          <div className="w-full h-[2px] bg-border/40" />
        </header>
      )}

      {/* 2-Column Reader Body matching StructuredArticleReader */}
      <div className="flex-1 flex w-full">
        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-8 pb-32">
          <div className="max-w-[75ch] mx-auto space-y-8">
            {/* Section heading + reading time badge */}
            <div className="space-y-3 border-b border-border/60 pb-4">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-20 rounded-md" />
                <Skeleton className="h-5 w-24 rounded-md" />
              </div>
              <Skeleton className="h-7 w-3/4 rounded-md" />
            </div>

            {/* Prior knowledge / problem introduction callout block */}
            <div className="rounded-r-lg border-l-4 border-l-primary/50 border-t border-r border-b border-border/60 bg-primary/[0.02] p-4 sm:p-5 space-y-3">
              <div className="flex items-center gap-2 border-b border-border/50 pb-2.5">
                <Skeleton className="size-6 rounded-md" />
                <Skeleton className="h-4 w-40" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>

            {/* Verbal & mathematical prose paragraphs */}
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-4/5" />
            </div>

            {/* Mathematical formula display block */}
            <div className="rounded-xl border border-border/60 bg-muted/20 p-5 flex items-center justify-center">
              <Skeleton className="h-6 w-56" />
            </div>

            {/* Worked example card */}
            <div className="rounded-r-lg border-l-4 border-l-status-success/60 border-t border-r border-b border-border/70 bg-card p-4 sm:p-5 space-y-3 shadow-xs">
              <div className="flex items-center gap-2 border-b border-border/60 pb-2.5">
                <Skeleton className="size-6 rounded-md" />
                <Skeleton className="h-4 w-44" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
          </div>
        </main>

        {/* Desktop Right TOC Sidebar matching StructuredArticleReader */}
        <aside className="hidden md:block w-72 lg:w-80 shrink-0 border-l border-border/80 h-[calc(100vh-53px)] sticky top-[53px] overflow-hidden bg-card/40">
          <div className="flex flex-col h-full">
            <div className="p-3 border-b border-border/70">
              <div className="relative flex items-center h-9 rounded-md border border-input bg-background px-2.5 gap-2">
                <Search className="size-4 text-muted-foreground/50 shrink-0" />
                <Skeleton className="h-3.5 w-32" />
              </div>
            </div>
            <div className="flex-1 p-3 space-y-2">
              <div className="flex items-center justify-between px-2 py-1">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-12" />
              </div>
              {[1, 2, 3, 4, 5].map((item) => (
                <div
                  key={item}
                  className={cn(
                    "flex items-start gap-2.5 px-2.5 py-2 rounded-lg",
                    item === 1 && "bg-primary/10 border-l-2 border-primary",
                  )}
                >
                  <Skeleton className="mt-0.5 size-4 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-1.5 py-0.5">
                    <Skeleton className="h-3.5 w-4/5" />
                    {item === 1 && (
                      <div className="space-y-1 pt-1 pl-2 border-l border-primary/25">
                        <Skeleton className="h-2.5 w-3/4" />
                        <Skeleton className="h-2.5 w-2/3" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/**
 * Tailored skeleton for the Course Progress dynamic cards (`StudyStatisticsCard` + `RecentActivityCard`).
 */
export function CourseProgressContentSkeleton() {
  return (
    <div data-testid="course-progress-content-skeleton" className="space-y-6">
      <StudyStatisticsSkeleton />
      <RecentActivitySkeleton />
    </div>
  );
}

/**
 * Tailored skeleton for the Course Mastery page (`ConceptGraphView` DAG + `ConceptMap` chapter tables).
 */
export function CourseMasteryContentSkeleton() {
  return (
    <div data-testid="course-mastery-content-skeleton" className="space-y-8">
      {/* Concept Graph section matching ConceptGraphView */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-36" />
        <div className="overflow-x-auto rounded-xl border border-border bg-card/40 p-4">
          <div className="flex items-center gap-8 min-w-[460px] py-2">
            <div className="space-y-3">
              <Skeleton className="h-11 w-36 rounded-lg border border-border/60" />
              <Skeleton className="h-11 w-36 rounded-lg border border-border/60" />
            </div>
            <div className="h-px w-12 bg-border shrink-0" />
            <div className="space-y-3">
              <Skeleton className="h-11 w-36 rounded-lg border border-border/60" />
              <Skeleton className="h-11 w-36 rounded-lg border border-border/60" />
            </div>
            <div className="h-px w-12 bg-border shrink-0" />
            <div>
              <Skeleton className="h-11 w-36 rounded-lg border border-border/60" />
            </div>
          </div>
        </div>
      </div>

      {/* Chapter Concept Map groups matching ConceptMap */}
      {[1, 2].map((groupIndex) => (
        <div key={groupIndex} className="space-y-3">
          <Skeleton className="h-4 w-48 mt-4 mb-2" />
          <div className="border-b border-border" />
          <div className="divide-y divide-border">
            {[1, 2, 3, 4].map((rowIndex) => (
              <div
                key={rowIndex}
                className="py-3 grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_auto] items-center gap-4"
              >
                <Skeleton className="h-4 w-2/5 max-w-xs" />
                <div className="flex items-center gap-3 shrink-0">
                  <Skeleton className="hidden sm:block w-32 h-1.5 rounded-md" />
                  <Skeleton className="h-4 w-7" />
                </div>
                <Skeleton className="hidden sm:block size-4 rounded-sm" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Tailored skeleton for the Course Quiz list (`QuizListClient`).
 */
export function CourseQuizListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div data-testid="course-quiz-list-skeleton" className="font-sans">
      <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card/75 shadow-2xs">
        {Array.from({ length: rows }).map((_, idx) => (
          <li key={idx} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-4 w-56 max-w-[75%]" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            <Skeleton className="h-7 w-20 shrink-0 rounded-lg" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Tailored skeleton for the Course Tryout list (`TryoutListClient`).
 */
export function CourseTryoutListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div data-testid="course-tryout-list-skeleton" className="space-y-3 font-sans">
      <ul className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/70 bg-card/75">
        {Array.from({ length: rows }).map((_, idx) => (
          <li key={idx} className="flex items-center justify-between gap-3 px-4 py-3.5">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-4 w-64 max-w-[80%]" />
              <div className="flex flex-wrap items-center gap-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="h-8 w-24 shrink-0 rounded-md" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Tailored skeleton for the Course Flashcard review deck (`FlashcardClient`).
 */
export function CourseFlashcardSkeleton() {
  return (
    <div data-testid="course-flashcard-skeleton" className="mx-auto max-w-2xl space-y-6">
      {/* Top progress bar & mode controls */}
      <div className="space-y-2">
        <Skeleton className="h-1 w-full rounded-md" />
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <Skeleton className="h-3.5 w-44" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      </div>

      {/* 3D Flip Card container skeleton */}
      <div className="w-full h-80 rounded-2xl border border-border bg-card p-6 shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-28 rounded-md" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-2.5 py-4">
          <Skeleton className="h-5 w-3/4 max-w-md" />
          <Skeleton className="h-5 w-1/2 max-w-xs" />
        </div>
        <div className="flex items-center justify-center gap-1.5 text-body-xs text-muted-foreground/50">
          <RotateCw className="size-3" />
          <Skeleton className="h-3.5 w-32" />
        </div>
      </div>
    </div>
  );
}

/**
 * Tailored skeleton for the Course Video playlists (`CourseVideosClient`).
 */
export function CourseVideoListSkeleton() {
  return (
    <div data-testid="course-video-list-skeleton" className="space-y-4 font-sans">
      {/* Search & chapter filter toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-1 flex-wrap items-center gap-2 min-w-[240px]">
          <div className="relative min-w-[140px] flex-1 max-w-sm flex items-center h-9 rounded-lg border border-input bg-background px-3 gap-2">
            <Search className="size-4 text-muted-foreground/50 shrink-0" />
            <Skeleton className="h-3.5 w-36" />
          </div>
          <div className="shrink-0 w-44 flex items-center h-9 rounded-lg border border-input bg-background px-3 gap-2">
            <Filter className="size-3.5 text-muted-foreground/50 shrink-0" />
            <Skeleton className="h-3.5 w-24" />
          </div>
        </div>
      </div>

      {/* Collapsible Playlist Accordion with 16:9 video thumbnails */}
      <div className="overflow-hidden rounded-xl border border-border/60 bg-card divide-y divide-border/45">
        <div>
          <div className="flex w-full items-center justify-between gap-3 px-3.5 py-3">
            <div className="flex flex-1 items-center gap-3">
              <Skeleton className="h-3.5 w-16 shrink-0" />
              <Skeleton className="h-4 w-52 max-w-[55%]" />
              <Skeleton className="ml-auto h-3.5 w-14 shrink-0" />
              <ChevronDown className="size-4 rotate-180 text-muted-foreground/40 shrink-0" />
            </div>
          </div>
          <div className="divide-y divide-border/40 border-t border-border/40 bg-card/30">
            {[1, 2, 3].map((row) => (
              <div key={row} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Skeleton className="w-28 sm:w-36 aspect-video shrink-0 rounded-lg border border-border/60" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-2/3 max-w-sm" />
                    <Skeleton className="h-3 w-36" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {[2, 3].map((pl) => (
          <div key={pl} className="flex w-full items-center justify-between gap-3 px-3.5 py-3">
            <div className="flex flex-1 items-center gap-3">
              <Skeleton className="h-3.5 w-16 shrink-0" />
              <Skeleton className="h-4 w-44 max-w-[50%]" />
              <Skeleton className="ml-auto h-3.5 w-14 shrink-0" />
              <ChevronDown className="size-4 text-muted-foreground/40 shrink-0" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Tailored skeleton for the Course Leaderboard rank card + Top 3 table.
 */
export function CourseLeaderboardContentSkeleton() {
  return (
    <div data-testid="course-leaderboard-skeleton">
      {/* User's own ranking status card */}
      <div className="mb-4 rounded-xl border border-border/70 bg-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3.5 w-48" />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Trophy className="size-5 text-brand-secondary/50" />
          <Skeleton className="h-5 w-36" />
        </div>
      </div>

      {/* Top 3 Leaderboard list */}
      <section className="overflow-hidden rounded-xl border border-border/70 bg-card">
        <div className="border-b border-border/60 px-4 py-3">
          <Skeleton className="h-5 w-28" />
        </div>
        <ol className="divide-y divide-border/60">
          {[1, 2, 3].map((rank) => (
            <li key={rank} className="flex items-start gap-3 px-4 py-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-body-sm font-semibold text-muted-foreground">
                {rank}
              </span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-48" />
                <Skeleton className="h-3 w-40" />
              </div>
              <Skeleton className="h-5 w-12 shrink-0" />
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

/**
 * Tailored skeleton for the Course My Results submission list (`my-results/page.tsx`).
 */
export function CourseMyResultsListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <ul
      data-testid="course-my-results-skeleton"
      className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card"
    >
      {Array.from({ length: rows }).map((_, idx) => (
        <li key={idx} className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-4 w-56 max-w-[75%]" />
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-5 w-20 rounded-md" />
          </div>
          <Skeleton className="h-6 w-12 shrink-0" />
          <ChevronRight className="size-5 shrink-0 text-muted-foreground/40" aria-hidden />
        </li>
      ))}
    </ul>
  );
}

/**
 * Tailored skeleton for the Study Path timeline (`StudyPathTimeline`).
 */
export function CourseStudyPathSkeleton() {
  return (
    <div data-testid="course-study-path-skeleton" className="space-y-4" aria-busy="true">
      {/* Target duration planner controls */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 pb-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-9 w-16 rounded-md" />
        <Skeleton className="h-4 w-10" />
        <Skeleton className="h-8 w-28 rounded-md" />
      </div>

      {/* Continue learning highlight card */}
      <section className="grid gap-3 rounded-xl border border-brand-primary/25 bg-brand-primary/5 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center shadow-xs">
        <div className="space-y-1.5">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-5 w-64 max-w-[85%]" />
          <Skeleton className="h-3.5 w-44" />
        </div>
        <Skeleton className="h-8 w-24 rounded-lg" />
      </section>

      {/* Collapsible chapter step groups */}
      <div className="space-y-3">
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-2xs">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <ChevronDown className="size-4 shrink-0 rotate-180 text-muted-foreground/40" />
              <Skeleton className="h-4 w-52" />
            </div>
            <Skeleton className="h-3.5 w-28 shrink-0" />
          </div>
          <div className="divide-y divide-border/40 border-t border-border/60">
            {[1, 2, 3].map((step) => (
              <div key={step} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Skeleton className="size-5 shrink-0 rounded-full" />
                  <Skeleton className="h-4 w-3/5 max-w-sm" />
                </div>
                <Skeleton className="h-3.5 w-14 shrink-0" />
              </div>
            ))}
          </div>
        </div>

        {[2, 3].map((ch) => (
          <div
            key={ch}
            className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-4 py-3 shadow-2xs"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <ChevronDown className="size-4 shrink-0 text-muted-foreground/40" />
              <Skeleton className="h-4 w-48" />
            </div>
            <Skeleton className="h-3.5 w-28 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Tailored skeleton for the Concept Explorer page (`concept/[slug]/page.tsx`).
 */
export function CourseConceptExplorerSkeleton() {
  return (
    <div data-testid="course-concept-explorer-skeleton" className="space-y-8">
      <div className={studentCardClass("space-y-4")}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <Skeleton className="h-5 w-48" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-1.5 w-32 rounded-md" />
            <Skeleton className="h-4 w-8" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-24" />
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-6 w-28 rounded-md" />
            <Skeleton className="h-6 w-32 rounded-md" />
          </div>
        </div>
      </div>

      {[1, 2].map((section) => (
        <section key={section} className="space-y-3">
          <Skeleton className="h-5 w-36" />
          <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
            <div className="p-4 space-y-2.5">
              <Skeleton className="h-5 w-56" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
