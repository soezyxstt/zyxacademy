"use client";

import { BookOpen, Check } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { TutorCourseSummary } from "./tutor-nav-model";

export interface TutorMobileCourseSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  emptyLabel: string;
  courses: TutorCourseSummary[];
  activeCourseId?: string;
  onSelectCourse: (courseId: string) => void;
}

export function TutorMobileCourseSheet({
  open,
  onOpenChange,
  title,
  emptyLabel,
  courses,
  activeCourseId,
  onSelectCourse,
}: TutorMobileCourseSheetProps) {
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
          {courses.length === 0 ? (
            <p className="px-3 py-6 text-center text-body-sm text-muted-foreground">
              {emptyLabel}
            </p>
          ) : (
            <div className="divide-y divide-border/50">
              {courses.map((course) => {
                const isCurrent =
                  Boolean(activeCourseId) &&
                  (course.courseId === activeCourseId ||
                    course.legacyCourseId === activeCourseId);

                return (
                  <button
                    key={course.courseId}
                    type="button"
                    onClick={() => {
                      onOpenChange(false);
                      onSelectCourse(course.courseId);
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
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{course.title}</span>
                        {course.code ? (
                          <span className="block truncate text-body-xs text-muted-foreground">
                            {course.code}
                          </span>
                        ) : null}
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
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
