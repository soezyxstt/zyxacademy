import { Skeleton } from "@/components/ui/skeleton";

export default function CoursesLoading() {
  return (
    <div role="status" aria-label="Memuat" className="@container/courses min-w-0 space-y-(--related-gap)">
      <div className="flex items-center gap-2">
        <Skeleton className="size-9" />
        <Skeleton className="h-9 w-28" />
        <Skeleton className="ml-auto h-9 w-20" />
      </div>
      <div className="grid grid-cols-1 gap-x-(--related-gap) divide-y divide-border/60 border-y border-border/60 @min-[32rem]/courses:grid-cols-2 @min-[32rem]/courses:divide-y-0 @min-[49rem]/courses:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((item) => (
          <div key={item} className="flex min-w-0 items-start gap-2 py-(--row-padding) @min-[32rem]/courses:border-b @min-[32rem]/courses:border-border/60">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-3/5" />
            </div>
            <Skeleton className="size-8 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
