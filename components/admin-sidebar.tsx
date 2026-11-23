"use client";

import { useState, useEffect, Suspense, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n/client";

import {
  ClipboardCheck,
  ListChecks,
  GraduationCap,
  BarChart3,
  Megaphone,
  Video,
  FileText,
  BookOpen,
  NotebookPen,
  Library,
  Settings,
  Archive,
  ArchiveRestore,
  Trophy,
  Layers,
  Check,
  ChevronDown,
  Search,
} from "lucide-react";
import { ADMIN_GROUP_MESSAGE_KEYS, ALL_ADMIN_TABS, ADMIN_TAB_MESSAGE_KEYS, DEFAULT_ARCHIVED, type AdminTabDef, type AdminTabGroup } from "@/lib/admin-navigation";
export { ALL_ADMIN_TABS, type AdminTabDef, type AdminTabGroup } from "@/lib/admin-navigation";
import {
  NavItem,
  NavGroup,
  NavCollapsible,
  SidebarBackLink,
  SidebarTooltip,
} from "@/components/sidebar-shell";
import { DesktopSidebarShell } from "@/components/navigation/desktop-sidebar-shell";
import { ADMIN_PINNED_SYNC_EVENT } from "@/components/navigation/admin/admin-nav-model";
import { useViewportMode } from "@/hooks/use-viewport-mode";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useSession } from "@/lib/auth-client";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { OpsAiTrigger } from "@/components/admin/ops-ai/ops-ai-trigger";
import { getCourseNavContext, getCourses } from "@/app/(admin)/admin/(academic)/courses/actions";

export function parseAdminCourseSlug(pathname: string): string | null {
  if (!pathname.startsWith("/admin/courses/")) return null;
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length >= 3 && parts[0] === "admin" && parts[1] === "courses" && parts[2]) {
    try {
      return decodeURIComponent(parts[2]);
    } catch {
      return null;
    }
  }
  return null;
}

export type CourseSidebarItem = {
  id: string;
  label: string;
  href: string;
  icon: React.ElementType;
  exact?: boolean;
};

export function getAdminCourseNavItems(slug: string): CourseSidebarItem[] {
  const base = `/admin/courses/${slug}`;
  return [
    { id: "bab", label: "Bab", href: base, icon: BookOpen, exact: true },
    { id: "documents", label: "Dokumen", href: `${base}/documents`, icon: FileText },
    { id: "videos", label: "Video", href: `${base}/videos`, icon: Video },
    { id: "quizzes", label: "Kuis", href: `${base}/quizzes`, icon: NotebookPen },
    { id: "tryouts", label: "Tryout", href: `${base}/tryouts`, icon: ClipboardCheck },
    { id: "questions", label: "Soal", href: `${base}/questions`, icon: Library },
    { id: "flashcards", label: "Flashcard", href: `${base}/flashcards`, icon: Layers },
    { id: "results", label: "Hasil", href: `${base}/results`, icon: ListChecks },
    { id: "leaderboard", label: "Papan Peringkat", href: `${base}/leaderboard`, icon: Trophy },
    { id: "analytics", label: "Analitik", href: `${base}/analytics`, icon: BarChart3 },
    { id: "review", label: "Review Materi", href: `${base}/review`, icon: ClipboardCheck },
    { id: "settings", label: "Pengaturan", href: `${base}/settings`, icon: Settings },
  ];
}

const ARCHIVED_STORAGE_KEY = "zyx_admin_sidebar_archived_tabs";
const PINNED_STORAGE_KEY = "zyx_admin_sidebar_pinned_tabs";

const getArchivedStorageKey = (userId?: string | null) =>
  userId ? `${ARCHIVED_STORAGE_KEY}_${userId}` : ARCHIVED_STORAGE_KEY;

const getPinnedStorageKey = (userId?: string | null) =>
  userId ? `${PINNED_STORAGE_KEY}_${userId}` : PINNED_STORAGE_KEY;

export interface AdminSidebarProps {
  pathnameOverride?: string;
  initialCourseTitle?: string;
  defaultCollapsed?: boolean;
}

function AdminSidebarInner({
  pathnameOverride,
  initialCourseTitle,
  defaultCollapsed = false,
}: AdminSidebarProps) {
  const t = useTranslations("admin.navigation");
  const tDiscussion = useTranslations("tutor.schedule");
  const actualPathname = usePathname();
  const pathname = pathnameOverride ?? actualPathname;
  const router = useRouter();
  const viewportMode = useViewportMode();
  const { data: session } = useSession();
  const userId = session?.user?.id;

  const courseSlug = useMemo(() => parseAdminCourseSlug(pathname), [pathname]);
  const [courseNav, setCourseNav] = useState<{
    slug: string;
    data: { slug: string; title: string; category: string } | null;
    isLoading: boolean;
    isNotFound: boolean;
  } | null>(() =>
    courseSlug && initialCourseTitle
      ? {
          slug: courseSlug,
          data: { slug: courseSlug, title: initialCourseTitle, category: "" },
          isLoading: false,
          isNotFound: false,
        }
      : null
  );

  const [adminCourses, setAdminCourses] = useState<Array<{ id: string; title: string }>>([]);
  const [courseFilter, setCourseFilter] = useState("");
  const [courseDropdownOpen, setCourseDropdownOpen] = useState(false);

  useEffect(() => {
    if (viewportMode !== "desktop" || !courseDropdownOpen || !courseSlug) return;
    let cancelled = false;
    getCourses()
      .then((res) => {
        if (!cancelled && Array.isArray(res)) {
          setAdminCourses(res.map((c) => ({ id: c.id, title: c.title })));
        }
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [courseDropdownOpen, courseSlug, viewportMode]);

  const filteredAdminCourses = useMemo(() => {
    const list: Array<{ id: string; title: string }> = [];
    const seen = new Set<string>();

    for (const c of adminCourses) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        list.push({ id: c.id, title: c.title });
      }
    }

    if (courseSlug && !seen.has(courseSlug)) {
      list.unshift({
        id: courseSlug,
        title: courseNav?.data?.title || courseSlug,
      });
    }

    if (!courseFilter.trim()) {
      return list;
    }
    const q = courseFilter.toLowerCase();
    return list.filter(
      (c) => c.title.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)
    );
  }, [adminCourses, courseSlug, courseNav?.data?.title, courseFilter]);

  const switchAdminCourse = (targetSlug: string) => {
    if (targetSlug === courseSlug) return;
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length >= 3 && parts[0] === "admin" && parts[1] === "courses") {
      const subpage = parts[3];
      const standardSubpages = [
        "documents",
        "quizzes",
        "questions",
        "flashcards",
        "results",
        "leaderboard",
        "analytics",
        "review",
        "settings",
      ];
      if (subpage && standardSubpages.includes(subpage)) {
        router.push(`/admin/courses/${encodeURIComponent(targetSlug)}/${subpage}`);
        return;
      }
    }
    router.push(`/admin/courses/${encodeURIComponent(targetSlug)}`);
  };

  const [archivedTabs, setArchivedTabs] = useState<string[]>(DEFAULT_ARCHIVED);
  const [pinnedTabs, setPinnedTabs] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (viewportMode !== "desktop") return;
    if (!courseSlug) {
      setCourseNav(null);
      return;
    }
    if (initialCourseTitle) {
      setCourseNav({
        slug: courseSlug,
        data: { slug: courseSlug, title: initialCourseTitle, category: "" },
        isLoading: false,
        isNotFound: false,
      });
      return;
    }
    let cancelled = false;
    setCourseNav({
      slug: courseSlug,
      data: null,
      isLoading: true,
      isNotFound: false,
    });
    getCourseNavContext(courseSlug)
      .then((res) => {
        if (cancelled) return;
        if (res) {
          setCourseNav({
            slug: courseSlug,
            data: {
              slug: res.slug || courseSlug,
              title: res.title,
              category: res.category,
            },
            isLoading: false,
            isNotFound: false,
          });
        } else {
          setCourseNav({
            slug: courseSlug,
            data: null,
            isLoading: false,
            isNotFound: true,
          });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setCourseNav({
          slug: courseSlug,
          data: null,
          isLoading: false,
          isNotFound: true,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [courseSlug, initialCourseTitle, viewportMode]);

  useEffect(() => {
    setMounted(true);
    const archivedKey = getArchivedStorageKey(userId);
    let storedArchived = localStorage.getItem(archivedKey);
    // Fallback to legacy un-scoped key if user-scoped key is not yet set
    if (storedArchived === null && userId) {
      storedArchived = localStorage.getItem(ARCHIVED_STORAGE_KEY);
    }
    if (storedArchived !== null) {
      try {
        const parsed = JSON.parse(storedArchived);
        if (Array.isArray(parsed)) {
          setArchivedTabs(parsed);
        }
      } catch {
        setArchivedTabs(DEFAULT_ARCHIVED);
      }
    } else {
      setArchivedTabs(DEFAULT_ARCHIVED);
    }

    const pinnedKey = getPinnedStorageKey(userId);
    let storedPinned = localStorage.getItem(pinnedKey);
    // Fallback to legacy un-scoped key if user-scoped key is not yet set
    if (storedPinned === null && userId) {
      storedPinned = localStorage.getItem(PINNED_STORAGE_KEY);
    }
    if (storedPinned !== null) {
      try {
        const parsed = JSON.parse(storedPinned);
        if (Array.isArray(parsed)) {
          setPinnedTabs(parsed);
        }
      } catch {
        setPinnedTabs([]);
      }
    } else {
      setPinnedTabs([]);
    }
  }, [userId]);

  const saveArchived = (tabs: string[]) => {
    setArchivedTabs(tabs);
    localStorage.setItem(getArchivedStorageKey(userId), JSON.stringify(tabs));
  };

  const savePinned = (tabs: string[]) => {
    setPinnedTabs(tabs);
    localStorage.setItem(getPinnedStorageKey(userId), JSON.stringify(tabs));
    window.dispatchEvent(new CustomEvent(ADMIN_PINNED_SYNC_EVENT));
  };

  const togglePinTab = (id: string, name: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    if (pinnedTabs.includes(id)) {
      const next = pinnedTabs.filter((t) => t !== id);
      savePinned(next);
      toast.success(`Sematan tab "${name}" dilepas.`);
    } else {
      const next = Array.from(new Set([...pinnedTabs, id]));
      savePinned(next);
      // Automatically unarchive if pinned
      if (archivedTabs.includes(id)) {
        saveArchived(archivedTabs.filter((t) => t !== id));
      }
      toast.success(`Tab "${name}" disematkan ke atas.`);
    }
  };

  const archiveTab = (id: string, name: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    const nextArchived = Array.from(new Set([...archivedTabs, id]));
    saveArchived(nextArchived);
    if (pinnedTabs.includes(id)) {
      savePinned(pinnedTabs.filter((t) => t !== id));
    }
    toast.success(`Tab "${name}" dipindahkan ke arsip.`);
  };

  const restoreTab = (id: string, name: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    const next = archivedTabs.filter((t) => t !== id);
    saveArchived(next);
    toast.success(`Tab "${name}" dipulihkan dari arsip.`);
  };

  const isTabActive = useMemo(() => {
    return (tab: AdminTabDef) => {
      if (tab.exact) {
        return pathname === tab.href;
      }
      return pathname === tab.href || pathname.startsWith(tab.href + "/");
    };
  }, [pathname]);

  const isArchived = (id: string) => mounted && archivedTabs.includes(id);
  const isPinned = (id: string) => mounted && pinnedTabs.includes(id);

  const tabLabel = (tab: AdminTabDef) => tab.id === "discussions" ? tDiscussion("discussion") : t(ADMIN_TAB_MESSAGE_KEYS[tab.id] ?? "dashboard");

  const renderTabItem = (tab: AdminTabDef, collapsed: boolean, isChild = false) => {
    const active = isTabActive(tab);
    const pinned = isPinned(tab.id);

    return (
      <NavItem
        key={tab.id}
        href={tab.href}
        icon={tab.icon}
        label={tabLabel(tab)}
        badge={tab.badge}
        active={active}
        collapsed={collapsed}
        isChild={isChild}
        isPinned={pinned}
        onPin={(e) => togglePinTab(tab.id, tabLabel(tab), e)}
        onArchive={(e) => archiveTab(tab.id, tabLabel(tab), e)}
      />
    );
  };

  const navContent = (c: boolean) => {
    if (courseSlug) {
      const courseItems = getAdminCourseNavItems(courseSlug);
      const courseGroups = [
        {
          key: "content",
          label: t("courseGroupContent"),
          ids: new Set(["bab", "documents", "videos"]),
        },
        {
          key: "evaluation",
          label: t("courseGroupEvaluation"),
          ids: new Set(["quizzes", "tryouts", "questions", "flashcards", "results"]),
        },
        {
          key: "manage",
          label: t("courseGroupManage"),
          ids: new Set(["leaderboard", "analytics", "review", "settings"]),
        },
      ];

      return (
        <nav
          className={cn(
            "flex flex-1 flex-col gap-0.5 py-2.5 font-sans text-left",
            c
              ? "min-h-0 px-1 items-center overflow-y-auto overflow-x-hidden sidebar-scroll-hidden"
              : "min-h-0 px-3 overflow-y-auto overflow-x-hidden sidebar-scroll"
          )}
        >
          <div className={cn("flex flex-col gap-1.5 pb-2 border-b border-border/60", c && "w-full items-center")}>
            <SidebarBackLink
              href="/admin/courses"
              label={t("backToCourses")}
              collapsed={c}
            />

            {c ? (
              <DropdownMenu onOpenChange={setCourseDropdownOpen}>
                <SidebarTooltip
                  label={`Pilih mata kuliah: ${courseNav?.data?.title || courseSlug}`}
                  collapsed={c}
                >
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Pilih mata kuliah: ${courseNav?.data?.title || courseSlug}`}
                      className="flex size-10 items-center justify-center rounded-lg border border-border/70 bg-muted/30 text-foreground hover:bg-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                    >
                      <GraduationCap className="size-4" />
                    </button>
                  </DropdownMenuTrigger>
                </SidebarTooltip>
                <DropdownMenuContent align="start" side="right" sideOffset={8} className="w-64 min-w-56 p-1">
                  <DropdownMenuLabel>{t("chooseCourse")}</DropdownMenuLabel>
                  {adminCourses.length > 5 && (
                    <div className="px-2 pb-1.5 pt-0.5">
                      <div className="relative flex items-center">
                        <Search className="absolute left-2 size-3.5 text-muted-foreground" />
                        <input
                          type="text"
                          placeholder={t("searchCourses")}
                          value={courseFilter}
                          onChange={(e) => setCourseFilter(e.target.value)}
                          className="w-full rounded-lg border border-border/60 bg-muted/40 py-1 pl-7 pr-2 text-body-xs text-foreground placeholder:text-muted-foreground focus:border-brand-primary focus:outline-none"
                        />
                      </div>
                    </div>
                  )}
                  <DropdownMenuSeparator />
                  <div className="max-h-64 overflow-y-auto space-y-0.5">
                    {filteredAdminCourses.length === 0 ? (
                      <div className="px-2 py-3 text-center text-body-xs text-muted-foreground">
                        {t("courseNotFound")}
                      </div>
                    ) : (
                      filteredAdminCourses.map((course) => {
                        const isCurrent =
                          course.id === courseSlug ||
                          course.id === courseNav?.data?.slug;
                        return (
                          <DropdownMenuItem
                            key={course.id}
                            onSelect={() => switchAdminCourse(course.id)}
                            className={cn(
                              "flex items-center justify-between gap-2 cursor-pointer text-body-sm",
                              isCurrent && "bg-brand-primary/10 text-brand-primary"
                            )}
                          >
                            <span className="truncate">{course.title}</span>
                            {isCurrent && <Check className="size-4 shrink-0 text-brand-primary" />}
                          </DropdownMenuItem>
                        );
                      })
                    )}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : courseNav?.isLoading ? (
              <div className="flex w-full items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/30 px-2.5 py-2">
                <div className="h-3.5 w-32 animate-pulse rounded bg-muted-foreground/20" />
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground/40" />
              </div>
            ) : courseNav?.isNotFound ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-left">
                <p className="truncate text-body-xs font-bold text-destructive font-heading leading-tight">
                  {t("courseMissing")}
                </p>
                <p className="truncate text-body-2xs text-muted-foreground uppercase tracking-widest font-semibold mt-0.5">
                  {courseSlug}
                </p>
              </div>
            ) : (
              <DropdownMenu onOpenChange={setCourseDropdownOpen}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Pilih mata kuliah: ${courseNav?.data?.title || courseSlug}`}
                    className="group flex w-full items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/30 px-2.5 py-2 text-left transition-colors hover:bg-muted/60 hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <BookOpen className="size-4 shrink-0 text-brand-primary" />
                      <span className="truncate text-body-sm font-semibold text-foreground font-heading leading-tight">
                        {courseNav?.data?.title || courseSlug}
                      </span>
                    </span>
                    <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" sideOffset={4} className="w-64 min-w-56 p-1">
                  <DropdownMenuLabel>{t("chooseCourse")}</DropdownMenuLabel>
                  {adminCourses.length > 5 && (
                    <div className="px-2 pb-1.5 pt-0.5">
                      <div className="relative flex items-center">
                        <Search className="absolute left-2 size-3.5 text-muted-foreground" />
                        <input
                          type="text"
                          placeholder={t("searchCourses")}
                          value={courseFilter}
                          onChange={(e) => setCourseFilter(e.target.value)}
                          className="w-full rounded-lg border border-border/60 bg-muted/40 py-1 pl-7 pr-2 text-body-xs text-foreground placeholder:text-muted-foreground focus:border-brand-primary focus:outline-none"
                        />
                      </div>
                    </div>
                  )}
                  <DropdownMenuSeparator />
                  <div className="max-h-64 overflow-y-auto space-y-0.5">
                    {filteredAdminCourses.length === 0 ? (
                      <div className="px-2 py-3 text-center text-body-xs text-muted-foreground">
                        {t("courseNotFound")}
                      </div>
                    ) : (
                      filteredAdminCourses.map((course) => {
                        const isCurrent =
                          course.id === courseSlug ||
                          course.id === courseNav?.data?.slug;
                        return (
                          <DropdownMenuItem
                            key={course.id}
                            onSelect={() => switchAdminCourse(course.id)}
                            className={cn(
                              "flex items-center justify-between gap-2 cursor-pointer text-body-sm",
                              isCurrent && "bg-brand-primary/10 text-brand-primary"
                            )}
                          >
                            <span className="truncate">{course.title}</span>
                            {isCurrent && <Check className="size-4 shrink-0 text-brand-primary" />}
                          </DropdownMenuItem>
                        );
                      })
                    )}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <div className={cn("flex flex-col gap-0.5 pt-1", c && "w-full items-center")}>
            {courseGroups.map((group, idx) => {
              const items = courseItems.filter((item) => group.ids.has(item.id));
              return (
                <div key={group.key} className={cn("flex flex-col gap-0.5 w-full", c && "items-center")}>
                  {idx === 0 && !c ? (
                    <div className="px-2.5 pt-1.5 pb-1">
                      <p className="text-body-2xs font-semibold tracking-wider text-muted-foreground/80 uppercase font-sans truncate">
                        {group.label}
                      </p>
                    </div>
                  ) : (
                    <NavGroup label={group.label} collapsed={c} />
                  )}
                  {items.map((item) => {
                    const active = item.exact
                      ? pathname === item.href
                      : pathname === item.href || pathname.startsWith(item.href + "/");

                    return (
                      <NavItem
                        key={item.id}
                        href={item.href}
                        icon={item.icon}
                        label={t(item.id === "review" ? "materialReview" : item.id)}
                        active={active}
                        collapsed={c}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>

          <div className="flex-1" />
          <NavItem href="/admin/docs" icon={BookOpen} label={t("docs")} active={false} collapsed={c} />
        </nav>
      );
    }

    // 1. Pinned tabs at the top
    const pinnedTabItems = ALL_ADMIN_TABS.filter((tab) => isPinned(tab.id));

    // 2. Active non-pinned, non-archived tabs grouped
    const getVisibleGroupTabs = (group: AdminTabGroup) => {
      return ALL_ADMIN_TABS.filter(
        (tab) => tab.group === group && !isArchived(tab.id) && !isPinned(tab.id)
      );
    };

    const utamaTabs = getVisibleGroupTabs("utama");
    const akademikTabs = getVisibleGroupTabs("akademik");
    const penggunaTabs = getVisibleGroupTabs("pengguna");
    const publikasiTabs = getVisibleGroupTabs("publikasi");
    const analitikTabs = getVisibleGroupTabs("analitik");
    const sistemTabs = getVisibleGroupTabs("sistem");
    const utilitasTabs = getVisibleGroupTabs("utilitas");
    const pkaTabs = getVisibleGroupTabs("tutorial-pka");

    // 3. Archived tabs list
    const archivedTabItems = ALL_ADMIN_TABS.filter((tab) => isArchived(tab.id));

    const hasSecondaryGroups =
      publikasiTabs.length > 0 ||
      analitikTabs.length > 0 ||
      sistemTabs.length > 0 ||
      pkaTabs.length > 0;
    const hasBottomSection = utilitasTabs.length > 0 || archivedTabItems.length > 0;

    return (
      <nav
        className={cn(
          "flex flex-1 flex-col gap-1 py-3 font-sans text-left",
          c
            ? "min-h-0 px-1 items-center overflow-y-auto overflow-x-hidden sidebar-scroll-hidden"
            : "min-h-0 px-3 overflow-y-auto overflow-x-hidden sidebar-scroll"
        )}
      >
        {/* Pinned Section */}
        {pinnedTabItems.length > 0 && (
          <>
            <NavGroup label={t("pinned")} collapsed={c} />
            <div className="flex flex-col gap-0.5 w-full">
              {pinnedTabItems.map((tab) => renderTabItem(tab, c, false))}
            </div>
            <div className="h-px bg-border/60 my-2 shrink-0 w-full" />
          </>
        )}

        {/* Utama */}
        {utamaTabs.length > 0 && (
          <div className="flex flex-col gap-0.5 w-full">
            {utamaTabs.map((tab) => renderTabItem(tab, c, false))}
          </div>
        )}

        {/* Akademik (direct access) */}
        {akademikTabs.length > 0 && (
          <>
            <NavGroup label={t(ADMIN_GROUP_MESSAGE_KEYS["akademik"])} collapsed={c} />
            <div className="flex flex-col gap-0.5 w-full">
              {akademikTabs.map((tab) => renderTabItem(tab, c, false))}
            </div>
          </>
        )}

        {/* Pengguna & Akses (direct access) */}
        {penggunaTabs.length > 0 && (
          <>
            <NavGroup label={t(ADMIN_GROUP_MESSAGE_KEYS["pengguna"])} collapsed={c} />
            <div className="flex flex-col gap-0.5 w-full">
              {penggunaTabs.map((tab) => renderTabItem(tab, c, false))}
            </div>
          </>
        )}

        {/* Secondary Collapsible Groups */}
        {hasSecondaryGroups && (
          <>
            <div className="h-px bg-border/60 my-2 shrink-0 w-full" />

            {/* Publikasi & Konten */}
            {publikasiTabs.length > 0 && (
              <NavCollapsible
                id="publikasi"
                key="publikasi"
                icon={Megaphone}
                label={t(ADMIN_GROUP_MESSAGE_KEYS["publikasi"])}
                collapsed={c}
                active={publikasiTabs.some((tab) => isTabActive(tab))}
                previewItems={publikasiTabs.map(tabLabel)}
              >
                {publikasiTabs.map((tab) => renderTabItem(tab, c, true))}
              </NavCollapsible>
            )}

            {/* Analitik & Monitor */}
            {analitikTabs.length > 0 && (
              <NavCollapsible
                id="analitik"
                key="analitik"
                icon={BarChart3}
                label={t(ADMIN_GROUP_MESSAGE_KEYS["analitik"])}
                collapsed={c}
                active={analitikTabs.some((tab) => isTabActive(tab))}
                previewItems={analitikTabs.map(tabLabel)}
              >
                {analitikTabs.map((tab) => renderTabItem(tab, c, true))}
              </NavCollapsible>
            )}

            {/* Sistem */}
            {sistemTabs.length > 0 && (
              <NavCollapsible
                id="sistem"
                key="sistem"
                icon={Settings}
                label={t(ADMIN_GROUP_MESSAGE_KEYS["sistem"])}
                collapsed={c}
                active={sistemTabs.some((tab) => isTabActive(tab))}
                previewItems={sistemTabs.map(tabLabel)}
              >
                {sistemTabs.map((tab) => renderTabItem(tab, c, true))}
              </NavCollapsible>
            )}

            {/* Tutorial PKA (if unarchived) */}
            {pkaTabs.length > 0 && (
              <NavCollapsible
                id="tutorial-pka"
                key="tutorial-pka"
                icon={GraduationCap}
                label={t(ADMIN_GROUP_MESSAGE_KEYS["tutorial-pka"])}
                collapsed={c}
                active={pkaTabs.some((tab) => isTabActive(tab))}
                previewItems={pkaTabs.map(tabLabel)}
              >
                {pkaTabs.map((tab) => renderTabItem(tab, c, true))}
              </NavCollapsible>
            )}
          </>
        )}

        {/* Bottom Utility & Archived Section */}
        {hasBottomSection && (
          <>
            <div className="h-px bg-border/60 my-2 shrink-0 w-full" />
            {utilitasTabs.length > 0 && (
              <div className="flex flex-col gap-0.5 w-full">
                {utilitasTabs.map((tab) => renderTabItem(tab, c, false))}
              </div>
            )}
            {archivedTabItems.length > 0 && (
              <NavCollapsible
                id="archived"
                key="archived"
                icon={Archive}
                label={`${t("archivedTabs")} (${archivedTabItems.length})`}
                collapsed={c}
                active={archivedTabItems.some((tab) => isTabActive(tab))}
                previewItems={archivedTabItems.map(tabLabel)}
              >
                <div className="flex flex-col gap-0.5">
                  {archivedTabItems.map((tab) => {
                    const active = isTabActive(tab);
                    return (
                      <div
                        key={tab.id}
                        className="group/item flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-body-xs font-medium hover:bg-muted text-muted-foreground hover:text-foreground transition-colors w-full"
                      >
                        <Link
                          href={tab.href}
                          className="flex items-center gap-2 flex-1 min-w-0 text-left"
                        >
                          <tab.icon className="size-3.5 shrink-0" />
                          <span className={cn("truncate", active && "text-brand-primary font-semibold")}>
                            {tabLabel(tab)}
                          </span>
                          {tab.badge && (
                            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider leading-none select-none shrink-0 border border-border/60 bg-muted/60 text-muted-foreground">
                              {tab.badge}
                            </span>
                          )}
                        </Link>
                        <button
                          type="button"
                          onClick={(e) => restoreTab(tab.id, tabLabel(tab), e)}
                          title={`${t("restoreTab")} ${tabLabel(tab)}`}
                          className="opacity-0 group-hover/item:opacity-100 p-1 hover:bg-brand-primary/10 rounded-md text-brand-primary transition-all cursor-pointer shrink-0"
                        >
                          <ArchiveRestore className="size-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </NavCollapsible>
            )}
          </>
        )}

        <div className="flex-1" />
      </nav>
    );
  };

  return (
    <DesktopSidebarShell
      collapsedKey="admin-sidebar-collapsed"
      logoHref="/admin"
      logoLabel="Panel Admin Zyx Academy"
      headerActions={(collapsed) => (
        <OpsAiTrigger variant="sidebar" collapsed={collapsed} />
      )}
      nav={navContent}
      defaultCollapsed={defaultCollapsed}
    />
  );
}

export function AdminSidebar(props: AdminSidebarProps = {}) {
  const viewportMode = useViewportMode();

  if (viewportMode === "mobile") {
    return null;
  }

  return (
    <Suspense fallback={<div className="hidden md:block w-64 bg-card border-r border-border" />}>
      <AdminSidebarInner {...props} />
    </Suspense>
  );
}
