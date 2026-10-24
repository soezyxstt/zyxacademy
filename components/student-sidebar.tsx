"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  Code2,
  Check,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  User,
  CalendarRange,
  Trophy,
  ArrowLeft,
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
  Bell,
} from "lucide-react";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import { useSession } from "@/lib/auth-client";
import { getStudentEnrollments, getCourseAction } from "@/app/(student)/dashboard/actions";
import { cn } from "@/lib/utils";
import { SidebarShell, NavItem } from "@/components/sidebar-shell";
import { createActivityRefresh } from "@/lib/student/activity-refresh";
import { ZYX_ACTIVITY_UPDATED_EVENT } from "@/lib/activity-signal";
import { StreakCalendarStrip } from "@/components/dashboard/streak-calendar-strip";
import { SidebarTooltip } from "@/components/sidebar-shell";
import { useTranslations } from "@/lib/i18n/client";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

type StudentEnrollment = Awaited<ReturnType<typeof getStudentEnrollments>>[number];

interface StudentSidebarProps {
  showStudyPath?: boolean;
  showMastery?: boolean;
  showLive?: boolean;
}

export function StudentSidebar({
  showStudyPath = false,
  showMastery = false,
  showLive = false,
}: StudentSidebarProps) {
  const t = useTranslations("student");
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const courseIdFromPath = pathname.startsWith("/courses/")
    ? pathname.split("/")[2]
    : undefined;
  const [courseIdFromSchedule, setCourseIdFromSchedule] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (pathname !== "/dashboard/schedule") {
      setCourseIdFromSchedule(undefined);
      return;
    }

    const readCourseId = () => {
      setCourseIdFromSchedule(
        new URLSearchParams(window.location.search).get("course") ?? undefined
      );
    };

    readCourseId();
    window.addEventListener("popstate", readCourseId);
    return () => window.removeEventListener("popstate", readCourseId);
  }, [pathname]);

  // Route context is authoritative for the sidebar mode. Course metadata may load later,
  // but the shell must switch on the same render as the route itself.
  const activeCourseId = courseIdFromPath ?? courseIdFromSchedule;

  const [activeCourse, setActiveCourse] = useState<any>(undefined);
  const [coursesOpen, setCoursesOpen] = useState(true);
  const [enrolledCourses, setEnrolledCourses] = useState<StudentEnrollment[]>([]);
  const [streakCurrent, setStreakCurrent] = useState<number | null>(null);
  const [weeklyActivity, setWeeklyActivity] = useState<boolean[]>([]);

  const enrolledActiveCourse = activeCourseId
    ? enrolledCourses.find((course) => course.id === activeCourseId)
    : undefined;
  const activeCourseMetadata = enrolledActiveCourse
    ?? (activeCourse?.id === activeCourseId ? activeCourse : undefined);

  useEffect(() => {
    if (!activeCourseId) {
      setActiveCourse(undefined);
      return;
    }
    const enrolled = enrolledCourses.find((c) => c.id === activeCourseId);
    if (enrolled) {
      setActiveCourse(enrolled);
      return;
    }

    // Clear stale metadata immediately. navContent still renders course mode from
    // activeCourseId, so switching A -> B cannot flash A or the general sidebar.
    setActiveCourse(undefined);
    let cancelled = false;
    getCourseAction(activeCourseId)
      .then((course) => {
        if (!cancelled && course) setActiveCourse(course);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [activeCourseId, enrolledCourses]);

  useEffect(() => {
    if (session?.user?.id) {
      getStudentEnrollments().then(setEnrolledCourses).catch(console.error);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    setStreakCurrent(null);
    setWeeklyActivity([]);
    if (!session?.user?.id) return;

    const activity = createActivityRefresh(async (signal) => {
      const response = await fetch("/api/student/today", { signal });
      if (!response.ok) throw new Error("Activity request failed");
      const data = await response.json();
      if (signal.aborted) return;
      if (data?.streak?.current != null) setStreakCurrent(data.streak.current);
      if (data?.weeklyActivity != null) setWeeklyActivity(data.weeklyActivity);
    });
    void activity.refresh(true);
    const handleFocus = () => { void activity.refresh(); };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") handleFocus();
    };
    const handleMutation = () => { void activity.refresh(true); };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener(ZYX_ACTIVITY_UPDATED_EVENT, handleMutation);
    return () => {
      activity.dispose();
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener(ZYX_ACTIVITY_UPDATED_EVENT, handleMutation);
    };
  }, [session?.user?.id]);

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
        title: activeCourseMetadata?.title ?? "Mata Kuliah Aktif",
      });
    }

    return list;
  }, [enrolledCourses, activeCourseId, activeCourseMetadata]);

  const handleSelectCourse = (targetCourseId: string) => {
    if (targetCourseId === activeCourseId) return;

    if (pathname === "/dashboard/schedule") {
      setCourseIdFromSchedule(targetCourseId);
      router.push(`/dashboard/schedule?course=${targetCourseId}`);
      return;
    }

    if (courseIdFromPath) {
      const currentBase = `/courses/${courseIdFromPath}`;
      if (pathname.startsWith(currentBase)) {
        const rest = pathname.slice(currentBase.length);
        const segment = rest.split("/").filter(Boolean)[0];
        const commonSegments = ["material", "quiz", "flashcard", "leaderboard", "progress"];
        const normalCourseSegments = ["tryout", "my-results"];
        if (
          segment &&
          (commonSegments.includes(segment) ||
            (targetCourseId !== PKA_COURSE_ID && normalCourseSegments.includes(segment)))
        ) {
          router.push(`/courses/${targetCourseId}/${segment}`);
          return;
        }
      }
    }

    router.push(`/courses/${targetCourseId}`);
  };

  const topSection = (c: boolean) => {
    if (streakCurrent === null) return null;
    if (c) {
      return (
        <div className="px-3 pt-3 shrink-0 flex justify-center">
          <SidebarTooltip label={t("navigation.streak", { count: streakCurrent })} collapsed={true}>
            <div className="flex size-10 items-center justify-center rounded-xl bg-brand-secondary/10 text-brand-secondary">
              <Flame className="size-5" />
            </div>
          </SidebarTooltip>
        </div>
      );
    }
    return (
      <div className="px-3 pt-3 shrink-0">
        <StreakCalendarStrip current={streakCurrent} weeklyActivity={weeklyActivity} />
      </div>
    );
  };

  const navContent = (c: boolean) => {
    if (activeCourseId) {
      const base = `/courses/${activeCourseId}`;
      const isPka = activeCourseId === PKA_COURSE_ID;
      const courseTitle = activeCourseMetadata?.title ?? t("navigation.loadingCourse");

      const primaryItems: Array<{
        href: string;
        icon: typeof LayoutDashboard;
        label: string;
        exact?: boolean;
        customActive?: boolean;
      }> = isPka
        ? [
            { href: base, icon: LayoutDashboard, label: t("navigation.summary"), exact: true },
            { href: `${base}/jadwal`, icon: CalendarRange, label: t("navigation.pkaSchedule") },
            { href: `${base}/simulasi`, icon: ClipboardList, label: t("navigation.simulation") },
            { href: `${base}/laporan`, icon: BarChart3, label: t("navigation.diagnosticReport") },
          ]
        : [
            { href: base, icon: LayoutDashboard, label: t("navigation.summary"), exact: true },
            { href: `${base}/material`, icon: FileText, label: t("navigation.documents") },
            { href: `${base}/video`, icon: Video, label: t("navigation.video") },
            { href: `${base}/playground`, icon: Code2, label: "Playground" },
            { href: `${base}/quiz`, icon: ClipboardList, label: t("navigation.quiz") },
            {
              href: `/dashboard/schedule?course=${activeCourseId}`,
              icon: CalendarRange,
              label: t("navigation.schedule"),
              customActive: pathname === "/dashboard/schedule" && courseIdFromSchedule === activeCourseId,
            },
          ];

      const secondaryItems: Array<{
        href: string;
        icon: typeof LayoutDashboard;
        label: string;
        exact?: boolean;
        badge?: string;
      }> = isPka
        ? [
            { href: `${base}/flashcard`, icon: Brain, label: t("navigation.flashcard") },
            { href: `${base}/quiz`, icon: ClipboardList, label: t("navigation.quiz") },
            { href: `${base}/leaderboard`, icon: Trophy, label: t("navigation.leaderboard") },
            { href: `${base}/material`, icon: FileText, label: t("navigation.materials") },
          ]
        : [
            { href: `${base}/flashcard`, icon: Brain, label: t("navigation.flashcard") },
            { href: `${base}/tryout`, icon: GraduationCap, label: t("navigation.tryout") },
            ...(showStudyPath ? [{ href: `${base}/path`, icon: Compass, label: t("navigation.studyPath") }] : []),
            ...(showMastery ? [{ href: `${base}/mastery`, icon: Target, label: t("navigation.mastery") }] : []),
            { href: `${base}/progress`, icon: BarChart3, label: t("navigation.progress") },
            { href: `${base}/leaderboard`, icon: Trophy, label: t("navigation.leaderboard") },
            { href: `${base}/my-results`, icon: History, label: t("navigation.examResults") },
            ...(showLive ? [{ href: `${base}/live`, icon: Play, label: t("navigation.liveQuiz"), badge: "Beta" }] : []),
          ];

      return (
        <nav className={cn(
          "flex flex-1 flex-col gap-1 py-4 font-sans text-left",
          c
            ? "px-1 items-center overflow-y-hidden sidebar-scroll-hidden"
            : "px-3 overflow-y-auto overflow-x-hidden sidebar-scroll"
        )}>
          <SidebarTooltip label={t("navigation.backToDashboard")} collapsed={c}>
            <Link
              href="/dashboard"
              title={c ? t("navigation.backToDashboard") : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-3 py-2 text-body-xs font-semibold text-brand-secondary hover:bg-muted/40 transition-colors mb-2",
                c && "justify-center size-10 px-0 mx-auto"
              )}
            >
              <ArrowLeft className="size-4 shrink-0" />
              {!c && <span>{t("navigation.dashboard")}</span>}
            </Link>
          </SidebarTooltip>

          {c ? (
            <div className="mb-2 flex w-full justify-center">
              <DropdownMenu>
                <SidebarTooltip label={`${t("navigation.switchCourse")}: ${courseTitle}`} collapsed={c}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`${t("navigation.switchCourse")}: ${courseTitle}`}
                      className="flex size-10 items-center justify-center rounded-xl text-foreground hover:bg-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
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
                            isCurrent && "font-semibold bg-brand-primary/10 text-brand-primary"
                          )}
                        >
                          <span className="truncate">{course.title}</span>
                          {isCurrent && <Check className="size-4 shrink-0 text-brand-primary" />}
                        </DropdownMenuItem>
                      );
                    })}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <div className="mb-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`${t("navigation.switchCourse")}: ${courseTitle}`}
                    className="group flex w-full items-center justify-between gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-left transition-colors hover:bg-muted/60 hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                  >
                    <span className="truncate text-body-sm font-semibold text-foreground font-heading leading-tight">
                      {courseTitle}
                    </span>
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" sideOffset={4} className="w-64 min-w-56 p-1">
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
                            isCurrent && "font-semibold bg-brand-primary/10 text-brand-primary"
                          )}
                        >
                          <span className="truncate">{course.title}</span>
                          {isCurrent && <Check className="size-4 shrink-0 text-brand-primary" />}
                        </DropdownMenuItem>
                      );
                    })}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          <div className={cn("space-y-1", c && "w-full flex flex-col items-center")}>
            {primaryItems.map((item) => (
              <NavItem
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={item.label}
                active={item.customActive ?? (item.exact ? pathname === item.href : pathname.startsWith(item.href))}
                collapsed={c}
              />
            ))}

            {secondaryItems.length > 0 && (
              <>
                {!c && (
                  <div className="pt-2.5 pb-1 px-2.5 text-left">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">
                      {t("navigation.more")}
                    </span>
                  </div>
                )}
                {c && <div className="my-1.5 w-5 border-t border-border/60" />}

                {secondaryItems.map((item) => (
                  <NavItem
                    key={item.href}
                    href={item.href}
                    icon={item.icon}
                    label={item.label}
                    badge={item.badge}
                    active={item.exact ? pathname === item.href : pathname.startsWith(item.href)}
                    collapsed={c}
                  />
                ))}
              </>
            )}
          </div>

          <div className="flex-1" />
        </nav>
      );
    }

    const userRole = (session?.user as { role?: string | null } | undefined)?.role;

    return (
      <nav className={cn(
        "flex flex-1 flex-col gap-1 py-4 font-sans text-left",
        c
          ? "px-1 items-center overflow-y-hidden sidebar-scroll-hidden"
          : "px-3 overflow-y-auto overflow-x-hidden sidebar-scroll"
      )}>
        <NavItem
          href="/dashboard"
          icon={LayoutDashboard}
          label={t("navigation.dashboard")}
          active={pathname === "/dashboard"}
          collapsed={c}
        />

        <NavItem
          href="/dashboard/schedule"
          icon={CalendarRange}
          label={userRole === "teacher" || userRole === "tutor" ? t("navigation.tutorialSchedule") : t("navigation.schedule")}
          active={pathname === "/dashboard/schedule"}
          collapsed={c}
        />

        {(userRole === "teacher" || userRole === "tutor" || userRole === "admin") && (
          <NavItem
            href="/tutor"
            icon={GraduationCap}
            label={t("navigation.teaching")}
            active={pathname === "/tutor" || pathname.startsWith("/tutor/")}
            collapsed={c}
          />
        )}

        <NavItem
          href="/dashboard/groups"
          icon={Users}
          label={t("navigation.groups")}
          active={pathname === "/dashboard/groups" || pathname.startsWith("/dashboard/groups")}
          collapsed={c}
        />

        <NavItem
          href="/leaderboard"
          icon={Trophy}
          label={t("navigation.leaderboard")}
          active={pathname === "/leaderboard" || pathname.startsWith("/leaderboard")}
          collapsed={c}
        />

        <div className={cn(c && "w-full flex flex-col items-center")}>
          <SidebarTooltip label={t("navigation.courses")} collapsed={c}>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                if (c) {
                  router.push("/courses");
                } else {
                  setCoursesOpen((v) => !v);
                }
              }}
              className={cn(
                "group/item relative flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-[13px] font-medium transition-colors cursor-pointer",
                pathname.startsWith("/courses")
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
                c && "justify-center size-10 px-0 mx-auto"
              )}
            >
              <BookOpen className="size-4 shrink-0" />
              {!c && (
                <>
                  <span className="truncate whitespace-nowrap flex-1 text-left min-w-0">{t("navigation.courses")}</span>
                  {coursesOpen
                    ? <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform" />
                    : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform" />}
                </>
              )}
            </button>
          </SidebarTooltip>

          {coursesOpen && !c && (
            <div className="ml-4 mt-1 space-y-0.5 border-l border-border pl-3">
              {enrolledCourses.map((course) => {
                const active =
                  pathname === `/courses/${course.id}` ||
                  pathname.startsWith(`/courses/${course.id}/`);
                return (
                  <Link
                    key={course.id}
                    href={`/courses/${course.id}`}
                    className={cn(
                      "block truncate rounded-lg px-2.5 py-1.5 text-body-xs font-medium transition-colors",
                      active
                        ? "bg-brand-primary/8 text-brand-primary font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {course.title}
                  </Link>
                );
              })}
              <Link
                href="/courses"
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-body-xs font-medium text-brand-secondary hover:underline transition-colors",
                  pathname === "/courses" && "font-semibold underline"
                )}
              >
                <Search className="size-3.5 shrink-0" />
                <span>{t("navigation.exploreCourses")}</span>
              </Link>
            </div>
          )}
        </div>

        <NavItem
          href="/profile"
          icon={User}
          label={t("settings.profile")}
          active={pathname === "/profile"}
          collapsed={c}
        />

        <NavItem
          href="/settings/notifications"
          icon={Bell}
          label={t("settings.emailNotifications")}
          active={pathname === "/settings/notifications"}
          collapsed={c}
        />

        <div className="flex-1" />
      </nav>
    );
  };

  return (
    <SidebarShell
      collapsedKey="sidebar-collapsed"
      logoHref="/dashboard"
      logoLabel={t("navigation.dashboard") + " Zyx Academy"}
      nav={navContent}
      topSection={topSection}
    />
  );
}
