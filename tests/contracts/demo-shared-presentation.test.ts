import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { demoRoute } from "@/lib/demo/routes";

const read = (path: string) => readFileSync(path, "utf8");
describe("demo shared student presentation", () => {
  test("dashboard and demo use the same course section and row", () => {
    for (const component of ["StudentDashboardSection", "StudentCourseProgressRow"]) {
      expect(read("app/(student)/dashboard/page.tsx")).toContain(`<${component}`);
      expect(read("components/demo/demo-dashboard.tsx")).toContain(`<${component}`);
    }
    expect(read("app/(student)/courses/page.tsx")).toContain("<CourseCatalogClient");
    expect(read("components/demo/demo-dashboard.tsx")).toContain("<CourseCatalogClient");
  });
  test("course selection remains on localized demo routes", () => {
    expect(demoRoute("en", "quiz", "course/a")).toBe("/en/demo/quiz?course=course%2Fa");
    expect(demoRoute("id", "dashboard", "one")).toBe("/id/demo?course=one");
    expect(demoRoute("en", "tryout", "one")).toBe("/en/demo/tryout?course=one");
  });
});

test("student and demo share statistics and activity presentations", () => {
  for (const component of ["StudyStatisticsCard", "RecentActivityCard"]) {
    expect(read("app/(student)/courses/[id]/progress/page.tsx")).toContain(`<${component}`);
    expect(read("components/demo/demo-dashboard.tsx")).toContain(`<${component}`);
  }
});

test("Zyra message presentation is shared without mounting its private tutor client", () => {
  expect(read("components/course/tutor-drawer-view.tsx")).toContain("<TutorStudentMessage");
  expect(read("components/demo/demo-zyra.tsx")).toContain("<TutorStudentMessage");
  expect(read("components/demo/demo-zyra.tsx")).not.toContain("<TutorProvider");
});

test("student and demo use the same chapter outline list", () => {
  expect(read("components/course/chapter-outline.tsx")).toContain("<ChapterOutlineList");
  expect(read("components/demo/demo-dashboard.tsx")).toContain("<ChapterOutlineList");
  expect(read("lib/demo/chapter-outline.ts")).not.toMatch(/fetch\s*\(|\/api\/|\/courses\//);
});
