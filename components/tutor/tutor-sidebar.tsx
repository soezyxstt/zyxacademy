"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n/client";
import {
  BookOpen,
  CalendarDays,
  Check,
  CheckSquare,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Video,
  LayoutDashboard,
  MessageSquareText,
  Radio,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NavGroup, NavItem, SidebarBackLink, SidebarTooltip } from "@/components/sidebar-shell";
import { DesktopSidebarShell } from "@/components/navigation/desktop-sidebar-shell";
import type { AssignedTutorCourse } from "@/components/tutor/tutor-course-switcher";
import { DiscussionCountBadge } from "@/components/discussions/discussion-count-badge";
import { useViewportMode } from "@/hooks/use-viewport-mode";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type { AssignedTutorCourse };

export interface TutorSidebarProps {
  assignedCourses?: AssignedTutorCourse[];
  pathnameOverride?: string;
  defaultCollapsed?: boolean;
  hideDiscussionBadges?: boolean;
}

export function TutorSidebar(props: TutorSidebarProps) {
  const viewportMode = useViewportMode();
  if (viewportMode === "mobile") {
    return null;
  }

  return <TutorSidebarContent {...props} />;
}

function resolveTutorCourseSwitchHref(pathname: string, targetCourseId: string): string {
  const suffixMap = [
    "/materials",
    "/videos",
    "/participants",
    "/discussions",
    "/quizzes/grading",
    "/quizzes",
    "/live",
    "/grading",
  ];
  for (const suffix of suffixMap) {
    if (pathname.includes(suffix)) {
      return `/tutor/${targetCourseId}${suffix}`;
    }
  }
  return `/tutor/${targetCourseId}`;
}

function TutorSidebarContent({
  assignedCourses = [],
  pathnameOverride,
  defaultCollapsed = false,
  hideDiscussionBadges = false,
}: TutorSidebarProps) {
  const t = useTranslations("tutor.navigation");
  const tDiscussion = useTranslations("tutor.schedule");
  const actualPathname = usePathname();
  const pathname = pathnameOverride ?? actualPathname;
  const router = useRouter();
  const parts = pathname.split("/").filter(Boolean);
  const courseId =
    parts[0] === "tutor" && parts[1] && !["schedule", "discussions", "docs"].includes(parts[1])
      ? parts[1]
      : undefined;
  const activeCourse = courseId
    ? assignedCourses.find(
        (course) => course.courseId === courseId || course.legacyCourseId === courseId,
      )
    : undefined;
  const activeCourseTitle = activeCourse?.title ?? courseId ?? "";
  const quizPath = courseId ? `/tutor/${courseId}/quizzes` : undefined;
  const quizGradingPath = quizPath ? `${quizPath}/grading` : undefined;
  const isQuizGradingPath = Boolean(
    quizGradingPath && (pathname === quizGradingPath || pathname.startsWith(`${quizGradingPath}/`)),
  );

  const handleSelectCourse = (targetCourseId: string) => {
    if (targetCourseId === courseId) return;
    router.push(resolveTutorCourseSwitchHref(pathname, targetCourseId));
  };

  const navContent = (collapsed: boolean) => {
    if (courseId) {
      return (
        <nav
          className={cn(
            "flex min-h-0 flex-1 flex-col gap-0.5 py-2.5 font-sans text-left",
            collapsed
              ? "items-center overflow-y-auto overflow-x-hidden px-1 sidebar-scroll-hidden"
              : "overflow-y-auto overflow-x-hidden px-3 sidebar-scroll",
          )}
        >
          <div className={cn("flex flex-col gap-1.5 pb-2 border-b border-border/60", collapsed && "w-full items-center")}>
            <SidebarBackLink
              href="/tutor"
              label={t("backToTeaching")}
              collapsed={collapsed}
            />

            {collapsed ? (
              <DropdownMenu>
                <SidebarTooltip label={`${t("switchCourse")}: ${activeCourseTitle}`} collapsed={true}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`${t("switchCourse")}: ${activeCourseTitle}`}
                      className="flex size-10 items-center justify-center rounded-lg border border-border/70 bg-muted/30 text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                    >
                      <BookOpen className="size-4" />
                    </button>
                  </DropdownMenuTrigger>
                </SidebarTooltip>
                <DropdownMenuContent align="start" side="right" sideOffset={8} className="w-64 min-w-56 p-1">
                  <DropdownMenuLabel>{t("switchCourse")}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <div className="max-h-64 overflow-y-auto space-y-0.5">
                    {assignedCourses.map((course) => {
                      const isCurrent = course.courseId === courseId || course.legacyCourseId === courseId;
                      return (
                        <DropdownMenuItem
                          key={course.courseId}
                          onSelect={() => handleSelectCourse(course.courseId)}
                          className={cn(
                            "flex items-center justify-between gap-2 cursor-pointer text-body-sm",
                            isCurrent && "bg-brand-primary/10 text-brand-primary",
                          )}
                        >
                          <span className="truncate">{course.title}</span>
                          {isCurrent && <Check className="size-3.5 shrink-0 text-brand-primary" />}
                        </DropdownMenuItem>
                      );
                    })}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : assignedCourses.length > 1 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`${t("switchCourse")}: ${activeCourseTitle}`}
                    className="group flex w-full items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/30 px-2.5 py-2 text-left transition-colors hover:border-border hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <BookOpen className="size-4 shrink-0 text-brand-primary" />
                      <span className="truncate font-heading text-body-sm font-semibold leading-tight text-foreground">
                        {activeCourseTitle}
                      </span>
                    </span>
                    <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" sideOffset={4} className="w-60 min-w-52 p-1">
                  <DropdownMenuLabel>{t("switchCourse")}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <div className="max-h-64 overflow-y-auto space-y-0.5">
                    {assignedCourses.map((course) => {
                      const isCurrent = course.courseId === courseId || course.legacyCourseId === courseId;
                      return (
                        <DropdownMenuItem
                          key={course.courseId}
                          onSelect={() => handleSelectCourse(course.courseId)}
                          className={cn(
                            "flex items-center justify-between gap-2 cursor-pointer text-body-sm",
                            isCurrent && "bg-brand-primary/10 text-brand-primary",
                          )}
                        >
                          <span className="truncate">{course.title}</span>
                          {isCurrent && <Check className="size-3.5 shrink-0 text-brand-primary" />}
                        </DropdownMenuItem>
                      );
                    })}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="flex w-full items-center gap-2 rounded-lg border border-border/70 bg-muted/30 px-2.5 py-2">
                <BookOpen className="size-4 shrink-0 text-brand-primary" />
                <span className="truncate font-heading text-body-sm font-semibold leading-tight text-foreground">
                  {activeCourseTitle}
                </span>
              </div>
            )}
          </div>

          <div className={cn("flex flex-col gap-0.5 pt-1", collapsed && "w-full items-center")}>
            {!collapsed ? (
              <div className="px-2.5 pt-1.5 pb-1">
                <p className="text-body-2xs font-semibold tracking-wider text-muted-foreground/80 uppercase font-sans truncate">
                  {t("groupClass")}
                </p>
              </div>
            ) : null}

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
              href={`/tutor/${courseId}/discussions`}
              icon={MessageSquareText}
              label={tDiscussion("discussion")}
              active={pathname === `/tutor/${courseId}/discussions` || pathname.startsWith(`/tutor/${courseId}/discussions/`)}
              badge={hideDiscussionBadges ? undefined : <DiscussionCountBadge courseId={courseId} />}
              collapsed={collapsed}
            />

            <NavGroup label={t("groupEvaluation")} collapsed={collapsed} />

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
          </div>

          <div className="flex-1" />

          <NavItem
            href="/tutor/docs"
            icon={BookOpen}
            label={t("docs")}
            active={pathname === "/tutor/docs" || pathname.startsWith("/tutor/docs/")}
            collapsed={collapsed}
          />
        </nav>
      );
    }

    return (
      <nav
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-0.5 py-3 font-sans text-left",
          collapsed
            ? "items-center overflow-y-auto overflow-x-hidden px-1 sidebar-scroll-hidden"
            : "overflow-y-auto overflow-x-hidden px-3 sidebar-scroll",
        )}
      >
        <div className={cn("flex flex-col gap-0.5 w-full", collapsed && "items-center")}>
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

          <NavItem
            href="/tutor/discussions"
            icon={MessageSquareText}
            label={tDiscussion("discussion")}
            active={pathname === "/tutor/discussions" || pathname.startsWith("/tutor/discussions/")}
            badge={hideDiscussionBadges ? undefined : <DiscussionCountBadge />}
            collapsed={collapsed}
          />
        </div>

        <NavGroup label={t("teaching")} collapsed={collapsed} />

        {collapsed ? (
          assignedCourses.slice(0, 5).map((course) => (
            <NavItem
              key={course.courseId}
              href={`/tutor/${course.courseId}`}
              icon={BookOpen}
              label={course.title}
              active={false}
              collapsed={true}
            />
          ))
        ) : (
          <div className="flex flex-col gap-0.5 w-full">
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
                  active={false}
                  collapsed={false}
                />
              ))
            )}
          </div>
        )}

        <div className="flex-1" />

        <NavItem
          href="/tutor/docs"
          icon={BookOpen}
          label={t("docs")}
          active={pathname === "/tutor/docs" || pathname.startsWith("/tutor/docs/")}
          collapsed={collapsed}
        />
      </nav>
    );
  };

  return (
    <DesktopSidebarShell
      collapsedKey="tutor-sidebar-collapsed"
      logoHref="/tutor"
      logoLabel="Panel Pengajar Zyx Academy"
      nav={navContent}
      defaultCollapsed={defaultCollapsed}
    />
  );
}
