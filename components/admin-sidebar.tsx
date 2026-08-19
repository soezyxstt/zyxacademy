"use client";

import { useState, useEffect, Suspense, useMemo } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import {
  LayoutDashboard,
  ClipboardCheck,
  KeyRound,
  Zap,
  ListChecks,
  GraduationCap,
  Bell,
  BarChart3,
  Megaphone,
  CalendarDays,
  Link as LinkIcon,
  Newspaper,
  Flag,
  Upload,
  Video,
  FileText,
  BookOpen,
  NotebookPen,
  Library,
  Target,
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
} from "lucide-react";
import {
  SidebarShell,
  NavItem,
  NavGroup,
  NavCollapsible,
} from "@/components/sidebar-shell";
import { useSession } from "@/lib/auth-client";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

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
  group: "utama" | "akademik" | "evaluasi" | "alat" | "pengguna" | "ops" | "tutorial-pka";
  exact?: boolean;
  badge?: React.ReactNode | string;
};

const ALL_ADMIN_TABS: AdminTabDef[] = [
  // Utama
  { id: "dashboard", label: "Panel Admin", href: "/admin", icon: LayoutDashboard, group: "utama", exact: true },
  { id: "blog", label: "Kelola Blog", href: "/admin/blog", icon: Newspaper, group: "utama" },

  // Akademik & Konten
  { id: "courses", label: "Mata Kuliah", href: "/admin/courses", icon: GraduationCap, group: "akademik" },
  { id: "schedules", label: "Jadwal & Kalender", href: "/admin/schedules", icon: CalendarDays, group: "akademik" },
  { id: "materials-review", label: "Review Materi", href: "/admin/materials/review", icon: ClipboardCheck, group: "akademik" },
  { id: "materials-manual", label: "Upload Manual", href: "/admin/materials/manual", icon: Upload, group: "akademik" },

  // Bank Soal & Asesmen
  { id: "bank-soal", label: "Bank Soal", href: "/admin/questions", icon: Library, group: "evaluasi" },
  { id: "quizzes", label: "Kuis", href: "/admin/quizzes", icon: NotebookPen, group: "evaluasi" },
  { id: "leaderboard", label: "Papan Peringkat", href: "/admin/leaderboard", icon: Trophy, group: "evaluasi" },
  { id: "quiz-insights", label: "Analisis Kuis", href: "/admin/quiz-insights", icon: BarChart3, group: "evaluasi", badge: "Beta" },
  { id: "question-jobs", label: "Generasi Soal", href: "/admin/jobs", icon: Zap, group: "evaluasi" },
  { id: "distractors", label: "Analitik Distraktor", href: "/admin/distractors", icon: Target, group: "evaluasi", badge: "Beta" },

  // Alat & Komunikasi
  { id: "forms", label: "Form Studio", href: "/admin/forms", icon: FilePen, group: "alat" },
  { id: "meet", label: "Meet", href: "/admin/meet", icon: Video, group: "alat" },
  { id: "media", label: "Pustaka Media", href: "/admin/media", icon: ImageIcon, group: "alat" },
  { id: "tautan", label: "Tautan Publik", href: "/admin/tautan", icon: LinkIcon, group: "alat" },

  // Pengguna & Akses
  { id: "groups", label: "Kelompok Belajar", href: "/admin/groups", icon: Users, group: "pengguna" },
  { id: "tokens", label: "Token Aktivasi", href: "/admin/tokens", icon: KeyRound, group: "pengguna" },
  { id: "notifications", label: "Push Notification", href: "/admin/notifications", icon: Bell, group: "pengguna" },

  // Sistem & Ops
  { id: "ops-monitor", label: "Monitor Ops", href: "/admin/ops", icon: Gauge, group: "ops", exact: true },
  { id: "feature-flags", label: "Feature Flags", href: "/admin/ops/flags", icon: Flag, group: "ops" },
  { id: "ai-analytics", label: "Analitik Zyra", href: "/admin/ops/analytics", icon: LineChart, group: "ops" },
  { id: "api-keys", label: "API Keys", href: "/admin/ops/keys", icon: Lock, group: "ops" },
  { id: "short-links", label: "Short Links", href: "/admin/ops/short-links", icon: LinkIcon, group: "ops" },
  { id: "web-analytics", label: "Web Analytics", href: "/admin/ops/web-analytics", icon: Globe, group: "ops" },

  // Tutorial PKA (Default Archived)
  { id: "pka-registrations", label: "Pendaftar PKA", href: "/admin/tutorial-pka/registrations", icon: UserCheck, group: "tutorial-pka" },
  { id: "pka-announcements", label: "Pengumuman PKA", href: "/admin/tutorial-pka/announcements", icon: Megaphone, group: "tutorial-pka" },
  { id: "pka-schedules", label: "Jadwal Live PKA", href: "/admin/tutorial-pka/schedules", icon: CalendarDays, group: "tutorial-pka" },
  { id: "pka-quizzes", label: "Kuis PKA", href: "/admin/quizzes?courseId=tutorial-pka", icon: ListChecks, group: "tutorial-pka" },
  { id: "pka-materials", label: "Materi PKA", href: "/admin/materials?courseId=tutorial-pka", icon: FileText, group: "tutorial-pka" },
];

function AdminSidebarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const userId = session?.user?.id;

  const [archivedTabs, setArchivedTabs] = useState<string[]>(DEFAULT_ARCHIVED);
  const [pinnedTabs, setPinnedTabs] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

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
      if (tab.id === "pka-quizzes") {
        return pathname === "/admin/quizzes" && searchParams?.get("courseId") === "tutorial-pka";
      }
      if (tab.id === "pka-materials") {
        return pathname === "/admin/materials" && searchParams?.get("courseId") === "tutorial-pka";
      }
      if (tab.id === "quizzes") {
        return (
          (pathname === "/admin/quizzes" || pathname.startsWith("/admin/quizzes/")) && searchParams?.get("courseId") !== "tutorial-pka"
        );
      }
      if (tab.exact) {
        return pathname === tab.href;
      }
      return pathname === tab.href || pathname.startsWith(tab.href + "/");
    };
  }, [pathname, searchParams]);

  const isArchived = (id: string) => mounted && archivedTabs.includes(id);
  const isPinned = (id: string) => mounted && pinnedTabs.includes(id);

  const renderTabItem = (tab: AdminTabDef, collapsed: boolean, isChild = false) => {
    const active = isTabActive(tab);
    const pinned = isPinned(tab.id);

    return (
      <NavItem
        key={tab.id}
        href={tab.href}
        icon={tab.icon}
        label={tab.label}
        badge={tab.badge}
        active={active}
        collapsed={collapsed}
        isChild={isChild}
        isPinned={pinned}
        onPin={(e) => togglePinTab(tab.id, tab.label, e)}
        onArchive={(e) => archiveTab(tab.id, tab.label, e)}
      />
    );
  };

  const navContent = (c: boolean) => {
    // 1. Pinned tabs at the top
    const pinnedTabItems = ALL_ADMIN_TABS.filter((t) => isPinned(t.id));

    // 2. Active non-pinned, non-archived tabs grouped
    const getVisibleGroupTabs = (group: AdminTabDef["group"]) => {
      return ALL_ADMIN_TABS.filter(
        (t) => t.group === group && !isArchived(t.id) && !isPinned(t.id)
      );
    };

    const akademikTabs = getVisibleGroupTabs("akademik");
    const evaluasiTabs = getVisibleGroupTabs("evaluasi");
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
            <NavGroup label="Disematkan" collapsed={c} />
            <div className="flex flex-col gap-0.5">
              {pinnedTabItems.map((tab) => renderTabItem(tab, c, false))}
            </div>
            <div className="h-px bg-border/60 my-2 shrink-0 w-full" />
          </>
        )}

        {/* Utama */}
        <NavGroup label="Utama" collapsed={c} />
        {!isPinned("dashboard") && !isArchived("dashboard") && (
          <NavItem
            href="/admin"
            icon={LayoutDashboard}
            label="Panel Admin"
            active={pathname === "/admin"}
            collapsed={c}
            onPin={(e) => togglePinTab("dashboard", "Panel Admin", e)}
            onArchive={(e) => archiveTab("dashboard", "Panel Admin", e)}
          />
        )}
        {!isPinned("blog") && !isArchived("blog") && (
          <NavItem
            href="/admin/blog"
            icon={Newspaper}
            label="Kelola Blog"
            active={pathname === "/admin/blog" || pathname.startsWith("/admin/blog/")}
            collapsed={c}
            onPin={(e) => togglePinTab("blog", "Kelola Blog", e)}
            onArchive={(e) => archiveTab("blog", "Kelola Blog", e)}
          />
        )}

        {/* Modul & Fitur Grouped Sections */}
        <NavGroup label="Modul & Fitur" collapsed={c} />

        {/* Akademik & Konten */}
        {akademikTabs.length > 0 && (
          <NavCollapsible
            id="akademik"
            key="akademik"
            icon={BookOpen}
            label="Akademik & Konten"
            collapsed={c}
            active={akademikTabs.some((t) => isTabActive(t))}
            previewItems={akademikTabs.map((t) => t.label)}
          >
            {akademikTabs.map((tab) => renderTabItem(tab, c, true))}
          </NavCollapsible>
        )}

        {/* Bank Soal & Asesmen */}
        {evaluasiTabs.length > 0 && (
          <NavCollapsible
            id="evaluasi"
            key="evaluasi"
            icon={Library}
            label="Bank Soal & Asesmen"
            collapsed={c}
            active={evaluasiTabs.some((t) => isTabActive(t))}
            previewItems={evaluasiTabs.map((t) => t.label)}
          >
            {evaluasiTabs.map((tab) => renderTabItem(tab, c, true))}
          </NavCollapsible>
        )}

        {/* Alat & Komunikasi */}
        {alatTabs.length > 0 && (
          <NavCollapsible
            id="alat"
            key="alat"
            icon={FilePen}
            label="Alat & Komunikasi"
            collapsed={c}
            active={alatTabs.some((t) => isTabActive(t))}
            previewItems={alatTabs.map((t) => t.label)}
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
            label="Pengguna & Akses"
            collapsed={c}
            active={penggunaTabs.some((t) => isTabActive(t))}
            previewItems={penggunaTabs.map((t) => t.label)}
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
            label="Sistem & Ops"
            collapsed={c}
            active={opsTabs.some((t) => isTabActive(t))}
            previewItems={opsTabs.map((t) => t.label)}
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
            label="Tutorial PKA"
            collapsed={c}
            active={pkaTabs.some((t) => isTabActive(t))}
            previewItems={pkaTabs.map((t) => t.label)}
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
              label={`Tab Diarsipkan (${archivedTabItems.length})`}
              collapsed={c}
              active={archivedTabItems.some((t) => isTabActive(t))}
              previewItems={archivedTabItems.map((t) => t.label)}
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
                          {tab.label}
                        </span>
                        {tab.badge && (
                          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider leading-none select-none shrink-0 border border-border/60 bg-muted/60 text-muted-foreground">
                            {tab.badge}
                          </span>
                        )}
                      </Link>
                      <button
                        type="button"
                        onClick={(e) => restoreTab(tab.id, tab.label, e)}
                        title={`Pulihkan tab ${tab.label}`}
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
