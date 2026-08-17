"use client";

import { useState, useEffect, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardCheck,
  KeyRound,
  Zap,
  ListChecks,
  ClipboardList,
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
  FilePen,
  Settings,
  Gauge,
  LineChart,
  Lock,
  Globe,
  Image as ImageIcon,
  Layers,
  Package,
  ShieldCheck,
  Archive,
  ArchiveRestore,
} from "lucide-react";
import { SidebarShell, NavItem, NavGroup, NavCollapsible, SidebarTooltip } from "@/components/sidebar-shell";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const ARCHIVED_STORAGE_KEY = "zyx_admin_sidebar_archived";
const DEFAULT_ARCHIVED = ["tutorial-pka"];

function AdminSidebarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [archivedTabs, setArchivedTabs] = useState<string[]>(DEFAULT_ARCHIVED);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(ARCHIVED_STORAGE_KEY);
    if (stored !== null) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setArchivedTabs(parsed);
          return;
        }
      } catch {
        // Fallback to default
      }
    }
    setArchivedTabs(DEFAULT_ARCHIVED);
  }, []);

  const saveArchived = (tabs: string[]) => {
    setArchivedTabs(tabs);
    localStorage.setItem(ARCHIVED_STORAGE_KEY, JSON.stringify(tabs));
  };

  const archiveTab = (id: string, name: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    const next = Array.from(new Set([...archivedTabs, id]));
    saveArchived(next);
    toast.success(`Tab "${name}" dipindahkan ke arsip.`);
  };

  const restoreTab = (id: string, name: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    const next = archivedTabs.filter((t) => t !== id);
    saveArchived(next);
    toast.success(`Tab "${name}" dipulihkan dari arsip.`);
  };

  const isExact = (path: string) => pathname === path;
  const isPrefix = (path: string) => pathname === path || pathname.startsWith(path + "/");

  const pkaQuizActive =
    pathname === "/admin/ai/quizzes" && searchParams?.get("courseId") === "tutorial-pka";
  const pkaMaterialActive =
    pathname === "/admin/ai/materials" && searchParams?.get("courseId") === "tutorial-pka";
  const materialsReviewActive = isPrefix("/admin/materials/review");
  const materialsManualActive = isPrefix("/admin/materials/manual");

  const akademikActive =
    isPrefix("/admin/courses") ||
    isPrefix("/admin/materials") ||
    isPrefix("/admin/bundles") ||
    isPrefix("/admin/authoring-context");

  const pkaActive =
    isPrefix("/admin/tutorial-pka") || pkaQuizActive || pkaMaterialActive;

  const evaluasiActive =
    isPrefix("/admin/ai/questions") ||
    (isPrefix("/admin/ai/quizzes") && !pkaQuizActive) ||
    isPrefix("/admin/ai/quiz-insights") ||
    isPrefix("/admin/ai/jobs") ||
    isPrefix("/admin/ai/distractors");

  const alatActive =
    isPrefix("/admin/meet") ||
    isPrefix("/admin/forms") ||
    isPrefix("/admin/media") ||
    isPrefix("/admin/tautan");

  const penggunaActive =
    isPrefix("/admin/tokens") || isPrefix("/admin/notifications");

  const opsActive = isPrefix("/admin/ops");

  // Check if active route is inside an archived tab
  const isArchived = (id: string) => mounted && archivedTabs.includes(id);

  const renderArchiveButton = (id: string, label: string) => (
    <SidebarTooltip label="Arsipkan tab" collapsed={false}>
      <button
        type="button"
        onClick={(e) => archiveTab(id, label, e)}
        title="Arsipkan tab"
        aria-label={`Arsipkan ${label}`}
        className="opacity-0 group-hover/collapsible:opacity-100 p-1 hover:bg-muted/80 rounded-md text-muted-foreground hover:text-foreground transition-all ml-auto mr-1 cursor-pointer"
      >
        <Archive className="size-3.5" />
      </button>
    </SidebarTooltip>
  );

  const renderRestoreButton = (id: string, label: string) => (
    <SidebarTooltip label="Pulihkan tab" collapsed={false}>
      <button
        type="button"
        onClick={(e) => restoreTab(id, label, e)}
        title="Pulihkan tab"
        aria-label={`Pulihkan ${label}`}
        className="p-1 hover:bg-brand-primary/20 rounded-md text-brand-primary transition-all ml-auto mr-1 cursor-pointer"
      >
        <ArchiveRestore className="size-3.5" />
      </button>
    </SidebarTooltip>
  );

  const navContent = (c: boolean) => {
    // Definisi tab-tab yang bisa diarsip
    const tabs = {
      akademik: (
        <NavCollapsible
          key="akademik"
          icon={BookOpen}
          label="Akademik & Konten"
          collapsed={c}
          active={akademikActive}
          trailing={!c ? renderArchiveButton("akademik", "Akademik & Konten") : undefined}
        >
          <NavItem href="/admin/courses" icon={GraduationCap} label="Mata Kuliah" active={isPrefix("/admin/courses")} collapsed={c} isChild />
          <NavItem href="/admin/materials/review" icon={ClipboardCheck} label="Review Materi" active={materialsReviewActive} collapsed={c} isChild />
          <NavItem href="/admin/materials/manual" icon={Upload} label="Upload Manual" active={materialsManualActive} collapsed={c} isChild />
          <NavItem href="/admin/authoring-context" icon={ShieldCheck} label="Authoring Context" active={isPrefix("/admin/authoring-context")} collapsed={c} isChild />
          <NavItem href="/admin/bundles/idea" icon={Layers} label="Idea Bundle" active={isPrefix("/admin/bundles/idea")} collapsed={c} isChild />
          <NavItem href="/admin/bundles/product" icon={Package} label="Product Bundle" active={isPrefix("/admin/bundles/product")} collapsed={c} isChild />
        </NavCollapsible>
      ),
      evaluasi: (
        <NavCollapsible
          key="evaluasi"
          icon={ClipboardList}
          label="Bank Soal & Asesmen"
          collapsed={c}
          active={evaluasiActive}
          trailing={!c ? renderArchiveButton("evaluasi", "Bank Soal & Asesmen") : undefined}
        >
          <NavItem href="/admin/ai/questions" icon={Library} label="Bank Soal" active={isPrefix("/admin/ai/questions")} collapsed={c} isChild />
          <NavItem href="/admin/ai/quizzes" icon={NotebookPen} label="Template Kuis" active={isPrefix("/admin/ai/quizzes") && !pkaQuizActive} collapsed={c} isChild />
          <NavItem href="/admin/ai/quiz-insights" icon={BarChart3} label="Analisis Kuis" active={isPrefix("/admin/ai/quiz-insights")} collapsed={c} isChild />
          <NavItem href="/admin/ai/jobs" icon={Zap} label="Generasi Soal" active={isPrefix("/admin/ai/jobs")} collapsed={c} isChild />
          <NavItem href="/admin/ai/distractors" icon={Target} label="Analitik Distraktor" active={isPrefix("/admin/ai/distractors")} collapsed={c} isChild />
        </NavCollapsible>
      ),
      alat: (
        <NavCollapsible
          key="alat"
          icon={FilePen}
          label="Alat & Komunikasi"
          collapsed={c}
          active={alatActive}
          trailing={!c ? renderArchiveButton("alat", "Alat & Komunikasi") : undefined}
        >
          <NavItem href="/admin/forms" icon={FilePen} label="Form Studio" active={isPrefix("/admin/forms")} collapsed={c} isChild />
          <NavItem href="/admin/meet" icon={Video} label="Meet" active={isPrefix("/admin/meet")} collapsed={c} isChild />
          <NavItem href="/admin/media" icon={ImageIcon} label="Pustaka Media" active={isPrefix("/admin/media")} collapsed={c} isChild />
          <NavItem href="/admin/tautan" icon={LinkIcon} label="Tautan Publik" active={isPrefix("/admin/tautan")} collapsed={c} isChild />
        </NavCollapsible>
      ),
      pengguna: (
        <NavCollapsible
          key="pengguna"
          icon={UserCog}
          label="Pengguna & Akses"
          collapsed={c}
          active={penggunaActive}
          trailing={!c ? renderArchiveButton("pengguna", "Pengguna & Akses") : undefined}
        >
          <NavItem href="/admin/tokens" icon={KeyRound} label="Token Aktivasi" active={isPrefix("/admin/tokens")} collapsed={c} isChild />
          <NavItem href="/admin/notifications" icon={Bell} label="Push Notification" active={isPrefix("/admin/notifications")} collapsed={c} isChild />
        </NavCollapsible>
      ),
      ops: (
        <NavCollapsible
          key="ops"
          icon={Settings}
          label="Sistem & Ops"
          collapsed={c}
          active={opsActive}
          trailing={!c ? renderArchiveButton("ops", "Sistem & Ops") : undefined}
        >
          <NavItem href="/admin/ops" icon={Gauge} label="Monitor Ops" active={isExact("/admin/ops")} collapsed={c} isChild />
          <NavItem href="/admin/ops/flags" icon={Flag} label="Feature Flags" active={isPrefix("/admin/ops/flags")} collapsed={c} isChild />
          <NavItem href="/admin/ops/analytics" icon={LineChart} label="Analitik AI" active={isPrefix("/admin/ops/analytics")} collapsed={c} isChild />
          <NavItem href="/admin/ops/keys" icon={Lock} label="API Keys" active={isPrefix("/admin/ops/keys")} collapsed={c} isChild />
          <NavItem href="/admin/ops/short-links" icon={LinkIcon} label="Short Links" active={isPrefix("/admin/ops/short-links")} collapsed={c} isChild />
          <NavItem href="/admin/ops/web-analytics" icon={Globe} label="Web Analytics" active={isPrefix("/admin/ops/web-analytics")} collapsed={c} isChild />
        </NavCollapsible>
      ),
      "tutorial-pka": (
        <NavCollapsible
          key="tutorial-pka"
          icon={GraduationCap}
          label="Tutorial PKA"
          collapsed={c}
          active={pkaActive}
          trailing={
            !c
              ? isArchived("tutorial-pka")
                ? renderRestoreButton("tutorial-pka", "Tutorial PKA")
                : renderArchiveButton("tutorial-pka", "Tutorial PKA")
              : undefined
          }
        >
          <NavItem href="/admin/tutorial-pka/registrations" icon={UserCheck} label="Pendaftar" active={isPrefix("/admin/tutorial-pka/registrations")} collapsed={c} isChild />
          <NavItem href="/admin/tutorial-pka/announcements" icon={Megaphone} label="Pengumuman" active={isPrefix("/admin/tutorial-pka/announcements")} collapsed={c} isChild />
          <NavItem href="/admin/tutorial-pka/schedules" icon={CalendarDays} label="Jadwal Live" active={isPrefix("/admin/tutorial-pka/schedules")} collapsed={c} isChild />
          <NavItem href="/admin/ai/quizzes?courseId=tutorial-pka" icon={ListChecks} label="Template Kuis PKA" active={pkaQuizActive} collapsed={c} isChild />
          <NavItem href="/admin/ai/materials?courseId=tutorial-pka" icon={FileText} label="Materi PKA" active={pkaMaterialActive} collapsed={c} isChild />
        </NavCollapsible>
      ),
    };

    const activeTabElements = Object.entries(tabs)
      .filter(([id]) => !isArchived(id))
      .map(([, el]) => el);

    const archivedTabElements = Object.entries(tabs)
      .filter(([id]) => isArchived(id))
      .map(([id]) => {
        if (id === "tutorial-pka") return tabs["tutorial-pka"];
        if (id === "akademik") {
          return (
            <NavCollapsible
              key="akademik-archived"
              icon={BookOpen}
              label="Akademik & Konten"
              collapsed={c}
              active={akademikActive}
              trailing={!c ? renderRestoreButton("akademik", "Akademik & Konten") : undefined}
            >
              <NavItem href="/admin/courses" icon={GraduationCap} label="Mata Kuliah" active={isPrefix("/admin/courses")} collapsed={c} isChild />
              <NavItem href="/admin/materials/review" icon={ClipboardCheck} label="Review Materi" active={materialsReviewActive} collapsed={c} isChild />
              <NavItem href="/admin/materials/manual" icon={Upload} label="Upload Manual" active={materialsManualActive} collapsed={c} isChild />
              <NavItem href="/admin/authoring-context" icon={ShieldCheck} label="Authoring Context" active={isPrefix("/admin/authoring-context")} collapsed={c} isChild />
              <NavItem href="/admin/bundles/idea" icon={Layers} label="Idea Bundle" active={isPrefix("/admin/bundles/idea")} collapsed={c} isChild />
              <NavItem href="/admin/bundles/product" icon={Package} label="Product Bundle" active={isPrefix("/admin/bundles/product")} collapsed={c} isChild />
            </NavCollapsible>
          );
        }
        if (id === "evaluasi") {
          return (
            <NavCollapsible
              key="evaluasi-archived"
              icon={ClipboardList}
              label="Bank Soal & Asesmen"
              collapsed={c}
              active={evaluasiActive}
              trailing={!c ? renderRestoreButton("evaluasi", "Bank Soal & Asesmen") : undefined}
            >
              <NavItem href="/admin/ai/questions" icon={Library} label="Bank Soal" active={isPrefix("/admin/ai/questions")} collapsed={c} isChild />
              <NavItem href="/admin/ai/quizzes" icon={NotebookPen} label="Template Kuis" active={isPrefix("/admin/ai/quizzes") && !pkaQuizActive} collapsed={c} isChild />
              <NavItem href="/admin/ai/quiz-insights" icon={BarChart3} label="Analisis Kuis" active={isPrefix("/admin/ai/quiz-insights")} collapsed={c} isChild />
              <NavItem href="/admin/ai/jobs" icon={Zap} label="Generasi Soal" active={isPrefix("/admin/ai/jobs")} collapsed={c} isChild />
              <NavItem href="/admin/ai/distractors" icon={Target} label="Analitik Distraktor" active={isPrefix("/admin/ai/distractors")} collapsed={c} isChild />
            </NavCollapsible>
          );
        }
        if (id === "alat") {
          return (
            <NavCollapsible
              key="alat-archived"
              icon={FilePen}
              label="Alat & Komunikasi"
              collapsed={c}
              active={alatActive}
              trailing={!c ? renderRestoreButton("alat", "Alat & Komunikasi") : undefined}
            >
              <NavItem href="/admin/forms" icon={FilePen} label="Form Studio" active={isPrefix("/admin/forms")} collapsed={c} isChild />
              <NavItem href="/admin/meet" icon={Video} label="Meet" active={isPrefix("/admin/meet")} collapsed={c} isChild />
              <NavItem href="/admin/media" icon={ImageIcon} label="Pustaka Media" active={isPrefix("/admin/media")} collapsed={c} isChild />
              <NavItem href="/admin/tautan" icon={LinkIcon} label="Tautan Publik" active={isPrefix("/admin/tautan")} collapsed={c} isChild />
            </NavCollapsible>
          );
        }
        if (id === "pengguna") {
          return (
            <NavCollapsible
              key="pengguna-archived"
              icon={UserCog}
              label="Pengguna & Akses"
              collapsed={c}
              active={penggunaActive}
              trailing={!c ? renderRestoreButton("pengguna", "Pengguna & Akses") : undefined}
            >
              <NavItem href="/admin/tokens" icon={KeyRound} label="Token Aktivasi" active={isPrefix("/admin/tokens")} collapsed={c} isChild />
              <NavItem href="/admin/notifications" icon={Bell} label="Push Notification" active={isPrefix("/admin/notifications")} collapsed={c} isChild />
            </NavCollapsible>
          );
        }
        if (id === "ops") {
          return (
            <NavCollapsible
              key="ops-archived"
              icon={Settings}
              label="Sistem & Ops"
              collapsed={c}
              active={opsActive}
              trailing={!c ? renderRestoreButton("ops", "Sistem & Ops") : undefined}
            >
              <NavItem href="/admin/ops" icon={Gauge} label="Monitor Ops" active={isExact("/admin/ops")} collapsed={c} isChild />
              <NavItem href="/admin/ops/flags" icon={Flag} label="Feature Flags" active={isPrefix("/admin/ops/flags")} collapsed={c} isChild />
              <NavItem href="/admin/ops/analytics" icon={LineChart} label="Analitik AI" active={isPrefix("/admin/ops/analytics")} collapsed={c} isChild />
              <NavItem href="/admin/ops/keys" icon={Lock} label="API Keys" active={isPrefix("/admin/ops/keys")} collapsed={c} isChild />
              <NavItem href="/admin/ops/short-links" icon={LinkIcon} label="Short Links" active={isPrefix("/admin/ops/short-links")} collapsed={c} isChild />
              <NavItem href="/admin/ops/web-analytics" icon={Globe} label="Web Analytics" active={isPrefix("/admin/ops/web-analytics")} collapsed={c} isChild />
            </NavCollapsible>
          );
        }
        return null;
      });

    return (
      <nav
        className={cn(
          "flex flex-1 flex-col gap-1 py-3 font-sans text-left",
          c
            ? "px-1 items-center overflow-y-hidden sidebar-scroll-hidden"
            : "px-3 overflow-y-auto sidebar-scroll"
        )}
      >
        <NavGroup label="Utama" collapsed={c} />
        <NavItem href="/admin" icon={LayoutDashboard} label="Panel Admin" active={isExact("/admin")} collapsed={c} />
        <NavItem href="/admin/blog" icon={Newspaper} label="Kelola Blog" active={isPrefix("/admin/blog")} collapsed={c} />

        <NavGroup label="Modul & Fitur" collapsed={c} />
        {activeTabElements}

        {archivedTabElements.length > 0 && (
          <>
            <div className="h-px bg-border/60 my-2 shrink-0 w-full" />
            <NavCollapsible
              icon={Archive}
              label={`Tab Diarsipkan (${archivedTabElements.length})`}
              collapsed={c}
              active={pkaActive && isArchived("tutorial-pka")}
            >
              <div className="pt-1 pb-1 space-y-1">
                {archivedTabElements}
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
