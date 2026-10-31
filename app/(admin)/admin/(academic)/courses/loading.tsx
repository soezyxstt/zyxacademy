import { Skeleton } from "@/components/ui/skeleton";

export default function CoursesLoading() {
  return (
    <div role="status" aria-label="Memuat" className="space-y-6">
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <Skeleton className="size-9 shrink-0" />
        <Skeleton className="h-7 w-40" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 min-w-[140px] max-w-sm flex-1" />
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-20" />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((item) => (
          <div key={item} className="space-y-3 rounded-xl border border-border bg-card p-4">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <div className="grid grid-cols-3 gap-2 border-y border-border py-3">
              {[0, 1, 2].map((stat) => <Skeleton key={stat} className="h-8 w-full" />)}
            </div>
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
