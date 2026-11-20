import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function QuestionListRows({ count }: { count: number }) {
  return (
    <div className="divide-y divide-border" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="space-y-2 px-3 py-3">
          <div className="space-y-1.5">
            <Skeleton className={cn("h-4", index % 2 === 0 ? "w-4/5" : "w-3/4")} />
            {index % 3 === 0 && <Skeleton className="h-4 w-2/5" />}
          </div>
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-3 w-24" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-6" />
              <Skeleton className="h-3 w-14" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function DiscussionQuestionListSkeleton({ count = 5, label }: { count?: number; label?: string }) {
  return (
    <div role="status" className="min-w-0">
      {label && <span className="sr-only">{label}</span>}
      <QuestionListRows count={count} />
    </div>
  );
}

function ThreadBodySkeleton({ backButton }: { backButton?: ReactNode }) {
  const bubbles = [
    { own: false, width: "w-3/4 max-w-md", lines: 2 },
    { own: true, width: "w-2/3 max-w-sm", lines: 2 },
    { own: false, width: "w-4/5 max-w-lg", lines: 3 },
  ];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border p-3">
        <div className="flex items-start gap-2">
          {backButton}
          <div className="min-w-0 flex-1 space-y-1.5" aria-hidden="true">
            <Skeleton className="h-5 w-2/3 max-w-md" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-hidden p-3 @min-[52rem]/discussions:p-5" aria-hidden="true">
        <div className="flex justify-center py-1">
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        {bubbles.map((bubble, index) => (
          <div key={index} className={cn("flex min-w-0 gap-2.5", bubble.own && "flex-row-reverse")}>
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className={cn("flex min-w-0 flex-1 flex-col", bubble.own ? "items-end" : "items-start")}>
              <div className={cn("space-y-2 rounded-xl border border-border bg-card px-3 py-2.5", bubble.width)}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-4 w-12 rounded" />
                  </div>
                  <Skeleton className="h-3 w-10" />
                </div>
                <div className="space-y-1.5">
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3.5 w-5/6" />
                  {bubble.lines > 2 && <Skeleton className="h-3.5 w-2/3" />}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="shrink-0 border-t border-border p-3" aria-hidden="true">
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Skeleton className="size-7 rounded-md" />
            <Skeleton className="size-7 rounded-md" />
            <Skeleton className="size-7 rounded-md" />
            <Skeleton className="size-7 rounded-md" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 flex-1 rounded-md" />
            <Skeleton className="size-8 shrink-0 rounded-md" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function DiscussionThreadSkeleton({ label, backButton }: { label?: string; backButton?: ReactNode }) {
  return (
    <div role="status" className="flex h-full min-h-0 flex-col">
      {label && <span className="sr-only">{label}</span>}
      <ThreadBodySkeleton backButton={backButton} />
    </div>
  );
}

export function DiscussionWorkspaceSkeleton({ label }: { label?: string }) {
  return (
    <div role="status" className="@container/discussions min-w-0">
      {label && <span className="sr-only">{label}</span>}
      <div className="flex h-[calc(100dvh-9rem)] min-h-[20rem] min-w-0 overflow-hidden" aria-hidden="true">
        <aside className="flex min-h-0 min-w-0 flex-1 flex-col @min-[52rem]/discussions:w-[21rem] @min-[52rem]/discussions:flex-none @min-[52rem]/discussions:border-r @min-[52rem]/discussions:border-border">
          <div className="flex shrink-0 items-center gap-1.5 border-b border-border py-1.5 @min-[52rem]/discussions:pr-3">
            <Skeleton className="h-9 flex-1 rounded-md" />
            <Skeleton className="size-8 shrink-0 rounded-md" />
            <Skeleton className="size-8 shrink-0 rounded-md" />
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <QuestionListRows count={6} />
          </div>
        </aside>
        <section className="hidden min-h-0 min-w-0 flex-1 flex-col @min-[52rem]/discussions:flex">
          <ThreadBodySkeleton />
        </section>
      </div>
    </div>
  );
}

export function DiscussionReportsSkeleton({ count = 4, label }: { count?: number; label?: string }) {
  return (
    <div role="status" className="min-w-0">
      {label && <span className="sr-only">{label}</span>}
      <div className="divide-y divide-border rounded-lg border border-border" aria-hidden="true">
        {Array.from({ length: count }).map((_, index) => (
          <div key={index} className="grid grid-cols-1 gap-2 p-3 @min-[52rem]/discussions:grid-cols-[1.2fr_1.4fr_auto_auto_auto] @min-[52rem]/discussions:items-center @min-[52rem]/discussions:gap-4">
            <Skeleton className="h-4 w-4/5" />
            <div className="space-y-1">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-44" />
            </div>
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-5 w-16 rounded-md" />
            <div className="flex gap-1">
              <Skeleton className="h-7 w-16 rounded-md" />
              <Skeleton className="h-7 w-14 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
