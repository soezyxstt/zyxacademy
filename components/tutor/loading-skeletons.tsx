import { ApplicationPage } from "@/components/application-page";
import { Skeleton } from "@/components/ui/skeleton";

function Header() {
  return <div className="flex items-center justify-between gap-2"><Skeleton className="size-9" /><Skeleton className="size-9" /></div>;
}
function Rows({ count = 4 }: { count?: number }) {
  return <div className="divide-y divide-border border-y border-border">{Array.from({ length: count }, (_, i) => <div key={i} className="flex items-center gap-(--compact-gap) py-3"><div className="min-w-0 flex-1 space-y-2"><Skeleton className="h-4 w-2/5" /><Skeleton className="h-3 w-1/3" /></div><Skeleton className="h-8 w-16 shrink-0" /></div>)}</div>;
}
function Tabs({ width = "w-64" }: { width?: string }) { return <Skeleton className={`h-10 max-w-full ${width}`} />; }
function Stats() { return <div className="grid grid-cols-2 gap-(--related-gap) border-y border-border py-3 sm:grid-cols-4">{[0,1,2,3].map(i => <div key={i} className="space-y-2"><Skeleton className="h-4 w-24 max-w-full" /><Skeleton className="h-6 w-12" /></div>)}</div>; }
function Shell({ children }: { children: React.ReactNode }) { return <ApplicationPage role="status" aria-label="Memuat" spacing="space-y-(--group-gap)">{children}</ApplicationPage>; }

export function TutorDashboardLoading() {
  return <Shell><Header /><Stats /><div className="grid gap-(--group-gap) xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]"><Rows count={3} /><Rows count={2} /></div><Rows count={3} /></Shell>;
}
export function TutorCourseLoading() {
  return (
    <Shell>
      <Header />
      <div className="flex flex-wrap gap-8 border-y border-border py-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-6 w-10" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
      <Skeleton className="h-8 w-40" />
      <div className="space-y-(--compact-gap) border-t border-border pt-4">
        <Skeleton className="h-5 w-40" />
        <Rows />
      </div>
    </Shell>
  );
}
export function TutorParticipantsLoading() {
  return <Shell><Header /><Stats /><Tabs /><Skeleton className="h-9 w-64 max-w-full" /><Rows count={5} /></Shell>;
}
export function TutorMaterialsLoading() {
  return <Shell><Header /><div className="flex justify-end"><Skeleton className="size-9" /></div><Rows count={5} /></Shell>;
}
export function TutorQuizzesLoading() {
  return <Shell><Header /><Tabs /><div className="flex justify-end"><Skeleton className="size-9" /></div><Rows count={4} /></Shell>;
}
export function TutorGradingLoading() {
  return <Shell><Header /><Tabs width="w-80" /><Rows count={5} /></Shell>;
}
export function TutorVideosContentLoading() {
  return <div role="status" aria-label="Memuat" className="space-y-(--group-gap)"><div className="flex flex-wrap items-center justify-between gap-2"><Tabs /><Skeleton className="size-9" /></div><Rows count={4} /></div>;
}
export function TutorVideosLoading() {
  return <Shell><Header /><TutorVideosContentLoading /></Shell>;
}
export function TutorQuizFormLoading() {
  return <Shell><Header /><Tabs width="w-80" /><div className="grid gap-(--related-gap) lg:grid-cols-12"><div className="space-y-(--related-gap) border-t border-border pt-3 lg:col-span-7">{[0,1,2,3].map(i => <div key={i} className="space-y-2"><Skeleton className="h-4 w-28" /><Skeleton className="h-9 w-full" /></div>)}</div><div className="space-y-(--related-gap) border-t border-border pt-3 lg:col-span-5">{[0,1,2].map(i => <div key={i} className="space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-9 w-full" /></div>)}</div></div></Shell>;
}
export function TutorQuizAttemptsLoading() {
  return <Shell><Header /><div className="flex flex-wrap gap-2"><Skeleton className="h-9 w-64" /><Skeleton className="size-9" /></div><Rows count={6} /></Shell>;
}
export function TutorQuizGradingLoading() {
  return <Shell><Header /><div className="flex flex-wrap gap-2"><Skeleton className="h-9 w-64" /><Skeleton className="size-9" /></div><Rows count={5} /></Shell>;
}
export function TutorLiveLoading() {
  return <Shell><Header /><div className="max-w-2xl space-y-(--related-gap)"><div className="space-y-2 border-b border-border pb-4"><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-64 max-w-full" /></div><div className="space-y-2"><Skeleton className="h-4 w-28" /><Skeleton className="h-9 w-full" /></div><Skeleton className="h-9 w-full" /></div></Shell>;
}
