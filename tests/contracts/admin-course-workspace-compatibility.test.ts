import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import {
  matchesCourseIdentity,
  getCanonicalCourseSlug,
  resolveQuizCourseIdentity,
  resolveBundleCourseIdentity,
  type ResolvedCourseIdentity,
} from "@/lib/admin/course-identity";
import { STATIC_PAGES } from "@/lib/site-search-index";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("CP6 Admin Course Workspace Compatibility Routes & Reverse Resolvers Contract", () => {
  describe("1. Compatibility redirect routes presence and server-side structure", () => {
    test("/admin/quizzes converts to server-side redirect", () => {
      const path = "app/(admin)/admin/(eval)/quizzes/page.tsx";
      expect(existsSync(path)).toBe(true);
      const content = source(path);
      expect(content).toContain("assertTutorOrAdmin");
      expect(content).toContain("resolveCourseIdentity");
      expect(content).toContain("getCanonicalCourseSlug");
      expect(content).toContain("/quizzes");
      expect(content).toContain('redirect("/admin/courses")');
      expect(content).not.toContain("<QuizzesCurationClient");
    });

    test("/admin/quizzes/new validates course identity server-side and redirects", () => {
      const path = "app/(admin)/admin/(eval)/quizzes/new/page.tsx";
      expect(existsSync(path)).toBe(true);
      const content = source(path);
      expect(content).toContain("assertTutorOrAdmin");
      expect(content).toContain("resolveCourseIdentity");
      expect(content).toContain("getCanonicalCourseSlug");
      expect(content).toContain("/quizzes/new");
      expect(content).toContain('redirect("/admin/courses")');
      expect(content).not.toContain("<QuizForm");
    });

    test("/admin/quizzes/[id]/edit resolves quiz owner server-side without trusting params", () => {
      const path = "app/(admin)/admin/(eval)/quizzes/[id]/edit/page.tsx";
      expect(existsSync(path)).toBe(true);
      const content = source(path);
      expect(content).toContain("assertTutorOrAdmin");
      expect(content).toContain("resolveQuizCourseIdentity");
      expect(content).toContain("getCanonicalCourseSlug");
      expect(content).toContain("notFound()");
      expect(content).toContain("/quizzes/");
      expect(content).toContain("/edit");
      expect(content).not.toContain("<QuizForm");
    });

    test("/admin/leaderboard converts to server-side redirect", () => {
      const path = "app/(admin)/admin/(eval)/leaderboard/page.tsx";
      expect(existsSync(path)).toBe(true);
      const content = source(path);
      expect(content).toContain("assertAdmin");
      expect(content).toContain("resolveCourseIdentity");
      expect(content).toContain("getCanonicalCourseSlug");
      expect(content).toContain("/leaderboard");
      expect(content).toContain('redirect("/admin/courses")');
      expect(content).not.toContain("<AdminLeaderboardClient");
    });

    test("/admin/quiz-insights converts to server-side redirect", () => {
      const path = "app/(admin)/admin/(eval)/quiz-insights/page.tsx";
      expect(existsSync(path)).toBe(true);
      const content = source(path);
      expect(content).toContain("assertAdmin");
      expect(content).toContain("resolveCourseIdentity");
      expect(content).toContain("getCanonicalCourseSlug");
      expect(content).toContain("/analytics");
      expect(content).toContain('redirect("/admin/courses")');
      expect(content).not.toContain("<QuizInsightsListClient");
    });

    test("/admin/quiz-insights/[id] resolves quiz owner server-side and redirects to course analytics", () => {
      const path = "app/(admin)/admin/(eval)/quiz-insights/[id]/page.tsx";
      expect(existsSync(path)).toBe(true);
      const content = source(path);
      expect(content).toContain("assertAdmin");
      expect(content).toContain("resolveQuizCourseIdentity");
      expect(content).toContain("getCanonicalCourseSlug");
      expect(content).toContain("notFound()");
      expect(content).toContain("/analytics/");
      expect(content).not.toContain("<QuizInsightDetailClient");
    });

    test("/admin/materials/review converts to server-side redirect", () => {
      const path = "app/(admin)/admin/(academic)/materials/review/page.tsx";
      expect(existsSync(path)).toBe(true);
      const content = source(path);
      expect(content).toContain("assertAdmin");
      expect(content).toContain("resolveCourseIdentity");
      expect(content).toContain("getCanonicalCourseSlug");
      expect(content).toContain("/review");
      expect(content).toContain('redirect("/admin/courses")');
      expect(content).not.toContain("<MaterialWorkspace");
    });

    test("/admin/materials/review/idea/[slug] resolves bundle owner server-side and redirects", () => {
      const path = "app/(admin)/admin/(academic)/materials/review/idea/[slug]/page.tsx";
      expect(existsSync(path)).toBe(true);
      const content = source(path);
      expect(content).toContain("assertAdmin");
      expect(content).toContain("resolveBundleCourseIdentity");
      expect(content).toContain("notFound()");
      expect(content).toContain("/review/idea/");
      expect(content).not.toContain("<MaterialWorkspace");
    });

    test("/admin/materials/review/product/[slug] resolves bundle owner server-side and redirects", () => {
      const path = "app/(admin)/admin/(academic)/materials/review/product/[slug]/page.tsx";
      expect(existsSync(path)).toBe(true);
      const content = source(path);
      expect(content).toContain("assertAdmin");
      expect(content).toContain("resolveBundleCourseIdentity");
      expect(content).toContain("notFound()");
      expect(content).toContain("/review/product/");
      expect(content).not.toContain("<MaterialWorkspace");
    });

    test("/admin/materials/manual remains redirected to /admin/courses", () => {
      const path = "app/(admin)/admin/(academic)/materials/manual/page.tsx";
      expect(existsSync(path)).toBe(true);
      const content = source(path);
      expect(content).toContain('redirect("/admin/courses")');
    });
  });

  describe("2. Canonical and legacy slug resolution logic (getCanonicalCourseSlug)", () => {
    test("prefers canonicalId when present", () => {
      const identity: Pick<ResolvedCourseIdentity, "slug" | "primaryId" | "canonicalId"> = {
        slug: "legacy-calc-id",
        primaryId: "mk-calc-101",
        canonicalId: "kalkulus-1",
      };
      expect(getCanonicalCourseSlug(identity)).toBe("kalkulus-1");
    });

    test("falls back to primaryId when canonicalId is null", () => {
      const identity: Pick<ResolvedCourseIdentity, "slug" | "primaryId" | "canonicalId"> = {
        slug: "raw-slug",
        primaryId: "mk-physics-101",
        canonicalId: null,
      };
      expect(getCanonicalCourseSlug(identity)).toBe("mk-physics-101");
    });

    test("falls back to slug when canonicalId and primaryId are empty", () => {
      const identity: Pick<ResolvedCourseIdentity, "slug" | "primaryId" | "canonicalId"> = {
        slug: "fallback-slug",
        primaryId: "",
        canonicalId: null,
      };
      expect(getCanonicalCourseSlug(identity)).toBe("fallback-slug");
    });
  });

  describe("3. Reverse owner resolution error handling", () => {
    test("resolveQuizCourseIdentity safely returns null for empty or whitespace IDs", async () => {
      expect(await resolveQuizCourseIdentity("")).toBeNull();
      expect(await resolveQuizCourseIdentity("   ")).toBeNull();
    });

    test("resolveBundleCourseIdentity safely returns null for empty or whitespace IDs", async () => {
      expect(await resolveBundleCourseIdentity("")).toBeNull();
      expect(await resolveBundleCourseIdentity("   ")).toBeNull();
      expect(await resolveBundleCourseIdentity("", "idea")).toBeNull();
      expect(await resolveBundleCourseIdentity("", "product")).toBeNull();
    });
  });

  describe("4. Ownership verification (matchesCourseIdentity)", () => {
    const sampleIdentity: ResolvedCourseIdentity = {
      slug: "aljabar-linear",
      primaryId: "mk-algeo-101",
      canonicalId: "aljabar-linear",
      legacyId: "mat201",
      title: "Aljabar Linear",
      category: "Matematika",
      description: "Materi aljabar linear",
      status: "active",
      allIds: ["aljabar-linear", "mk-algeo-101", "mat201"],
    };

    test("accepts canonical ID match", () => {
      expect(matchesCourseIdentity("aljabar-linear", sampleIdentity)).toBe(true);
    });

    test("accepts primaryId match", () => {
      expect(matchesCourseIdentity("mk-algeo-101", sampleIdentity)).toBe(true);
    });

    test("accepts legacyId match", () => {
      expect(matchesCourseIdentity("mat201", sampleIdentity)).toBe(true);
    });

    test("case insensitive matching works", () => {
      expect(matchesCourseIdentity("ALJABAR-LINEAR", sampleIdentity)).toBe(true);
      expect(matchesCourseIdentity("MK-ALGEO-101", sampleIdentity)).toBe(true);
      expect(matchesCourseIdentity("MAT201", sampleIdentity)).toBe(true);
    });

    test("rejects foreign wrong course IDs", () => {
      expect(matchesCourseIdentity("kalkulus-1", sampleIdentity)).toBe(false);
      expect(matchesCourseIdentity("fisika-dasar", sampleIdentity)).toBe(false);
      expect(matchesCourseIdentity("unknown-id", sampleIdentity)).toBe(false);
    });

    test("safely handles null, undefined, and empty course IDs", () => {
      expect(matchesCourseIdentity(null, sampleIdentity)).toBe(false);
      expect(matchesCourseIdentity(undefined, sampleIdentity)).toBe(false);
      expect(matchesCourseIdentity("", sampleIdentity)).toBe(false);
      expect(matchesCourseIdentity("   ", sampleIdentity)).toBe(false);
    });
  });

  describe("5. Site search index clean state (no stale global course-scoped surfaces)", () => {
    test("does not contain stale global Kuis, leaderboard, analytics, or Review Materi routes", () => {
      const staticHrefs = STATIC_PAGES.map((p) => p.href);
      expect(staticHrefs).not.toContain("/admin/quizzes");
      expect(staticHrefs).not.toContain("/admin/leaderboard");
      expect(staticHrefs).not.toContain("/admin/quiz-insights");
      expect(staticHrefs).not.toContain("/admin/materials/review");
      expect(staticHrefs).not.toContain("/admin/materials/manual");
    });

    test("preserves valid global destinations including course selector", () => {
      const staticHrefs = STATIC_PAGES.map((p) => p.href);
      expect(staticHrefs).toContain("/admin");
      expect(staticHrefs).toContain("/admin/courses");
      expect(staticHrefs).toContain("/admin/questions");
      expect(staticHrefs).toContain("/admin/jobs");
      expect(staticHrefs).toContain("/admin/distractors");
      expect(staticHrefs).toContain("/admin/bundles/idea");
      expect(staticHrefs).toContain("/admin/bundles/product");
    });
  });
});
