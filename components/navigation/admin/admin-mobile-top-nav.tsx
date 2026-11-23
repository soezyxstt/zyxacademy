"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Bot, ChevronsUpDown, Search } from "lucide-react";
import {
  MobileTopNavActionButton,
  MobileTopNavbar,
  useMobileChrome,
} from "@/components/navigation";
import { Button } from "@/components/ui/button";
import { useCommandMenu } from "@/components/command-menu";
import { useOptionalOpsAiContext } from "@/components/admin/ops-ai/ops-ai-context";
import { SidebarAccountMenu } from "@/components/auth/sidebar-account-menu";
import {
  StudentAccountBoundary,
  type StudentAccountState,
} from "@/components/student-account-boundary";
import { getRouteTitle } from "@/components/mobile-navbar";
import {
  getCourseNavContext,
  getCourses,
} from "@/app/(admin)/admin/(academic)/courses/actions";
import { useViewportMode } from "@/hooks/use-viewport-mode";
import { useTranslations } from "@/lib/i18n/client";
import { AdminMobileCourseSheet } from "./admin-mobile-course-sheet";
import {
  getActiveAdminCourseContext,
  getAdminDetailTitleKey,
  getAdminMobileBackHref,
  isAdminDeepDetailRoute,
  isAdminRootHub,
  parseAdminCourseSlugFromPathname,
  resolveAdminCourseSwitchHref,
  setActiveAdminCourseContext,
  subscribeActiveAdminCourseContext,
  type AdminCourseSummary,
} from "./admin-nav-model";

export function AdminMobileTopNav() {
  const viewportMode = useViewportMode();

  if (viewportMode === "desktop") {
    return null;
  }

  return (
    <StudentAccountBoundary>
      {({ data }) => <AdminMobileTopNavContent session={data} />}
    </StudentAccountBoundary>
  );
}

function AdminMobileTopNavContent({
  session,
}: {
  session: StudentAccountState["data"];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const tAdmin = useTranslations("admin");
  const tTutor = useTranslations("tutor");
  const tStudent = useTranslations("student");
  const { setOpen: setSearchOpen } = useCommandMenu();
  const { topNav } = useMobileChrome();
  const opsAi = useOptionalOpsAiContext();

  const [courseSheetOpen, setCourseSheetOpen] = useState(false);
  const [courses, setCourses] = useState<AdminCourseSummary[]>([]);
  const [eventTitle, setEventTitle] = useState<string | null>(null);

  useEffect(() => {
    const handleSetTitle = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
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

  const courseSlug = useMemo(
    () => parseAdminCourseSlugFromPathname(pathname),
    [pathname]
  );

  const activeCourseContext = useSyncExternalStore(
    subscribeActiveAdminCourseContext,
    getActiveAdminCourseContext,
    () => null
  );

  useEffect(() => {
    if (!courseSlug) {
      setActiveAdminCourseContext(null);
      return;
    }

    let cancelled = false;
    getCourseNavContext(courseSlug)
      .then((res) => {
        if (cancelled) return;
        if (res) {
          setActiveAdminCourseContext({
            id: res.slug || courseSlug,
            slug: res.slug || courseSlug,
            title: res.title,
            category: res.category,
          });
        } else {
          setActiveAdminCourseContext({
            id: courseSlug,
            slug: courseSlug,
            title: courseSlug,
          });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setActiveAdminCourseContext({
          id: courseSlug,
          slug: courseSlug,
          title: courseSlug,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [courseSlug]);

  useEffect(() => {
    if (!courseSlug) return;
    let cancelled = false;
    getCourses()
      .then((res) => {
        if (!cancelled && Array.isArray(res)) {
          setCourses(
            res.map((course) => ({
              id: course.id,
              slug: course.id,
              title: course.title,
              category: course.category,
            }))
          );
        }
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [courseSlug]);

  const courseTitle =
    (activeCourseContext &&
    (activeCourseContext.slug === courseSlug ||
      activeCourseContext.id === courseSlug)
      ? activeCourseContext.title
      : undefined) ||
    courses.find((course) => course.id === courseSlug || course.slug === courseSlug)
      ?.title ||
    courseSlug ||
    tAdmin("routeTitles.courses");

  const coursesToDisplay = useMemo<AdminCourseSummary[]>(() => {
    const list: AdminCourseSummary[] = [];
    const seen = new Set<string>();
    for (const course of courses) {
      if (!seen.has(course.id)) {
        seen.add(course.id);
        list.push(course);
      }
    }
    if (courseSlug && !seen.has(courseSlug)) {
      list.unshift({
        id: courseSlug,
        slug: courseSlug,
        title: courseTitle,
      });
    }
    return list;
  }, [courseSlug, courseTitle, courses]);

  const handleSelectCourse = (targetSlug: string) => {
    if (targetSlug === courseSlug) return;
    router.push(resolveAdminCourseSwitchHref(pathname, targetSlug));
  };

  const handleToggleOpsAi = () => {
    if (opsAi) {
      opsAi.toggleOpen();
    } else {
      window.dispatchEvent(new CustomEvent("zyx:toggle-ops-ai"));
    }
  };

  const translateRoute = (key: string) => {
    if (key.startsWith("admin.")) return tAdmin(key.slice("admin.".length));
    if (key.startsWith("tutor.")) return tTutor(key.slice("tutor.".length));
    return tStudent(key);
  };

  const isDeepDetail = isAdminDeepDetailRoute(pathname);
  const isRootHub = isAdminRootHub(pathname);
  const isCourseRoute = Boolean(courseSlug);
  const detailTitleKey = getAdminDetailTitleKey(pathname);

  const fallbackRouteTitle =
    eventTitle || getRouteTitle(pathname, "admin", translateRoute);

  const resolvedTitle = detailTitleKey
    ? eventTitle || tAdmin(`mobile.detailTitles.${detailTitleKey}`)
    : fallbackRouteTitle;

  const hasChildLeftOverride = Boolean(
    topNav.leftSlot || topNav.backHref || topNav.onBack
  );
  const showCourseSwitcher =
    isCourseRoute && !isDeepDetail && !hasChildLeftOverride;

  const courseLeftSlot = showCourseSwitcher ? (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      <Button
        asChild
        variant="outline"
        size="icon-lg"
        className="relative size-9 shrink-0 rounded-xl border-border/60 bg-card/85 text-muted-foreground shadow-xs backdrop-blur-md transition-all duration-150 hover:border-border hover:bg-muted/85 hover:text-foreground active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 after:absolute after:-inset-1 after:content-['']"
      >
        <Link href="/admin/courses" aria-label={tAdmin("mobile.back")}>
          <ArrowLeft className="size-4" aria-hidden="true" />
        </Link>
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={() => setCourseSheetOpen(true)}
        aria-label={`${tAdmin("mobile.switchCourse")}: ${courseTitle}`}
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
    </div>
  ) : undefined;

  const backHref = isDeepDetail ? getAdminMobileBackHref(pathname) : undefined;
  const logoHref = isRootHub && !isDeepDetail ? "/admin" : undefined;

  const rightActions = (
    <>
      <MobileTopNavActionButton
        label={tAdmin("mobile.opsAi")}
        aria-expanded={opsAi?.isOpen ?? false}
        aria-controls="ops-ai-panel"
        onClick={handleToggleOpsAi}
      >
        <Bot className="size-4 text-primary" aria-hidden="true" />
      </MobileTopNavActionButton>

      <MobileTopNavActionButton
        label={tAdmin("mobile.search")}
        onClick={() => setSearchOpen(true)}
      >
        <Search className="size-4" aria-hidden="true" />
      </MobileTopNavActionButton>

      {!isDeepDetail && session?.user ? (
        <div className="flex size-9 shrink-0 items-center justify-center">
          <SidebarAccountMenu collapsed={true} session={session} />
        </div>
      ) : null}
    </>
  );

  return (
    <>
      <MobileTopNavbar
        title={courseLeftSlot ? "" : resolvedTitle}
        logoHref={logoHref}
        logoLabel={tAdmin("navigation.dashboard")}
        backHref={backHref}
        backLabel={tAdmin("mobile.back")}
        leftSlot={courseLeftSlot}
        rightActions={rightActions}
      />

      {isCourseRoute ? (
        <AdminMobileCourseSheet
          open={courseSheetOpen}
          onOpenChange={setCourseSheetOpen}
          title={tAdmin("navigation.chooseCourse")}
          searchPlaceholder={tAdmin("navigation.searchCourses")}
          emptyLabel={tAdmin("navigation.courseNotFound")}
          courses={coursesToDisplay}
          activeCourseSlug={courseSlug}
          onSelectCourse={handleSelectCourse}
        />
      ) : null}
    </>
  );
}
