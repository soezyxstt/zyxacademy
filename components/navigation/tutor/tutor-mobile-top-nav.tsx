"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronsUpDown, Search } from "lucide-react";
import {
  MobileTopNavActionButton,
  MobileTopNavbar,
  useMobileChrome,
} from "@/components/navigation";
import { Button } from "@/components/ui/button";
import { useCommandMenu } from "@/components/command-menu";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { AppUpdateControl } from "@/components/native/app-update-control";
import { SidebarAccountMenu } from "@/components/auth/sidebar-account-menu";
import {
  StudentAccountBoundary,
  type StudentAccountState,
} from "@/components/student-account-boundary";
import { getRouteTitle } from "@/components/mobile-navbar";
import { useViewportMode } from "@/hooks/use-viewport-mode";
import { useTranslations } from "@/lib/i18n/client";
import { TutorMobileCourseSheet } from "./tutor-mobile-course-sheet";
import {
  findAssignedTutorCourse,
  getActiveTutorCourseContext,
  getActiveTutorCourseIdFromPathname,
  getTutorDetailRouteTitleKey,
  getTutorMobileBackHref,
  isTutorDetailOrFormRoute,
  isTutorRootHub,
  resolveTutorCourseSwitchHref,
  subscribeActiveTutorCourseContext,
  type TutorCourseSummary,
} from "./tutor-nav-model";

export interface TutorMobileTopNavProps {
  assignedCourses?: TutorCourseSummary[];
}

export function TutorMobileTopNav({
  assignedCourses = [],
}: TutorMobileTopNavProps) {
  const viewportMode = useViewportMode();

  if (viewportMode === "desktop") {
    return null;
  }

  return (
    <StudentAccountBoundary>
      {({ data }) => (
        <TutorMobileTopNavContent
          session={data}
          assignedCourses={assignedCourses}
        />
      )}
    </StudentAccountBoundary>
  );
}

function TutorMobileTopNavContent({
  session,
  assignedCourses,
}: {
  session: StudentAccountState["data"];
  assignedCourses: TutorCourseSummary[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("tutor");
  const tAdmin = useTranslations("admin");
  const tStudent = useTranslations("student");
  const { setOpen: setSearchOpen } = useCommandMenu();
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
    subscribeActiveTutorCourseContext,
    getActiveTutorCourseContext,
    () => null
  );

  const activeCourseId = getActiveTutorCourseIdFromPathname(pathname);
  const matchedCourse = findAssignedTutorCourse(assignedCourses, activeCourseId);

  const contextCourseTitle =
    activeCourseContext &&
    activeCourseId &&
    (activeCourseContext.courseId === activeCourseId ||
      activeCourseContext.legacyCourseId === activeCourseId)
      ? activeCourseContext.title
      : undefined;

  const courseTitle =
    matchedCourse?.title ||
    contextCourseTitle ||
    eventTitle ||
    t("routeTitles.overview");

  const coursesToDisplay = useMemo<TutorCourseSummary[]>(() => {
    const list: TutorCourseSummary[] = [];
    const seen = new Set<string>();

    for (const course of assignedCourses) {
      if (!seen.has(course.courseId)) {
        seen.add(course.courseId);
        list.push(course);
      }
    }

    if (
      activeCourseId &&
      !findAssignedTutorCourse(list, activeCourseId)
    ) {
      list.unshift({
        courseId: activeCourseId,
        title: courseTitle,
        code: null,
      });
    }

    return list;
  }, [activeCourseId, assignedCourses, courseTitle]);

  const handleSelectCourse = (targetCourseId: string) => {
    if (
      targetCourseId === activeCourseId ||
      (matchedCourse && matchedCourse.courseId === targetCourseId)
    ) {
      return;
    }
    const nextPath = resolveTutorCourseSwitchHref(
      pathname,
      activeCourseId,
      targetCourseId
    );
    router.push(nextPath);
  };

  const translateRoute = (key: string) => {
    if (key.startsWith("admin.")) return tAdmin(key.slice("admin.".length));
    if (key.startsWith("tutor.")) return t(key.slice("tutor.".length));
    return tStudent(key);
  };

  const isDetailRoute = isTutorDetailOrFormRoute(pathname);
  const isRootHub = isTutorRootHub(pathname);
  const isCourseRoute = Boolean(activeCourseId);
  const detailTitleKey = getTutorDetailRouteTitleKey(pathname);

  const fallbackRouteTitle =
    eventTitle || getRouteTitle(pathname, "tutor", translateRoute);

  const resolvedTitle = detailTitleKey
    ? detailTitleKey === "docs"
      ? eventTitle || t("routeTitles.docs")
      : t(`routeTitles.${detailTitleKey}`)
    : fallbackRouteTitle;

  const hasChildTopNavOverride = Boolean(
    topNav.leftSlot || topNav.backHref || topNav.onBack
  );
  const canSwitchCourses = coursesToDisplay.length > 1;
  const showCourseSwitcher =
    isCourseRoute && !isDetailRoute && !hasChildTopNavOverride;

  const courseLeftSlot =
    showCourseSwitcher && canSwitchCourses ? (
      <Button
        type="button"
        variant="outline"
        onClick={() => setCourseSheetOpen(true)}
        aria-label={`${t("mobile.switchCourse")}: ${courseTitle}`}
        aria-haspopup="dialog"
        aria-expanded={courseSheetOpen}
        className="h-9 min-w-0 max-w-full flex-1 rounded-xl border-border/60 bg-card/85 px-2.5 text-left text-body-sm font-medium text-foreground shadow-xs backdrop-blur-md transition-all duration-150 hover:border-border hover:bg-muted/70 hover:text-foreground active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 [&>span]:justify-between"
      >
        <span className="min-w-0 flex-1 truncate">{courseTitle}</span>
        <ChevronsUpDown
          className="size-3.5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      </Button>
    ) : undefined;

  const backHref =
    isDetailRoute || (!isRootHub && !isCourseRoute)
      ? getTutorMobileBackHref(pathname)
      : undefined;

  const rightActions = (
    <>
      <AppUpdateControl variant="mobile" />

      <MobileTopNavActionButton
        label={t("mobile.search")}
        onClick={() => setSearchOpen(true)}
      >
        <Search className="size-4" aria-hidden="true" />
      </MobileTopNavActionButton>

      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-card/85 shadow-xs backdrop-blur-md">
        <NotificationBell variant="sidebar" />
      </div>

      {session?.user ? (
        <div className="flex size-9 shrink-0 items-center justify-center">
          <SidebarAccountMenu collapsed={true} session={session} />
        </div>
      ) : null}
    </>
  );

  return (
    <>
      <MobileTopNavbar
        title={
          courseLeftSlot
            ? ""
            : showCourseSwitcher
              ? courseTitle
              : resolvedTitle
        }
        backHref={backHref}
        backLabel={t("mobile.back")}
        leftSlot={courseLeftSlot}
        rightActions={rightActions}
      />

      {isCourseRoute && canSwitchCourses ? (
        <TutorMobileCourseSheet
          open={courseSheetOpen}
          onOpenChange={setCourseSheetOpen}
          title={t("mobile.switchCourse")}
          emptyLabel={t("navigation.noCourses")}
          courses={coursesToDisplay}
          activeCourseId={activeCourseId}
          onSelectCourse={handleSelectCourse}
        />
      ) : null}
    </>
  );
}
