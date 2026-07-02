"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  LogOut,
  Bell,
  Activity,
  BarChart3,
} from "lucide-react";
import { useSession, signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { SidebarShell, NavItem } from "@/components/sidebar-shell";

export function AdminSidebar() {
  const { data: session } = useSession();
  const pathname = usePathname();
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

  const isActiveTab = (tab: "dashboard" | "academic" | "files" | "rag" | "eval" | "ops") => {
    if (tab === "dashboard") {
      return pathname === "/admin";
    }
    if (tab === "academic") {
      const paths = ["/admin/courses", "/admin/tokens", "/admin/notifications", "/admin/pka-announcements"];
      return paths.some((p) => pathname === p || pathname.startsWith(p + "/"));
    }
    if (tab === "files") {
      return pathname === "/admin/files" || pathname.startsWith("/admin/files/");
    }
    if (tab === "rag") {
      const paths = ["/admin/ai/materials", "/admin/ai/assessments", "/admin/ai/diktats", "/admin/ai/ast-inspector"];
      return paths.some((p) => pathname === p || pathname.startsWith(p + "/"));
    }
    if (tab === "eval") {
      const paths = ["/admin/ai/questions", "/admin/ai/jobs", "/admin/ai/quizzes", "/admin/ai/distractors"];
      return paths.some((p) => pathname === p || pathname.startsWith(p + "/"));
    }
    if (tab === "ops") {
      const paths = ["/admin/ops", "/admin/ops/analytics", "/admin/ops/keys"];
      return paths.some((p) => pathname === p || pathname.startsWith(p + "/"));
    }
    return false;
  };

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
            <img
              src={session.user.image}
              alt={session.user.name}
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
              onClick={() => setProfileOpen(false)}
              className="flex w-full items-center rounded-lg px-2.5 py-2 text-body-sm text-foreground hover:bg-muted transition-colors"
            >
              Pengaturan Profil
            </Link>
            <Link
              href="/dashboard"
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
        <NavItem
          href="/admin"
          icon={LayoutDashboard}
          label="Panel Admin"
          active={isActiveTab("dashboard")}
          collapsed={c}
        />

        <NavItem
          href="/admin/courses"
          icon={GraduationCap}
          label="Manajemen Akademik"
          active={isActiveTab("academic")}
          collapsed={c}
        />

        <NavItem
          href="/admin/files"
          icon={FolderOpen}
          label="File Storage"
          active={isActiveTab("files")}
          collapsed={c}
        />

        <NavItem
          href="/admin/ai/materials"
          icon={BookText}
          label="RAG & Konten AI"
          active={isActiveTab("rag")}
          collapsed={c}
        />

        <NavItem
          href="/admin/ai/questions"
          icon={ClipboardList}
          label="Evaluasi & Kuis"
          active={isActiveTab("eval")}
          collapsed={c}
        />

        <NavItem
          href="/admin/ops"
          icon={Activity}
          label="Sistem & Ops"
          active={isActiveTab("ops")}
          collapsed={c}
        />

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
