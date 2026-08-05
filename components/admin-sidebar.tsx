"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  FolderOpen,
  KeyRound,
  BookText,
  Archive,
  Zap,
  ListChecks,
  ClipboardList,
  GraduationCap,
  Bell,
  Activity,
  BarChart3,
  Users,
  Megaphone,
  Calendar,
  Link as LinkIcon,
  Newspaper,
  Flag,
  Layers,
  Package,
  ShieldCheck,
  Video,
  FileText,
} from "lucide-react";
import { useSession, signOut } from "@/lib/auth-client";
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

  const handleLogout = async () => {
    await signOut();
    window.location.href = "/";
  };

  const isExact = (path: string) => pathname === path;
  const isPrefix = (path: string) => pathname === path || pathname.startsWith(path + "/");

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
            <div className="my-1 border-t border-border" />
            <button
              type="button"
              onClick={() => {
                setProfileOpen(false);
                handleLogout();
              }}
              className="flex w-full items-center rounded-lg px-2.5 py-2 text-body-sm text-status-error hover:bg-status-error/10 transition-colors cursor-pointer text-left font-medium"
            >
              Keluar
            </button>
          </div>
        )}
      </div>
    );
  };

  const bottomSection = (c: boolean) => {
    return (
      <nav className={cn(
        "flex flex-col gap-1 pb-4 font-sans text-left",
        c ? "px-1 items-center" : "px-3"
      )}>
        <NavItem
          href="/dashboard"
          icon={GraduationCap}
          label="Beranda Siswa"
          className="text-tertiary-1 hover:bg-tertiary-1/10 hover:text-tertiary-1 font-semibold"
          collapsed={c}
        />
      </nav>
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
        <NavItem href="/admin/files" icon={FolderOpen} label="File Storage" active={isPrefix("/admin/files")} collapsed={c} />

        <NavGroup label="Akademik" collapsed={c} />
        <NavItem href="/admin/courses" icon={BookText} label="Mata Kuliah" active={isPrefix("/admin/courses")} collapsed={c} />
        <NavItem href="/admin/bundles/idea" icon={Layers} label="Idea Bundle V2" active={isPrefix("/admin/bundles/idea")} collapsed={c} />
        <NavItem href="/admin/bundles/product" icon={Package} label="Product Bundle V2" active={isPrefix("/admin/bundles/product")} collapsed={c} />
        <NavItem href="/admin/authoring-context" icon={ShieldCheck} label="Authoring Context" active={isPrefix("/admin/authoring-context")} collapsed={c} />
        
        <NavCollapsible 
          icon={GraduationCap} 
          label="Tutorial PKA" 
          collapsed={c} 
          active={isPrefix("/admin/tutorial-pka") || (pathname.startsWith("/admin/ai/quizzes") && searchParams?.get("courseId") === "tutorial-pka") || (pathname.startsWith("/admin/ai/materials") && searchParams?.get("courseId") === "tutorial-pka")}
        >
          <NavItem href="/admin/tutorial-pka/registrations" icon={Users} label="Pendaftar" active={isPrefix("/admin/tutorial-pka/registrations")} collapsed={c} isChild />
          <NavItem href="/admin/tutorial-pka/announcements" icon={Megaphone} label="Pengumuman" active={isPrefix("/admin/tutorial-pka/announcements")} collapsed={c} isChild />
          <NavItem href="/admin/tutorial-pka/schedules" icon={Calendar} label="Jadwal Live" active={isPrefix("/admin/tutorial-pka/schedules")} collapsed={c} isChild />
          <NavItem href="/admin/ai/quizzes?courseId=tutorial-pka" icon={ListChecks} label="Template Kuis" active={pathname === "/admin/ai/quizzes" && searchParams?.get("courseId") === "tutorial-pka"} collapsed={c} isChild />
          <NavItem href="/admin/ai/materials?courseId=tutorial-pka" icon={BookText} label="Materi & Flashcard" active={pathname === "/admin/ai/materials" && searchParams?.get("courseId") === "tutorial-pka"} collapsed={c} isChild />
        </NavCollapsible>

        <NavGroup label="Evaluasi & Kuis" collapsed={c} />
        <NavItem href="/admin/ai/questions" icon={ClipboardList} label="Bank Soal" active={isPrefix("/admin/ai/questions")} collapsed={c} />
        <NavItem href="/admin/ai/quizzes" icon={ListChecks} label="Template Kuis" active={isPrefix("/admin/ai/quizzes")} collapsed={c} />
        <NavItem href="/admin/ai/quiz-insights" icon={BarChart3} label="Analisis & Insight Kuis" active={isPrefix("/admin/ai/quiz-insights")} collapsed={c} />
        <NavItem href="/admin/ai/jobs" icon={Zap} label="Generasi Soal" active={isPrefix("/admin/ai/jobs")} collapsed={c} />
        <NavItem href="/admin/ai/distractors" icon={BarChart3} label="Analitik Distraktor" active={isPrefix("/admin/ai/distractors")} collapsed={c} />


        <NavGroup label="AI & Konten" collapsed={c} />
        <NavItem href="/admin/ai/materials" icon={BookText} label="Materi AI" active={isPrefix("/admin/ai/materials")} collapsed={c} />
        <NavItem href="/admin/ai/assessments" icon={Archive} label="Asesmen Historis" active={isPrefix("/admin/ai/assessments")} collapsed={c} />
        <NavItem href="/admin/ai/diktats" icon={FolderOpen} label="Kompilasi Diktat" active={isPrefix("/admin/ai/diktats")} collapsed={c} />
        <NavItem href="/admin/ai/ast-inspector" icon={Activity} label="AST Inspector" active={isPrefix("/admin/ai/ast-inspector")} collapsed={c} />

        <NavGroup label="Pengguna & Akses" collapsed={c} />
        <NavItem href="/admin/tokens" icon={KeyRound} label="Token Aktivasi" active={isPrefix("/admin/tokens")} collapsed={c} />
        <NavItem href="/admin/notifications" icon={Bell} label="Push Notification" active={isPrefix("/admin/notifications")} collapsed={c} />

        <NavGroup label="Sistem & Ops" collapsed={c} />
        <NavItem href="/admin/meet" icon={Video} label="Sesi & Temu (Meet)" active={isPrefix("/admin/meet")} collapsed={c} />
        <NavItem href="/admin/forms" icon={FileText} label="Form Studio" active={isPrefix("/admin/forms")} collapsed={c} />
        <NavItem href="/admin/ops" icon={Activity} label="Monitor Ops" active={isExact("/admin/ops")} collapsed={c} />
        <NavItem href="/admin/ops/flags" icon={Flag} label="Feature Flags" active={isPrefix("/admin/ops/flags")} collapsed={c} />
        <NavItem href="/admin/ops/analytics" icon={BarChart3} label="Analitik AI" active={isPrefix("/admin/ops/analytics")} collapsed={c} />
        <NavItem href="/admin/ops/keys" icon={KeyRound} label="API Keys" active={isPrefix("/admin/ops/keys")} collapsed={c} />
        <NavItem href="/admin/ops/short-links" icon={LinkIcon} label="Short Links" active={isPrefix("/admin/ops/short-links")} collapsed={c} />

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
      bottomSection={bottomSection}
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
