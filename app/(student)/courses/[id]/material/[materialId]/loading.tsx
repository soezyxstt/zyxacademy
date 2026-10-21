import { CoursePageShell } from "@/components/course/course-page-shell";

export default function MaterialReaderLoading() {
  return (
    <CoursePageShell hideHeader maxWidth="7xl">
      <div className="space-y-6 animate-pulse max-w-4xl mx-auto py-4">
        {/* Navigation / Back header skeleton */}
        <div className="flex items-center justify-between pb-4 border-b border-border/40">
          <div className="h-8 w-32 rounded-lg bg-muted/60" />
          <div className="flex items-center gap-2">
            <div className="h-8 w-20 rounded-lg bg-muted/40" />
            <div className="h-8 w-8 rounded-lg bg-muted/40" />
          </div>
        </div>

        {/* Article title & meta skeleton */}
        <div className="space-y-3 pt-2">
          <div className="h-4 w-28 rounded bg-muted/60" />
          <div className="h-8 w-3/4 rounded-lg bg-muted" />
          <div className="h-4 w-40 rounded bg-muted/40" />
        </div>

        {/* Article body content skeleton */}
        <div className="space-y-4 pt-4">
          <div className="h-4 w-full rounded bg-muted/40" />
          <div className="h-4 w-11/12 rounded bg-muted/40" />
          <div className="h-4 w-4/5 rounded bg-muted/40" />

          <div className="h-6 w-1/3 rounded bg-muted pt-2" />

          <div className="h-4 w-full rounded bg-muted/40" />
          <div className="h-4 w-5/6 rounded bg-muted/40" />
          <div className="h-32 w-full rounded-xl border border-border/40 bg-muted/20" />

          <div className="h-4 w-full rounded bg-muted/40" />
          <div className="h-4 w-3/4 rounded bg-muted/40" />
        </div>
      </div>
    </CoursePageShell>
  );
}
