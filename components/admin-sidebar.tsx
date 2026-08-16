"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
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
} from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { SidebarShell, NavItem, NavGroup, NavCollapsible } from "@/components/sidebar-shell";

function AdminSidebarInner() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profileOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [profileOpen]);

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
    isPrefix("/admin/materials");

  const pkaActive =
    isPrefix("/admin/tutorial-pka") || pkaQuizActive || pkaMaterialActive;

  const evaluasiActive =
    isPrefix("/admin/ai/questions") ||
    (isPrefix("/admin/ai/quizzes") && !pkaQuizActive) ||
    isPrefix("/admin/ai/quiz-insights") ||
    isPrefix("/admin/ai/jobs") ||
    isPrefix("/admin/ai/distractors");

  const penggunaActive =
    isPrefix("/admin/tokens") || isPrefix("/admin/notifications");

  const opsActive = isPrefix("/admin/ops");

  const topSection = (c: boolean) => {
    if (!session?.user) return null;

    return (
      <div className="shrink-0 relative" ref={profileRef}>
        <button
          type="button"
          onClick={() => setProfileOpen(!profileOpen)}
          aria-expanded={profileOpen}
          aria-haspopup="true"
          className={cn(
            "mx-3 mt-3 flex w-[calc(100%-1.5rem)] shrink-0 items-center gap-3 rounded-xl border border-border/70 bg-muted/40 p-2.5 transition-all duration-300 hover:bg-muted/70 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            c && "justify-center p-1.5 mx-auto size-10 w-10"
          )}
        >
          {session.user.image ? (
            <Image
              src={session.user.image}
              alt={session.user.name || ""}
              width={28}
              height={28}
              className="size-7 shrink-0 rounded-full object-cover ring-2 ring-brand-primary/20"
            />
          ) : (
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-primary text-xs font-bold text-white">
              {session.user.name?.charAt(0)?.toUpperCase() ?? "?"}
            </span>
          )}
          {!c && (
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-body-xs font-semibold text-foreground">
                {session.user.name}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {session.user.email}
              </p>
            </div>
          )}
        </button>

        {profileOpen && (
          <div
            className={cn(
              "absolute z-50 mt-1 rounded-xl border border-border bg-popover p-1 shadow-md animate-in fade-in-50 slide-in-from-top-1 duration-150",
              c
                ? "left-14 top-0 ml-0 w-48"
                : "top-full w-[calc(100%-1.5rem)] mx-3"
            )}
          >
            <Link
              href="/settings"
              prefetch={true}
              onClick={() => setProfileOpen(false)}
              className="flex w-full items-center rounded-lg px-2.5 py-2 text-body-sm text-foreground hover:bg-muted transition-colors"
            >
              Pengaturan Profil
            </Link>
            <Link
              href="/dashboard"
              prefetch={true}
              onClick={() => setProfileOpen(false)}
              className="flex w-full items-center rounded-lg px-2.5 py-2 text-body-sm text-foreground hover:bg-muted transition-colors"
            >
              Beranda Siswa
            </Link>
          </div>
        )}
      </div>
    );
  };

  const navContent = (c: boolean) => {
    return (
      <nav
        className={cn(
          "flex flex-1 flex-col gap-1 py-4 font-sans text-left",
          c
            ? "px-1 items-center overflow-y-hidden sidebar-scroll-hidden"
            : "px-3 overflow-y-auto sidebar-scroll"
        )}
      >
        <NavGroup label="Utama" collapsed={c} />
        <NavItem href="/admin" icon={LayoutDashboard} label="Panel Admin" active={isExact("/admin")} collapsed={c} />
        <NavItem href="/admin/blog" icon={Newspaper} label="Kelola Blog" active={isPrefix("/admin/blog")} collapsed={c} />

        <NavGroup label="Media & Alat" collapsed={c} />
        <NavItem href="/admin/meet" icon={Video} label="Meet" active={isPrefix("/admin/meet")} collapsed={c} />
        <NavItem href="/admin/forms" icon={FilePen} label="Form Studio" active={isPrefix("/admin/forms")} collapsed={c} />
        <NavItem href="/admin/media" icon={ImageIcon} label="Media" active={isPrefix("/admin/media")} collapsed={c} />
        <NavItem href="/admin/tautan" icon={LinkIcon} label="Tautan" active={isPrefix("/admin/tautan")} collapsed={c} />

        <NavCollapsible icon={BookOpen} label="Akademik" collapsed={c} active={akademikActive}>
          <NavItem href="/admin/courses" icon={GraduationCap} label="Mata Kuliah" active={isPrefix("/admin/courses")} collapsed={c} isChild />
          <NavItem href="/admin/materials/review" icon={ClipboardCheck} label="Review Materi" active={materialsReviewActive} collapsed={c} isChild />
          <NavItem href="/admin/materials/manual" icon={Upload} label="Upload Manual" active={materialsManualActive} collapsed={c} isChild />
        </NavCollapsible>

        <NavCollapsible icon={GraduationCap} label="Tutorial PKA" collapsed={c} active={pkaActive}>
          <NavItem href="/admin/tutorial-pka/registrations" icon={UserCheck} label="Pendaftar" active={isPrefix("/admin/tutorial-pka/registrations")} collapsed={c} isChild />
          <NavItem href="/admin/tutorial-pka/announcements" icon={Megaphone} label="Pengumuman" active={isPrefix("/admin/tutorial-pka/announcements")} collapsed={c} isChild />
          <NavItem href="/admin/tutorial-pka/schedules" icon={CalendarDays} label="Jadwal Live" active={isPrefix("/admin/tutorial-pka/schedules")} collapsed={c} isChild />
          <NavItem href="/admin/ai/quizzes?courseId=tutorial-pka" icon={ListChecks} label="Template Kuis PKA" active={pkaQuizActive} collapsed={c} isChild />
          <NavItem href="/admin/ai/materials?courseId=tutorial-pka" icon={FileText} label="Materi PKA" active={pkaMaterialActive} collapsed={c} isChild />
        </NavCollapsible>

        <NavCollapsible icon={ClipboardList} label="Evaluasi & Kuis" collapsed={c} active={evaluasiActive}>
          <NavItem href="/admin/ai/questions" icon={Library} label="Bank Soal" active={isPrefix("/admin/ai/questions")} collapsed={c} isChild />
          <NavItem href="/admin/ai/quizzes" icon={NotebookPen} label="Template Kuis" active={isPrefix("/admin/ai/quizzes") && !pkaQuizActive} collapsed={c} isChild />
          <NavItem href="/admin/ai/quiz-insights" icon={BarChart3} label="Analisis & Insight Kuis" active={isPrefix("/admin/ai/quiz-insights")} collapsed={c} isChild />
          <NavItem href="/admin/ai/jobs" icon={Zap} label="Generasi Soal" active={isPrefix("/admin/ai/jobs")} collapsed={c} isChild />
          <NavItem href="/admin/ai/distractors" icon={Target} label="Analitik Distraktor" active={isPrefix("/admin/ai/distractors")} collapsed={c} isChild />
        </NavCollapsible>

        <NavCollapsible icon={UserCog} label="Pengguna & Akses" collapsed={c} active={penggunaActive}>
          <NavItem href="/admin/tokens" icon={KeyRound} label="Token Aktivasi" active={isPrefix("/admin/tokens")} collapsed={c} isChild />
          <NavItem href="/admin/notifications" icon={Bell} label="Push Notification" active={isPrefix("/admin/notifications")} collapsed={c} isChild />
        </NavCollapsible>

        <NavCollapsible icon={Settings} label="Sistem & Ops" collapsed={c} active={opsActive}>
          <NavItem href="/admin/ops" icon={Gauge} label="Monitor Ops" active={isExact("/admin/ops")} collapsed={c} isChild />
          <NavItem href="/admin/ops/flags" icon={Flag} label="Feature Flags" active={isPrefix("/admin/ops/flags")} collapsed={c} isChild />
          <NavItem href="/admin/ops/analytics" icon={LineChart} label="Analitik AI" active={isPrefix("/admin/ops/analytics")} collapsed={c} isChild />
          <NavItem href="/admin/ops/keys" icon={Lock} label="API Keys" active={isPrefix("/admin/ops/keys")} collapsed={c} isChild />
          <NavItem href="/admin/ops/short-links" icon={LinkIcon} label="Short Links" active={isPrefix("/admin/ops/short-links")} collapsed={c} isChild />
          <NavItem href="/admin/ops/web-analytics" icon={Globe} label="Web Analytics" active={isPrefix("/admin/ops/web-analytics")} collapsed={c} isChild />
        </NavCollapsible>

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
      topSection={topSection}
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
