import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CalendarDays,
  GraduationCap,
  Home,
  MessageSquareText,
} from "lucide-react";
import {
  MobileBottomNav,
  type MobileBottomNavItem,
} from "@/components/navigation/mobile-bottom-nav";
import {
  buildTutorCourseMobileTabs,
  findAssignedTutorCourse,
  getActiveTutorBottomTab,
  getActiveTutorCourseContext,
  getActiveTutorCourseIdFromPathname,
  getTutorDetailRouteTitleKey,
  getTutorMobileBackHref,
  isTutorCourseTabActive,
  isTutorDetailOrFormRoute,
  isTutorRootHub,
  resolveTutorCourseSwitchHref,
  setActiveTutorCourseContext,
  shouldHideTutorCourseTabs,
  subscribeActiveTutorCourseContext,
  type TutorCourseMobileTabLabels,
  type TutorCourseSummary,
} from "@/components/navigation/tutor/tutor-nav-model";

const SAMPLE_LABELS: TutorCourseMobileTabLabels = {
  overview: "Overview",
  quizzes: "Quizzes",
  quizGrading: "Quiz grading",
  tryoutGrading: "Tryout grading",
  participants: "Participants",
  discussions: "Discussions",
  live: "Live",
  materials: "Materials",
  videos: "Videos",
};

const SINGLE_COURSE: TutorCourseSummary[] = [
  { courseId: "calc-1", title: "Kalkulus I", code: "MA1101" },
];

const MULTI_COURSES: TutorCourseSummary[] = [
  { courseId: "calc-1", title: "Kalkulus I", code: "MA1101" },
  {
    courseId: "phys-1",
    title: "Fisika Dasar I",
    code: "FI1101",
    legacyCourseId: "fisdas-1",
  },
];

function buildBottomNavItems(
  pathname: string,
  courses: TutorCourseSummary[],
  unreadDiscussions = 0
): MobileBottomNavItem[] {
  const activeTab = getActiveTutorBottomTab(pathname);
  const singleCourse = courses.length === 1 ? courses[0] : undefined;

  return [
    {
      id: "home",
      label: "Home",
      icon: Home,
      href: "/tutor",
      active: activeTab === "home",
    },
    {
      id: "schedule",
      label: "Schedule",
      icon: CalendarDays,
      href: "/tutor/schedule",
      active: activeTab === "schedule",
    },
    {
      id: "discuss",
      label: "Discuss",
      icon: MessageSquareText,
      href: "/tutor/discussions",
      active: activeTab === "discuss",
      badgeCount: unreadDiscussions,
      badgeLabel:
        unreadDiscussions > 0
          ? `${unreadDiscussions} unread discussions`
          : undefined,
    },
    singleCourse
      ? {
          id: "classes",
          label: "Classes",
          icon: GraduationCap,
          href: `/tutor/${singleCourse.courseId}`,
          active: activeTab === "classes",
        }
      : {
          id: "classes",
          label: "Classes",
          icon: GraduationCap,
          onClick: () => {},
          active: activeTab === "classes",
        },
  ];
}

describe("Tutor Mobile Bottom Nav", () => {
  test("renders 4 bottom nav items with direct Classes link for single course", () => {
    const html = renderToStaticMarkup(
      <MobileBottomNav
        ariaLabel="Tutor navigation"
        items={buildBottomNavItems("/tutor/calc-1/quizzes", SINGLE_COURSE, 3)}
      />
    );

    expect(html).toContain("grid-cols-4");
    expect(html).toContain('href="/tutor"');
    expect(html).toContain('href="/tutor/schedule"');
    expect(html).toContain('href="/tutor/discussions"');
    expect(html).toContain('href="/tutor/calc-1"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("3 unread discussions");
  });

  test("renders Classes as a sheet trigger button when assigned multiple courses", () => {
    const html = renderToStaticMarkup(
      <MobileBottomNav
        ariaLabel="Tutor navigation"
        items={buildBottomNavItems("/tutor", MULTI_COURSES, 0)}
      />
    );

    expect(html).toContain("grid-cols-4");
    expect(html).toContain('href="/tutor"');
    expect(html).toContain('href="/tutor/schedule"');
    expect(html).toContain('href="/tutor/discussions"');
    expect(html).not.toContain('href="/tutor/calc-1"');
    expect(html).toContain("<button");
    expect(html).toContain("Classes");
  });

  test("matches active routes for all 4 tutor bottom nav tabs", () => {
    expect(getActiveTutorBottomTab("/tutor")).toBe("home");
    expect(getActiveTutorBottomTab("/tutor/")).toBe("home");

    expect(getActiveTutorBottomTab("/tutor/schedule")).toBe("schedule");
    expect(getActiveTutorBottomTab("/tutor/schedule/slots")).toBe("schedule");

    expect(getActiveTutorBottomTab("/tutor/discussions")).toBe("discuss");
    expect(getActiveTutorBottomTab("/tutor/discussions/thread-1")).toBe(
      "discuss"
    );

    expect(getActiveTutorBottomTab("/tutor/calc-1")).toBe("classes");
    expect(getActiveTutorBottomTab("/tutor/calc-1/quizzes")).toBe("classes");
    expect(getActiveTutorBottomTab("/tutor/calc-1/discussions")).toBe(
      "classes"
    );
    expect(getActiveTutorBottomTab("/tutor/calc-1/grading")).toBe("classes");

    expect(getActiveTutorBottomTab("/tutor/docs")).toBeNull();
    expect(getActiveTutorBottomTab("/tutor/docs/getting-started")).toBeNull();
  });

  test("identifies root hubs, detail/form routes, and mobile back hrefs", () => {
    expect(isTutorRootHub("/tutor")).toBe(true);
    expect(isTutorRootHub("/tutor/schedule")).toBe(true);
    expect(isTutorRootHub("/tutor/discussions")).toBe(true);
    expect(isTutorRootHub("/tutor/docs")).toBe(true);

    expect(isTutorRootHub("/tutor/calc-1")).toBe(false);
    expect(isTutorRootHub("/tutor/docs/guide")).toBe(false);

    expect(isTutorDetailOrFormRoute("/tutor/docs/guide")).toBe(true);
    expect(isTutorDetailOrFormRoute("/tutor/calc-1/quizzes/new")).toBe(true);
    expect(isTutorDetailOrFormRoute("/tutor/calc-1/quizzes/q1/edit")).toBe(
      true
    );
    expect(isTutorDetailOrFormRoute("/tutor/calc-1/quizzes/q1/attempts")).toBe(
      true
    );
    expect(isTutorDetailOrFormRoute("/tutor/calc-1/quizzes")).toBe(false);
    expect(isTutorDetailOrFormRoute("/tutor/calc-1/quizzes/grading")).toBe(
      false
    );

    expect(getTutorMobileBackHref("/tutor/docs/guide")).toBe("/tutor/docs");
    expect(getTutorMobileBackHref("/tutor/calc-1/quizzes/new")).toBe(
      "/tutor/calc-1/quizzes"
    );
    expect(getTutorMobileBackHref("/tutor/calc-1/quizzes/q1/edit")).toBe(
      "/tutor/calc-1/quizzes"
    );
    expect(getTutorMobileBackHref("/tutor/calc-1/quizzes/q1/attempts")).toBe(
      "/tutor/calc-1/quizzes"
    );

    expect(getTutorDetailRouteTitleKey("/tutor/docs/guide")).toBe("docs");
    expect(getTutorDetailRouteTitleKey("/tutor/calc-1/quizzes/new")).toBe(
      "createQuiz"
    );
    expect(getTutorDetailRouteTitleKey("/tutor/calc-1/quizzes/q1/edit")).toBe(
      "editQuiz"
    );
    expect(
      getTutorDetailRouteTitleKey("/tutor/calc-1/quizzes/q1/attempts")
    ).toBe("studentAttempts");
    expect(getTutorDetailRouteTitleKey("/tutor/calc-1/quizzes")).toBeNull();
  });
});

describe("Tutor Course Switcher & Segment Preservation", () => {
  test("extracts course id and matches canonical or legacy ids", () => {
    expect(getActiveTutorCourseIdFromPathname("/tutor")).toBeUndefined();
    expect(
      getActiveTutorCourseIdFromPathname("/tutor/schedule")
    ).toBeUndefined();
    expect(
      getActiveTutorCourseIdFromPathname("/tutor/discussions")
    ).toBeUndefined();
    expect(getActiveTutorCourseIdFromPathname("/tutor/docs")).toBeUndefined();
    expect(getActiveTutorCourseIdFromPathname("/tutor/calc-1")).toBe("calc-1");
    expect(getActiveTutorCourseIdFromPathname("/tutor/calc-1/quizzes/q1")).toBe(
      "calc-1"
    );

    expect(findAssignedTutorCourse(MULTI_COURSES, "fisdas-1")?.courseId).toBe(
      "phys-1"
    );
  });

  test("preserves compatible course sub-segments when switching courses", () => {
    expect(
      resolveTutorCourseSwitchHref("/tutor/calc-1", "calc-1", "phys-1")
    ).toBe("/tutor/phys-1");

    expect(
      resolveTutorCourseSwitchHref("/tutor/calc-1/quizzes", "calc-1", "phys-1")
    ).toBe("/tutor/phys-1/quizzes");

    expect(
      resolveTutorCourseSwitchHref(
        "/tutor/calc-1/quizzes/grading",
        "calc-1",
        "phys-1"
      )
    ).toBe("/tutor/phys-1/quizzes/grading");

    expect(
      resolveTutorCourseSwitchHref("/tutor/calc-1/grading", "calc-1", "phys-1")
    ).toBe("/tutor/phys-1/grading");

    expect(
      resolveTutorCourseSwitchHref(
        "/tutor/calc-1/participants",
        "calc-1",
        "phys-1"
      )
    ).toBe("/tutor/phys-1/participants");

    expect(
      resolveTutorCourseSwitchHref(
        "/tutor/calc-1/discussions",
        "calc-1",
        "phys-1"
      )
    ).toBe("/tutor/phys-1/discussions");

    expect(
      resolveTutorCourseSwitchHref("/tutor/calc-1/live", "calc-1", "phys-1")
    ).toBe("/tutor/phys-1/live");

    expect(
      resolveTutorCourseSwitchHref(
        "/tutor/calc-1/materials",
        "calc-1",
        "phys-1"
      )
    ).toBe("/tutor/phys-1/materials");

    expect(
      resolveTutorCourseSwitchHref("/tutor/calc-1/videos", "calc-1", "phys-1")
    ).toBe("/tutor/phys-1/videos");

    expect(
      resolveTutorCourseSwitchHref("/tutor/schedule", undefined, "phys-1")
    ).toBe("/tutor/phys-1");
  });
});

describe("Tutor Mobile Course Tab Nav", () => {
  test("builds all 9 course tabs in required order with active matching", () => {
    const tabs = buildTutorCourseMobileTabs({
      courseId: "calc-1",
      labels: SAMPLE_LABELS,
    });

    expect(tabs).toHaveLength(9);
    expect(tabs.map((tab) => tab.label)).toEqual([
      "Overview",
      "Quizzes",
      "Quiz grading",
      "Tryout grading",
      "Participants",
      "Discussions",
      "Live",
      "Materials",
      "Videos",
    ]);

    const overviewTab = tabs[0];
    const quizzesTab = tabs[1];
    const quizGradingTab = tabs[2];
    const discussionsTab = tabs[5];

    expect(discussionsTab?.hasDiscussionBadge).toBe(true);

    expect(isTutorCourseTabActive(overviewTab, "/tutor/calc-1", "calc-1")).toBe(
      true
    );
    expect(
      isTutorCourseTabActive(overviewTab, "/tutor/calc-1/quizzes", "calc-1")
    ).toBe(false);

    expect(
      isTutorCourseTabActive(quizzesTab, "/tutor/calc-1/quizzes", "calc-1")
    ).toBe(true);
    expect(
      isTutorCourseTabActive(
        quizzesTab,
        "/tutor/calc-1/quizzes/grading",
        "calc-1"
      )
    ).toBe(false);

    expect(
      isTutorCourseTabActive(
        quizGradingTab,
        "/tutor/calc-1/quizzes/grading",
        "calc-1"
      )
    ).toBe(true);
  });

  test("hides course tabs on quiz form/detail routes and non-course routes", () => {
    expect(shouldHideTutorCourseTabs("/tutor")).toBe(true);
    expect(shouldHideTutorCourseTabs("/tutor/schedule")).toBe(true);
    expect(shouldHideTutorCourseTabs("/tutor/calc-1/quizzes/new")).toBe(true);
    expect(shouldHideTutorCourseTabs("/tutor/calc-1/quizzes/q1/edit")).toBe(
      true
    );
    expect(shouldHideTutorCourseTabs("/tutor/calc-1/quizzes/q1/attempts")).toBe(
      true
    );

    expect(shouldHideTutorCourseTabs("/tutor/calc-1")).toBe(false);
    expect(shouldHideTutorCourseTabs("/tutor/calc-1/quizzes")).toBe(false);
    expect(shouldHideTutorCourseTabs("/tutor/calc-1/quizzes/grading")).toBe(
      false
    );
    expect(shouldHideTutorCourseTabs("/tutor/calc-1/grading")).toBe(false);
  });

  test("active course context store notifies subscribers", () => {
    let calls = 0;
    const unsubscribe = subscribeActiveTutorCourseContext(() => {
      calls += 1;
    });

    setActiveTutorCourseContext({
      courseId: "calc-1",
      title: "Kalkulus I",
      code: "MA1101",
    });
    expect(getActiveTutorCourseContext()).toEqual({
      courseId: "calc-1",
      title: "Kalkulus I",
      code: "MA1101",
    });
    expect(calls).toBe(1);

    setActiveTutorCourseContext(null);
    expect(getActiveTutorCourseContext()).toBeNull();
    expect(calls).toBe(2);

    unsubscribe();
  });
});
