"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

export interface MobileNavContextValue {
  title: ReactNode | null;
  setTitle: (title: ReactNode | null) => void;
  backHref: string | null;
  setBackHref: (href: string | null) => void;
  actions: ReactNode | null;
  setActions: (actions: ReactNode | null) => void;
}

const MobileNavContext = createContext<MobileNavContextValue | null>(null);

export function getRouteTitle(
  pathname: string,
  surface?: "admin" | "student" | "tutor"
): string {
  // 1. Admin routes
  if (pathname === "/admin") return "Panel Admin";
  if (pathname.startsWith("/admin/blog")) return "Kelola Blog";
  if (pathname.startsWith("/admin/courses")) return "Mata Kuliah";
  if (pathname.startsWith("/admin/schedules")) return "Jadwal";
  if (pathname.startsWith("/admin/materials/review")) return "Review Materi";
  if (pathname.startsWith("/admin/materials/manual")) return "Upload Manual";
  if (pathname.startsWith("/admin/materials")) return "Materi Kuliah";
  if (pathname.startsWith("/admin/questions")) return "Bank Soal";
  if (pathname.startsWith("/admin/quizzes")) return "Kuis";
  if (pathname.startsWith("/admin/leaderboard")) return "Papan Peringkat";
  if (pathname.startsWith("/admin/quiz-insights")) return "Analisis Kuis";
  if (pathname.startsWith("/admin/jobs")) return "Generasi Soal";
  if (pathname.startsWith("/admin/distractors")) return "Distraktor";
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
  if (pathname.startsWith("/admin/authoring-context")) return "Authoring Context";

  // 2. Tutor routes
  if (pathname === "/tutor") return "Pengajaran";
  if (pathname.startsWith("/tutor/schedule")) return "Jadwal Mengajar";
  if (pathname.startsWith("/tutor")) return "Panel Pengajar";

  // 3. Student routes
  if (pathname === "/dashboard") return "Dashboard Siswa";
  if (pathname.startsWith("/dashboard/schedule")) return "Jadwal Belajar";
  if (pathname.startsWith("/dashboard/groups")) return "Kelompok Belajar";
  if (pathname.startsWith("/courses/tutorial-pka")) return "Tutorial PKA";
  if (pathname.startsWith("/courses")) return "Kelas";
  if (pathname.startsWith("/leaderboard")) return "Papan Peringkat";
  if (pathname.startsWith("/calendar")) return "Kalender";
  if (pathname.startsWith("/feedback")) return "Umpan Balik";
  if (pathname.startsWith("/profile")) return "Profil";
  if (pathname.startsWith("/settings")) return "Pengaturan";

  if (surface === "admin") return "Panel Admin";
  if (surface === "tutor") return "Panel Pengajar";
  return "Zyx Academy";
}

export function MobileNavProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [title, setTitle] = useState<ReactNode | null>(null);
  const [backHref, setBackHref] = useState<string | null>(null);
  const [actions, setActions] = useState<ReactNode | null>(null);

  // Clear page-specific title when path changes to avoid stale titles across routes
  useEffect(() => {
    setTitle(null);
    setBackHref(null);
    setActions(null);
  }, [pathname]);

  return (
    <MobileNavContext.Provider
      value={{
        title,
        setTitle,
        backHref,
        setBackHref,
        actions,
        setActions,
      }}
    >
      {children}
    </MobileNavContext.Provider>
  );
}

export function useMobileNav() {
  return useContext(MobileNavContext);
}
