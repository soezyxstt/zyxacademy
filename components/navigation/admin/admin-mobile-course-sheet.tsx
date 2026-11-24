"use client";

import { useMemo, useState } from "react";
import { BookOpen, Check, Search, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { hapticMedium } from "@/lib/native/haptics";
import { closeDialogsThen } from "@/hooks/use-dialog-history";
import type { AdminCourseSummary } from "./admin-nav-model";

export interface AdminMobileCourseSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  searchPlaceholder: string;
  emptyLabel: string;
  courses: AdminCourseSummary[];
  activeCourseSlug?: string | null;
  onSelectCourse: (courseSlug: string) => void;
}

export function AdminMobileCourseSheet({
  open,
  onOpenChange,
  title,
  searchPlaceholder,
  emptyLabel,
  courses,
  activeCourseSlug,
  onSelectCourse,
}: AdminMobileCourseSheetProps) {
  const [query, setQuery] = useState("");

  const filteredCourses = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return courses;
    return courses.filter(
      (course) =>
        course.title.toLowerCase().includes(trimmed) ||
        course.id.toLowerCase().includes(trimmed) ||
        (course.slug?.toLowerCase().includes(trimmed) ?? false) ||
        (course.category?.toLowerCase().includes(trimmed) ?? false)
    );
  }, [courses, query]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setQuery("");
    }
    onOpenChange(nextOpen);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="flex max-h-[80svh] flex-col gap-0 rounded-t-2xl p-0 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]"
      >
        <SheetHeader className="shrink-0 border-b border-border/70 px-4 py-3.5 text-left">
          <SheetTitle className="pr-8 font-heading text-body-base font-semibold">
            {title}
          </SheetTitle>
        </SheetHeader>

        <div className="shrink-0 border-b border-border/60 px-3 py-2.5">
          <div className="relative flex items-center">
            <Search
              className="pointer-events-none absolute left-3 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="h-11 w-full rounded-xl border-border bg-muted/40 pl-9 pr-10 text-body-sm"
            />
            {query ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-1 size-9 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {filteredCourses.length === 0 ? (
            <p className="px-3 py-6 text-center text-body-sm text-muted-foreground">
              {emptyLabel}
            </p>
          ) : (
            <div className="divide-y divide-border/50">
              {filteredCourses.map((course) => {
                const targetSlug = course.slug || course.id;
                const isCurrent =
                  Boolean(activeCourseSlug) &&
                  (course.id === activeCourseSlug ||
                    course.slug === activeCourseSlug);

                return (
                  <button
                    key={course.id}
                    type="button"
                    onClick={() => {
                      void hapticMedium();
                      closeDialogsThen(
                        () => handleOpenChange(false),
                        () => onSelectCourse(targetSlug)
                      );
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
                        {course.category ? (
                          <span className="block truncate text-body-xs text-muted-foreground">
                            {course.category}
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
