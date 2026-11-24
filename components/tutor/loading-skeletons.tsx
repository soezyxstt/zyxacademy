import type { ReactNode } from "react";
import { ApplicationPage } from "@/components/application-page";
import { TranslatedText } from "@/components/i18n/translated-text";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function LoadingLabel() {
  return <TranslatedText namespace="tutor.quizForm" messageKey="loading" className="sr-only" />;
}

function Rows({ count = 4 }: { count?: number }) {
  return (
    <div className="divide-y divide-border/55 border-y border-border/55">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex min-h-11 items-start gap-(--compact-gap) py-(--row-padding)">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
          <Skeleton className="h-3 w-14 shrink-0" />
        </div>
      ))}
    </div>
  );
}

function Toolbar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/55 pb-2">
      {children}
    </div>
  );
}

function TabStrip({ width = "w-64" }: { width?: string }) {
  return <Skeleton className={cn("h-9 max-w-full", width)} />;
}

function Stats({ count = 4 }: { count?: number }) {
  return (
    <div className={cn(
      "grid grid-cols-2 gap-x-(--related-gap) gap-y-(--compact-gap) border-b border-border/55 pb-(--compact-gap)",
      count === 3 ? "sm:grid-cols-3" : "sm:grid-cols-4",
    )}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="min-w-0 space-y-1.5">
          <Skeleton className="h-4 w-24 max-w-full" />
          <Skeleton className="h-6 w-12" />
        </div>
      ))}
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <ApplicationPage role="status">
      <LoadingLabel />
      <div aria-hidden className="space-y-(--related-gap)">{children}</div>
    </ApplicationPage>
  );
}

export function TutorDashboardLoading() {
  return (
    <Shell>
      <Stats />
      <div className="grid gap-(--section-gap) xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
        <Rows count={3} />
        <Rows count={2} />
      </div>
      <Rows count={3} />
    </Shell>
  );
}

export function TutorCourseLoading() {
  return (
    <Shell>
      <Stats count={3} />
      <Toolbar><Skeleton className="h-3 w-28" /><Skeleton className="size-9" /></Toolbar>
      <Skeleton className="h-5 w-40" />
      <Rows />
    </Shell>
  );
}

export function TutorParticipantsLoading() {
  return (
    <Shell>
      <Stats />
      <TabStrip />
      <Toolbar><Skeleton className="size-9" /><Skeleton className="h-9 w-24" /></Toolbar>
      <Rows count={5} />
    </Shell>
  );
}

export function TutorMaterialsLoading() {
  return (
    <Shell>
      <Toolbar><Skeleton className="h-4 w-20" /><Skeleton className="size-9" /></Toolbar>
      <Rows count={5} />
    </Shell>
  );
}

export function TutorQuizzesLoading() {
  return (
    <Shell>
      <TabStrip />
      <Toolbar><Skeleton className="h-4 w-20" /><Skeleton className="size-9" /></Toolbar>
      <Rows />
    </Shell>
  );
}

export function TutorGradingLoading() {
  return <Shell><TabStrip width="w-72" /><Rows count={5} /></Shell>;
}

function VideoRows() {
  return (
    <div className="space-y-(--related-gap)">
      <Toolbar><Skeleton className="size-9" /><Skeleton className="size-9" /></Toolbar>
      <Skeleton className="h-5 w-44 max-w-full" />
      <div className="divide-y divide-border/55 border-y border-border/55">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="flex items-start gap-(--compact-gap) py-(--row-padding)">
            <Skeleton className="aspect-video w-24 shrink-0 sm:w-32" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-3 w-2/5" />
            </div>
            <Skeleton className="size-9 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TutorVideosContentLoading() {
  return <div role="status"><LoadingLabel /><div aria-hidden><VideoRows /></div></div>;
}

export function TutorVideosLoading() {
  return <Shell><VideoRows /></Shell>;
}

export function TutorQuizFormLoading() {
  return (
    <Shell>
      <TabStrip width="w-72" />
      <div className="grid gap-(--related-gap) lg:grid-cols-12">
        {[4, 2].map((count, group) => (
          <div key={group} className={cn(
            "space-y-(--related-gap) border-t border-border/55 pt-(--related-gap)",
            group === 0 ? "lg:col-span-7" : "lg:col-span-5",
          )}>
            {Array.from({ length: count }, (_, index) => (
              <div key={index} className="space-y-1.5">
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

export function TutorQuizAttemptsLoading() {
  return (
    <Shell>
      <div className="space-y-1.5"><Skeleton className="h-5 w-44 max-w-full" /><Skeleton className="h-3 w-36 max-w-full" /></div>
      <Toolbar>
        <div className="flex items-center gap-2"><Skeleton className="size-9" /><Skeleton className="size-9" /></div>
        <Skeleton className="h-3 w-16" />
      </Toolbar>
      <Rows count={6} />
    </Shell>
  );
}

export function TutorQuizGradingLoading() {
  return (
    <Shell>
      <Toolbar><Skeleton className="size-9" /><Skeleton className="h-3 w-24" /></Toolbar>
      <Rows count={5} />
    </Shell>
  );
}

export function TutorLiveLoading() {
  return (
    <Shell>
      <div className="max-w-2xl space-y-(--related-gap)">
        <div className="space-y-1.5 border-b border-border/55 pb-(--compact-gap)">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <div className="space-y-1.5"><Skeleton className="h-4 w-28" /><Skeleton className="h-9 w-full" /></div>
        <Skeleton className="h-9 w-40" />
      </div>
    </Shell>
  );
}
