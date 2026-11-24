"use client";

import { useEffect, useMemo, type ElementType } from "react";
import { usePathname } from "next/navigation";
import {
  Award,
  BarChart3,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Compass,
  FileText,
  Layers,
  LayoutDashboard,
  ListChecks,
  Radio,
  Target,
  Terminal,
  TrendingUp,
  Trophy,
  Video,
} from "lucide-react";
import { TabNav, type TabNavItem } from "@/components/ui/tabs";
import { useMobileChrome } from "@/components/navigation/mobile-chrome-context";
import { useStudentExperience } from "@/components/student-experience-provider";
import { useViewportMode } from "@/hooks/use-viewport-mode";
import { useTranslations } from "@/lib/i18n/client";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import {
  buildCourseMobileTabs,
  isCourseTabActive,
  setActiveCourseContext,
} from "./student-nav-model";

const COURSE_TAB_ICONS: Record<string, ElementType> = {
  summary: LayoutDashboard,
  documents: FileText,
  materials: FileText,
  video: Video,
  quiz: ListChecks,
  flashcard: Layers,
  tryout: ClipboardList,
  schedule: CalendarDays,
  pkaSchedule: CalendarDays,
  simulation: ClipboardCheck,
  diagnosticReport: BarChart3,
  playground: Terminal,
  studyPath: Compass,
  mastery: Target,
  progress: TrendingUp,
  leaderboard: Trophy,
  examResults: Award,
  live: Radio,
};

export interface CourseMobileTabNavProps {
  courseId: string;
  courseTitle: string;
  isPka?: boolean;
  showStudyPath?: boolean;
  showMastery?: boolean;
  showLive?: boolean;
}

export function CourseMobileTabNav({
  courseId,
  courseTitle,
  isPka = courseId === PKA_COURSE_ID,
  showStudyPath = true,
  showMastery = true,
  showLive = false,
}: CourseMobileTabNavProps) {
  const actualPathname = usePathname();
  const experience = useStudentExperience();
  const pathname = experience.pathname ?? actualPathname;
  const resolveHref = experience.href;
  const viewportMode = useViewportMode();
  const { hideBottomNav } = useMobileChrome();

  const tNav = useTranslations("student.navigation");
  const tMobile = useTranslations("student.mobile");

  useEffect(() => {
    setActiveCourseContext({ id: courseId, title: courseTitle });
    return () => {
      setActiveCourseContext(null);
    };
  }, [courseId, courseTitle]);

  const tabs = useMemo<TabNavItem[]>(() => {
    const descriptors = buildCourseMobileTabs({
      courseId,
      isPka,
      showStudyPath,
      showMastery,
      showLive,
      labels: {
        summary: tNav("summary"),
        documents: tNav("documents"),
        video: tNav("video"),
        quiz: tNav("quiz"),
        flashcard: tNav("flashcard"),
        tryout: tNav("tryout"),
        schedule: tNav("schedule"),
        playground: "Playground",
        studyPath: tMobile("studyPathShort"),
        mastery: tNav("mastery"),
        progress: tNav("progress"),
        leaderboard: tNav("leaderboard"),
        examResults: tMobile("examResultsShort"),
        live: tMobile("liveShort"),
        pkaSchedule: tNav("pkaSchedule"),
        simulation: tNav("simulation"),
        diagnosticReport: tMobile("diagnosticShort"),
        materials: tNav("materials"),
      },
    });

    return descriptors.map((tab) => {
      const Icon = COURSE_TAB_ICONS[tab.id];
      return {
        href: resolveHref ? resolveHref(tab.href) : tab.href,
        label: tab.label,
        icon: Icon ? <Icon className="size-3.5 shrink-0" aria-hidden="true" /> : undefined,
        active: isCourseTabActive(tab, pathname, courseId),
      };
    });
  }, [
    courseId,
    isPka,
    pathname,
    resolveHref,
    showLive,
    showMastery,
    showStudyPath,
    tMobile,
    tNav,
  ]);

  if (viewportMode === "desktop" || hideBottomNav) {
    return null;
  }

  return (
    <TabNav
      tabs={tabs}
      label={tMobile("courseTabsLabel")}
      variant="page"
      activeTone="neutral"
      flush={true}
      className="mx-0 w-full px-1 md:hidden"
    />
  );
}
