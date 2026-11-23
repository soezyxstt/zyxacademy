"use client";

import { useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  CalendarRange,
  Home,
  MessageSquareText,
  UserRound,
} from "lucide-react";
import {
  MobileBottomNav,
  type MobileBottomNavItem,
} from "@/components/navigation";
import { DISCUSSION_COUNTS_CHANGED } from "@/components/discussions/discussion-count-badge";
import { useStudentExperience } from "@/components/student-experience-provider";
import { useQueryAccountId } from "@/hooks/use-query-account";
import { useViewportMode } from "@/hooks/use-viewport-mode";
import { discussionCountsQuery } from "@/lib/discussions/counts-query";
import { useTranslations } from "@/lib/i18n/client";
import { queryKeys } from "@/lib/query/keys";
import { getActiveStudentBottomTab } from "./student-nav-model";

export function StudentMobileBottomNav() {
  const actualPathname = usePathname();
  const experience = useStudentExperience();
  const pathname = experience.pathname ?? actualPathname;
  const resolveHref = experience.href;
  const demo = experience.mode === "demo";
  const viewportMode = useViewportMode();
  const t = useTranslations("student.mobile");
  const tDiscussions = useTranslations("discussions");

  const userId = useQueryAccountId();
  const client = useQueryClient();
  const countsEnabled = !demo && viewportMode === "mobile" && Boolean(userId);

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
  const activeTab = getActiveStudentBottomTab(pathname);

  const items = useMemo<MobileBottomNavItem[]>(() => {
    const toHref = (path: string) => (resolveHref ? resolveHref(path) : path);
    return [
      {
        id: "home",
        label: t("home"),
        icon: Home,
        href: toHref("/dashboard"),
        active: activeTab === "home",
      },
      {
        id: "courses",
        label: t("courses"),
        icon: BookOpen,
        href: toHref("/courses"),
        active: activeTab === "courses",
      },
      {
        id: "schedule",
        label: t("schedule"),
        icon: CalendarRange,
        href: toHref("/dashboard/schedule"),
        active: activeTab === "schedule",
      },
      {
        id: "discuss",
        label: t("discuss"),
        icon: MessageSquareText,
        href: toHref("/dashboard/discussions"),
        active: activeTab === "discuss",
        badgeCount: demo ? undefined : unreadDiscussions,
        badgeLabel:
          !demo && unreadDiscussions > 0
            ? tDiscussions("unreadQuestions", { count: unreadDiscussions })
            : undefined,
      },
      {
        id: "me",
        label: t("me"),
        icon: UserRound,
        href: toHref("/profile"),
        active: activeTab === "me",
      },
    ];
  }, [activeTab, demo, resolveHref, t, tDiscussions, unreadDiscussions]);

  if (viewportMode === "desktop") {
    return null;
  }

  return <MobileBottomNav items={items} ariaLabel={t("bottomNavLabel")} />;
}
