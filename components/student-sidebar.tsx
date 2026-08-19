"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  User,
  CalendarRange,
  Trophy,
  ArrowLeft,
  Compass,
  FileText,
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
} from "lucide-react";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import { useTutor } from "@/components/course/tutor-drawer";
import { useSession } from "@/lib/auth-client";
import { getStudentEnrollments, getCourseAction } from "@/app/(student)/dashboard/actions";
import { cn } from "@/lib/utils";
import { ZyraMark } from "@/components/course/zyra-mark";
import { SidebarShell, NavItem } from "@/components/sidebar-shell";
import { StreakCalendarStrip } from "@/components/dashboard/streak-calendar-strip";
import { SidebarTooltip } from "@/components/sidebar-shell";

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
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const { openChat } = useTutor();
  const courseIdFromPath = pathname.startsWith("/courses/")
    ? pathname.split("/")[2]
    : undefined;

  const [activeCourse, setActiveCourse] = useState<any>(undefined);
  const [coursesOpen, setCoursesOpen] = useState(true);
  const [enrolledCourses, setEnrolledCourses] = useState<StudentEnrollment[]>([]);
  const [streakCurrent, setStreakCurrent] = useState<number | null>(null);
  const [weeklyActivity, setWeeklyActivity] = useState<boolean[]>([]);

  useEffect(() => {
    if (!courseIdFromPath) {
      setActiveCourse(undefined);
      return;
    }
    const enrolled = enrolledCourses.find((c) => c.id === courseIdFromPath);
    if (enrolled) {
      setActiveCourse(enrolled);
      return;
    }
    getCourseAction(courseIdFromPath)
      .then((course) => {
        if (course) {
          setActiveCourse(course);
        }
      })
      .catch(console.error);
  }, [courseIdFromPath, enrolledCourses]);

  useEffect(() => {
    if (session?.user?.id) {
      getStudentEnrollments().then(setEnrolledCourses).catch(console.error);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) return;
    fetch("/api/student/today")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.streak?.current != null) setStreakCurrent(d.streak.current);
        if (d?.weeklyActivity != null) setWeeklyActivity(d.weeklyActivity);
      })
      .catch(() => {});
  }, [session?.user?.id, pathname]);

  const topSection = (c: boolean) => {
    if (streakCurrent === null) return null;
    if (c) {
      return (
        <div className="px-3 pt-3 shrink-0 flex justify-center">
          <SidebarTooltip label={`Streak: ${streakCurrent} Hari`} collapsed={true}>
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
    if (activeCourse) {
      return (
        <nav className={cn(
          "flex flex-1 flex-col gap-1 py-4 font-sans text-left",
          c
            ? "px-1 items-center overflow-y-hidden sidebar-scroll-hidden"
            : "px-3 overflow-y-auto overflow-x-hidden sidebar-scroll"
        )}>
          <SidebarTooltip label="Kembali ke Dashboard" collapsed={c}>
            <Link
              href="/dashboard"
              title={c ? "Kembali ke Dashboard" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-3 py-2 text-body-xs font-semibold text-brand-secondary hover:bg-muted/40 transition-colors mb-2",
                c && "justify-center size-10 px-0 mx-auto"
              )}
            >
              <ArrowLeft className="size-4 shrink-0" />
              {!c && <span>Dashboard</span>}
            </Link>
          </SidebarTooltip>

          {!c && (
            <div className="rounded-xl border border-border/60 bg-muted/30 p-3 mb-4 text-left">
              <div className="flex items-center gap-2">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
                  <BookOpen className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-xs font-bold text-foreground font-heading leading-tight">
                    {activeCourse.title}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mt-0.5">
                    {activeCourse.category || "Kelas"}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className={cn("space-y-1", c && "w-full flex flex-col items-center")}>
            {(() => {
              const base = `/courses/${activeCourse.id}`;
              const isPka = activeCourse.id === PKA_COURSE_ID;
              const items: Array<{
                href: string;
                icon: typeof LayoutDashboard;
                label: string;
                exact?: boolean;
                badge?: string;
              }> = isPka
                ? [
                    { href: base, icon: LayoutDashboard, label: "Ringkasan", exact: true },
                    { href: `${base}/jadwal`, icon: CalendarRange, label: "Jadwal" },
                    { href: `${base}/simulasi`, icon: ClipboardList, label: "Simulasi" },
                    { href: `${base}/flashcard`, icon: Brain, label: "Flashcard" },
                    { href: `${base}/quiz`, icon: ClipboardList, label: "Kuis" },
                    { href: `${base}/leaderboard`, icon: Trophy, label: "Peringkat" },
                    { href: `${base}/material`, icon: FileText, label: "Materi" },
                    { href: `${base}/laporan`, icon: BarChart3, label: "Laporan Diagnostik" },
                  ]
                : [
                    { href: base, icon: LayoutDashboard, label: "Ringkasan", exact: true },
                    ...(showStudyPath ? [{ href: `${base}/path`, icon: Compass, label: "Alur Belajar", badge: "Beta" }] : []),
                    { href: `${base}/material`, icon: FileText, label: "Dokumen" },
                    { href: `${base}/flashcard`, icon: Brain, label: "Flashcard" },
                    { href: `${base}/quiz`, icon: ClipboardList, label: "Kuis" },
                    { href: `${base}/tryout`, icon: GraduationCap, label: "Tryout" },
                    ...(showLive ? [{ href: `${base}/live`, icon: Play, label: "Kuis Langsung", badge: "Beta" }] : []),
                    ...(showMastery ? [{ href: `${base}/mastery`, icon: Target, label: "Penguasaan", badge: "Beta" }] : []),
                    { href: `${base}/leaderboard`, icon: Trophy, label: "Peringkat" },
                    { href: `${base}/my-results`, icon: History, label: "Hasil Ujian" },
                  ];

              return items.map((item) => (
                <NavItem
                  key={item.href}
                  href={item.href}
                  icon={item.icon}
                  label={item.label}
                  badge={item.badge}
                  active={item.exact ? pathname === item.href : pathname.startsWith(item.href)}
                  collapsed={c}
                />
              ));
            })()}
          </div>

          <div className="h-px bg-border/50 my-3 shrink-0 w-full" />

          <SidebarTooltip label="Tanya Zyra" collapsed={c}>
            <button
              type="button"
              onClick={openChat}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-body-sm font-semibold transition-colors cursor-pointer",
                "bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20",
                c && "justify-center size-10 px-0 mx-auto"
              )}
            >
              <ZyraMark className="size-5" />
              {!c && <span>Tanya Zyra</span>}
            </button>
          </SidebarTooltip>

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
          label="Dashboard"
          active={pathname === "/dashboard"}
          collapsed={c}
        />

        <NavItem
          href="/dashboard/schedule"
          icon={CalendarRange}
          label={userRole === "teacher" ? "Jadwal Tutorial" : "Jadwal"}
          active={pathname === "/dashboard/schedule"}
          collapsed={c}
        />

        {(userRole === "teacher" || userRole === "admin") && (
          <NavItem
            href="/tutor"
            icon={GraduationCap}
            label="Teaching"
            active={pathname === "/tutor" || pathname.startsWith("/tutor/")}
            collapsed={c}
          />
        )}

        <NavItem
          href="/dashboard/groups"
          icon={Users}
          label="Kelompok Belajar"
          active={pathname === "/dashboard/groups" || pathname.startsWith("/dashboard/groups")}
          collapsed={c}
        />

        <NavItem
          href="/leaderboard"
          icon={Trophy}
          label="Peringkat"
          active={pathname === "/leaderboard" || pathname.startsWith("/leaderboard")}
          collapsed={c}
        />

        <div className={cn(c && "w-full flex flex-col items-center")}>
          <SidebarTooltip label="Courses" collapsed={c}>
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
                "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-body-sm font-medium transition-colors cursor-pointer",
                pathname.startsWith("/courses")
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
                c && "justify-center size-10 px-0 mx-auto"
              )}
            >
              <BookOpen className="size-5 shrink-0" />
              {!c && (
                <>
                  <span className="flex-1 text-left">Courses</span>
                  {coursesOpen
                    ? <ChevronDown className="size-4" />
                    : <ChevronRight className="size-4" />}
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
                      "block truncate rounded-lg px-3 py-1.5 text-body-xs font-medium transition-colors",
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
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-body-xs font-semibold text-brand-secondary hover:underline",
                  pathname === "/courses" && "underline"
                )}
              >
                <Search className="size-3 shrink-0" />
                Jelajahi Course
              </Link>
            </div>
          )}
        </div>

        <NavItem
          href="/profile"
          icon={User}
          label="Profile"
          active={pathname === "/profile"}
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
      logoLabel="Dashboard Zyx Academy"
      nav={navContent}
      topSection={topSection}
    />
  );
}
