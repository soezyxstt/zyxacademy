import { Skeleton } from "@/components/ui/skeleton";

export default function SchedulesLoading() {
  return (
    <div role="status" aria-label="Memuat" className="space-y-3">
      <div className="space-y-3 md:hidden" aria-hidden="true">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="size-9 rounded-lg" />
        </div>
        <div className="divide-y divide-border/50 border-t border-border/50">
          {[1, 2, 3, 4].map((row) => (
            <div key={row} className="space-y-2 py-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-2/5" />
            </div>
          ))}
        </div>
      </div>
      <div className="hidden space-y-3 md:block" aria-hidden="true">
        <div className="flex items-center gap-3 border-b border-border pb-4"><Skeleton className="size-9" /><Skeleton className="h-7 w-44" /></div>
        <div className="flex flex-wrap items-center gap-2"><Skeleton className="h-10 w-96 max-w-full" /><Skeleton className="h-9 w-36" /><Skeleton className="h-9 w-28" /></div>
        <Skeleton className="h-10 w-full" />
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex justify-between border-b border-border p-3"><Skeleton className="h-8 w-32" /><Skeleton className="h-8 w-24" /></div>
          <div className="grid grid-cols-7 divide-x divide-border">
            {Array.from({ length: 7 }, (_, i) => <div key={i} className="space-y-4 p-2"><Skeleton className="mx-auto h-4 w-full max-w-16" /><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>)}
          </div>
        </div>
      </div>
    </div>
  );
}
