import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { CoursePrimaryActions } from "@/components/course/course-primary-actions";
import { CourseAttentionStrip } from "@/components/course/course-attention-strip";
import { DashboardWeakConcepts } from "@/components/course/dashboard-weak-concepts";
import { ApplicationPage } from "@/components/application-page";
import type { MasteryRow } from "@/lib/mastery-store";
import type { CourseAttentionData } from "@/types/course-learning";
import { PKA_COURSE_ID } from "@/lib/pka-config";

describe("Course Overview and Mastery Refactor", () => {
  describe("Mastery isMeasured and Sorting Contract", () => {
    test("evidenceCount 0 results in isMeasured false, while measured score 0 with evidenceCount > 0 results in isMeasured true", () => {
      // Simulating canonical concept mapping
      const unmeasuredIdea = { score: null, evidenceCount: 0, title: "Akar Kuadrat" };
      const measuredZeroIdea = { score: 0, evidenceCount: 2, title: "Limit Trigonometri" };
      const measuredPassIdea = { score: 85, evidenceCount: 5, title: "Fungsi Komposisi" };

      const mapIdea = (idea: { score: number | null; evidenceCount: number; title: string }): MasteryRow => {
        const isMeasured = idea.score !== null && (idea.evidenceCount ?? 0) > 0;
        return {
          conceptName: idea.title,
          masteryScore: idea.score ?? 0,
          confidence: 0,
          evidenceCount: idea.evidenceCount,
          isMeasured,
          trend: null,
          blockedBy: [],
          lastEvidenceAt: new Date(),
        };
      };

      const row1 = mapIdea(unmeasuredIdea);
      const row2 = mapIdea(measuredZeroIdea);
      const row3 = mapIdea(measuredPassIdea);

      expect(row1.isMeasured).toBe(false);
      expect(row2.isMeasured).toBe(true);
      expect(row2.masteryScore).toBe(0);
      expect(row3.isMeasured).toBe(true);
      expect(row3.masteryScore).toBe(85);
    });

    test("measured concepts are sorted before unmeasured concepts", () => {
      const rows: MasteryRow[] = [
        {
          conceptName: "Zeta Concept (Unmeasured)",
          masteryScore: 0,
          confidence: 0,
          evidenceCount: 0,
          isMeasured: false,
          trend: null,
          blockedBy: [],
          lastEvidenceAt: new Date(),
        },
        {
          conceptName: "Alpha Concept (Strong)",
          masteryScore: 90,
          confidence: 80,
          evidenceCount: 3,
          isMeasured: true,
          trend: null,
          blockedBy: [],
          lastEvidenceAt: new Date(),
        },
        {
          conceptName: "Beta Concept (Weak Measured)",
          masteryScore: 35,
          confidence: 50,
          evidenceCount: 2,
          isMeasured: true,
          trend: null,
          blockedBy: [],
          lastEvidenceAt: new Date(),
        },
      ];

      const sorted = [...rows].sort((left, right) => {
        if (left.isMeasured !== right.isMeasured) {
          return left.isMeasured ? -1 : 1;
        }
        return left.masteryScore - right.masteryScore || left.conceptName.localeCompare(right.conceptName, "id");
      });

      // Measured weak should be first, then measured strong, and unmeasured last
      expect(sorted[0].conceptName).toBe("Beta Concept (Weak Measured)");
      expect(sorted[1].conceptName).toBe("Alpha Concept (Strong)");
      expect(sorted[2].conceptName).toBe("Zeta Concept (Unmeasured)");
    });

    test("weak concept recommendation ignores unmeasured concepts", () => {
      const masteryList: MasteryRow[] = [
        {
          conceptName: "Belum Dikerjakan",
          masteryScore: 0,
          confidence: 0,
          evidenceCount: 0,
          isMeasured: false,
          trend: null,
          blockedBy: [],
          lastEvidenceAt: new Date(),
        },
        {
          conceptName: "Turunan Implisit",
          masteryScore: 45,
          confidence: 60,
          evidenceCount: 1,
          isMeasured: true,
          trend: null,
          blockedBy: [],
          lastEvidenceAt: new Date(),
        },
      ];

      const weakestMeasured = masteryList.find((c) => c.isMeasured && c.masteryScore < 70);
      expect(weakestMeasured).toBeDefined();
      expect(weakestMeasured?.conceptName).toBe("Turunan Implisit");
    });
  });

  describe("Schedule Filter and Course Selection", () => {
    test("valid course param selects that course, while invalid course param falls back to all", () => {
      const coursesList = [
        { id: "matematika-1", title: "Matematika I" },
        { id: "fisika-dasar-1", title: "Fisika Dasar I" },
      ];

      const resolveFilter = (requested?: string) => {
        return requested && coursesList.some((c) => c.id === requested)
          ? requested
          : "all";
      };

      expect(resolveFilter("matematika-1")).toBe("matematika-1");
      expect(resolveFilter("invalid-course-slug")).toBe("all");
      expect(resolveFilter(undefined)).toBe("all");
    });

    test("sidebar course resolution detects activeCourseId from pathname or schedule query parameter", () => {
      const resolveActiveCourseId = (pathname: string, searchParamCourse?: string) => {
        const courseIdFromPath = pathname.startsWith("/courses/")
          ? pathname.split("/")[2]
          : undefined;
        const courseIdFromSchedule =
          pathname === "/dashboard/schedule"
            ? searchParamCourse ?? undefined
            : undefined;

        return courseIdFromPath ?? courseIdFromSchedule;
      };

      expect(resolveActiveCourseId("/courses/matematika-1")).toBe("matematika-1");
      expect(resolveActiveCourseId("/courses/matematika-1/quiz")).toBe("matematika-1");
      expect(resolveActiveCourseId("/dashboard/schedule", "matematika-1")).toBe("matematika-1");
      expect(resolveActiveCourseId("/dashboard/schedule")).toBeUndefined();
      expect(resolveActiveCourseId("/dashboard")).toBeUndefined();
    });

    test("PKA course navigation preserves custom PKA items while standard course groups primary and secondary", () => {
      const getNavigationConfig = (courseId: string) => {
        const isPka = courseId === PKA_COURSE_ID;
        const base = `/courses/${courseId}`;

        const primaryItems = isPka
          ? [
              { href: base, label: "Ringkasan" },
              { href: `${base}/jadwal`, label: "Jadwal" },
              { href: `${base}/simulasi`, label: "Simulasi" },
              { href: `${base}/laporan`, label: "Laporan Diagnostik" },
            ]
          : [
              { href: base, label: "Ringkasan" },
              { href: `${base}/material`, label: "Dokumen" },
              { href: `${base}/quiz`, label: "Kuis" },
              { href: `/dashboard/schedule?course=${courseId}`, label: "Jadwal" },
            ];

        return { isPka, primaryItems };
      };

      const pkaNav = getNavigationConfig(PKA_COURSE_ID);
      expect(pkaNav.isPka).toBe(true);
      expect(pkaNav.primaryItems.map((i) => i.label)).toEqual([
        "Ringkasan",
        "Jadwal",
        "Simulasi",
        "Laporan Diagnostik",
      ]);

      const stdNav = getNavigationConfig("matematika-1");
      expect(stdNav.isPka).toBe(false);
      expect(stdNav.primaryItems.map((i) => i.label)).toEqual([
        "Ringkasan",
        "Dokumen",
        "Kuis",
        "Jadwal",
      ]);
    });
  });

  describe("UI Components Rendering", () => {
    test("CoursePrimaryActions renders 3 clickable cards with Dokumen, Kuis, and Jadwal", () => {
      const markup = renderToStaticMarkup(
        <CoursePrimaryActions
          reading={{
            tag: "DOKUMEN",
            title: "Lanjutkan Limit",
            meta: "35% selesai",
            actionLabel: "Lanjutkan →",
            href: "/courses/mat-1/material/limit-doc",
          }}
          quiz={{
            tag: "KUIS",
            title: "Latihan tersedia",
            meta: "5 kuis tersedia",
            actionLabel: "Pilih kuis →",
            href: "/courses/mat-1/quiz",
          }}
          schedule={{
            tag: "JADWAL",
            title: "Pilih sesi tutorial",
            meta: "Lihat jadwal dan slot yang tersedia",
            actionLabel: "Pilih jadwal →",
            href: "/dashboard/schedule?course=mat-1",
          }}
        />
      );

      expect(markup).toContain("DOKUMEN");
      expect(markup).toContain("Lanjutkan Limit");
      expect(markup).toContain("35% selesai");
      expect(markup).toContain("KUIS");
      expect(markup).toContain("5 kuis tersedia");
      expect(markup).toContain("JADWAL");
      expect(markup).toContain("Pilih sesi tutorial");
      expect(markup).toContain('href="/courses/mat-1/material/limit-doc"');
      expect(markup).toContain('href="/courses/mat-1/quiz"');
      expect(markup).toContain('href="/dashboard/schedule?course=mat-1"');
    });

    test("CourseAttentionStrip renders null when attention is null, and renders both flashcard and weak concept items when present", () => {
      // 1. Null attention
      const emptyMarkup = renderToStaticMarkup(
        <CourseAttentionStrip attention={null} />
      );
      expect(emptyMarkup).toBe("");

      // 2. Multiple attention items
      const attentionData: CourseAttentionData = {
        items: [
          {
            kind: "flashcard",
            label: "12 flashcard perlu diulas",
            actionLabel: "Ulas sekarang →",
            href: "/courses/mat-1/flashcard",
          },
          {
            kind: "weak-concept",
            label: "Limit perlu latihan (42%)",
            actionLabel: "Latihan sekarang →",
            href: "/courses/mat-1/quiz",
          },
        ],
      };

      const filledMarkup = renderToStaticMarkup(
        <CourseAttentionStrip attention={attentionData} />
      );
      expect(filledMarkup).toContain("Perlu perhatian");
      expect(filledMarkup).toContain("12 flashcard perlu diulas");
      expect(filledMarkup).toContain("Ulas sekarang →");
      expect(filledMarkup).toContain("Limit perlu latihan (42%)");
      expect(filledMarkup).toContain("Latihan sekarang →");
      expect(filledMarkup).toContain('href="/courses/mat-1/flashcard"');
    });

    test("DashboardWeakConcepts renders empty state when no concepts are measured, and renders Belum diukur for unmeasured concepts alongside measured ones", () => {
      // Case 1: None measured -> Clean empty state
      const emptyStateMarkup = renderToStaticMarkup(
        <DashboardWeakConcepts
          courseTitle="Matematika I"
          concepts={[
            {
              conceptName: "Akar Kuadrat",
              masteryScore: 0,
              evidenceCount: 0,
              isMeasured: false,
            },
          ]}
        />
      );

      expect(emptyStateMarkup).toContain("Belum ada data penguasaan");
      expect(emptyStateMarkup).not.toContain(">0%<");

      // Case 2: Mixed measured and unmeasured -> Measured displays percentage, unmeasured displays "Belum diukur"
      const mixedMarkup = renderToStaticMarkup(
        <DashboardWeakConcepts
          courseTitle="Matematika I"
          concepts={[
            {
              conceptName: "Limit Fungsi",
              masteryScore: 65,
              evidenceCount: 3,
              isMeasured: true,
            },
            {
              conceptName: "Turunan Implisit",
              masteryScore: 0,
              evidenceCount: 0,
              isMeasured: false,
            },
          ]}
        />
      );

      expect(mixedMarkup).toContain("65%");
      expect(mixedMarkup).toContain("Belum diukur");
      expect(mixedMarkup).not.toContain(">0%<");
    });

    test("ApplicationPage applies max-w-7xl mx-auto when maxWidth 7xl is specified", () => {
      const markup7xl = renderToStaticMarkup(
        <ApplicationPage maxWidth="7xl">
          <div>Content</div>
        </ApplicationPage>
      );
      expect(markup7xl).toContain("max-w-7xl");
      expect(markup7xl).toContain("mx-auto");

      const markupFull = renderToStaticMarkup(
        <ApplicationPage maxWidth="full">
          <div>Content</div>
        </ApplicationPage>
      );
      expect(markupFull).not.toContain("max-w-7xl");
    });
  });
});
