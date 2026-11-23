"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, Flame } from "lucide-react";
import {
  MobileTopNavSearchTrigger,
  MobileTopNavbar,
  useMobileChrome,
} from "@/components/navigation";
import { Button } from "@/components/ui/button";
import { useCommandMenu } from "@/components/command-menu";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { SidebarAccountMenu } from "@/components/auth/sidebar-account-menu";
import {
  StudentAccountBoundary,
  type StudentAccountState,
} from "@/components/student-account-boundary";
import { useStudentExperience } from "@/components/student-experience-provider";
import { getRouteTitle } from "@/components/mobile-navbar";
import { useStudentSidebarData } from "@/hooks/use-student-sidebar-data";
import { useViewportMode } from "@/hooks/use-viewport-mode";
import { useTranslations } from "@/lib/i18n/client";
import { StudentMobileCourseSheet } from "./student-mobile-course-sheet";
import {
  getActiveCourseContext,
  getActiveCourseIdFromPathname,
  getStudentMobileBackHref,
  isStudentRootHub,
  resolveCourseSwitchHref,
  subscribeActiveCourseContext,
  type StudentCourseSummary,
} from "./student-nav-model";

export function StudentMobileTopNav() {
  const viewportMode = useViewportMode();

  if (viewportMode === "desktop") {
    return null;
  }

  return (
    <StudentAccountBoundary>
      {({ data }) => <StudentMobileTopNavContent session={data} />}
    </StudentAccountBoundary>
  );
}

function StudentMobileTopNavContent({
  session,
}: {
  session: StudentAccountState["data"];
}) {
  const actualPathname = usePathname();
  const router = useRouter();
  const experience = useStudentExperience();
  const pathname = experience.pathname ?? actualPathname;
  const href = experience.href ?? ((path: string) => path);
  const demo = experience.mode === "demo";
  const viewportMode = useViewportMode();

  const t = useTranslations("student");
  const tAdmin = useTranslations("admin");
  const tTutor = useTranslations("tutor");
  const tSearch = useTranslations("search");
  const { setOpen: setSearchOpen, openWithQuery } = useCommandMenu();
  const { topNav } = useMobileChrome();

  const [courseSheetOpen, setCourseSheetOpen] = useState(false);
  const [eventTitle, setEventTitle] = useState<string | null>(null);

  useEffect(() => {
    const handleSetTitle = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string") setEventTitle(detail);
    };
    const handleClearTitle = () => setEventTitle(null);

    window.addEventListener("zyx:set-mobile-title", handleSetTitle);
    window.addEventListener("zyx:clear-mobile-title", handleClearTitle);
    return () => {
      window.removeEventListener("zyx:set-mobile-title", handleSetTitle);
      window.removeEventListener("zyx:clear-mobile-title", handleClearTitle);
    };
  }, []);

  const activeCourseContext = useSyncExternalStore(
    subscribeActiveCourseContext,
    getActiveCourseContext,
    () => null
  );
  const activeCourseId = getActiveCourseIdFromPathname(pathname);
  const userId = session?.user?.id;
  const liveData = useStudentSidebarData({
    userId,
    activeCourseId,
    pathname,
    enabled: !demo && viewportMode === "mobile",
  });

  const enrolledCourses = useMemo(
    () => (demo ? (experience.courses ?? []) : liveData.courses),
    [demo, experience.courses, liveData.courses]
  );
  const activeCourseMetadata = demo
    ? enrolledCourses.find((course) => course.id === activeCourseId)
    : liveData.activeCourse;
  const streakCurrent = demo
    ? (experience.streak?.current ?? null)
    : liveData.streak;

  const contextCourseTitle =
    activeCourseContext &&
    activeCourseId &&
    activeCourseContext.id === activeCourseId
      ? activeCourseContext.title
      : undefined;

  const courseTitle =
    contextCourseTitle ||
    activeCourseMetadata?.title ||
    eventTitle ||
    t("navigation.loadingCourse");

  const coursesToDisplay = useMemo<StudentCourseSummary[]>(() => {
    const list: StudentCourseSummary[] = [];
    const seen = new Set<string>();

    for (const course of enrolledCourses) {
      if (!seen.has(course.id)) {
        seen.add(course.id);
        list.push({ id: course.id, title: course.title });
      }
    }

    if (activeCourseId && !seen.has(activeCourseId)) {
      list.unshift({
        id: activeCourseId,
        title:
          contextCourseTitle ||
          activeCourseMetadata?.title ||
          eventTitle ||
          t("routeTitles.course"),
      });
    }

    return list;
  }, [
    activeCourseId,
    activeCourseMetadata?.title,
    contextCourseTitle,
    enrolledCourses,
    eventTitle,
    t,
  ]);

  const handleSelectCourse = (targetCourseId: string) => {
    if (targetCourseId === activeCourseId) return;
    const nextPath = resolveCourseSwitchHref(
      pathname,
      activeCourseId,
      targetCourseId
    );
    router.push(href(nextPath));
  };

  const translateRoute = (key: string) => {
    if (key.startsWith("admin.")) return tAdmin(key.slice("admin.".length));
    if (key.startsWith("tutor.")) return tTutor(key.slice("tutor.".length));
    return t(key);
  };

  const routeTitle =
    eventTitle || getRouteTitle(pathname, "student", translateRoute);
  const isRootHub = isStudentRootHub(pathname);
  const isCourseRoute = Boolean(activeCourseId);
  const isDashboard = pathname === "/dashboard";
  const isProfile = pathname === "/profile";
  const backHref = href(getStudentMobileBackHref(pathname));
  const backLabel = t("mobile.back");

  const hasChildTopNavOverride = Boolean(
    topNav.leftSlot || topNav.backHref || topNav.onBack
  );
  const showCourseSwitcher = isCourseRoute && !hasChildTopNavOverride;

  const courseLeftSlot = showCourseSwitcher ? (
    <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
      <Button
        asChild
        variant="outline"
        size="icon-lg"
        className="relative size-9 shrink-0 rounded-xl border-border/60 bg-card/85 text-muted-foreground shadow-xs backdrop-blur-md transition-all duration-150 hover:border-border hover:bg-muted/85 hover:text-foreground active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 after:absolute after:-inset-1 after:content-['']"
      >
        <Link href={backHref} aria-label={backLabel}>
          <ArrowLeft className="size-4" aria-hidden="true" />
        </Link>
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={() => setCourseSheetOpen(true)}
        aria-label={`${t("navigation.switchCourse")}: ${courseTitle}`}
        aria-haspopup="dialog"
        aria-expanded={courseSheetOpen}
        className="h-9 min-w-0 max-w-full flex-1 rounded-xl border-border/60 bg-card/85 px-2.5 text-left text-body-sm font-medium text-foreground shadow-xs backdrop-blur-md transition-all duration-150 hover:border-border hover:bg-muted/70 hover:text-foreground active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 [&>span]:justify-between"
      >
        <span className="min-w-0 flex-1 truncate">{courseTitle}</span>
        <ChevronDown
          className="size-3.5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      </Button>
    </div>
  ) : undefined;

  const rightActions = (
    <>
      {isDashboard && streakCurrent !== null ? (
        <Link
          href={href("/achievements")}
          aria-label={t("navigation.streak", { count: streakCurrent })}
          className="flex h-9 shrink-0 items-center gap-1 rounded-xl border border-border/60 bg-card/85 px-2 text-body-sm font-medium text-brand-secondary shadow-xs backdrop-blur-md transition-colors hover:bg-muted/85 focus-visible:outline-[2px] focus-visible:outline-[var(--zx-accent)]"
        >
          <Flame className="size-4 shrink-0" aria-hidden="true" />
          <span className="tabular-nums">{streakCurrent}</span>
        </Link>
      ) : null}

      <MobileTopNavSearchTrigger label={t("mobile.search")} />

      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-card/85 shadow-xs backdrop-blur-md">
        <NotificationBell variant="sidebar" />
      </div>

      {isProfile && session?.user ? (
        <div className="flex size-9 shrink-0 items-center justify-center">
          <SidebarAccountMenu collapsed={true} session={session} />
        </div>
      ) : null}
    </>
  );

  const searchLabels = useMemo(
    () => ({
      placeholder: tSearch("searchPagePlaceholder"),
      searchGlobally: tSearch("searchGlobally"),
      searchGloballyQuery: (query: string) =>
        tSearch("searchGloballyQuery", { query }),
      clear: tSearch("clear"),
      close: tSearch("closeSearch"),
    }),
    [tSearch]
  );

  return (
    <>
      <MobileTopNavbar
        title={showCourseSwitcher ? "" : routeTitle}
        logoHref={isRootHub ? href("/dashboard") : undefined}
        logoLabel={`${t("navigation.dashboard")} Zyx`}
        backHref={!isRootHub && !showCourseSwitcher ? backHref : undefined}
        backLabel={backLabel}
        leftSlot={courseLeftSlot}
        rightActions={rightActions}
        searchLabels={searchLabels}
        onOpenGlobalSearch={(q) =>
          q && openWithQuery ? openWithQuery(q) : setSearchOpen(true)
        }
      />

      {isCourseRoute ? (
        <StudentMobileCourseSheet
          open={courseSheetOpen}
          onOpenChange={setCourseSheetOpen}
          title={t("navigation.switchCourse")}
          courses={coursesToDisplay}
          activeCourseId={activeCourseId}
          onSelectCourse={handleSelectCourse}
          exploreHref={href("/courses")}
          exploreLabel={t("navigation.exploreCourses")}
        />
      ) : null}
    </>
  );
}
