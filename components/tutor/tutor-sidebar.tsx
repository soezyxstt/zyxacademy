"use client";

import { usePathname } from "next/navigation";
import {
  GraduationCap,
  CalendarDays,
  LayoutDashboard,
  Users,
  ClipboardList,
  ClipboardCheck,
  Radio,
  CheckSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SidebarShell, NavItem } from "@/components/sidebar-shell";
import {
  TutorCourseSwitcher,
  type AssignedTutorCourse,
} from "@/components/tutor/tutor-course-switcher";

export type { AssignedTutorCourse };

export interface TutorSidebarProps {
  assignedCourses?: AssignedTutorCourse[];
}

export function TutorSidebar({ assignedCourses = [] }: TutorSidebarProps) {
  const pathname = usePathname();

  // Active course detection strictly from /tutor/:courseId (excluding /tutor/schedule)
  const parts = pathname.split("/").filter(Boolean);
  let courseId: string | undefined = undefined;
  if (parts[0] === "tutor" && parts[1] && parts[1] !== "schedule") {
    courseId = parts[1];
  }

  const quizPath = courseId ? `/tutor/${courseId}/quizzes` : undefined;
  const quizGradingPath = quizPath ? `${quizPath}/grading` : undefined;
  const isQuizGradingPath =
    quizGradingPath !== undefined &&
    (pathname === quizGradingPath || pathname.startsWith(`${quizGradingPath}/`));

  const navContent = (c: boolean) => {
    return (
      <nav
        className={cn(
          "flex flex-1 flex-col gap-1 py-4 font-sans text-left",
          c
            ? "px-1 items-center overflow-y-hidden sidebar-scroll-hidden"
            : "px-3 overflow-y-auto overflow-x-hidden sidebar-scroll",
        )}
      >
        <NavItem
          href="/tutor"
          icon={GraduationCap}
          label="Pengajaran"
          active={pathname === "/tutor"}
          collapsed={c}
        />

        <NavItem
          href="/tutor/schedule"
          icon={CalendarDays}
          label="Jadwal"
          active={pathname === "/tutor/schedule" || pathname.startsWith("/tutor/schedule/")}
          collapsed={c}
        />

        {courseId && (
          <>
            {!c && (
              <>
                <div className="h-px bg-border/50 my-3 shrink-0 w-full" />
                <div className="mb-1">
                  <TutorCourseSwitcher
                    courses={assignedCourses}
                    activeCourseId={courseId}
                    collapsed={c}
                  />
                </div>
                <p className="px-3 py-1 text-body-xs font-bold uppercase tracking-wider text-muted-foreground font-sans">
                  Navigasi Kelas
                </p>
              </>
            )}
            {c && (
              <>
                <div className="h-px bg-border/50 my-2 shrink-0 w-full" />
                <TutorCourseSwitcher
                  courses={assignedCourses}
                  activeCourseId={courseId}
                  collapsed={c}
                />
              </>
            )}

            <NavItem
              href={`/tutor/${courseId}`}
              icon={LayoutDashboard}
              label="Ringkasan"
              active={pathname === `/tutor/${courseId}`}
              collapsed={c}
            />

            <NavItem
              href={`/tutor/${courseId}/participants`}
              icon={Users}
              label="Peserta & Kelompok"
              active={
                pathname === `/tutor/${courseId}/participants` ||
                pathname.startsWith(`/tutor/${courseId}/participants/`)
              }
              collapsed={c}
            />

            <NavItem
              href={`/tutor/${courseId}/quizzes`}
              icon={ClipboardList}
              label="Kuis"
              active={
                pathname === quizPath ||
                (quizPath !== undefined &&
                  pathname.startsWith(`${quizPath}/`) &&
                  !isQuizGradingPath)
              }
              collapsed={c}
            />

            <NavItem
              href={`/tutor/${courseId}/quizzes/grading`}
              icon={ClipboardCheck}
              label="Penilaian Kuis"
              active={isQuizGradingPath}
              collapsed={c}
            />

            <NavItem
              href={`/tutor/${courseId}/live`}
              icon={Radio}
              label="Kuis Langsung"
              active={
                pathname === `/tutor/${courseId}/live` ||
                pathname.startsWith(`/tutor/${courseId}/live/`)
              }
              collapsed={c}
            />

            <NavItem
              href={`/tutor/${courseId}/grading`}
              icon={CheckSquare}
              label="Penilaian Tryout"
              active={
                pathname === `/tutor/${courseId}/grading` ||
                pathname.startsWith(`/tutor/${courseId}/grading/`)
              }
              collapsed={c}
            />
          </>
        )}

        <div className="flex-1" />
      </nav>
    );
  };

  return (
    <SidebarShell
      collapsedKey="tutor-sidebar-collapsed"
      logoHref="/tutor"
      logoLabel="Panel Pengajar Zyx Academy"
      nav={navContent}
    />
  );
}
