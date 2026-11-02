"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "@/lib/i18n/client";
import {
  BookOpen,
  CalendarDays,
  CheckSquare,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Video,
  GraduationCap,
  LayoutDashboard,
  Radio,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NavCollapsible, NavItem, SidebarShell } from "@/components/sidebar-shell";
import type { AssignedTutorCourse } from "@/components/tutor/tutor-course-switcher";

export type { AssignedTutorCourse };

export interface TutorSidebarProps {
  assignedCourses?: AssignedTutorCourse[];
}

export function TutorSidebar({ assignedCourses = [] }: TutorSidebarProps) {
  const t = useTranslations("tutor.navigation");
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  const courseId = parts[0] === "tutor" && parts[1] && parts[1] !== "schedule"
    ? parts[1]
    : undefined;
  const isCourseRoute = Boolean(courseId);
  const quizPath = courseId ? `/tutor/${courseId}/quizzes` : undefined;
  const quizGradingPath = quizPath ? `${quizPath}/grading` : undefined;
  const isQuizGradingPath = Boolean(
    quizGradingPath && (pathname === quizGradingPath || pathname.startsWith(`${quizGradingPath}/`)),
  );

  const navContent = (collapsed: boolean) => (
    <nav
      className={cn(
        "flex flex-1 flex-col gap-1 py-4 font-sans text-left",
        collapsed
          ? "items-center overflow-y-hidden px-1 sidebar-scroll-hidden"
          : "overflow-y-auto overflow-x-hidden px-3 sidebar-scroll",
      )}
    >
      <NavItem
        href="/tutor"
        icon={LayoutDashboard}
        label={t("dashboard")}
        active={pathname === "/tutor"}
        collapsed={collapsed}
      />

      <NavItem
        href="/tutor/schedule"
        icon={CalendarDays}
        label={t("schedule")}
        active={pathname === "/tutor/schedule" || pathname.startsWith("/tutor/schedule/")}
        collapsed={collapsed}
      />

      <NavCollapsible
        id="tutor-teaching"
        icon={GraduationCap}
        label={t("teaching")}
        active={isCourseRoute}
        defaultOpen={isCourseRoute}
        collapsed={collapsed}
        previewItems={assignedCourses.slice(0, 5).map((course) => course.title)}
      >
        {assignedCourses.length === 0 ? (
          <NavItem
            icon={BookOpen}
            label={t("noCourses")}
            collapsed={false}
            className="pointer-events-none opacity-60"
          />
        ) : (
          assignedCourses.map((course) => (
            <NavItem
              key={course.courseId}
              href={`/tutor/${course.courseId}`}
              icon={BookOpen}
              label={course.title}
              active={courseId === course.courseId || courseId === course.legacyCourseId}
              collapsed={false}
              isChild
            />
          ))
        )}
      </NavCollapsible>

      {courseId ? (
        <>
          {!collapsed ? (
            <div className="px-2.5 pb-1 pt-3">
              <p className="text-body-xs font-semibold text-muted-foreground">
                Navigasi kelas
              </p>
            </div>
          ) : (
            <div className="my-1.5 w-5 border-t border-border/60" />
          )}

          <NavItem
            href={`/tutor/${courseId}`}
            icon={LayoutDashboard}
            label={t("overview")}
            active={pathname === `/tutor/${courseId}`}
            collapsed={collapsed}
          />
          <NavItem
            href={`/tutor/${courseId}/materials`}
            icon={FileText}
            label={t("documents")}
            active={pathname === `/tutor/${courseId}/materials` || pathname.startsWith(`/tutor/${courseId}/materials/`)}
            collapsed={collapsed}
          />
          <NavItem
            href={`/tutor/${courseId}/videos`}
            icon={Video}
            label={t("videos")}
            active={pathname === `/tutor/${courseId}/videos` || pathname.startsWith(`/tutor/${courseId}/videos/`)}
            collapsed={collapsed}
          />
          <NavItem
            href={`/tutor/${courseId}/participants`}
            icon={Users}
            label={t("participants")}
            active={pathname === `/tutor/${courseId}/participants` || pathname.startsWith(`/tutor/${courseId}/participants/`)}
            collapsed={collapsed}
          />
          <NavItem
            href={`/tutor/${courseId}/quizzes`}
            icon={ClipboardList}
            label={t("quizzes")}
            active={Boolean(quizPath && pathname.startsWith(quizPath) && !isQuizGradingPath)}
            collapsed={collapsed}
          />
          <NavItem
            href={`/tutor/${courseId}/quizzes/grading`}
            icon={ClipboardCheck}
            label={t("quizGrading")}
            active={isQuizGradingPath}
            collapsed={collapsed}
          />
          <NavItem
            href={`/tutor/${courseId}/live`}
            icon={Radio}
            label={t("liveQuiz")}
            active={pathname === `/tutor/${courseId}/live` || pathname.startsWith(`/tutor/${courseId}/live/`)}
            collapsed={collapsed}
          />
          <NavItem
            href={`/tutor/${courseId}/grading`}
            icon={CheckSquare}
            label={t("tryoutGrading")}
            active={pathname === `/tutor/${courseId}/grading` || pathname.startsWith(`/tutor/${courseId}/grading/`)}
            collapsed={collapsed}
          />
        </>
      ) : null}

      <div className="flex-1" />
    </nav>
  );

  return (
    <SidebarShell
      collapsedKey="tutor-sidebar-collapsed"
      logoHref="/tutor"
      logoLabel="Panel Pengajar Zyx Academy"
      nav={navContent}
    />
  );
}
