import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import {
  matchesCourseIdentity,
  isQuizOwnedByCourse,
  type ResolvedCourseIdentity,
} from "@/lib/admin/course-identity";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("admin course workspace metrics contract (CP3A)", () => {
  const courseRoot = "app/(admin)/admin/(academic)/courses/[slug]";
  const globalEvalRoot = "app/(admin)/admin/(eval)";

  describe("Route Matrix & Server Security Guards", () => {
    test("provides course-scoped leaderboard page with admin auth and locked course identity", () => {
      const pagePath = `${courseRoot}/leaderboard/page.tsx`;
      expect(existsSync(pagePath)).toBe(true);

      const page = source(pagePath);
      expect(page).toContain("assertAdmin");
      expect(page).toContain("getCourseDetailData");
      expect(page).toContain("notFound()");
      expect(page).toContain("CourseDetailHeader");
      expect(page).toContain("<AdminLeaderboardClient");
      expect(page).toContain("lockedCourse=");
      expect(page).toContain("compatibleCourseIds");
    });

    test("provides course-scoped analytics list page with admin auth and locked course", () => {
      const pagePath = `${courseRoot}/analytics/page.tsx`;
      expect(existsSync(pagePath)).toBe(true);

      const page = source(pagePath);
      expect(page).toContain("assertAdmin");
      expect(page).toContain("getCourseDetailData");
      expect(page).toContain("notFound()");
      expect(page).toContain("CourseDetailHeader");
      expect(page).toContain("<QuizInsightsListClient");
      expect(page).toContain("lockedCourse=");
      expect(page).toContain("detailHrefPrefix=");
    });

    test("provides course-scoped analytics detail page with strict server-side ownership validation", () => {
      const pagePath = `${courseRoot}/analytics/[quizId]/page.tsx`;
      expect(existsSync(pagePath)).toBe(true);

      const page = source(pagePath);
      expect(page).toContain("assertAdmin");
      expect(page).toContain("resolveCourseIdentity");
      expect(page).toContain("matchesCourseIdentity");
      expect(page).toContain("quizTemplates");
      expect(page).toContain("notFound()");
      expect(page).toContain("<QuizInsightDetailClient");
      expect(page).toContain("lockedCourse=");
      expect(page).toContain("backHref=");
    });
  });

  describe("Client Component Isolation & Locked Mode Guarantees", () => {
    test("AdminLeaderboardClient locks out overview mode and course switching in locked mode", () => {
      const client = source("components/admin/leaderboard/admin-leaderboard-client.tsx");

      // Overview mode is disabled when lockedCourse is present
      expect(client).toContain("!lockedCourse && responseMode === \"overview\"");

      // Course combobox selector is hidden in locked mode
      expect(client).toContain("!lockedCourse &&");
      expect(client).toContain("<CourseCombobox");

      // Always queries API with effective course id
      expect(client).toContain("params.set(\"courseId\", effectiveCourseId)");

      // Reset filters preserves locked course
      expect(client).toContain("if (!lockedCourse) {");
      expect(client).toContain("setSelectedCourse(\"all\")");
    });

    test("QuizInsightsListClient hides course selector and scopes analytics links in locked mode", () => {
      const client = source("app/(admin)/admin/(eval)/quiz-insights/quiz-insights-list-client.tsx");

      // Course selector hidden when lockedCourse is present
      expect(client).toContain("!lockedCourse &&");

      // Params include lockedCourse id
      expect(client).toContain("params.set(\"courseId\", lockedCourse.id)");

      // Detail links respect detailHrefPrefix
      expect(client).toContain("`${detailHrefPrefix}/${encodeURIComponent(item.id)}`");
    });
  });

  describe("Global Route Compatibility Redirects (CP6 cleanup)", () => {
    test("converts global leaderboard page to compatibility redirect", () => {
      const page = source(`${globalEvalRoot}/leaderboard/page.tsx`);
      expect(page).toContain("assertAdmin");
      expect(page).toContain("resolveCourseIdentity");
      expect(page).toContain('redirect("/admin/courses")');
      expect(page).toContain("/leaderboard");
      expect(page).not.toContain("<AdminLeaderboardClient");
    });

    test("converts global quiz insights list page to compatibility redirect", () => {
      const page = source(`${globalEvalRoot}/quiz-insights/page.tsx`);
      expect(page).toContain("assertAdmin");
      expect(page).toContain("resolveCourseIdentity");
      expect(page).toContain('redirect("/admin/courses")');
      expect(page).toContain("/analytics");
      expect(page).not.toContain("<QuizInsightsListClient");
    });

    test("converts global quiz insights detail page to server-side resolving redirect", () => {
      const page = source(`${globalEvalRoot}/quiz-insights/[id]/page.tsx`);
      expect(page).toContain("assertAdmin");
      expect(page).toContain("resolveQuizCourseIdentity");
      expect(page).toContain("notFound()");
      expect(page).toContain("/analytics/");
      expect(page).not.toContain("<QuizInsightDetailClient");
    });
  });

  describe("Canonical & Legacy Course Identity Matching Logic", () => {
    const mockIdentity: ResolvedCourseIdentity = {
      slug: "kalkulus-1",
      primaryId: "mk-calc-101",
      canonicalId: "mk-calc-101",
      legacyId: "mat101",
      title: "Kalkulus I",
      category: "Matematika",
      description: "Dasar kalkulus",
      status: "active",
      allIds: ["kalkulus-1", "mk-calc-101", "mat101"],
    };

    test("matches against canonical ID", () => {
      expect(matchesCourseIdentity("mk-calc-101", mockIdentity)).toBe(true);
      expect(matchesCourseIdentity("MK-CALC-101", mockIdentity)).toBe(true);
    });

    test("matches against legacy ID", () => {
      expect(matchesCourseIdentity("mat101", mockIdentity)).toBe(true);
      expect(matchesCourseIdentity("MAT101", mockIdentity)).toBe(true);
    });

    test("matches against route slug if present in allIds", () => {
      expect(matchesCourseIdentity("kalkulus-1", mockIdentity)).toBe(true);
    });

    test("rejects quiz belonging to another course", () => {
      expect(matchesCourseIdentity("fis101", mockIdentity)).toBe(false);
      expect(matchesCourseIdentity("mk-physics-201", mockIdentity)).toBe(false);
    });

    test("rejects null, undefined, or empty course IDs safely", () => {
      expect(matchesCourseIdentity(null, mockIdentity)).toBe(false);
      expect(matchesCourseIdentity(undefined, mockIdentity)).toBe(false);
      expect(matchesCourseIdentity("", mockIdentity)).toBe(false);
      expect(matchesCourseIdentity("   ", mockIdentity)).toBe(false);
    });

    test("isQuizOwnedByCourse delegates accurately", () => {
      expect(isQuizOwnedByCourse({ courseId: "mat101" }, mockIdentity)).toBe(true);
      expect(isQuizOwnedByCourse({ courseId: "mk-calc-101" }, mockIdentity)).toBe(true);
      expect(isQuizOwnedByCourse({ courseId: "other-course" }, mockIdentity)).toBe(false);
    });
  });

  describe("API Route Hardening Contract", () => {
    test("leaderboard API uses resolveCourseIdentity and inArray for compatible IDs", () => {
      const api = source("app/api/admin/leaderboard/route.ts");
      expect(api).toContain("resolveCourseIdentity");
      expect(api).toContain("inArray(quizTemplates.courseId");
      expect(api).toContain("mataKuliah");
    });

    test("quiz insights API resolves course identity and matches canonical/legacy IDs", () => {
      const api = source("app/api/admin/quiz-insights/route.ts");
      expect(api).toContain("resolveCourseIdentity");
      expect(api).toContain("matchesCourseIdentity");
      expect(api).toContain("mataKuliah");
    });

    test("quiz insights detail API joins mataKuliah for canonical course resolution", () => {
      const api = source("app/api/admin/quiz-insights/[id]/route.ts");
      expect(api).toContain("mataKuliah");
      expect(api).toContain("canonicalCourseName");
    });
  });
});
