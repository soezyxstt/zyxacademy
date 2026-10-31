import { Skeleton } from "@/components/ui/skeleton";

function Header() {
  return <div className="space-y-3 border-b border-border pb-4"><Skeleton className="h-4 w-44" /><div className="flex flex-wrap items-center justify-between gap-3"><Skeleton className="h-7 w-56" /><Skeleton className="h-8 w-40" /></div></div>;
}
function Toolbar() { return <div className="flex flex-wrap gap-2"><Skeleton className="h-9 min-w-[140px] max-w-sm flex-1" /><Skeleton className="h-9 w-32" /><Skeleton className="h-9 w-24" /></div>; }
function Rows({ count = 5 }: { count?: number }) { return <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">{Array.from({ length: count }, (_, i) => <div key={i} className="flex items-center gap-3 px-4 py-3"><div className="min-w-0 flex-1 space-y-2"><Skeleton className="h-4 w-2/5" /><Skeleton className="h-3 w-1/4" /></div><Skeleton className="h-8 w-16 shrink-0" /></div>)}</div>; }
function Stats() { return <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-4">{[0,1,2,3].map(i => <div key={i} className="space-y-2 bg-card p-4"><Skeleton className="h-4 w-24 max-w-full" /><Skeleton className="h-6 w-12" /></div>)}</div>; }
function Shell({ children }: { children: React.ReactNode }) { return <div role="status" aria-label="Memuat" className="space-y-4 font-sans"><Header />{children}</div>; }
export function CourseChaptersLoading() { return <Shell><div className="flex justify-between gap-2"><Skeleton className="h-5 w-32" /><Skeleton className="h-9 w-28" /></div><Rows /></Shell>; }
export function CourseQuizzesLoading() { return <Shell><Toolbar /><Rows /></Shell>; }
export function CourseQuestionsLoading() { return <Shell><Skeleton className="h-10 w-64 max-w-full" /><Toolbar /><Rows /></Shell>; }
export function CourseResultsLoading() { return <Shell><Stats /><Rows /></Shell>; }
export function CourseAnalyticsLoading() { return <Shell><Stats /><Toolbar /><Rows /></Shell>; }
export function CourseLeaderboardLoading() { return <Shell><Toolbar /><Rows count={6} /></Shell>; }
export function CourseReviewLoading() { return <Shell><Skeleton className="h-10 w-64 max-w-full" /><Toolbar /><Rows /></Shell>; }
export function CourseReviewDetailLoading() { return <Shell><div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"><Rows count={4} /><div className="space-y-4 rounded-xl border border-border bg-card p-4"><Skeleton className="h-6 w-48" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-4/5" /><Skeleton className="h-40 w-full" /></div></div></Shell>; }
export function CourseQuizFormLoading() { return <Shell><Skeleton className="h-10 w-80 max-w-full" /><div className="grid gap-4 lg:grid-cols-2">{[0,1].map(i => <div key={i} className="space-y-4 rounded-xl border border-border bg-card p-4">{[0,1,2,3].map(j => <div key={j} className="space-y-2"><Skeleton className="h-4 w-28" /><Skeleton className="h-9 w-full" /></div>)}</div>)}</div></Shell>; }
export function CourseTryoutsLoading() { return <Shell><div className="flex justify-end"><Skeleton className="h-9 w-32" /></div><Rows /></Shell>; }
export function CourseAnalyticsDetailLoading() { return <Shell><Stats /><div className="grid gap-4 lg:grid-cols-2"><Rows count={3} /><Rows count={3} /></div></Shell>; }
