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
  Bell,
} from "lucide-react";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import { useSession } from "@/lib/auth-client";
import { getStudentEnrollments, getCourseAction } from "@/app/(student)/dashboard/actions";
import { cn } from "@/lib/utils";
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

  const activeCourseId = courseIdFromPath ?? courseIdFromSchedule;

  const [activeCourse, setActiveCourse] = useState<any>(undefined);
  const [coursesOpen, setCoursesOpen] = useState(true);
  const [enrolledCourses, setEnrolledCourses] = useState<StudentEnrollment[]>([]);
  const [streakCurrent, setStreakCurrent] = useState<number | null>(null);
  const [weeklyActivity, setWeeklyActivity] = useState<boolean[]>([]);

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
    getCourseAction(activeCourseId)
      .then((course) => {
        if (course) {
          setActiveCourse(course);
        }
      })
      .catch(console.error);
  }, [activeCourseId, enrolledCourses]);

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
                c && "justify-center px-0 size-10"
              )}
            >
              <ArrowLeft className="size-4 shrink-0" />
              {!c && <span>Kembali ke Dashboard</span>}
            </Link>
          </SidebarTooltip>

          {!c && (
            <div className="mb-3 px-3">
              <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/70 mb-1">Mata Kuliah</p>
              <p className="text-body-xs font-bold text-foreground truncate">{activeCourse.title}</p>
            </div>
          )}

          <SidebarTooltip label="Ringkasan" collapsed={c}>
            <NavItem href={`/courses/${activeCourse.id}`} icon={LayoutDashboard} label="Ringkasan" collapsed={c} />
          </SidebarTooltip>
          <SidebarTooltip label="Dokumen" collapsed={c}>
            <NavItem href={`/courses/${activeCourse.id}/material`} icon={FileText} label="Dokumen" collapsed={c} />
          </SidebarTooltip>
          <SidebarTooltip label="Kuis" collapsed={c}>
            <NavItem href={`/courses/${activeCourse.id}/quiz`} icon={ClipboardList} label="Kuis" collapsed={c} />
          </SidebarTooltip>
          <SidebarTooltip label="Jadwal" collapsed={c}>
            <NavItem href={`/dashboard/schedule?course=${activeCourse.id}`} icon={CalendarRange} label="Jadwal" collapsed={c} />
          </SidebarTooltip>
          {showStudyPath && (
            <SidebarTooltip label="Jalur Belajar" collapsed={c}>
              <NavItem href={`/courses/${activeCourse.id}/study-path`} icon={Compass} label="Jalur Belajar" collapsed={c} />
            </SidebarTooltip>
          )}
          {showMastery && (
            <SidebarTooltip label="Penguasaan" collapsed={c}>
              <NavItem href={`/courses/${activeCourse.id}/mastery`} icon={Target} label="Penguasaan" collapsed={c} />
            </SidebarTooltip>
          )}
          {showLive && (
            <SidebarTooltip label="Live" collapsed={c}>
              <NavItem href={`/courses/${activeCourse.id}/live`} icon={Play} label="Live" collapsed={c} />
            </SidebarTooltip>
          )}
          <SidebarTooltip label="Progres Belajar" collapsed={c}>
            <NavItem href={`/courses/${activeCourse.id}/progress`} icon={BarChart3} label="Progres Belajar" collapsed={c} />
          </SidebarTooltip>
        </nav>
      );
    }

    return (
      <nav className={cn(
        "flex flex-1 flex-col gap-1 py-4 font-sans text-left",
        c
          ? "px-1 items-center overflow-y-hidden sidebar-scroll-hidden"
          : "px-3 overflow-y-auto overflow-x-hidden sidebar-scroll"
      )}>
        <SidebarTooltip label="Dashboard" collapsed={c}>
          <NavItem href="/dashboard" icon={LayoutDashboard} label="Dashboard" collapsed={c} />
        </SidebarTooltip>
        <SidebarTooltip label="Mata Kuliah" collapsed={c}>
          <NavItem href="/dashboard/courses" icon={BookOpen} label="Mata Kuliah" collapsed={c} />
        </SidebarTooltip>
        <SidebarTooltip label="Jadwal" collapsed={c}>
          <NavItem href="/dashboard/schedule" icon={CalendarRange} label="Jadwal" collapsed={c} />
        </SidebarTooltip>
        <SidebarTooltip label="Kelompok" collapsed={c}>
          <NavItem href="/dashboard/groups" icon={Users} label="Kelompok" collapsed={c} />
        </SidebarTooltip>
        <SidebarTooltip label="Leaderboard" collapsed={c}>
          <NavItem href="/leaderboard" icon={Trophy} label="Leaderboard" collapsed={c} />
        </SidebarTooltip>
        <SidebarTooltip label="Riwayat" collapsed={c}>
          <NavItem href="/dashboard/history" icon={History} label="Riwayat" collapsed={c} />
        </SidebarTooltip>
        <SidebarTooltip label="Notifikasi" collapsed={c}>
          <NavItem href="/dashboard/notifications" icon={Bell} label="Notifikasi" collapsed={c} />
        </SidebarTooltip>
        <SidebarTooltip label="Profil" collapsed={c}>
          <NavItem href="/profile" icon={User} label="Profil" collapsed={c} />
        </SidebarTooltip>
      </nav>
    );
  };

  return (
    <SidebarShell
      ariaLabel="Navigasi siswa"
      top={topSection}
      content={navContent}
    />
  );
}
