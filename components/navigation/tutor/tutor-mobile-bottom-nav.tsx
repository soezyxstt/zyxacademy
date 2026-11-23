"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  GraduationCap,
  Home,
  MessageSquareText,
} from "lucide-react";
import {
  MobileBottomNav,
  type MobileBottomNavItem,
} from "@/components/navigation";
import { DISCUSSION_COUNTS_CHANGED } from "@/components/discussions/discussion-count-badge";
import { useQueryAccountId } from "@/hooks/use-query-account";
import { useViewportMode } from "@/hooks/use-viewport-mode";
import { discussionCountsQuery } from "@/lib/discussions/counts-query";
import { useTranslations } from "@/lib/i18n/client";
import { queryKeys } from "@/lib/query/keys";
import { TutorMobileCourseSheet } from "./tutor-mobile-course-sheet";
import {
  getActiveTutorBottomTab,
  getActiveTutorCourseIdFromPathname,
  resolveTutorCourseSwitchHref,
  type TutorCourseSummary,
} from "./tutor-nav-model";

export interface TutorMobileBottomNavProps {
  assignedCourses?: TutorCourseSummary[];
}

export function TutorMobileBottomNav({
  assignedCourses = [],
}: TutorMobileBottomNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const viewportMode = useViewportMode();
  const tMobile = useTranslations("tutor.mobile");
  const tNav = useTranslations("tutor.navigation");
  const tDiscussions = useTranslations("discussions");

  const [courseSheetOpen, setCourseSheetOpen] = useState(false);

  const userId = useQueryAccountId();
  const client = useQueryClient();
  const countsEnabled = viewportMode === "mobile" && Boolean(userId);

  const { data: discussionCounts } = useQuery({
    ...discussionCountsQuery(userId ?? ""),
    enabled: countsEnabled,
  });

  useEffect(() => {
    if (!countsEnabled || !userId) return;
    const refresh = () => {
      void client.invalidateQueries({
        queryKey: queryKeys.discussions.all(userId),
      });
    };
    window.addEventListener(DISCUSSION_COUNTS_CHANGED, refresh);
    return () => window.removeEventListener(DISCUSSION_COUNTS_CHANGED, refresh);
  }, [client, countsEnabled, userId]);

  const unreadDiscussions = discussionCounts?.total.unreadThreads ?? 0;
  const activeTab = getActiveTutorBottomTab(pathname);
  const activeCourseId = getActiveTutorCourseIdFromPathname(pathname);
  const singleCourse =
    assignedCourses.length === 1 ? assignedCourses[0] : undefined;

  const items = useMemo<MobileBottomNavItem[]>(() => {
    const classesItem: MobileBottomNavItem = singleCourse
      ? {
          id: "classes",
          label: tMobile("classes"),
          icon: GraduationCap,
          href: `/tutor/${singleCourse.courseId}`,
          active: activeTab === "classes",
        }
      : {
          id: "classes",
          label: tMobile("classes"),
          icon: GraduationCap,
          onClick: () => setCourseSheetOpen(true),
          active: activeTab === "classes",
        };

    return [
      {
        id: "home",
        label: tMobile("home"),
        icon: Home,
        href: "/tutor",
        active: activeTab === "home",
      },
      {
        id: "schedule",
        label: tMobile("schedule"),
        icon: CalendarDays,
        href: "/tutor/schedule",
        active: activeTab === "schedule",
      },
      {
        id: "discuss",
        label: tMobile("discuss"),
        icon: MessageSquareText,
        href: "/tutor/discussions",
        active: activeTab === "discuss",
        badgeCount: unreadDiscussions,
        badgeLabel:
          unreadDiscussions > 0
            ? tDiscussions("unreadQuestions", { count: unreadDiscussions })
            : undefined,
      },
      classesItem,
    ];
  }, [activeTab, singleCourse, tDiscussions, tMobile, unreadDiscussions]);

  if (viewportMode === "desktop") {
    return null;
  }

  return (
    <>
      <MobileBottomNav
        items={items}
        ariaLabel={tMobile("bottomNavLabel")}
      />

      {!singleCourse ? (
        <TutorMobileCourseSheet
          open={courseSheetOpen}
          onOpenChange={setCourseSheetOpen}
          title={tMobile("switchCourse")}
          emptyLabel={tNav("noCourses")}
          courses={assignedCourses}
          activeCourseId={activeCourseId}
          onSelectCourse={(targetCourseId) => {
            const nextPath = resolveTutorCourseSwitchHref(
              pathname,
              activeCourseId,
              targetCourseId
            );
            router.push(nextPath);
          }}
        />
      ) : null}
    </>
  );
}
