"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { CommandMenuProvider } from "@/components/command-menu";
import { StudentExperienceProvider, type StudentExperienceAdapter } from "@/components/student-experience-provider";
import { StudentSidebar } from "@/components/student-sidebar";
import { TutorSidebar, type AssignedTutorCourse } from "@/components/tutor/tutor-sidebar";
import { AdminSidebar } from "@/components/admin-sidebar";
import { ApplicationShell } from "@/components/application-shell";
import { StudentMobileBottomNav, StudentMobileTopNav } from "@/components/navigation/student";
import { PKA_COURSE_ID } from "@/lib/pka-config";

const DEMO_COURSES = [
  { id: "ma1101", title: "Matematika I (MA1101)", category: "Matematika" },
  { id: "fi1101", title: "Fisika Dasar I (FI1101)", category: "Fisika" },
  { id: "ku1102", title: "Pengenalan Komputasi (KU1102)", category: "Komputasi" },
  { id: PKA_COURSE_ID, title: "Tutorial PKA", category: "PKA" },
];

const TUTOR_COURSES: AssignedTutorCourse[] = [
  { courseId: "mk-kalkulus", title: "Matematika I (MA1101)", code: "MA1101" },
  { courseId: "mk-fisika", title: "Fisika Dasar I (FI1101)", code: "FI1101" },
  { courseId: "mk-komputasi", title: "Pengenalan Komputasi (KU1102)", code: "KU1102" },
];

type SidebarCase =
  | "student-global"
  | "student-global-collapsed"
  | "student-course"
  | "student-course-collapsed"
  | "student-course-pka"
  | "tutor-global"
  | "tutor-course"
  | "admin-course"
  | "student-mobile";

const CASE_TITLES: Record<SidebarCase, { heading: string; subtitle: string }> = {
  "student-global": {
    heading: "Dashboard Siswa",
    subtitle: "Global Student Sidebar (Expanded)",
  },
  "student-global-collapsed": {
    heading: "Dashboard Siswa",
    subtitle: "Global Student Sidebar (Collapsed)",
  },
  "student-course": {
    heading: "Dokumen Matematika I (MA1101)",
    subtitle: "Course Student Sidebar Reguler (Expanded)",
  },
  "student-course-collapsed": {
    heading: "Dokumen Matematika I (MA1101)",
    subtitle: "Course Student Sidebar Reguler (Collapsed)",
  },
  "student-course-pka": {
    heading: "Simulasi Tutorial PKA",
    subtitle: "Course Student Sidebar PKA (Expanded)",
  },
  "tutor-global": {
    heading: "Dashboard Pengajar",
    subtitle: "Global Tutor Sidebar (Expanded)",
  },
  "tutor-course": {
    heading: "Diskusi Kelas Matematika I",
    subtitle: "Course Tutor Sidebar (Expanded)",
  },
  "admin-course": {
    heading: "Kelola Dokumen Matematika I",
    subtitle: "Course Admin Sidebar (Expanded)",
  },
  "student-mobile": {
    heading: "Dashboard Siswa (Mobile)",
    subtitle: "Mobile Navigation Chrome (380px)",
  },
};

function SidebarCasesContent() {
  const searchParams = useSearchParams();
  const activeCase = (searchParams.get("case") as SidebarCase) || "student-global";
  const meta = CASE_TITLES[activeCase] ?? CASE_TITLES["student-global"];

  const studentPathname = useMemo(() => {
    switch (activeCase) {
      case "student-course":
      case "student-course-collapsed":
        return "/courses/ma1101/material";
      case "student-course-pka":
        return `/courses/${PKA_COURSE_ID}/simulasi`;
      default:
        return "/dashboard";
    }
  }, [activeCase]);

  const experience = useMemo<StudentExperienceAdapter>(
    () => ({
      mode: "demo",
      pathname: studentPathname,
      href: (path: string) => path,
      courses: DEMO_COURSES,
      account: { name: "Raka Contoh", email: "raka.demo@example.com" },
      streak: { current: 5, weeklyActivity: [true, true, true, true, true, false, false] },
      courseHref: (id) => `/courses/${encodeURIComponent(id)}`,
      route: (view, id) => (id ? `/courses/${encodeURIComponent(id)}/${view}` : `/${view}`),
      baseline: [],
      selectedCourseId: activeCase.startsWith("student-course") ? "ma1101" : null,
      overlay: null,
      ready: true,
    }),
    [activeCase, studentPathname]
  );

  const sidebarNode = (() => {
    switch (activeCase) {
      case "student-global":
      case "student-mobile":
        return <StudentSidebar showStudyPath showMastery showLive />;
      case "student-global-collapsed":
        return <StudentSidebar showStudyPath showMastery showLive defaultCollapsed />;
      case "student-course":
      case "student-course-pka":
        return <StudentSidebar showStudyPath showMastery showLive />;
      case "student-course-collapsed":
        return <StudentSidebar showStudyPath showMastery showLive defaultCollapsed />;
      case "tutor-global":
        return (
          <TutorSidebar
            assignedCourses={TUTOR_COURSES}
            pathnameOverride="/tutor"
            hideDiscussionBadges
          />
        );
      case "tutor-course":
        return (
          <TutorSidebar
            assignedCourses={TUTOR_COURSES}
            pathnameOverride="/tutor/mk-kalkulus/discussions"
            hideDiscussionBadges
          />
        );
      case "admin-course":
        return (
          <AdminSidebar
            pathnameOverride="/admin/courses/ma1101/documents"
            initialCourseTitle="Matematika I (MA1101)"
          />
        );
    }
  })();

  return (
    <CommandMenuProvider>
      <StudentExperienceProvider value={experience}>
        <ApplicationShell
          showOrnaments={false}
          desktopSidebar={sidebarNode}
          mobileTopNav={activeCase === "student-mobile" ? <StudentMobileTopNav /> : undefined}
          mobileBottomNav={activeCase === "student-mobile" ? <StudentMobileBottomNav /> : undefined}
        >
          <div className="mx-auto max-w-4xl px-6 py-8">
            <h1 className="font-heading text-h5 font-bold text-foreground">{meta.heading}</h1>
            <p className="mt-1 text-body-xs text-muted-foreground">{meta.subtitle}</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-body-sm font-semibold text-foreground">Konten utama</p>
                <p className="mt-1 text-body-xs text-muted-foreground">
                  Area kerja tetap lega dengan batas jelas antara navigasi global dan konteks mata kuliah.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-body-sm font-semibold text-foreground">Konsistensi layout</p>
                <p className="mt-1 text-body-xs text-muted-foreground">
                  Navigasi mobile tetap terpisah pada viewport sempit tanpa terpengaruh perubahan sidebar desktop.
                </p>
              </div>
            </div>
          </div>
        </ApplicationShell>
      </StudentExperienceProvider>
    </CommandMenuProvider>
  );
}

export default function DesktopSidebarCasesFixturePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <SidebarCasesContent />
    </Suspense>
  );
}
