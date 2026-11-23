import React from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  Compass,
  GraduationCap,
  Layers,
} from "lucide-react";
import { DashboardFocusStrip, pickDashboardPriority, type DashboardFocusData } from "@/components/dashboard/dashboard-focus-strip";
import { DashboardInlineEmpty, DashboardSectionCount, DashboardSectionHeading } from "@/components/dashboard/dashboard-section-heading";
import { TodayPlan } from "@/components/dashboard/today-plan";
import { WeeklyReflection } from "@/components/dashboard/weekly-reflection";
import { DashboardWeakConcepts } from "@/components/course/dashboard-weak-concepts";
import { MathText } from "@/components/course/math-text";
import { Button } from "@/components/ui/button";
import { StudentDashboardDesktop } from "@/features/student-dashboard/ui/desktop/student-dashboard-desktop";
import { StudentDashboardMobile } from "@/features/student-dashboard/ui/mobile/student-dashboard-mobile";
import student from "@/messages/id/student.json";
import studentCourse from "@/messages/id/studentCourse.json";
import ui from "@/messages/id/ui.json";

declare global {
  interface Window {
    dashboardRedesignFixture: { layout: "desktop" | "mobile"; theme: "dark" | "light" };
  }
}

const baseFocus: Omit<DashboardFocusData, "priority"> = {
  cards: { due: 102, href: "/courses/ma1101/flashcard" },
  weak: {
    weakCount: 3,
    measuredCount: 6,
    lowest: { conceptName: "Akar kuadrat $\\sqrt{x}$ untuk $x \\ge 0$", score: 2 },
    href: "/courses/ma1101/mastery",
  },
  materials: { done: 2, total: 6, href: "/courses/ma1101" },
  exams: { quizzes: 0, tryouts: 0, href: null },
};

const focusData: DashboardFocusData = {
  ...baseFocus,
  priority: pickDashboardPriority(baseFocus),
};

const masteryConcepts = [
  {
    conceptName: "Akar kuadrat $\\sqrt{x}$ untuk $x \\ge 0$ adalah bilangan tak negatif $a$ yang memenuhi $a^2 = x$, sedangkan penyelesaian $x^2 = b$ adalah $x = \\pm\\sqrt{b}$.",
    masteryScore: 2,
    evidenceCount: 3,
    isMeasured: true,
    trend: "stable" as const,
  },
  {
    conceptName: "Pada pembuktian formal limit fungsi linear $f(x) = ax + b$, nilai delta dapat dipilih langsung sebagai delta = epsilon / |a|.",
    masteryScore: 3,
    evidenceCount: 2,
    isMeasured: true,
    trend: "declining" as const,
  },
  {
    conceptName: "Teorema nilai antara untuk fungsi kontinu pada selang tertutup $[a, b]$.",
    masteryScore: 54,
    evidenceCount: 4,
    isMeasured: true,
    trend: "improving" as const,
  },
  {
    conceptName: "Turunan fungsi komposisi dengan aturan rantai.",
    masteryScore: 0,
    evidenceCount: 0,
    isMeasured: false,
    trend: null,
  },
];

function App() {
  const { layout, theme } = window.dashboardRedesignFixture;
  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const sections = {
    activeAndReading: (
      <section>
        <DashboardSectionHeading
          icon={GraduationCap}
          title={student.dashboard.classesActive}
          actions={
            <>
              <Button variant="outline" size="sm">Aktivasi kelas</Button>
              <a href="/courses" className="flex items-center gap-0.5 text-body-xs font-semibold text-muted-foreground">
                Lihat semua <ArrowUpRight className="size-3.5" />
              </a>
            </>
          }
        />
        <div className="divide-y divide-border/30">
          <a href="/courses/ma1101" className="group -mx-2 block rounded-lg px-2 py-3 hover:bg-muted/40">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <h3 className="font-heading text-body-base font-bold text-foreground">Matematika I</h3>
                  <span className="text-body-xs font-medium uppercase tracking-wider text-muted-foreground">TPB</span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-1.5 min-w-16 max-w-56 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: "33%" }} />
                  </div>
                  <span className="text-body-sm font-semibold tabular-nums text-foreground">33%</span>
                  <span className="text-body-xs tabular-nums text-muted-foreground">2/6 materi</span>
                </div>
                <p className="mt-2 flex min-w-0 items-baseline gap-1.5 text-body-sm">
                  <span className="shrink-0 text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Berikutnya</span>
                  <span className="line-clamp-2 min-w-0 font-medium text-foreground"><MathText as="span">Bilangan real</MathText></span>
                </p>
              </div>
              <ArrowUpRight className="mt-1 size-4 shrink-0 text-muted-foreground/60" />
            </div>
          </a>
        </div>
      </section>
    ),
    recommendedCourses: (
      <section>
        <DashboardSectionHeading icon={Compass} title={student.dashboard.recommendedCourses} meta={<DashboardSectionCount>TPB</DashboardSectionCount>} />
        <div className="divide-y divide-border/30">
          <a href="/courses/ku1102" className="group -mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/40">
            <div className="min-w-0 flex-1">
              <h3 className="text-body-sm font-semibold text-foreground">Berpikir Komputasi</h3>
              <div className="mt-1 flex items-center gap-2 text-body-xs text-muted-foreground">
                <span className="font-medium uppercase tracking-wider">TPB</span>
              </div>
            </div>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground/60" />
          </a>
        </div>
      </section>
    ),
    reviewQueue: (
      <section>
        <DashboardSectionHeading
          icon={Layers}
          title={student.dashboard.spacedRepetition}
          meta={<DashboardSectionCount tone="warning">102 kartu perlu diulas</DashboardSectionCount>}
        />
        <Button asChild className="mt-1 w-full">
          <a href="/courses/ma1101/flashcard">Mulai ulas flashcard <ArrowRight /></a>
        </Button>
      </section>
    ),
    weakConcepts: (
      <section>
        <DashboardWeakConcepts concepts={masteryConcepts} courseTitle="Matematika I" showHeader={true} />
        <a href="/courses/ma1101/mastery" className="mt-2 inline-flex items-center gap-1 text-body-xs font-semibold text-muted-foreground">
          Lihat peta lengkap <ArrowUpRight className="size-3.5" />
        </a>
      </section>
    ),
    availableAssessments: (
      <section>
        <DashboardSectionHeading icon={ClipboardList} title={student.dashboard.availableAssessments} />
        <DashboardInlineEmpty icon={CheckCircle2}>{student.dashboard.allExamsDone}</DashboardInlineEmpty>
      </section>
    ),
  };

  return (
    <main className="mx-auto min-h-screen max-w-7xl bg-background px-4 py-5 text-foreground sm:px-6 lg:px-8">
      <WeeklyReflection
        reflection={{
          id: "ref-1",
          studentId: "fixture-student",
          weekStart: "2026-11-23",
          createdAt: new Date().toISOString(),
          payload: {
            completed: { quizzes: 0, flashcards: 0, modules: 1 },
            masteryGrowth: 0,
            mostImproved: null,
            streak: { currentStreak: 2, longestStreak: 5 },
          },
        }}
      />
      <DashboardFocusStrip data={focusData} />
      <TodayPlan
        firstName="Adi"
        adapter={{
          data: {
            streak: { current: 2, longest: 5 },
            items: [
              { id: "fc", kind: "flashcards", title: "Ulas flashcard", href: "/courses/ma1101/flashcard", count: 20, done: false },
              { id: "mod", kind: "module", title: "Pertaksamaan dan Fungsi", href: "/courses/ma1101/material/1", done: false },
            ],
          },
          complete: () => {},
        }}
      />
      {layout === "desktop" ? (
        <StudentDashboardDesktop sections={sections} />
      ) : (
        <StudentDashboardMobile sections={sections} />
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider locale="id" timeZone="UTC" messages={{ student, studentCourse, ui }}>
    <App />
  </NextIntlClientProvider>,
);
