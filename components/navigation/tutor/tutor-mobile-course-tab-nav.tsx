"use client";

import { useEffect, useMemo, type ElementType } from "react";
import { usePathname } from "next/navigation";
import {
  ClipboardCheck,
  FileCheck2,
  FileText,
  LayoutDashboard,
  ListChecks,
  MessageSquareText,
  Radio,
  Users,
  Video,
} from "lucide-react";
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
  type TutorCourseTabId,
} from "./tutor-nav-model";

const TUTOR_COURSE_TAB_ICONS: Record<TutorCourseTabId, ElementType> = {
  overview: LayoutDashboard,
  quizzes: ListChecks,
  quizGrading: ClipboardCheck,
  tryoutGrading: FileCheck2,
  participants: Users,
  discussions: MessageSquareText,
  live: Radio,
  materials: FileText,
  videos: Video,
};

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

    return descriptors.map((tab) => {
      const Icon = TUTOR_COURSE_TAB_ICONS[tab.id];
      return {
        href: tab.href,
        label: tab.label,
        icon: Icon ? <Icon className="size-3.5 shrink-0" aria-hidden="true" /> : undefined,
        active: isTutorCourseTabActive(tab, pathname, courseId),
        badge: tab.hasDiscussionBadge ? (
          <DiscussionCountBadge
            courseId={courseId}
            enabled={viewportMode === "mobile"}
          />
        ) : undefined,
      };
    });
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
    <TabNav
      tabs={tabs}
      label={tMobile("courseTabsLabel")}
      variant="page"
      flush={true}
      className="mx-0 w-full px-1 md:hidden"
    />
  );
}
