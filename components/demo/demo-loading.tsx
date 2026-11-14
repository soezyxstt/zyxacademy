"use client";

import { usePathname } from "next/navigation";
import { ApplicationPage } from "@/components/application-page";
import { PageHeader } from "@/components/page-header";
import { CourseFlashcardSkeleton, CourseMaterialListSkeleton, CourseMasteryContentSkeleton, CourseOverviewContentSkeleton, CourseProgressContentSkeleton, CourseQuizListSkeleton, CourseTryoutListSkeleton, MaterialReaderContentSkeleton } from "@/components/course/course-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

function DashboardSkeleton() {
  return <div className="space-y-6" data-testid="demo-dashboard-skeleton">
    <Skeleton className="h-7 w-48" />
    <section className="space-y-3"><Skeleton className="h-5 w-40" />{[0, 1, 2].map(i => <Skeleton key={i} className="h-12 w-full" />)}</section>
    <div className="grid gap-6 lg:grid-cols-12"><div className="space-y-6 lg:col-span-7">{[0, 1].map(i => <section key={i} className="space-y-3"><Skeleton className="h-6 w-40" />{[0, 1, 2, 3].map(j => <Skeleton key={j} className="h-20 w-full" />)}</section>)}</div><div className="space-y-6 lg:col-span-5">{[0, 1, 2].map(i => <section key={i} className="space-y-3"><Skeleton className="h-6 w-44" />{[0, 1, 2].map(j => <Skeleton key={j} className="h-14 w-full" />)}</section>)}</div></div>
  </div>;
}

export function DemoTodayPlanSkeleton() {
  return <div className="mb-4 sm:mb-6" data-testid="demo-today-plan-skeleton" aria-busy="true">
    <PageHeader title={<Skeleton className="h-7 w-40" />} actions={<Skeleton className="hidden h-7 w-20 sm:block" />} />
    <section className="mt-4 sm:mt-6">
      <div className="mb-3 flex items-center justify-between gap-2 border-b border-border/50 pb-2.5"><Skeleton className="h-5 w-40" /><Skeleton className="h-5 w-20" /></div>
      <div className="divide-y divide-border/30">{[0, 1, 2].map(i => <div key={i} className="flex items-center gap-2 py-3 sm:gap-3"><Skeleton className="size-8 shrink-0" /><Skeleton className="size-8 shrink-0" /><Skeleton className="h-4 w-40 max-w-[40%]" /><Skeleton className="ml-auto h-8 w-9 shrink-0" /></div>)}</div>
    </section>
  </div>;
}

export function DemoMasterySkeleton() {
  return <section className="space-y-6" data-testid="demo-mastery-skeleton" aria-busy="true">{[0, 1, 2, 3].map(i => <div key={i} className="space-y-3"><Skeleton className="h-6 w-48" />{[0, 1, 2].map(j => <Skeleton key={j} className="h-10 w-full" />)}</div>)}</section>;
}

function DemoQuizPlayerSkeleton() {
  return <div data-testid="demo-quiz-player-skeleton" className="grid grid-cols-1 items-start gap-4 md:gap-6 lg:grid-cols-12">
    <div className="space-y-4 md:space-y-5 lg:col-span-8">
      <div className="flex flex-col gap-2.5 border-b border-border pb-3 sm:flex-row sm:items-center sm:gap-4 md:pb-4"><div className="flex-1 space-y-1.5"><div className="flex justify-between"><Skeleton className="h-4 w-20" /><Skeleton className="h-4 w-24" /></div><Skeleton className="h-2 w-full" /></div><Skeleton className="h-8 w-24" /></div>
      <div className="space-y-5 rounded-xl border border-border/85 bg-card p-4 md:rounded-2xl md:p-6"><div className="flex gap-3"><Skeleton className="size-8 shrink-0" /><Skeleton className="h-5 w-3/4" /></div><div className="space-y-3">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div><div className="flex justify-between"><Skeleton className="h-9 w-24" /><Skeleton className="h-9 w-24" /></div></div>
    </div>
    <div className="space-y-4 lg:col-span-4 lg:border-l lg:border-border lg:pl-6"><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-56 max-w-full" /><div className="flex gap-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="size-9" />)}</div></div>
  </div>;
}

export function DemoViewSkeleton({ view }: { view: string }) {
  let body;
  switch (view) {
    case "overview": case "zyra": body = <CourseOverviewContentSkeleton />; break;
    case "documents": body = <CourseMaterialListSkeleton />; break;
    case "article": case "diktat": body = <MaterialReaderContentSkeleton />; break;
    case "mastery": body = <CourseMasteryContentSkeleton />; break;
    case "progress": body = <CourseProgressContentSkeleton />; break;
    case "flashcards": body = <CourseFlashcardSkeleton />; break;
    case "quiz": body = <DemoQuizPlayerSkeleton />; break;
    case "quiz-list": case "quiz-start": case "quiz-review": case "quiz-summary": body = <CourseQuizListSkeleton />; break;
    case "tryout-list": case "tryout": case "tryout-review": body = <CourseTryoutListSkeleton />; break;
    case "dashboard": body = <DashboardSkeleton />; break;
    default: body = <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-12 w-full" /><Skeleton className="h-40 w-full" /></div>;
  }
  return <ApplicationPage aria-busy="true" aria-label="Loading">{body}</ApplicationPage>;
}

export function DemoLoading() {
  const pathname = usePathname();
  const last = pathname.split("/").filter(Boolean).at(-1);
  const view = last === "demo" ? "dashboard" : last ?? "dashboard";
  return <div className="min-h-screen bg-background lg:flex" aria-busy="true">
    <aside className="hidden w-60 shrink-0 space-y-5 border-r border-border px-4 py-5 lg:block"><Skeleton className="h-9 w-20" /><Skeleton className="h-24 w-full" />{[0, 1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-9 w-full" />)}</aside>
    <div className="min-w-0 flex-1"><div className="h-14 border-b border-border px-4 py-3 lg:hidden"><Skeleton className="h-8 w-32" /></div><DemoViewSkeleton view={view} /></div>
  </div>;
}
