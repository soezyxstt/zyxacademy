"use client";

import { useState, useEffect, Suspense, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n/client";

import {
  LayoutDashboard,
  ClipboardCheck,
  KeyRound,
  ListChecks,
  GraduationCap,
  Bell,
  BarChart3,
  Megaphone,
  CalendarDays,
  Link as LinkIcon,
  Newspaper,
  Flag,
  Video,
  FileText,
  BookOpen,
  NotebookPen,
  Library,
  UserCheck,
  UserCog,
  Users,
  FilePen,
  Settings,
  Gauge,
  LineChart,
  Lock,
  Globe,
  Image as ImageIcon,
  Archive,
  ArchiveRestore,
  Trophy,
  MousePointerClick,
  Activity,
  ArrowLeft,
  Layers,
  Calculator,
  Check,
  ChevronDown,
  Cpu,
  Search,
} from "lucide-react";
import {
  SidebarShell,
  NavItem,
  NavGroup,
  NavCollapsible,
  SidebarTooltip,
} from "@/components/sidebar-shell";
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

// PKA tabs default archived per user request
const DEFAULT_ARCHIVED = [
  "pka-registrations",
  "pka-announcements",
  "pka-schedules",
  "pka-quizzes",
  "pka-materials",
];

export type AdminTabDef = {
  id: string;
  label: string;
  href: string;
  icon: React.ElementType;
  group: "utama" | "akademik" | "alat" | "pengguna" | "ops" | "tutorial-pka";
  exact?: boolean;
  badge?: React.ReactNode | string;
};

const ALL_ADMIN_TABS: AdminTabDef[] = [
  // Utama
  { id: "dashboard", label: "Panel Admin", href: "/admin", icon: LayoutDashboard, group: "utama", exact: true },
  { id: "blog", label: "Blog", href: "/admin/blog", icon: Newspaper, group: "utama" },

  // Akademik & Konten
  { id: "courses", label: "Mata Kuliah", href: "/admin/courses", icon: GraduationCap, group: "akademik" },
  { id: "schedules", label: "Jadwal Umum", href: "/admin/schedules", icon: CalendarDays, group: "akademik" },
  { id: "bank-soal", label: "Bank Soal", href: "/admin/questions", icon: Library, group: "akademik" },

  // Alat & Komunikasi
  { id: "pricing", label: "Kalkulator Harga", href: "/admin/pricing", icon: Calculator, group: "alat" },
  { id: "docs", label: "Dokumentasi", href: "/admin/docs", icon: BookOpen, group: "alat" },
  { id: "forms", label: "Form Studio", href: "/admin/forms", icon: FilePen, group: "alat" },
  { id: "meet", label: "Meet", href: "/admin/meet", icon: Video, group: "alat" },
  { id: "media", label: "Pustaka Media", href: "/admin/media", icon: ImageIcon, group: "alat" },
  { id: "tautan", label: "Tautan Publik", href: "/admin/tautan", icon: LinkIcon, group: "alat" },

  // Pengguna & Akses
  { id: "users", label: "Pengguna", href: "/admin/users", icon: UserCog, group: "pengguna" },
  { id: "groups", label: "Kelompok Belajar", href: "/admin/groups", icon: Users, group: "pengguna" },
  { id: "tokens", label: "Token Aktivasi", href: "/admin/tokens", icon: KeyRound, group: "pengguna" },
  { id: "notifications", label: "Notifikasi", href: "/admin/notifications", icon: Bell, group: "pengguna" },

  // Sistem & Ops
  { id: "ops-monitor", label: "Monitor Ops", href: "/admin/ops", icon: Gauge, group: "ops", exact: true },
  { id: "ai-models", label: "Model AI", href: "/admin/ops/models", icon: Cpu, group: "ops" },
  { id: "tutor-activity", label: "Aktivitas Tutor", href: "/admin/ops/tutor-activity", icon: Activity, group: "ops" },
  { id: "feature-flags", label: "Feature Flags", href: "/admin/ops/flags", icon: Flag, group: "ops" },
  { id: "ai-analytics", label: "Analitik Zyra", href: "/admin/ops/analytics", icon: LineChart, group: "ops" },
  { id: "feature-usage", label: "Fitur", href: "/admin/ops/feature-usage", icon: MousePointerClick, group: "ops" },
  { id: "api-keys", label: "API Keys", href: "/admin/ops/keys", icon: Lock, group: "ops" },
  { id: "short-links", label: "Short Links", href: "/admin/ops/short-links", icon: LinkIcon, group: "ops" },
  { id: "web-analytics", label: "Web Analytics", href: "/admin/ops/web-analytics", icon: Globe, group: "ops" },

  // Tutorial PKA (Default Archived)
  { id: "pka-registrations", label: "Pendaftar PKA", href: "/admin/tutorial-pka/registrations", icon: UserCheck, group: "tutorial-pka" },
  { id: "pka-announcements", label: "Pengumuman PKA", href: "/admin/tutorial-pka/announcements", icon: Megaphone, group: "tutorial-pka" },
  { id: "pka-schedules", label: "Jadwal Live PKA", href: "/admin/tutorial-pka/schedules", icon: CalendarDays, group: "tutorial-pka" },
  { id: "pka-quizzes", label: "Kuis PKA", href: "/admin/courses/tutorial-pka/quizzes", icon: ListChecks, group: "tutorial-pka" },
  { id: "pka-materials", label: "Materi PKA", href: "/admin/courses/tutorial-pka/documents", icon: FileText, group: "tutorial-pka" },
];

const ADMIN_TAB_MESSAGE_KEYS: Record<string, string> = {
  dashboard: "dashboard", blog: "blog", courses: "courses", schedules: "schedules",
  "bank-soal": "questionBank", pricing: "pricing", docs: "docs", forms: "forms", meet: "meet",
  media: "media", tautan: "publicLinks", users: "users", groups: "groups", tokens: "tokens",
  notifications: "notifications", "ops-monitor": "opsMonitor", "ai-models": "aiModels",
  "tutor-activity": "tutorActivity", "feature-flags": "featureFlags", "ai-analytics": "zyraAnalytics",
  "feature-usage": "featureUsage", "api-keys": "apiKeys", "short-links": "shortLinks",
  "web-analytics": "webAnalytics", "pka-registrations": "pkaRegistrations",
  "pka-announcements": "pkaAnnouncements", "pka-schedules": "pkaSchedules",
  "pka-quizzes": "pkaQuizzes", "pka-materials": "pkaMaterials",
};

function AdminSidebarInner() {
  const t = useTranslations("admin.navigation");
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const userId = session?.user?.id;

  const courseSlug = useMemo(() => parseAdminCourseSlug(pathname), [pathname]);
  const [courseNav, setCourseNav] = useState<{
    slug: string;
    data: { slug: string; title: string; category: string } | null;
    isLoading: boolean;
    isNotFound: boolean;
  } | null>(null);

  const [adminCourses, setAdminCourses] = useState<Array<{ id: string; title: string }>>([]);
  const [courseFilter, setCourseFilter] = useState("");

  useEffect(() => {
    if (!courseSlug) return;
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
  }, [courseSlug]);

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
    if (!courseSlug) {
      setCourseNav(null);
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
  }, [courseSlug]);

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

  const tabLabel = (tab: AdminTabDef) => t(ADMIN_TAB_MESSAGE_KEYS[tab.id] ?? "dashboard");

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
      return (
        <nav
          className={cn(
            "flex flex-1 flex-col gap-1 py-3 font-sans text-left",
            c
              ? "px-1 items-center overflow-y-hidden sidebar-scroll-hidden"
              : "px-3 overflow-y-auto overflow-x-hidden sidebar-scroll"
          )}
        >
          {/* Back link to /admin/courses */}
          <SidebarTooltip label={t("allCourses")} collapsed={c}>
            <Link
              href="/admin/courses"
              title={c ? t("allCourses") : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-3 py-2 text-body-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors mb-2",
                c && "justify-center size-10 px-0 mx-auto"
              )}
            >
              <ArrowLeft className="size-4 shrink-0" />
              {!c && <span>{t("allCourses")}</span>}
            </Link>
          </SidebarTooltip>

          {c ? (
            <div className="mb-2 flex w-full justify-center">
              <DropdownMenu>
                <SidebarTooltip
                  label={`Pilih mata kuliah: ${courseNav?.data?.title || courseSlug}`}
                  collapsed={c}
                >
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Pilih mata kuliah: ${courseNav?.data?.title || courseSlug}`}
                      className="flex size-10 items-center justify-center rounded-xl text-foreground hover:bg-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
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
                              isCurrent && "font-semibold bg-brand-primary/10 text-brand-primary"
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
            </div>
          ) : courseNav?.isLoading ? (
            <div className="flex w-full items-center justify-between gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5 mb-3">
              <div className="h-3.5 w-32 animate-pulse rounded bg-muted-foreground/20" />
              <ChevronDown className="size-4 shrink-0 text-muted-foreground/40" />
            </div>
          ) : courseNav?.isNotFound ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 mb-3 text-left">
              <p className="truncate text-body-xs font-bold text-destructive font-heading leading-tight">
                {t("courseMissing")}
              </p>
              <p className="truncate text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mt-0.5">
                {courseSlug}
              </p>
            </div>
          ) : (
            <div className="mb-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Pilih mata kuliah: ${courseNav?.data?.title || courseSlug}`}
                    className="group flex w-full items-center justify-between gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-left transition-colors hover:bg-muted/60 hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                  >
                    <span className="truncate text-body-sm font-semibold text-foreground font-heading leading-tight">
                      {courseNav?.data?.title || courseSlug}
                    </span>
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
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
                              isCurrent && "font-semibold bg-brand-primary/10 text-brand-primary"
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
            </div>
          )}

          {/* 9 Course navigation items */}
          <div className={cn("space-y-0.5", c && "w-full flex flex-col items-center")}>
            {courseItems.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(item.href + "/");

              return (
                <NavItem
                  key={item.id}
                  href={item.href}
                  icon={item.icon}
                  label={t(item.id)}
                  active={active}
                  collapsed={c}
                />
              );
            })}
          </div>

          <NavItem href="/admin/docs" icon={BookOpen} label={t("docs")} active={false} collapsed={c} />
          <div className="flex-1" />
        </nav>
      );
    }

    // 1. Pinned tabs at the top
    const pinnedTabItems = ALL_ADMIN_TABS.filter((t) => isPinned(t.id));

    // 2. Active non-pinned, non-archived tabs grouped
    const getVisibleGroupTabs = (group: AdminTabDef["group"]) => {
      return ALL_ADMIN_TABS.filter(
        (t) => t.group === group && !isArchived(t.id) && !isPinned(t.id)
      );
    };

    const akademikTabs = getVisibleGroupTabs("akademik");
    const alatTabs = getVisibleGroupTabs("alat");
    const penggunaTabs = getVisibleGroupTabs("pengguna");
    const opsTabs = getVisibleGroupTabs("ops");
    const pkaTabs = getVisibleGroupTabs("tutorial-pka");

    // 3. Archived tabs list
    const archivedTabItems = ALL_ADMIN_TABS.filter((t) => isArchived(t.id));

    return (
      <nav
        className={cn(
          "flex flex-1 flex-col gap-1 py-3 font-sans text-left",
          c
            ? "px-1 items-center overflow-y-hidden sidebar-scroll-hidden"
            : "px-3 overflow-y-auto overflow-x-hidden sidebar-scroll"
        )}
      >
        {/* Pinned Section */}
        {pinnedTabItems.length > 0 && (
          <>
            <NavGroup label={t("pinned")} collapsed={c} />
            <div className="flex flex-col gap-0.5">
              {pinnedTabItems.map((tab) => renderTabItem(tab, c, false))}
            </div>
            <div className="h-px bg-border/60 my-2 shrink-0 w-full" />
          </>
        )}

        {/* Utama */}
        <NavGroup label={t("main")} collapsed={c} />
        {!isPinned("dashboard") && !isArchived("dashboard") && (
          <NavItem
            href="/admin"
            icon={LayoutDashboard}
            label={t("dashboard")}
            active={pathname === "/admin"}
            collapsed={c}
            onPin={(e) => togglePinTab("dashboard", t("dashboard"), e)}
            onArchive={(e) => archiveTab("dashboard", t("dashboard"), e)}
          />
        )}
        {!isPinned("blog") && !isArchived("blog") && (
          <NavItem
            href="/admin/blog"
            icon={Newspaper}
            label={t("manageBlog")}
            active={pathname === "/admin/blog" || pathname.startsWith("/admin/blog/")}
            collapsed={c}
            onPin={(e) => togglePinTab("blog", t("manageBlog"), e)}
            onArchive={(e) => archiveTab("blog", t("manageBlog"), e)}
          />
        )}

        {/* Modul & Fitur Grouped Sections */}
        <NavGroup label={t("modules")} collapsed={c} />

        {/* Akademik & Konten */}
        {akademikTabs.length > 0 && (
          <NavCollapsible
            id="akademik"
            key="akademik"
            icon={BookOpen}
            label={t("academicContent")}
            collapsed={c}
            active={akademikTabs.some((t) => isTabActive(t))}
            previewItems={akademikTabs.map(tabLabel)}
          >
            {akademikTabs.map((tab) => renderTabItem(tab, c, true))}
          </NavCollapsible>
        )}

        {/* Alat & Komunikasi */}
        {alatTabs.length > 0 && (
          <NavCollapsible
            id="alat"
            key="alat"
            icon={FilePen}
            label={t("toolsCommunication")}
            collapsed={c}
            active={alatTabs.some((t) => isTabActive(t))}
            previewItems={alatTabs.map(tabLabel)}
          >
            {alatTabs.map((tab) => renderTabItem(tab, c, true))}
          </NavCollapsible>
        )}

        {/* Pengguna & Akses */}
        {penggunaTabs.length > 0 && (
          <NavCollapsible
            id="pengguna"
            key="pengguna"
            icon={UserCog}
            label={t("usersAccess")}
            collapsed={c}
            active={penggunaTabs.some((t) => isTabActive(t))}
            previewItems={penggunaTabs.map(tabLabel)}
          >
            {penggunaTabs.map((tab) => renderTabItem(tab, c, true))}
          </NavCollapsible>
        )}

        {/* Sistem & Ops */}
        {opsTabs.length > 0 && (
          <NavCollapsible
            id="ops"
            key="ops"
            icon={Settings}
            label={t("systemOps")}
            collapsed={c}
            active={opsTabs.some((t) => isTabActive(t))}
            previewItems={opsTabs.map(tabLabel)}
          >
            {opsTabs.map((tab) => renderTabItem(tab, c, true))}
          </NavCollapsible>
        )}

        {/* Tutorial PKA (if unarchived) */}
        {pkaTabs.length > 0 && (
          <NavCollapsible
            id="tutorial-pka"
            key="tutorial-pka"
            icon={GraduationCap}
            label={t("pka")}
            collapsed={c}
            active={pkaTabs.some((t) => isTabActive(t))}
            previewItems={pkaTabs.map(tabLabel)}
          >
            {pkaTabs.map((tab) => renderTabItem(tab, c, true))}
          </NavCollapsible>
        )}

        {/* Archived Section */}
        {archivedTabItems.length > 0 && (
          <>
            <div className="h-px bg-border/60 my-2 shrink-0 w-full" />
            <NavCollapsible
              id="archived"
              key="archived"
              icon={Archive}
              label={`${t("archivedTabs")} (${archivedTabItems.length})`}
              collapsed={c}
              active={archivedTabItems.some((t) => isTabActive(t))}
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
          </>
        )}

        <div className="flex-1" />
      </nav>
    );
  };

  return (
    <SidebarShell
      collapsedKey="admin-sidebar-collapsed"
      logoHref="/admin"
      logoLabel="Panel Admin Zyx Academy"
      headerActions={(collapsed) => (
        <OpsAiTrigger variant="sidebar" collapsed={collapsed} />
      )}
      nav={navContent}
    />
  );
}

export function AdminSidebar() {
  return (
    <Suspense fallback={<div className="w-64 bg-card border-r border-border" />}>
      <AdminSidebarInner />
    </Suspense>
  );
}
