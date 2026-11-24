import { Skeleton } from "@/components/ui/skeleton";

export default function PkaSchedulesLoading() {
  return (
    <div role="status" aria-label="Memuat" className="min-w-0 space-y-(--related-gap)">
      <Skeleton className="h-9 w-80 max-w-full" />
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="size-9" />
      </div>
      <div className="divide-y divide-border/60 border-y border-border/60">
        {[0, 1, 2, 3, 4].map((index) => (
          <div key={index} className="flex min-w-0 items-start gap-2 py-(--row-padding)">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-40 max-w-full" />
              <Skeleton className="h-3 w-48 max-w-full" />
            </div>
            <Skeleton className="size-8 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
