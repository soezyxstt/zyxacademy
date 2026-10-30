import { BookOpen } from "lucide-react";
import { CoursePageShell } from "@/components/course/course-page-shell";

export default function CourseLoading() {
  return (
    <CoursePageShell
      title={<div className="h-7 w-48 bg-muted rounded-md animate-pulse" />}
      icon={BookOpen}
      maxWidth="7xl"
      hideMobileTitle
    >
      <div className="space-y-6 animate-pulse">
        {/* Primary learning actions skeleton */}
        <div className="grid gap-3 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-xl border border-border/60 bg-muted/30 p-4 flex flex-col justify-between">
              <div className="flex items-center gap-2">
                <div className="size-8 rounded-lg bg-muted" />
                <div className="h-4 w-24 bg-muted rounded" />
              </div>
              <div className="h-3 w-16 bg-muted/60 rounded" />
            </div>
          ))}
        </div>

        {/* Attention strip skeleton */}
        <div className="h-16 rounded-xl border border-border/40 bg-muted/20 p-4 flex items-center justify-between">
          <div className="h-4 w-64 bg-muted rounded" />
          <div className="h-8 w-24 bg-muted rounded-lg" />
        </div>

        {/* Syllabus / Chapters skeleton */}
        <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
          <div className="h-5 w-36 bg-muted rounded" />
          <div className="space-y-3 pt-2">
            {[1, 2, 3].map((chapter) => (
              <div key={chapter} className="rounded-lg border border-border/40 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="h-4 w-40 bg-muted rounded" />
                  <div className="h-4 w-12 bg-muted/60 rounded" />
                </div>
                <div className="space-y-1.5 pt-1">
                  <div className="h-3.5 w-3/4 bg-muted/40 rounded" />
                  <div className="h-3.5 w-1/2 bg-muted/40 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </CoursePageShell>
  );
}
