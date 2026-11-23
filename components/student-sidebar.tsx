"use client";

import { useState, useEffect, useMemo } from "react";
import { useStudentSidebarData } from "@/hooks/use-student-sidebar-data";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  Code2,
  Check,
  ChevronDown,
  ChevronRight,
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
import { StudentNavigationItems } from "@/components/student-navigation-items";
import { NavItem, SidebarTooltip } from "@/components/sidebar-shell";
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
}

export function StudentSidebar(props: StudentSidebarProps) {
  const viewportMode = useViewportMode();
  if (viewportMode === "mobile") {
    return null;
  }
  return <StudentAccountBoundary>{({data}) => <StudentSidebarContent {...props} session={data} />}</StudentAccountBoundary>;
}

function StudentSidebarContent({
  showStudyPath = false,
  showMastery = false,
  showLive = false,
  session,
}: StudentSidebarProps & { session: {user: {id: string; role?: string | null}} | null }) {
  const t = useTranslations("student");
  const tDiscussion = useTranslations("tutor.schedule");
  const experience = useStudentExperience();
  const actualPathname = usePathname();
  const pathname = experience.pathname ?? actualPathname;
  const href = experience.href ?? ((path: string) => path);
  const demo = experience.mode === "demo";
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
  const activeCourseId = courseIdFromPath ?? (pathname === "/dashboard/schedule" ? courseIdFromSchedule : undefined);

  const [coursesOpen, setCoursesOpen] = useState(true);
  const viewportMode = useViewportMode();
  const userId = session?.user?.id;
  const liveData = useStudentSidebarData({
    userId,
    activeCourseId,
    pathname,
    enabled: !demo && viewportMode === "desktop",
  });
  const enrolledCourses = useMemo(() => demo ? experience.courses ?? [] : liveData.courses, [demo, experience.courses, liveData.courses]);
  const activeCourseMetadata = demo ? enrolledCourses.find(course => course.id === activeCourseId) : liveData.activeCourse;
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
        title: activeCourseMetadata?.title ?? "Mata Kuliah Aktif",
      });
    }

    return list;
  }, [enrolledCourses, activeCourseId, activeCourseMetadata]);

  const handleSelectCourse = (targetCourseId: string) => {
    if (targetCourseId === activeCourseId) return;

    if (pathname === "/dashboard/schedule") {
      setCourseIdFromSchedule(targetCourseId);
      router.push(href(`/dashboard/schedule?course=${targetCourseId}`));
      return;
    }

    if (courseIdFromPath) {
      const currentBase = `/courses/${courseIdFromPath}`;
      if (pathname.startsWith(currentBase)) {
        const rest = pathname.slice(currentBase.length);
        const segment = rest.split("/").filter(Boolean)[0];
        const commonSegments = ["material", "quiz", "flashcard", "leaderboard", "progress", "discussions"];
        const normalCourseSegments = ["tryout", "my-results"];
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

  const topSection = (c: boolean) => {
    if (streakCurrent === null) return null;
    if (c) {
      return (
        <div className="px-1 pt-2 shrink-0 flex justify-center">
          <SidebarTooltip label={t("navigation.streak", { count: streakCurrent })} collapsed={true}>
            <div className="flex size-8 items-center justify-center rounded-md text-brand-secondary">
              <Flame className="size-4" />
            </div>
          </SidebarTooltip>
        </div>
      );
    }
    return (
      <div className="shrink-0">
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
        badge?: React.ReactNode;
      }> = isPka
        ? [
            { href: base, icon: LayoutDashboard, label: t("navigation.summary"), exact: true },
            { href: `${base}/jadwal`, icon: CalendarRange, label: t("navigation.pkaSchedule") },
            { href: `${base}/simulasi`, icon: ClipboardList, label: t("navigation.simulation") },
            { href: `${base}/laporan`, icon: BarChart3, label: t("navigation.diagnosticReport") },
            { href: `${base}/discussions`, icon: MessageSquareText, label: tDiscussion("discussion"), badge: demo ? undefined : <DiscussionCountBadge courseId={activeCourseId} /> },
          ]
        : [
            { href: base, icon: LayoutDashboard, label: t("navigation.summary"), exact: true },
            { href: `${base}/material`, icon: FileText, label: t("navigation.documents") },
            { href: `${base}/video`, icon: Video, label: t("navigation.video") },
            { href: `${base}/playground`, icon: Code2, label: "Playground" },
            { href: `${base}/quiz`, icon: ClipboardList, label: t("navigation.quiz") },
            { href: `${base}/discussions`, icon: MessageSquareText, label: tDiscussion("discussion"), badge: demo ? undefined : <DiscussionCountBadge courseId={activeCourseId} /> },
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
            { href: `${base}/leaderboard`, icon: Medal, label: t("navigation.leaderboard") },
            { href: `${base}/material`, icon: FileText, label: t("navigation.materials") },
          ]
        : [
            { href: `${base}/flashcard`, icon: Brain, label: t("navigation.flashcard") },
            { href: `${base}/tryout`, icon: GraduationCap, label: t("navigation.tryout") },
            ...(showStudyPath ? [{ href: `${base}/path`, icon: Compass, label: t("navigation.studyPath") }] : []),
            ...(showMastery ? [{ href: `${base}/mastery`, icon: Target, label: t("navigation.mastery") }] : []),
            { href: `${base}/progress`, icon: BarChart3, label: t("navigation.progress") },
            { href: `${base}/leaderboard`, icon: Medal, label: t("navigation.leaderboard") },
            { href: `${base}/my-results`, icon: History, label: t("navigation.examResults") },
            ...(showLive ? [{ href: `${base}/live`, icon: Play, label: t("navigation.liveQuiz"), badge: "Beta" }] : []),
          ];

      return (
        <nav className={cn(
          "flex min-h-0 flex-1 flex-col gap-1 py-2.5 font-sans text-left",
          c
            ? "px-1 items-center overflow-y-auto overflow-x-hidden sidebar-scroll-hidden"
            : "px-2.5 overflow-y-auto overflow-x-hidden sidebar-scroll"
        )}>
          {c ? (
            <div className="mb-1 flex w-full shrink-0 justify-center">
              <DropdownMenu>
                <SidebarTooltip label={`${t("navigation.switchCourse")}: ${courseTitle}`} collapsed={c}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`${t("navigation.switchCourse")}: ${courseTitle}`}
                      className="flex size-10 items-center justify-center rounded-lg text-foreground hover:bg-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
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
                            "flex items-center justify-between gap-2 cursor-pointer text-body-xs",
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
            </div>
          ) : (
            <div className="mb-2 border-b border-border/50 pb-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`${t("navigation.switchCourse")}: ${courseTitle}`}
                    className="group flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                  >
                    <span className="truncate text-body-sm font-semibold text-foreground font-heading leading-tight">
                      {courseTitle}
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
                            "flex items-center justify-between gap-2 cursor-pointer text-body-xs",
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
            </div>
          )}

          <div className={cn("space-y-1", c && "w-full flex flex-col items-center")}>
            <StudentNavigationItems collapsed={c} items={primaryItems.map((item) => ({ ...item, href: href(item.href), active: item.customActive ?? (item.exact ? pathname === item.href : pathname.startsWith(item.href)) }))} />

            {secondaryItems.length > 0 && (
              <>
                {!c && (
                  <div className="pt-6 pb-1.5 px-2.5 text-left">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">
                      {t("navigation.more")}
                    </span>
                  </div>
                )}
                {c && <div className="my-3 w-5 border-t border-border/60" />}

                <StudentNavigationItems collapsed={c} items={secondaryItems.map((item) => ({ ...item, href: href(item.href), active: item.exact ? pathname === item.href : pathname.startsWith(item.href) }))} />
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
        "flex min-h-0 flex-1 flex-col gap-1 py-3 font-sans text-left",
        c
          ? "px-1 items-center overflow-y-auto overflow-x-hidden sidebar-scroll-hidden"
          : "px-3 overflow-y-auto overflow-x-hidden sidebar-scroll"
      )}>
        <NavItem
          href={href("/dashboard")}
          icon={LayoutDashboard}
          label={t("navigation.dashboard")}
          active={pathname === "/dashboard"}
          collapsed={c}
        />

        <NavItem
          href={href("/dashboard/schedule")}
          icon={CalendarRange}
          label={userRole === "teacher" || userRole === "tutor" ? t("navigation.tutorialSchedule") : t("navigation.schedule")}
          active={pathname === "/dashboard/schedule"}
          collapsed={c}
        />

        <NavItem href={href("/dashboard/discussions")} icon={MessageSquareText} label={tDiscussion("discussion")}
          active={pathname === "/dashboard/discussions" || pathname.startsWith("/dashboard/discussions/")}
          badge={demo ? undefined : <DiscussionCountBadge />} collapsed={c} />

        {(userRole === "teacher" || userRole === "tutor" || userRole === "admin") && (
          <NavItem
            href={href("/tutor")}
            icon={GraduationCap}
            label={t("navigation.teaching")}
            active={pathname === "/tutor" || pathname.startsWith("/tutor/")}
            collapsed={c}
          />
        )}

        <NavItem
          href={href("/dashboard/groups")}
          icon={Users}
          label={t("navigation.groups")}
          active={pathname === "/dashboard/groups" || pathname.startsWith("/dashboard/groups")}
          collapsed={c}
        />

        <NavItem
          href={href("/achievements")}
          icon={Trophy}
          label={t("navigation.achievements")}
          active={pathname === "/achievements"}
          collapsed={c}
        />

        {(demo || userRole === "student") && <NavItem href={href("/pet")} icon={PawPrint} label="Pet" active={pathname === "/pet"} collapsed={c} />}

        <NavItem
          href={href("/leaderboard")}
          icon={Medal}
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
                  router.push(href("/courses"));
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
                    href={href(`/courses/${course.id}`)}
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
                href={href("/courses")}
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
      topSection={topSection}
    />
  );
}
