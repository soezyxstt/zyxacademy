"use client";

import { useMemo } from "react";
import { useStudentSidebarData } from "@/hooks/use-student-sidebar-data";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  Code2,
  Check,
  ChevronDown,
  LayoutDashboard,
  CalendarRange,
  Trophy,
  Medal,
  PawPrint,
  Compass,
  FileText,
  Video,
  Brain,
  ClipboardList,
  GraduationCap,
  Play,
  Target,
  History,
  Flame,
  Search,
  BarChart3,
  Users,
  MessageSquareText,
} from "lucide-react";
import { DiscussionCountBadge } from "@/components/discussions/discussion-count-badge";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import { StudentAccountBoundary } from "@/components/student-account-boundary";
import { useStudentExperience } from "@/components/student-experience-provider";
import { cn } from "@/lib/utils";
import { StudentNavigationItems, type StudentNavigationItem } from "@/components/student-navigation-items";
import { NavGroup, NavItem, SidebarBackLink, SidebarTooltip } from "@/components/sidebar-shell";
import { useStudentTabLinkOptions } from "@/components/navigation/student/student-tab-reuse";
import { DesktopSidebarShell } from "@/components/navigation/desktop-sidebar-shell";
import { StreakCalendarStrip } from "@/components/dashboard/streak-calendar-strip";
import { useViewportMode } from "@/hooks/use-viewport-mode";
import { useTranslations } from "@/lib/i18n/client";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface StudentSidebarProps {
  showStudyPath?: boolean;
  showMastery?: boolean;
  showLive?: boolean;
  defaultCollapsed?: boolean;
}

export function StudentSidebar(props: StudentSidebarProps) {
  const viewportMode = useViewportMode();
  if (viewportMode === "mobile") {
    return null;
  }
  return <StudentAccountBoundary>{({ data }) => <StudentSidebarContent {...props} session={data} />}</StudentAccountBoundary>;
}

function StudentSidebarContent({
  showStudyPath = false,
  showMastery = false,
  showLive = false,
  defaultCollapsed = false,
  session,
}: StudentSidebarProps & { session: { user: { id: string; role?: string | null } } | null }) {
  const t = useTranslations("student");
  const tDiscussion = useTranslations("tutor.schedule");
  const experience = useStudentExperience();
  const actualPathname = usePathname();
  const pathname = experience.pathname ?? actualPathname;
  const href = experience.href ?? ((path: string) => path);
  const demo = experience.mode === "demo";
  const router = useRouter();
  const optionsFor = useStudentTabLinkOptions();
  const courseIdFromPath = pathname.startsWith("/courses/")
    ? pathname.split("/")[2]
    : undefined;

  // Route context is authoritative for the sidebar mode. Keep /dashboard/schedule
  // in global mode so schedule never traps users inside course navigation.
  const activeCourseId = courseIdFromPath;

  const userId = session?.user?.id;
  const liveData = useStudentSidebarData({ userId, activeCourseId, pathname, enabled: !demo });
  const enrolledCourses = useMemo(
    () => (demo ? experience.courses ?? [] : experience.offlineCourses ?? liveData.courses),
    [demo, experience.courses, experience.offlineCourses, liveData.courses]
  );
  const activeCourseMetadata = demo
    ? enrolledCourses.find((course) => course.id === activeCourseId)
    : liveData.activeCourse;
  const streakCurrent = demo ? experience.streak?.current ?? 0 : liveData.streak;
  const weeklyActivity = demo ? experience.streak?.weeklyActivity ?? [] : liveData.weeklyActivity;

  const coursesToDisplay = useMemo(() => {
    const list: Array<{ id: string; title: string }> = [];
    const seen = new Set<string>();

    for (const course of enrolledCourses) {
      if (!seen.has(course.id)) {
        seen.add(course.id);
        list.push({ id: course.id, title: course.title });
      }
    }

    if (activeCourseId && !seen.has(activeCourseId)) {
      list.unshift({
        id: activeCourseId,
        title: activeCourseMetadata?.title ?? t("navigation.loadingCourse"),
      });
    }

    return list;
  }, [enrolledCourses, activeCourseId, activeCourseMetadata, t]);

  const handleSelectCourse = (targetCourseId: string) => {
    if (targetCourseId === activeCourseId) return;

    if (courseIdFromPath) {
      const currentBase = `/courses/${courseIdFromPath}`;
      if (pathname.startsWith(currentBase)) {
        const rest = pathname.slice(currentBase.length);
        const segment = rest.split("/").filter(Boolean)[0];
        const commonSegments = ["material", "quiz", "flashcard", "leaderboard", "progress", "discussions"];
        const normalCourseSegments = ["video", "playground", "tryout", "path", "mastery", "my-results", "live"];
        if (
          segment &&
          (commonSegments.includes(segment) ||
            (targetCourseId !== PKA_COURSE_ID && normalCourseSegments.includes(segment)))
        ) {
          router.push(href(`/courses/${targetCourseId}/${segment}`));
          return;
        }
      }
    }

    router.push(href(`/courses/${targetCourseId}`));
  };

  // Show streak strip only in global mode (above account footer) so course mode stays focused.
  const bottomSection = (c: boolean) => {
    if (activeCourseId || streakCurrent === null) return null;
    if (c) {
      return (
        <div className="flex shrink-0 justify-center border-t border-border/60 px-1 py-1.5">
          <SidebarTooltip label={t("navigation.streak", { count: streakCurrent })} collapsed={true}>
            <div className="flex size-8 items-center justify-center rounded-md text-brand-secondary">
              <Flame className="size-4" />
            </div>
          </SidebarTooltip>
        </div>
      );
    }
    return (
      <div className="shrink-0 border-t border-border/60 [&>div]:border-b-0">
        <StreakCalendarStrip current={streakCurrent} weeklyActivity={weeklyActivity} />
      </div>
    );
  };

  const mapCourseItems = (
    items: Array<{
      href: string;
      icon: typeof LayoutDashboard;
      label: string;
      exact?: boolean;
      badge?: React.ReactNode;
    }>
  ): StudentNavigationItem[] =>
    items.map((item) => ({
      href: href(item.href),
      icon: item.icon,
      label: item.label,
      badge: item.badge,
      active: item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`),
    }));

  const navContent = (c: boolean) => {
    if (activeCourseId) {
      const base = `/courses/${activeCourseId}`;
      const isPka = activeCourseId === PKA_COURSE_ID;
      const courseTitle = activeCourseMetadata?.title ?? t("navigation.loadingCourse");

      const groups = isPka
        ? [
            {
              key: "pka-program",
              label: t("navigation.groupPkaProgram"),
              items: mapCourseItems([
                { href: base, icon: LayoutDashboard, label: t("navigation.summary"), exact: true },
                { href: `${base}/jadwal`, icon: CalendarRange, label: t("navigation.pkaSchedule") },
                { href: `${base}/simulasi`, icon: ClipboardList, label: t("navigation.simulation") },
                { href: `${base}/laporan`, icon: BarChart3, label: t("navigation.diagnosticReport") },
                {
                  href: `${base}/discussions`,
                  icon: MessageSquareText,
                  label: tDiscussion("discussion"),
                  badge: demo ? undefined : <DiscussionCountBadge courseId={activeCourseId} />,
                },
              ]),
            },
            {
              key: "pka-practice",
              label: t("navigation.groupPkaPractice"),
              items: mapCourseItems([
                { href: `${base}/material`, icon: FileText, label: t("navigation.materials") },
                { href: `${base}/quiz`, icon: ClipboardList, label: t("navigation.quiz") },
                { href: `${base}/flashcard`, icon: Brain, label: t("navigation.flashcard") },
                { href: `${base}/leaderboard`, icon: Medal, label: t("navigation.leaderboard") },
              ]),
            },
          ]
        : [
            {
              key: "learn",
              label: t("navigation.groupLearn"),
              items: mapCourseItems([
                { href: base, icon: LayoutDashboard, label: t("navigation.summary"), exact: true },
                { href: `${base}/material`, icon: FileText, label: t("navigation.documents") },
                { href: `${base}/video`, icon: Video, label: t("navigation.video") },
                { href: `${base}/playground`, icon: Code2, label: "Playground" },
                ...(showStudyPath ? [{ href: `${base}/path`, icon: Compass, label: t("navigation.studyPath") }] : []),
              ]),
            },
            {
              key: "practice",
              label: t("navigation.groupPractice"),
              items: mapCourseItems([
                { href: `${base}/quiz`, icon: ClipboardList, label: t("navigation.quiz") },
                { href: `${base}/flashcard`, icon: Brain, label: t("navigation.flashcard") },
                { href: `${base}/tryout`, icon: GraduationCap, label: t("navigation.tryout") },
                ...(showLive ? [{ href: `${base}/live`, icon: Play, label: t("navigation.liveQuiz"), badge: "Beta" }] : []),
              ]),
            },
            {
              key: "class-progress",
              label: t("navigation.groupClassProgress"),
              items: mapCourseItems([
                {
                  href: `${base}/discussions`,
                  icon: MessageSquareText,
                  label: tDiscussion("discussion"),
                  badge: demo ? undefined : <DiscussionCountBadge courseId={activeCourseId} />,
                },
                { href: `${base}/progress`, icon: BarChart3, label: t("navigation.progress") },
                ...(showMastery ? [{ href: `${base}/mastery`, icon: Target, label: t("navigation.mastery") }] : []),
                { href: `${base}/my-results`, icon: History, label: t("navigation.examResults") },
                { href: `${base}/leaderboard`, icon: Medal, label: t("navigation.leaderboard") },
              ]),
            },
          ];

      return (
        <nav
          className={cn(
            "flex min-h-0 flex-1 flex-col gap-1 py-2.5 font-sans text-left",
            c
              ? "px-1 items-center overflow-y-auto overflow-x-hidden sidebar-scroll-hidden"
              : "px-3 overflow-y-auto overflow-x-hidden sidebar-scroll"
          )}
        >
          <div className={cn("flex flex-col gap-1.5 pb-2 border-b border-border/60", c && "w-full items-center")}>
            <SidebarBackLink
              href={href("/dashboard")}
              label={t("navigation.backToDashboard")}
              collapsed={c}
            />

            {c ? (
              <DropdownMenu>
                <SidebarTooltip label={`${t("navigation.switchCourse")}: ${courseTitle}`} collapsed={c}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`${t("navigation.switchCourse")}: ${courseTitle}`}
                      className="flex size-10 items-center justify-center rounded-lg border border-border/70 bg-muted/30 text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                    >
                      <BookOpen className="size-4" />
                    </button>
                  </DropdownMenuTrigger>
                </SidebarTooltip>
                <DropdownMenuContent align="start" side="right" sideOffset={8} className="w-64 min-w-56 p-1">
                  <DropdownMenuLabel>{t("navigation.switchCourse")}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <div className="max-h-64 overflow-y-auto space-y-0.5">
                    {coursesToDisplay.map((course) => {
                      const isCurrent = course.id === activeCourseId;
                      return (
                        <DropdownMenuItem
                          key={course.id}
                          onSelect={() => handleSelectCourse(course.id)}
                          className={cn(
                            "flex items-center justify-between gap-2 cursor-pointer text-body-sm",
                            isCurrent && "bg-brand-primary/10 text-brand-primary"
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`${t("navigation.switchCourse")}: ${courseTitle}`}
                    className="group flex w-full items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/30 px-2.5 py-2 text-left transition-colors hover:border-border hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <BookOpen className="size-4 shrink-0 text-brand-primary" />
                      <span className="truncate font-heading text-body-sm font-semibold leading-tight text-foreground">
                        {courseTitle}
                      </span>
                    </span>
                    <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" sideOffset={4} className="w-60 min-w-52 p-1">
                  <DropdownMenuLabel>{t("navigation.switchCourse")}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <div className="max-h-64 overflow-y-auto space-y-0.5">
                    {coursesToDisplay.map((course) => {
                      const isCurrent = course.id === activeCourseId;
                      return (
                        <DropdownMenuItem
                          key={course.id}
                          onSelect={() => handleSelectCourse(course.id)}
                          className={cn(
                            "flex items-center justify-between gap-2 cursor-pointer text-body-sm",
                            isCurrent && "bg-brand-primary/10 text-brand-primary"
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
            )}
          </div>

          <div className={cn("flex flex-col gap-0.5 pt-1", c && "w-full items-center")}>
            {groups.map((group, idx) => (
              <div key={group.key} className={cn("flex flex-col gap-0.5 w-full", c && "items-center")}>
                {idx === 0 && !c ? (
                  <div className="px-2.5 pt-1.5 pb-1">
                    <p className="text-body-2xs font-semibold tracking-wider text-muted-foreground/80 uppercase font-sans truncate">
                      {group.label}
                    </p>
                  </div>
                ) : (
                  <NavGroup label={group.label} collapsed={c} />
                )}
                <StudentNavigationItems collapsed={c} items={group.items} />
              </div>
            ))}
          </div>

          <div className="flex-1" />
        </nav>
      );
    }

    const userRole = (session?.user as { role?: string | null } | undefined)?.role;

    return (
      <nav
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-0.5 py-3 font-sans text-left",
          c
            ? "px-1 items-center overflow-y-auto overflow-x-hidden sidebar-scroll-hidden"
            : "px-3 overflow-y-auto overflow-x-hidden sidebar-scroll"
        )}
      >
        {/* Primary global hubs */}
        <div className={cn("flex flex-col gap-0.5 w-full", c && "items-center")}>
          <NavItem
            href={href("/dashboard")}
            {...optionsFor(href("/dashboard"))}
            icon={LayoutDashboard}
            label={t("navigation.dashboard")}
            active={pathname === "/dashboard"}
            collapsed={c}
          />

          <NavItem
            href={href("/dashboard/schedule")}
            icon={CalendarRange}
            label={userRole === "teacher" || userRole === "tutor" ? t("navigation.tutorialSchedule") : t("navigation.schedule")}
            active={pathname === "/dashboard/schedule" || pathname.startsWith("/dashboard/schedule/")}
            collapsed={c}
          />

          <NavItem
            href={href("/dashboard/discussions")}
            icon={MessageSquareText}
            label={tDiscussion("discussion")}
            active={pathname === "/dashboard/discussions" || pathname.startsWith("/dashboard/discussions/")}
            badge={demo ? undefined : <DiscussionCountBadge />}
            collapsed={c}
          />
        </div>

        {/* Courses promoted to the center of global navigation */}
        <NavGroup
          label={t("navigation.courses")}
          collapsed={c}
          trailing={
            <Link
              href={href("/courses")}
              {...optionsFor(href("/courses"))}
              aria-label={t("navigation.exploreCourses")}
              title={t("navigation.exploreCourses")}
              className={cn(
                "flex size-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                pathname === "/courses" && "bg-muted text-foreground"
              )}
            >
              <Search className="size-3" />
            </Link>
          }
        />

        {c ? (
          <NavItem
            href={href("/courses")}
            {...optionsFor(href("/courses"))}
            icon={BookOpen}
            label={t("navigation.courses")}
            active={pathname === "/courses" || pathname.startsWith("/courses/")}
            collapsed={true}
          />
        ) : (
          <div className="flex flex-col gap-0.5 w-full">
            {enrolledCourses.map((course) => (
              <NavItem
                key={course.id}
                href={href(`/courses/${course.id}`)}
                icon={BookOpen}
                label={course.title}
                active={pathname === `/courses/${course.id}` || pathname.startsWith(`/courses/${course.id}/`)}
                collapsed={false}
              />
            ))}
            {enrolledCourses.length === 0 && (
              <NavItem
                href={href("/courses")}
                {...optionsFor(href("/courses"))}
                icon={Search}
                label={t("navigation.exploreCourses")}
                active={pathname === "/courses"}
                collapsed={false}
              />
            )}
          </div>
        )}

        {/* Community & Gamification */}
        <NavGroup label={t("navigation.groupCommunity")} collapsed={c} />
        <div className={cn("flex flex-col gap-0.5 w-full", c && "items-center")}>
          <NavItem
            href={href("/dashboard/groups")}
            icon={Users}
            label={t("navigation.groups")}
            active={pathname === "/dashboard/groups" || pathname.startsWith("/dashboard/groups/")}
            collapsed={c}
          />

          <NavItem
            href={href("/leaderboard")}
            icon={Medal}
            label={t("navigation.leaderboard")}
            active={pathname === "/leaderboard" || pathname.startsWith("/leaderboard/")}
            collapsed={c}
          />

          <NavItem
            href={href("/achievements")}
            icon={Trophy}
            label={t("navigation.achievements")}
            active={pathname === "/achievements"}
            collapsed={c}
          />

          {(demo || userRole === "student") && (
            <NavItem
              href={href("/pet")}
              icon={PawPrint}
              label="Pet"
              active={pathname === "/pet"}
              collapsed={c}
            />
          )}
        </div>

        <div className="flex-1" />
      </nav>
    );
  };

  return (
    <DesktopSidebarShell
      collapsedKey={demo ? "demo-sidebar-collapsed" : "sidebar-collapsed"}
      logoHref={href("/dashboard")}
      logoLabel={t("navigation.dashboard") + " Zyx Academy"}
      nav={navContent}
      bottomSection={bottomSection}
      defaultCollapsed={defaultCollapsed}
    />
  );
}
