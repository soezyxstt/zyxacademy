import { CoursePageShell } from "@/components/course/course-page-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function CourseLoading() {
  return (
    <CoursePageShell title={<Skeleton className="h-7 w-48" />}>
      <div role="status" aria-label="Memuat" className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    </CoursePageShell>
  );
}
