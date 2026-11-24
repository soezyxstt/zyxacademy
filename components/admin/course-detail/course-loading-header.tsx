import { Skeleton } from "@/components/ui/skeleton";

export function CourseLoadingHeader() {
  return (
    <div className="flex items-center justify-end gap-2 border-b border-border/60 pb-1">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-3 w-12" />
      <Skeleton className="size-8" />
    </div>
  );
}
