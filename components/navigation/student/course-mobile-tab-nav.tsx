"use client";

import { useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { TabNav, type TabNavItem } from "@/components/ui/tabs";
import { useMobileChrome } from "@/components/navigation/mobile-chrome-context";
import { DiscussionCountBadge } from "@/components/discussions/discussion-count-badge";
import { useStudentExperience } from "@/components/student-experience-provider";
import { useViewportMode } from "@/hooks/use-viewport-mode";
import { useTranslations } from "@/lib/i18n/client";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import {
  buildCourseMobileTabs,
  isCourseTabActive,
  setActiveCourseContext,
} from "./student-nav-model";

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
  const demo = experience.mode === "demo";
  const viewportMode = useViewportMode();
  const { hideBottomNav } = useMobileChrome();

  const tNav = useTranslations("student.navigation");
  const tMobile = useTranslations("student.mobile");
  const tDiscussion = useTranslations("tutor.schedule");

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
        discussions: tDiscussion("discussion"),
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

    return descriptors.map((tab) => ({
      href: resolveHref ? resolveHref(tab.href) : tab.href,
      label: tab.label,
      active: isCourseTabActive(tab, pathname, courseId),
      badge:
        tab.hasDiscussionBadge && !demo ? (
          <DiscussionCountBadge
            courseId={courseId}
            enabled={viewportMode === "mobile"}
          />
        ) : undefined,
    }));
  }, [
    courseId,
    demo,
    isPka,
    pathname,
    resolveHref,
    showLive,
    showMastery,
    showStudyPath,
    tDiscussion,
    tMobile,
    tNav,
    viewportMode,
  ]);

  if (viewportMode === "desktop" || hideBottomNav) {
    return null;
  }

  return (
    <TabNav
      tabs={tabs}
      label={tMobile("courseTabsLabel")}
      variant="page"
      flush={true}
      className="mx-0 w-full px-1 md:hidden"
    />
  );
}
