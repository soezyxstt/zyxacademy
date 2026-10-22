import { BarChart3 } from "lucide-react";
import { CoursePageShell } from "@/components/course/course-page-shell";

export default function CourseProgressLoading() {
  return (
    <CoursePageShell
      title={<div className="h-7 w-48 bg-muted rounded-md animate-pulse" />}
      icon={BarChart3}
    >
      <div className="space-y-6 animate-pulse">
        {/* KPI stat summary cards skeleton */}
        <div className="grid gap-3 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl border border-border/60 bg-muted/30 p-4 flex flex-col justify-between">
              <div className="h-3 w-24 bg-muted rounded" />
              <div className="h-7 w-16 bg-muted rounded-md" />
            </div>
          ))}
        </div>

        {/* Progress chart / activity skeleton */}
        <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
          <div className="h-5 w-40 bg-muted rounded" />
          <div className="h-48 rounded-lg bg-muted/20 border border-border/40 flex items-center justify-center">
            <div className="h-6 w-32 bg-muted/40 rounded" />
          </div>
        </div>
      </div>
    </CoursePageShell>
  );
}
