import { CourseLoadingHeader } from "@/components/admin/course-detail/course-loading-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function CourseFlashcardsLoading() {
  return (
    <div role="status" aria-label="Memuat" className="min-w-0 space-y-(--compact-gap)">
      <CourseLoadingHeader />
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="size-9" />
        <Skeleton className="h-9 w-24" />
        <Skeleton className="ml-auto size-9" />
      </div>
      <div className="divide-y divide-border/60 border-y border-border/60">
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex items-start gap-2 py-(--row-padding)">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-48 max-w-full" />
              <Skeleton className="h-3 w-28 max-w-full" />
            </div>
            <Skeleton className="size-8 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
