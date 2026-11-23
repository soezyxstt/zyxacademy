"use client";

import { useMemo, type ElementType } from "react";
import { usePathname } from "next/navigation";
import {
  Activity,
  Award,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  Calculator,
  ClipboardCheck,
  ClipboardList,
  Cpu,
  FileText,
  Flag,
  Globe,
  GraduationCap,
  KeyRound,
  Layers,
  Library,
  ListChecks,
  Settings,
  Trophy,
  UserCog,
  Users,
  Video,
} from "lucide-react";
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

const ADMIN_SUB_TAB_ICONS: Record<string, ElementType> = {
  // Course sub-tabs
  bab: BookOpen,
  documents: FileText,
  videos: Video,
  quizzes: ListChecks,
  tryouts: ClipboardList,
  questions: Library,
  flashcards: Layers,
  results: Award,
  leaderboard: Trophy,
  analytics: BarChart3,
  review: ClipboardCheck,
  settings: Settings,
  // People sub-tabs
  users: UserCog,
  groups: Users,
  tokens: KeyRound,
  pricing: Calculator,
  notifications: Bell,
  // Ops sub-tabs
  monitor: Activity,
  tutor: GraduationCap,
  zyra: Bot,
  usage: BarChart3,
  web: Globe,
  models: Cpu,
  flags: Flag,
  keys: KeyRound,
};

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
    const mapWithIcons = <T extends { id: string; href: string; label: string; exact?: boolean }>(
      descriptors: T[]
    ): TabNavItem[] =>
      descriptors.map((tab) => {
        const Icon = ADMIN_SUB_TAB_ICONS[tab.id];
        return {
          href: tab.href,
          label: tab.label,
          icon: Icon ? <Icon className="size-3.5 shrink-0" aria-hidden="true" /> : undefined,
          active: isAdminSubTabActive(tab, pathname),
        };
      });

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
        tabs: mapWithIcons(descriptors),
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
        tabs: mapWithIcons(descriptors),
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
        tabs: mapWithIcons(descriptors),
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
    <TabNav
      tabs={tabs}
      label={label}
      variant="page"
      flush={true}
      className="mx-0 w-full px-1 md:hidden"
    />
  );
}
