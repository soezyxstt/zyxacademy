import { FileText } from "lucide-react";
import { CoursePageShell } from "@/components/course/course-page-shell";

export default function CourseMaterialLoading() {
  return (
    <CoursePageShell
      title={<div className="h-7 w-48 bg-muted rounded-md animate-pulse" />}
      icon={FileText}
    >
      <div className="space-y-6 animate-pulse">
        {/* Tab strip skeleton */}
        <div className="flex items-center gap-2 border-b border-border/60 pb-3">
          <div className="h-8 w-24 rounded-lg bg-muted" />
          <div className="h-8 w-24 rounded-lg bg-muted/50" />
          <div className="h-8 w-24 rounded-lg bg-muted/50" />
        </div>

        {/* Filter / Search toolbar skeleton */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="h-9 w-64 rounded-xl border border-border/60 bg-muted/30" />
          <div className="flex items-center gap-2">
            <div className="h-9 w-36 rounded-xl border border-border/60 bg-muted/30" />
            <div className="h-9 w-28 rounded-xl border border-border/60 bg-muted/30" />
          </div>
        </div>

        {/* Material item rows skeleton */}
        <div className="divide-y divide-border/60 rounded-xl border border-border/60 bg-card overflow-hidden">
          {[1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="flex items-center justify-between p-4 gap-4">
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <div className="size-9 rounded-lg bg-muted shrink-0" />
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="h-4 w-1/2 bg-muted rounded" />
                  <div className="h-3 w-1/4 bg-muted/60 rounded" />
                </div>
              </div>
              <div className="h-8 w-20 rounded-lg bg-muted/40 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </CoursePageShell>
  );
}
