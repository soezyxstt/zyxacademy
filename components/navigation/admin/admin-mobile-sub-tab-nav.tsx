"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { TabNav, type TabNavItem } from "@/components/ui/tabs";
import { useMobileChrome } from "@/components/navigation/mobile-chrome-context";
import { useViewportMode } from "@/hooks/use-viewport-mode";
import { useTranslations } from "@/lib/i18n/client";
import {
  buildAdminCourseSubTabs,
  buildAdminOpsSubTabs,
  buildAdminPeopleSubTabs,
  getAdminSubTabContext,
  isAdminSubTabActive,
  parseAdminCourseSlugFromPathname,
} from "./admin-nav-model";

export function AdminMobileSubTabNav() {
  const pathname = usePathname();
  const viewportMode = useViewportMode();
  const { hideBottomNav } = useMobileChrome();

  const tNav = useTranslations("admin.navigation");
  const tMobile = useTranslations("admin.mobile");
  const tTabs = useTranslations("admin.mobile.tabs");

  const context = getAdminSubTabContext(pathname);
  const courseSlug = parseAdminCourseSlugFromPathname(pathname);

  const { tabs, label } = useMemo<{
    tabs: TabNavItem[];
    label: string;
  }>(() => {
    if (context === "course" && courseSlug) {
      const descriptors = buildAdminCourseSubTabs({
        slug: courseSlug,
        labels: {
          bab: tNav("bab"),
          documents: tNav("documents"),
          videos: tNav("videos"),
          quizzes: tNav("quizzes"),
          tryouts: tNav("tryouts"),
          questions: tNav("questions"),
          flashcards: tNav("flashcards"),
          results: tNav("results"),
          leaderboard: tTabs("leaderboardShort"),
          analytics: tNav("analytics"),
          review: tTabs("reviewShort"),
          settings: tNav("settings"),
        },
      });
      return {
        label: tMobile("courseTabsLabel"),
        tabs: descriptors.map((tab) => ({
          href: tab.href,
          label: tab.label,
          active: isAdminSubTabActive(tab, pathname),
        })),
      };
    }

    if (context === "people") {
      const descriptors = buildAdminPeopleSubTabs({
        users: tTabs("users"),
        groups: tTabs("groups"),
        tokens: tTabs("tokens"),
        pricing: tTabs("pricing"),
        notifications: tTabs("notif"),
      });
      return {
        label: tMobile("peopleTabsLabel"),
        tabs: descriptors.map((tab) => ({
          href: tab.href,
          label: tab.label,
          active: isAdminSubTabActive(tab, pathname),
        })),
      };
    }

    if (context === "ops") {
      const descriptors = buildAdminOpsSubTabs({
        monitor: tTabs("monitor"),
        tutor: tTabs("tutor"),
        zyra: tTabs("zyra"),
        usage: tTabs("usage"),
        web: tTabs("web"),
        models: tTabs("models"),
        flags: tTabs("flags"),
        keys: tTabs("keys"),
      });
      return {
        label: tMobile("opsTabsLabel"),
        tabs: descriptors.map((tab) => ({
          href: tab.href,
          label: tab.label,
          active: isAdminSubTabActive(tab, pathname),
        })),
      };
    }

    return { tabs: [], label: "" };
  }, [context, courseSlug, pathname, tMobile, tNav, tTabs]);

  if (
    viewportMode === "desktop" ||
    hideBottomNav ||
    !context ||
    tabs.length === 0
  ) {
    return null;
  }

  return (
    <div className="md:hidden">
      <TabNav
        tabs={tabs}
        label={label}
        variant="page"
        flush={true}
        className="mx-0 w-full px-1"
      />
    </div>
  );
}
