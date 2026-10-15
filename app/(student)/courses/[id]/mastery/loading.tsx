import { CoursePageShell } from "@/components/course/course-page-shell";

export default function Loading() {
  return (
    <CoursePageShell
      title="Peta Penguasaan"

      hideHeader
    >
      <div className="space-y-8 animate-pulse">
        {[1, 2].map((groupIndex) => (
          <div key={groupIndex} className="space-y-3">
            {/* Chapter header skeleton */}
            <div className="h-5 w-48 bg-muted rounded-md mt-8 mb-2" />
            <div className="border-b border-border" />

            {/* Concept rows skeleton */}
            <div className="divide-y divide-border">
              {[1, 2, 3, 4].map((rowIndex) => (
                <div key={rowIndex} className="py-3 grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_auto] items-center gap-4">
                  {/* Name col skeleton */}
                  <div className="h-5 w-1/3 bg-muted rounded-md" />

                  {/* Bar col skeleton */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="hidden sm:block w-32 h-1.5 bg-muted rounded-md" />
                    <div className="h-5 w-6 bg-muted rounded-md" />
                  </div>

                  {/* Trend col skeleton */}
                  <div className="hidden sm:block w-5 h-5 bg-muted rounded-md" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </CoursePageShell>
  );
}
