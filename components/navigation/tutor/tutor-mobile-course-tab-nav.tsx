"use client";

import { useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { TabNav, type TabNavItem } from "@/components/ui/tabs";
import { useMobileChrome } from "@/components/navigation/mobile-chrome-context";
import { DiscussionCountBadge } from "@/components/discussions/discussion-count-badge";
import { useViewportMode } from "@/hooks/use-viewport-mode";
import { useTranslations } from "@/lib/i18n/client";
import {
  buildTutorCourseMobileTabs,
  findAssignedTutorCourse,
  getActiveTutorCourseIdFromPathname,
  isTutorCourseTabActive,
  setActiveTutorCourseContext,
  shouldHideTutorCourseTabs,
  type TutorCourseSummary,
} from "./tutor-nav-model";

export interface TutorMobileCourseTabNavProps {
  assignedCourses?: TutorCourseSummary[];
}

export function TutorMobileCourseTabNav({
  assignedCourses = [],
}: TutorMobileCourseTabNavProps) {
  const pathname = usePathname();
  const viewportMode = useViewportMode();
  const { hideBottomNav } = useMobileChrome();

  const tNav = useTranslations("tutor.navigation");
  const tMobile = useTranslations("tutor.mobile");
  const tDiscussion = useTranslations("tutor.schedule");

  const courseId = getActiveTutorCourseIdFromPathname(pathname);
  const matchedCourse = findAssignedTutorCourse(assignedCourses, courseId);

  useEffect(() => {
    if (matchedCourse) {
      setActiveTutorCourseContext(matchedCourse);
    } else {
      setActiveTutorCourseContext(null);
    }
    return () => {
      setActiveTutorCourseContext(null);
    };
  }, [matchedCourse]);

  const tabs = useMemo<TabNavItem[]>(() => {
    if (!courseId) return [];

    const descriptors = buildTutorCourseMobileTabs({
      courseId,
      labels: {
        overview: tNav("overview"),
        quizzes: tNav("quizzes"),
        quizGrading: tNav("quizGrading"),
        tryoutGrading: tNav("tryoutGrading"),
        participants: tMobile("participantsShort"),
        discussions: tDiscussion("discussion"),
        live: tMobile("liveShort"),
        materials: tMobile("materialsShort"),
        videos: tNav("videos"),
      },
    });

    return descriptors.map((tab) => ({
      href: tab.href,
      label: tab.label,
      active: isTutorCourseTabActive(tab, pathname, courseId),
      badge: tab.hasDiscussionBadge ? (
        <DiscussionCountBadge
          courseId={courseId}
          enabled={viewportMode === "mobile"}
        />
      ) : undefined,
    }));
  }, [courseId, pathname, tDiscussion, tMobile, tNav, viewportMode]);

  if (
    viewportMode === "desktop" ||
    hideBottomNav ||
    !courseId ||
    shouldHideTutorCourseTabs(pathname)
  ) {
    return null;
  }

  return (
    <div className="md:hidden">
      <TabNav
        tabs={tabs}
        label={tMobile("courseTabsLabel")}
        variant="page"
        flush={true}
        className="mx-0 w-full px-1"
      />
    </div>
  );
}
