"use client";

import { useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { STUDENT_MOBILE_DESTINATIONS } from "./student-mobile-destinations";
import { useStudentTabLinkOptions } from "./student-tab-reuse";
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
  const optionsFor = useStudentTabLinkOptions();
  const activeTab = getActiveStudentBottomTab(pathname);

  const items = useMemo<MobileBottomNavItem[]>(() => {
    const toHref = (path: string) => (resolveHref ? resolveHref(path) : path);
    return STUDENT_MOBILE_DESTINATIONS.map(({ id, href, icon }) => {
      const resolvedHref = toHref(href);
      return {
        id,
        label: t(id),
        icon,
        href: resolvedHref,
        ...optionsFor(resolvedHref),
        active: activeTab === id,
        badgeCount: !demo && id === "discuss" ? unreadDiscussions : undefined,
        badgeLabel:
          !demo && id === "discuss" && unreadDiscussions > 0
            ? tDiscussions("unreadQuestions", { count: unreadDiscussions })
            : undefined,
      };
    });
  }, [activeTab, demo, optionsFor, resolveHref, t, tDiscussions, unreadDiscussions]);

  if (viewportMode === "desktop") {
    return null;
  }

  return (
    <MobileBottomNav
      items={items}
      ariaLabel={t("bottomNavLabel")}
      activeTone="neutral"
    />
  );
}
