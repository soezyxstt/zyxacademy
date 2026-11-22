import { Skeleton } from "@/components/ui/skeleton";

export function FormsBuilderSkeleton() {
  return (
    <div role="status" aria-label="Memuat" className="space-y-4">
      <Skeleton className="h-10 w-full" />
      <div className="mx-auto max-w-3xl space-y-4 pt-2">
        <div className="flex items-center justify-between gap-2 md:pr-14">
          <Skeleton className="h-4 w-24" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-9 rounded-md" />
            <Skeleton className="h-9 w-28 rounded-md" />
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="flex-1 divide-y divide-border border-t-2 border-t-primary/40 border-b border-border">
            <div className="space-y-3 py-5">
              <Skeleton className="h-7 w-2/3" />
              <Skeleton className="h-4 w-3/4" />
              <div className="flex gap-3 pt-1">
                <Skeleton className="h-9 w-40" />
                <Skeleton className="h-9 w-44" />
              </div>
            </div>
            {[0, 1].map((i) => (
              <div key={i} className="space-y-3 py-5">
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ))}
          </div>
          <div className="hidden md:flex flex-col gap-1.5 rounded-xl border border-border bg-card p-1.5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="size-9 rounded-md" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
