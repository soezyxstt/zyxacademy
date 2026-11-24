import { CourseLoadingHeader } from "./course-loading-header";
import { Skeleton } from "@/components/ui/skeleton";

function Toolbar() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Skeleton className="size-9" />
      <Skeleton className="h-9 w-28 max-w-full" />
      <Skeleton className="ml-auto size-9" />
    </div>
  );
}

function Rows({ count = 5 }: { count?: number }) {
  return (
    <div className="divide-y divide-border/60 border-y border-border/60">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex items-start gap-3 py-(--row-padding)">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="size-8 shrink-0" />
        </div>
      ))}
    </div>
  );
}

function Stats() {
  return (
    <div className="grid grid-cols-2 gap-px border-y border-border/60 bg-border/60 lg:grid-cols-4">
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className="space-y-2 bg-background p-(--compact-gap)">
          <Skeleton className="h-4 w-24 max-w-full" />
          <Skeleton className="h-6 w-12" />
        </div>
      ))}
    </div>
  );
}

function Shell({ children, courseHeader = true }: { children: React.ReactNode; courseHeader?: boolean }) {
  return (
    <div role="status" aria-label="Memuat" className="min-w-0 space-y-(--compact-gap)">
      {courseHeader && <CourseLoadingHeader />}
      {children}
    </div>
  );
}

export function CourseChaptersLoading() {
  return (
    <Shell>
      <div className="flex gap-2">
        <Skeleton className="h-9 min-w-0 flex-1 sm:max-w-72" />
        <Skeleton className="h-9 min-w-0 flex-1" />
        <Skeleton className="size-9 shrink-0" />
      </div>
      <Rows />
    </Shell>
  );
}

export function CourseQuizzesLoading() {
  return <Shell><Toolbar /><Rows /></Shell>;
}

export function CourseQuestionsLoading() {
  return <Shell><Skeleton className="h-9 w-64 max-w-full" /><Toolbar /><Rows /></Shell>;
}

export function CourseResultsLoading() {
  return <Shell><Stats /><Rows /></Shell>;
}

export function CourseAnalyticsLoading() {
  return <Shell><Stats /><Toolbar /><Rows /></Shell>;
}

export function CourseLeaderboardLoading() {
  return <Shell><Toolbar /><Rows count={6} /></Shell>;
}

export function CourseReviewLoading() {
  return <Shell><Skeleton className="h-9 w-64 max-w-full" /><Toolbar /><Rows /></Shell>;
}

export function CourseReviewDetailLoading() {
  return (
    <Shell>
      <div className="grid gap-(--related-gap) lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Rows count={4} />
        <div className="space-y-(--compact-gap) border-b border-border/60 pb-(--compact-gap)">
          <Skeleton className="h-6 w-48 max-w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    </Shell>
  );
}

export function CourseQuizFormLoading() {
  return (
    <Shell courseHeader={false}>
      <Skeleton className="h-9 w-80 max-w-full" />
      <div className="grid gap-(--related-gap) lg:grid-cols-2">
        {[0, 1].map((column) => (
          <div key={column} className="space-y-(--compact-gap) border-b border-border/60 pb-(--compact-gap)">
            {[0, 1, 2, 3].map((field) => (
              <div key={field} className="space-y-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </Shell>
  );
}

export function CourseTryoutsLoading() {
  return <Shell><Toolbar /><Rows /></Shell>;
}

export function CourseAnalyticsDetailLoading() {
  return (
    <Shell courseHeader={false}>
      <Stats />
      <div className="grid gap-(--related-gap) lg:grid-cols-2">
        <Rows count={3} />
        <Rows count={3} />
      </div>
    </Shell>
  );
}
