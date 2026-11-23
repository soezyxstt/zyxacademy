"use client";

import Link from "next/link";
import { BookOpen, Check, Search } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { StudentCourseSummary } from "./student-nav-model";

export interface StudentMobileCourseSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  courses: StudentCourseSummary[];
  activeCourseId?: string;
  onSelectCourse: (courseId: string) => void;
  exploreHref?: string;
  exploreLabel?: string;
}

export function StudentMobileCourseSheet({
  open,
  onOpenChange,
  title,
  courses,
  activeCourseId,
  onSelectCourse,
  exploreHref,
  exploreLabel,
}: StudentMobileCourseSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[75svh] gap-0 rounded-t-2xl p-0 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]"
      >
        <SheetHeader className="border-b border-border/70 px-4 py-3.5 text-left">
          <SheetTitle className="pr-8 font-heading text-body-base font-semibold">
            {title}
          </SheetTitle>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          <div className="divide-y divide-border/50">
            {courses.map((course) => {
              const isCurrent = course.id === activeCourseId;
              return (
                <button
                  key={course.id}
                  type="button"
                  onClick={() => {
                    onOpenChange(false);
                    onSelectCourse(course.id);
                  }}
                  aria-current={isCurrent ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-body-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isCurrent
                      ? "bg-primary/10 text-primary"
                      : "text-foreground hover:bg-muted/60"
                  )}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2.5">
                    <BookOpen
                      className={cn(
                        "size-4 shrink-0",
                        isCurrent ? "text-primary" : "text-muted-foreground"
                      )}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {course.title}
                    </span>
                  </span>
                  {isCurrent ? (
                    <Check
                      className="size-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                  ) : null}
                </button>
              );
            })}
          </div>

          {exploreHref && exploreLabel ? (
            <div className="mt-2 border-t border-border/70 pt-2">
              <Link
                href={exploreHref}
                onClick={() => onOpenChange(false)}
                className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-body-sm text-brand-secondary transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Search className="size-4 shrink-0" aria-hidden="true" />
                <span>{exploreLabel}</span>
              </Link>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
