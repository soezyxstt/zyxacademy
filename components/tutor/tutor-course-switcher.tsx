"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, ChevronsUpDown, Check } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { cn } from "@/lib/utils";
import { SidebarTooltip } from "@/components/sidebar-shell";

export interface AssignedTutorCourse {
  courseId: string;
  title: string;
  code?: string | null;
  legacyCourseId?: string | null;
  source?: string;
  isCompatibilityFallback?: boolean;
}

interface TutorCourseSwitcherProps {
  courses: AssignedTutorCourse[];
  activeCourseId?: string;
  collapsed?: boolean;
  className?: string;
}

export function TutorCourseSwitcher({
  courses,
  activeCourseId,
  collapsed = false,
  className,
}: TutorCourseSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();

  if (!courses || courses.length === 0) {
    return null;
  }

  const currentCourse = courses.find(
    (c) => c.courseId === activeCourseId || c.legacyCourseId === activeCourseId,
  ) ?? (activeCourseId ? { courseId: activeCourseId, title: "Kelas", code: null } : courses[0]);

  const handleSelectCourse = (targetCourseId: string) => {
    if (!activeCourseId) {
      router.push(`/tutor/${targetCourseId}`);
      return;
    }

    // Preserve sub-route if navigating within known course subpages
    if (pathname.includes("/participants")) {
      router.push(`/tutor/${targetCourseId}/participants`);
    } else if (pathname.includes("/live")) {
      router.push(`/tutor/${targetCourseId}/live`);
    } else if (pathname.includes("/quizzes")) {
      router.push(`/tutor/${targetCourseId}/quizzes`);
    } else if (pathname.includes("/grading")) {
      router.push(`/tutor/${targetCourseId}/grading`);
    } else {
      router.push(`/tutor/${targetCourseId}`);
    }
  };

  if (courses.length <= 1) {
    const singleContent = collapsed ? (
      <Link
        href={`/tutor/${currentCourse.courseId}`}
        className={cn(
          "flex size-10 items-center justify-center rounded-xl hover:bg-muted text-foreground transition-colors mx-auto shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          activeCourseId ? "bg-brand-primary/10 text-brand-primary" : "text-muted-foreground",
        )}
        aria-label={currentCourse.title}
      >
        <BookOpen className="size-4.5 shrink-0" />
      </Link>
    ) : (
      <Link
        href={`/tutor/${currentCourse.courseId}`}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-xl border border-border/80 bg-muted/40 px-3 py-2 text-left hover:bg-muted transition-colors group shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        <div className="flex size-7 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary shrink-0">
          <BookOpen className="size-4" />
        </div>
        <div className="min-w-0 flex-1 text-left">
          <p className="truncate text-body-sm font-semibold text-foreground">
            {currentCourse.title}
          </p>
          <p className="truncate text-body-xs text-muted-foreground">
            {currentCourse.code ? currentCourse.code : "Kelas Aktif"}
          </p>
        </div>
      </Link>
    );

    if (collapsed) {
      return (
        <SidebarTooltip label={currentCourse.title} collapsed={collapsed}>
          {singleContent}
        </SidebarTooltip>
      );
    }
    return singleContent;
  }

  const trigger = collapsed ? (
    <button
      type="button"
      className={cn(
        "flex size-10 items-center justify-center rounded-xl hover:bg-muted text-foreground transition-colors cursor-pointer mx-auto shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        activeCourseId ? "bg-brand-primary/10 text-brand-primary" : "text-muted-foreground",
      )}
      aria-label={`Pilih Kelas (${currentCourse.title})`}
    >
      <BookOpen className="size-4.5 shrink-0" />
    </button>
  ) : (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2.5 rounded-xl border border-border/80 bg-muted/40 px-3 py-2 text-left hover:bg-muted transition-colors cursor-pointer group shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <div className="flex size-7 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary shrink-0">
        <BookOpen className="size-4" />
      </div>
      <div className="min-w-0 flex-1 text-left">
        <p className="truncate text-body-sm font-semibold text-foreground">
          {currentCourse.title}
        </p>
        <p className="truncate text-body-xs text-muted-foreground">
          {currentCourse.code ? currentCourse.code : "Kelas Aktif"}
        </p>
      </div>
      <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
    </button>
  );

  return (
    <DropdownMenu.Root>
      <SidebarTooltip label={currentCourse.title} collapsed={collapsed}>
        <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      </SidebarTooltip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side={collapsed ? "right" : "bottom"}
          align={collapsed ? "start" : "start"}
          sideOffset={8}
          className={cn(
            "z-50 min-w-60 max-w-72 overflow-hidden rounded-xl border border-border bg-popover p-1.5 shadow-xl",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[side=bottom]:slide-in-from-top-2 data-[side=right]:slide-in-from-left-2",
          )}
        >
          <div className="px-2.5 py-1.5 border-b border-border/60 mb-1">
            <p className="text-body-xs font-semibold text-muted-foreground uppercase tracking-wider font-sans">
              Pilih Kelas
            </p>
          </div>
          <div className="flex flex-col gap-0.5 max-h-64 overflow-y-auto ds-scrollbar">
            {courses.map((course) => {
              const isSelected =
                course.courseId === currentCourse.courseId ||
                (course.legacyCourseId && course.legacyCourseId === currentCourse.legacyCourseId);

              return (
                <DropdownMenu.Item
                  key={course.courseId}
                  onSelect={() => handleSelectCourse(course.courseId)}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-body-sm text-foreground outline-none transition-colors hover:bg-muted data-[highlighted]:bg-muted",
                    isSelected && "bg-brand-primary/10 text-brand-primary",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body-sm font-semibold">{course.title}</p>
                    {course.code && (
                      <p className="truncate text-body-xs text-muted-foreground">{course.code}</p>
                    )}
                  </div>
                  {isSelected && <Check className="size-4 shrink-0 text-brand-primary" />}
                </DropdownMenu.Item>
              );
            })}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
