"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { openMobileSidebar } from "@/components/sidebar-shell";
import { useCommandMenu } from "@/components/command-menu";

export function getRouteTitle(
  pathname: string,
  surface?: "admin" | "student" | "tutor"
): string {
  if (pathname === "/admin") return "Panel Admin";
  if (pathname.startsWith("/admin/blog")) return "Kelola Blog";
  if (pathname.startsWith("/admin/courses/")) {
    const match = pathname.match(/^\/admin\/courses\/([^/]+)(.*)$/);
    if (match && match[1]) {
      const subpath = match[2] || "";
      if (subpath.startsWith("/documents")) return "Dokumen";
      if (subpath.startsWith("/videos")) return "Video";
      if (subpath.startsWith("/quizzes")) return "Kuis";
      if (subpath.startsWith("/questions")) return "Soal";
      if (subpath.startsWith("/flashcards")) return "Flashcard";
      if (subpath.startsWith("/results")) return "Hasil";
      if (subpath.startsWith("/leaderboard")) return "Papan Peringkat";
      if (subpath.startsWith("/analytics")) return "Analitik";
      if (subpath.startsWith("/review")) return "Review Materi";
      if (subpath.startsWith("/settings")) return "Pengaturan";
      if (subpath === "" || subpath === "/") return "Bab";
      return "Mata Kuliah";
    }
  }
  if (pathname.startsWith("/admin/courses")) return "Mata Kuliah";
  if (pathname.startsWith("/admin/schedules")) return "Jadwal";
  if (pathname.startsWith("/admin/materials/review")) return "Review Materi";
  if (pathname.startsWith("/admin/materials")) return "Materi Kuliah";
  if (pathname.startsWith("/admin/questions")) return "Bank Soal";
  if (pathname.startsWith("/admin/quizzes")) return "Kuis";
  if (pathname.startsWith("/admin/leaderboard")) return "Papan Peringkat";
  if (pathname.startsWith("/admin/quiz-insights")) return "Analisis Kuis";
  if (pathname.startsWith("/admin/jobs")) return "Generasi Soal";
  if (pathname.startsWith("/admin/distractors")) return "Distraktor";
  if (pathname.startsWith("/admin/pricing")) return "Kalkulator Harga";
  if (pathname.startsWith("/admin/forms")) return "Form Studio";
  if (pathname.startsWith("/admin/meet")) return "Meet";
  if (pathname.startsWith("/admin/media")) return "Pustaka Media";
  if (pathname.startsWith("/admin/tautan")) return "Tautan Publik";
  if (pathname.startsWith("/admin/users")) return "Pengguna";
  if (pathname.startsWith("/admin/groups")) return "Kelompok Belajar";
  if (pathname.startsWith("/admin/tokens")) return "Token Aktivasi";
  if (pathname.startsWith("/admin/notifications")) return "Notifikasi";
  if (pathname.startsWith("/admin/ops/analytics")) return "Analitik Zyra";
  if (pathname.startsWith("/admin/ops/feature-usage")) return "Fitur";
  if (pathname.startsWith("/admin/ops/flags")) return "Feature Flags";
  if (pathname.startsWith("/admin/ops/keys")) return "API Keys";
  if (pathname.startsWith("/admin/ops/short-links")) return "Short Links";
  if (pathname.startsWith("/admin/ops/tutor-activity")) return "Aktivitas Tutor";
  if (pathname.startsWith("/admin/ops/web-analytics")) return "Web Analytics";
  if (pathname.startsWith("/admin/ops")) return "Monitor Ops";
  if (pathname.startsWith("/admin/tutorial-pka/registrations")) return "Pendaftar PKA";
  if (pathname.startsWith("/admin/tutorial-pka/announcements")) return "Pengumuman PKA";
  if (pathname.startsWith("/admin/tutorial-pka/schedules")) return "Jadwal Live PKA";
  if (pathname.startsWith("/admin/tutorial-pka")) return "Tutorial PKA";
  if (pathname.startsWith("/admin/bundles/idea")) return "Idea Bundles";
  if (pathname.startsWith("/admin/bundles/product")) return "Product Bundles";

  if (pathname === "/tutor") return "Panel Pengajar";
  if (pathname.startsWith("/tutor/schedule")) return "Jadwal Mengajar";
  if (pathname.startsWith("/tutor")) {
    if (pathname.includes("/videos")) return "Video";
    if (pathname.includes("/materials")) return "Dokumen";
    return "Panel Pengajar";
  }

  if (pathname === "/dashboard/schedule") return "Jadwal Belajar";
  if (pathname.startsWith("/dashboard/groups")) return "Kelompok Belajar";
  if (pathname === "/dashboard") return "Dashboard Siswa";
  if (pathname.startsWith("/courses/tutorial-pka")) return "Tutorial PKA";
  if (pathname.startsWith("/courses")) {
    if (pathname.includes("/video")) return "Video";
    if (pathname.includes("/material")) return "Dokumen";
    return "Kelas";
  }
  if (pathname.startsWith("/leaderboard")) return "Papan Peringkat";
  if (pathname.startsWith("/calendar")) return "Kalender";
  if (pathname.startsWith("/feedback")) return "Umpan Balik";
  if (pathname.startsWith("/profile")) return "Profil";
  if (pathname.startsWith("/settings")) return "Pengaturan";

  if (surface === "admin") return "Panel Admin";
  if (surface === "tutor") return "Panel Pengajar";
  return "Dashboard Siswa";
}

export function setMobileNavTitle(title: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("zyx:set-mobile-title", { detail: title }));
  }
}

export type MobileNavbarProps = {
  surface?: "admin" | "student" | "tutor";
  className?: string;
};

function isMobileSidebarBackdrop(target: EventTarget | null): target is HTMLElement {
  return target instanceof HTMLElement
    && target.classList.contains("fixed")
    && target.classList.contains("inset-0")
    && target.classList.contains("z-40")
    && target.classList.contains("bg-black/50")
    && target.classList.contains("md:hidden");
}

export function MobileNavbar({ surface, className }: MobileNavbarProps) {
  const pathname = usePathname();
  const { setOpen: setSearchOpen } = useCommandMenu();
  const [customTitle, setCustomTitle] = useState<string | null>(null);
  const [isTitleOverflowing, setIsTitleOverflowing] = useState(false);
  const titleRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const handleSetTitle = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string") setCustomTitle(detail);
    };
    const handleClearTitle = () => setCustomTitle(null);

    window.addEventListener("zyx:set-mobile-title", handleSetTitle);
    window.addEventListener("zyx:clear-mobile-title", handleClearTitle);
    return () => {
      window.removeEventListener("zyx:set-mobile-title", handleSetTitle);
      window.removeEventListener("zyx:clear-mobile-title", handleClearTitle);
    };
  }, []);

  useEffect(() => {
    const handleBackdropPointerDown = (event: PointerEvent) => {
      if (!isMobileSidebarBackdrop(event.target)) return;

      event.preventDefault();
      event.stopPropagation();
      event.target.click();
    };

    document.addEventListener("pointerdown", handleBackdropPointerDown, true);
    return () => document.removeEventListener("pointerdown", handleBackdropPointerDown, true);
  }, []);

  useEffect(() => {
    titleRef.current?.scrollTo({ left: 0 });
  }, [pathname]);

  const displayTitle = customTitle || getRouteTitle(pathname, surface);

  useEffect(() => {
    const checkOverflow = () => {
      const title = titleRef.current;
      setIsTitleOverflowing(Boolean(title && title.scrollWidth - title.clientWidth > 1));
    };

    checkOverflow();
    window.addEventListener("resize", checkOverflow);
    return () => window.removeEventListener("resize", checkOverflow);
  }, [displayTitle]);

  const revealFullTitle = () => {
    const title = titleRef.current;
    if (!title) return;

    const maxScroll = title.scrollWidth - title.clientWidth;
    if (maxScroll <= 1) return;

    const atEnd = title.scrollLeft >= maxScroll - 1;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    title.scrollTo({
      left: atEnd ? 0 : maxScroll,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  };

  const titleContent = (
    <span
      ref={titleRef}
      className="block min-w-0 overflow-x-hidden whitespace-nowrap font-heading text-body-sm font-semibold leading-tight tracking-tight text-foreground [text-overflow:ellipsis]"
    >
      {displayTitle}
    </span>
  );

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-13 w-full max-w-full shrink-0 items-center justify-between gap-2 overflow-hidden border-b border-border/80 bg-background/95 px-3 backdrop-blur-md md:!hidden sm:px-4",
        className
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden">
        <button
          type="button"
          onClick={openMobileSidebar}
          aria-label="Buka navigasi"
          className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-xs transition-colors hover:bg-muted hover:text-foreground active:scale-95"
        >
          <Menu className="size-4.5" />
        </button>

        {isTitleOverflowing ? (
          <button
            type="button"
            onClick={revealFullTitle}
            aria-label={`Tampilkan judul lengkap: ${displayTitle}`}
            title={displayTitle}
            className="min-w-0 flex-1 cursor-pointer overflow-hidden text-left"
          >
            {titleContent}
          </button>
        ) : (
          <div className="min-w-0 flex-1 overflow-hidden text-left" title={displayTitle}>
            {titleContent}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label="Cari"
          className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-xs transition-colors hover:bg-muted hover:text-foreground active:scale-95"
        >
          <Search className="size-4" />
        </button>
      </div>
    </header>
  );
}
