import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BookOpen,
  CalendarRange,
  Home,
  MessageSquareText,
  UserRound,
} from "lucide-react";
import { MobileBottomNav } from "@/components/navigation/mobile-bottom-nav";
import {
  buildCourseMobileTabs,
  getActiveCourseContext,
  getActiveCourseIdFromPathname,
  getActiveStudentBottomTab,
  getStudentMobileBackHref,
  isCourseTabActive,
  isStudentRootHub,
  resolveCourseSwitchHref,
  setActiveCourseContext,
  subscribeActiveCourseContext,
  type CourseMobileTabLabels,
} from "@/components/navigation/student/student-nav-model";
import { PKA_COURSE_ID } from "@/lib/pka-config";

const SAMPLE_LABELS: CourseMobileTabLabels = {
  summary: "Ringkasan",
  documents: "Dokumen",
  video: "Video",
  quiz: "Kuis",
  discussions: "Diskusi",
  flashcard: "Flashcard",
  tryout: "Tryout",
  schedule: "Jadwal",
  playground: "Playground",
  studyPath: "Alur",
  mastery: "Penguasaan",
  progress: "Progres",
  leaderboard: "Peringkat",
  examResults: "Hasil",
  live: "Live",
  pkaSchedule: "Jadwal",
  simulation: "Simulasi",
  diagnosticReport: "Laporan",
  materials: "Materi",
};

describe("Student Mobile Bottom Nav", () => {
  test("renders 5 bottom nav items with active state and discussion badge", () => {
    const active = getActiveStudentBottomTab("/courses/calc-1/material");
    expect(active).toBe("courses");

    const html = renderToStaticMarkup(
      <MobileBottomNav
        ariaLabel="Navigasi siswa"
        items={[
          {
            id: "home",
            label: "Beranda",
            icon: Home,
            href: "/dashboard",
            active: active === "home",
          },
          {
            id: "courses",
            label: "Kelas",
            icon: BookOpen,
            href: "/courses",
            active: active === "courses",
          },
          {
            id: "schedule",
            label: "Jadwal",
            icon: CalendarRange,
            href: "/dashboard/schedule",
            active: active === "schedule",
          },
          {
            id: "discuss",
            label: "Diskusi",
            icon: MessageSquareText,
            href: "/dashboard/discussions",
            active: active === "discuss",
            badgeCount: 4,
            badgeLabel: "4 diskusi belum dibaca",
          },
          {
            id: "me",
            label: "Saya",
            icon: UserRound,
            href: "/profile",
            active: active === "me",
          },
        ]}
      />
    );

    expect(html).toContain("grid-cols-5");
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('href="/courses"');
    expect(html).toContain('href="/dashboard/schedule"');
    expect(html).toContain('href="/dashboard/discussions"');
    expect(html).toContain('href="/profile"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("4 diskusi belum dibaca");
  });

  test("matches active routes for all 5 student bottom nav tabs", () => {
    expect(getActiveStudentBottomTab("/dashboard")).toBe("home");

    expect(getActiveStudentBottomTab("/courses")).toBe("courses");
    expect(getActiveStudentBottomTab("/courses/calc-1")).toBe("courses");
    expect(getActiveStudentBottomTab("/courses/calc-1/material")).toBe(
      "courses"
    );
    expect(getActiveStudentBottomTab(`/courses/${PKA_COURSE_ID}/simulasi`)).toBe(
      "courses"
    );

    expect(getActiveStudentBottomTab("/dashboard/schedule")).toBe("schedule");
    expect(getActiveStudentBottomTab("/calendar")).toBe("schedule");

    expect(getActiveStudentBottomTab("/dashboard/discussions")).toBe("discuss");
    expect(getActiveStudentBottomTab("/dashboard/discussions/thread-1")).toBe(
      "discuss"
    );
    expect(getActiveStudentBottomTab("/courses/calc-1/discussions")).toBe(
      "discuss"
    );
    expect(
      getActiveStudentBottomTab(`/courses/${PKA_COURSE_ID}/discussions`)
    ).toBe("discuss");

    expect(getActiveStudentBottomTab("/profile")).toBe("me");
    expect(getActiveStudentBottomTab("/profile/reflections")).toBe("me");
    expect(getActiveStudentBottomTab("/achievements")).toBe("me");
    expect(getActiveStudentBottomTab("/leaderboard")).toBe("me");
    expect(getActiveStudentBottomTab("/leaderboard/academic")).toBe("me");
    expect(getActiveStudentBottomTab("/dashboard/groups")).toBe("me");
    expect(getActiveStudentBottomTab("/pet")).toBe("me");
    expect(getActiveStudentBottomTab("/settings")).toBe("me");
    expect(getActiveStudentBottomTab("/settings/security")).toBe("me");
    expect(getActiveStudentBottomTab("/feedback")).toBe("me");
  });

  test("identifies root hubs and resolves mobile back hrefs", () => {
    expect(isStudentRootHub("/dashboard")).toBe(true);
    expect(isStudentRootHub("/courses")).toBe(true);
    expect(isStudentRootHub("/dashboard/schedule")).toBe(true);
    expect(isStudentRootHub("/dashboard/discussions")).toBe(true);
    expect(isStudentRootHub("/profile")).toBe(true);

    expect(isStudentRootHub("/achievements")).toBe(false);
    expect(isStudentRootHub("/courses/calc-1")).toBe(false);

    expect(getStudentMobileBackHref("/courses/calc-1")).toBe("/courses");
    expect(getStudentMobileBackHref("/courses/calc-1/material")).toBe(
      "/courses/calc-1"
    );
    expect(getStudentMobileBackHref("/achievements")).toBe("/profile");
    expect(getStudentMobileBackHref("/settings")).toBe("/profile");
    expect(getStudentMobileBackHref("/calendar")).toBe("/dashboard/schedule");
  });
});

describe("Course Switcher Segment Preservation", () => {
  test("extracts active course id from course pathnames", () => {
    expect(getActiveCourseIdFromPathname("/courses")).toBeUndefined();
    expect(getActiveCourseIdFromPathname("/courses/calc-1")).toBe("calc-1");
    expect(getActiveCourseIdFromPathname("/courses/calc-1/quiz/q1")).toBe(
      "calc-1"
    );
    expect(
      getActiveCourseIdFromPathname(`/courses/${PKA_COURSE_ID}/simulasi`)
    ).toBe(PKA_COURSE_ID);
  });

  test("preserves compatible sub-segments when switching courses", () => {
    expect(
      resolveCourseSwitchHref("/courses/calc-1/material", "calc-1", "phys-1")
    ).toBe("/courses/phys-1/material");

    expect(
      resolveCourseSwitchHref("/courses/calc-1/quiz/q1", "calc-1", "phys-1")
    ).toBe("/courses/phys-1/quiz");

    expect(
      resolveCourseSwitchHref("/courses/calc-1/tryout", "calc-1", "phys-1")
    ).toBe("/courses/phys-1/tryout");

    expect(
      resolveCourseSwitchHref("/courses/calc-1/discussions", "calc-1", PKA_COURSE_ID)
    ).toBe(`/courses/${PKA_COURSE_ID}/discussions`);

    // Normal-only segment falls back to course root when switching to PKA.
    expect(
      resolveCourseSwitchHref("/courses/calc-1/tryout", "calc-1", PKA_COURSE_ID)
    ).toBe(`/courses/${PKA_COURSE_ID}`);

    // PKA-only segment falls back to course root when switching to a normal course.
    expect(
      resolveCourseSwitchHref(
        `/courses/${PKA_COURSE_ID}/simulasi`,
        PKA_COURSE_ID,
        "calc-1"
      )
    ).toBe("/courses/calc-1");

    // Schedule query preserves course switch.
    expect(
      resolveCourseSwitchHref("/dashboard/schedule", "calc-1", "phys-1")
    ).toBe("/dashboard/schedule?course=phys-1");
  });
});

describe("CourseMobileTabNav tab definitions", () => {
  test("builds normal course tabs in priority order with optional flags", () => {
    const tabs = buildCourseMobileTabs({
      courseId: "calc-1",
      isPka: false,
      showStudyPath: true,
      showMastery: true,
      showLive: true,
      labels: SAMPLE_LABELS,
    });

    expect(tabs.map((tab) => tab.label)).toEqual([
      "Ringkasan",
      "Dokumen",
      "Video",
      "Kuis",
      "Diskusi",
      "Flashcard",
      "Tryout",
      "Jadwal",
      "Playground",
      "Alur",
      "Penguasaan",
      "Progres",
      "Peringkat",
      "Hasil",
      "Live",
    ]);

    const discussionsTab = tabs.find((tab) => tab.id === "discussions");
    expect(discussionsTab?.hasDiscussionBadge).toBe(true);

    const summaryTab = tabs[0];
    expect(isCourseTabActive(summaryTab, "/courses/calc-1", "calc-1")).toBe(
      true
    );
    expect(
      isCourseTabActive(summaryTab, "/courses/calc-1/material", "calc-1")
    ).toBe(false);

    const docsTab = tabs[1];
    expect(
      isCourseTabActive(docsTab, "/courses/calc-1/material/m1", "calc-1")
    ).toBe(true);
  });

  test("omits gated tabs when feature flags are false", () => {
    const tabs = buildCourseMobileTabs({
      courseId: "calc-1",
      isPka: false,
      showStudyPath: false,
      showMastery: false,
      showLive: false,
      labels: SAMPLE_LABELS,
    });

    expect(tabs.map((tab) => tab.id)).not.toContain("studyPath");
    expect(tabs.map((tab) => tab.id)).not.toContain("mastery");
    expect(tabs.map((tab) => tab.id)).not.toContain("live");
  });

  test("builds PKA course tabs in priority order", () => {
    const tabs = buildCourseMobileTabs({
      courseId: PKA_COURSE_ID,
      isPka: true,
      labels: SAMPLE_LABELS,
    });

    expect(tabs.map((tab) => tab.label)).toEqual([
      "Ringkasan",
      "Jadwal",
      "Simulasi",
      "Laporan",
      "Diskusi",
      "Flashcard",
      "Kuis",
      "Peringkat",
      "Materi",
    ]);

    expect(tabs.find((tab) => tab.id === "pkaSchedule")?.href).toBe(
      `/courses/${PKA_COURSE_ID}/jadwal`
    );
    expect(tabs.find((tab) => tab.id === "discussions")?.hasDiscussionBadge).toBe(
      true
    );
  });

  test("active course context store notifies subscribers", () => {
    let calls = 0;
    const unsubscribe = subscribeActiveCourseContext(() => {
      calls += 1;
    });

    setActiveCourseContext({ id: "calc-1", title: "Kalkulus I" });
    expect(getActiveCourseContext()).toEqual({
      id: "calc-1",
      title: "Kalkulus I",
    });
    expect(calls).toBe(1);

    setActiveCourseContext(null);
    expect(getActiveCourseContext()).toBeNull();
    expect(calls).toBe(2);

    unsubscribe();
  });
});
