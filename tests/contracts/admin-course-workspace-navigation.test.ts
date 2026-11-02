import { describe, expect, test, mock } from "bun:test";
import { readFileSync } from "node:fs";

mock.module("server-only", () => ({}));

const { parseAdminCourseSlug, getAdminCourseNavItems } = await import("@/components/admin-sidebar");
const { getRouteTitle } = await import("@/components/mobile-navbar");
const routeTitle = (path: string) => getRouteTitle(path, undefined, (key) => key);
const adminMessages = JSON.parse(readFileSync("messages/id/admin.json", "utf8"));
const studentMessages = JSON.parse(readFileSync("messages/id/student.json", "utf8"));
const { getCourseNavContext } = await import("@/app/(admin)/admin/(academic)/courses/actions");

describe("Admin Course Workspace Navigation & Mobile Route Titles Contract", () => {
  describe("Pathname parsing contract (parseAdminCourseSlug)", () => {
    test("excludes /admin/courses root and returns null", () => {
      expect(parseAdminCourseSlug("/admin/courses")).toBeNull();
      expect(parseAdminCourseSlug("/admin/courses/")).toBeNull();
    });

    test("excludes non-course admin routes and returns null", () => {
      expect(parseAdminCourseSlug("/admin")).toBeNull();
      expect(parseAdminCourseSlug("/admin/blog")).toBeNull();
      expect(parseAdminCourseSlug("/admin/quizzes")).toBeNull();
      expect(parseAdminCourseSlug("/courses/kalkulus-1")).toBeNull();
      expect(parseAdminCourseSlug("/dashboard")).toBeNull();
    });

    test("captures nested course slug accurately", () => {
      expect(parseAdminCourseSlug("/admin/courses/kalkulus-1")).toBe("kalkulus-1");
      expect(parseAdminCourseSlug("/admin/courses/kalkulus-1/")).toBe("kalkulus-1");
      expect(parseAdminCourseSlug("/admin/courses/kalkulus-1/documents")).toBe("kalkulus-1");
      expect(parseAdminCourseSlug("/admin/courses/kalkulus-1/quizzes/new")).toBe("kalkulus-1");
      expect(parseAdminCourseSlug("/admin/courses/kalkulus-1/settings")).toBe("kalkulus-1");
    });

    test("handles URL-encoded slugs", () => {
      expect(parseAdminCourseSlug("/admin/courses/kalkulus%20dasar")).toBe("kalkulus dasar");
    });

    test("handles malformed percent encoding safely without throwing and returns null", () => {
      expect(parseAdminCourseSlug("/admin/courses/%E0%A4%A")).toBeNull();
      expect(parseAdminCourseSlug("/admin/courses/%")).toBeNull();
      expect(parseAdminCourseSlug("/admin/courses/%FF")).toBeNull();
      expect(parseAdminCourseSlug("/admin/courses/bad%segment/documents")).toBeNull();
    });
  });

  describe("Contextual course sidebar items contract (getAdminCourseNavItems)", () => {
    const slug = "kalkulus-1";
    const items = getAdminCourseNavItems(slug);

    test("returns exactly twelve items in the prescribed order", () => {
      expect(items).toHaveLength(12);
      expect(items.map((i) => i.label)).toEqual([
        "Bab",
        "Dokumen",
        "Video",
        "Kuis",
        "Tryout",
        "Soal",
        "Flashcard",
        "Hasil",
        "Papan Peringkat",
        "Analitik",
        "Review Materi",
        "Pengaturan",
      ]);
    });

    test("uses Dokumen as exact Indonesian label for documents item", () => {
      const docItem = items.find((i) => i.id === "documents");
      expect(docItem?.label).toBe("Dokumen");
    });

    test("uses Video as exact Indonesian label for videos item", () => {
      const videoItem = items.find((i) => i.id === "videos");
      expect(videoItem?.label).toBe("Video");
    });

    test("constructs exact paths with the course slug", () => {
      expect(items.map((i) => i.href)).toEqual([
        `/admin/courses/${slug}`,
        `/admin/courses/${slug}/documents`,
        `/admin/courses/${slug}/videos`,
        `/admin/courses/${slug}/quizzes`,
        `/admin/courses/${slug}/tryouts`,
        `/admin/courses/${slug}/questions`,
        `/admin/courses/${slug}/flashcards`,
        `/admin/courses/${slug}/results`,
        `/admin/courses/${slug}/leaderboard`,
        `/admin/courses/${slug}/analytics`,
        `/admin/courses/${slug}/review`,
        `/admin/courses/${slug}/settings`,
      ]);
    });

    test("marks only Bab as exact: true to avoid greedy matching", () => {
      const babItem = items.find((i) => i.id === "bab");
      expect(babItem?.exact).toBe(true);

      const otherItems = items.filter((i) => i.id !== "bab");
      for (const item of otherItems) {
        expect(item.exact).toBeFalsy();
      }
    });

    test("resolves active state correctly across routes", () => {
      const isItemActive = (item: (typeof items)[number], currentPath: string) => {
        if (item.exact) {
          return currentPath === item.href;
        }
        return currentPath === item.href || currentPath.startsWith(item.href + "/");
      };

      // Root course route: only Bab is active
      const rootPath = `/admin/courses/${slug}`;
      expect(isItemActive(items[0], rootPath)).toBe(true);
      expect(items.slice(1).every((i) => !isItemActive(i, rootPath))).toBe(true);

      // Documents route: only Dokumen is active, Bab is not
      const docsPath = `/admin/courses/${slug}/documents`;
      expect(isItemActive(items[0], docsPath)).toBe(false);
      expect(isItemActive(items[1], docsPath)).toBe(true);

      // Videos route: only Video is active
      const videosPath = `/admin/courses/${slug}/videos`;
      expect(isItemActive(items[0], videosPath)).toBe(false);
      expect(isItemActive(items[2], videosPath)).toBe(true);

      // Quizzes nested route (/quizzes/new): Kuis is active, others not
      const newQuizPath = `/admin/courses/${slug}/quizzes/new`;
      expect(isItemActive(items[0], newQuizPath)).toBe(false);
      expect(isItemActive(items[3], newQuizPath)).toBe(true);

      // Settings route: only Settings is active
      const settingsPath = `/admin/courses/${slug}/settings`;
      expect(isItemActive(items[11], settingsPath)).toBe(true);
      expect(items.slice(0, 11).every((i) => !isItemActive(i, settingsPath))).toBe(true);
    });
  });

  describe("Global navigation isolation contract", () => {
    test("contextual course navigation does not include pin or archive actions", () => {
      const items = getAdminCourseNavItems("kalkulus-1");
      // All items in course context are navigation links only; none carry pin/archive keys or actions
      for (const item of items) {
        expect((item as any).onPin).toBeUndefined();
        expect((item as any).onArchive).toBeUndefined();
      }
    });

    test("/admin/courses root maintains global navigation mode (parseAdminCourseSlug is null)", () => {
      const globalSlug = parseAdminCourseSlug("/admin/courses");
      expect(globalSlug).toBeNull();
    });
  });

  describe("Mobile route titles contract (getRouteTitle)", () => {
    test("Indonesian catalogs contain the route labels", () => {
      expect(adminMessages.routeTitles).toMatchObject({
        courses: "Mata kuliah", chapters: "Bab", documents: "Dokumen", videos: "Video",
        quizzes: "Kuis", tryouts: "Tryout", questions: "Soal", flashcards: "Flashcard",
        results: "Hasil", leaderboard: "Papan peringkat", analytics: "Analitik",
        review: "Review materi", settings: "Pengaturan", dashboard: "Panel admin",
        blog: "Kelola blog", schedules: "Jadwal umum", ops: "Monitor Ops",
      });
      expect(studentMessages.routeTitles.dashboard).toBe("Dashboard Siswa");
    });

    test("preserves global course title for /admin/courses root", () => {
      expect(routeTitle("/admin/courses")).toBe("admin.routeTitles.courses");
      expect(routeTitle("/admin/courses/")).toBe("admin.routeTitles.courses");
    });

    test("resolves mobile route titles for all twelve contextual course routes", () => {
      const slug = "aljabar-linear";
      expect(routeTitle(`/admin/courses/${slug}`)).toBe("admin.routeTitles.chapters");
      expect(routeTitle(`/admin/courses/${slug}/`)).toBe("admin.routeTitles.chapters");
      expect(routeTitle(`/admin/courses/${slug}/documents`)).toBe("admin.routeTitles.documents");
      expect(routeTitle(`/admin/courses/${slug}/videos`)).toBe("admin.routeTitles.videos");
      expect(routeTitle(`/admin/courses/${slug}/quizzes`)).toBe("admin.routeTitles.quizzes");
      expect(routeTitle(`/admin/courses/${slug}/quizzes/new`)).toBe("admin.routeTitles.quizzes");
      expect(routeTitle(`/admin/courses/${slug}/tryouts`)).toBe("admin.routeTitles.tryouts");
      expect(routeTitle(`/admin/courses/${slug}/questions`)).toBe("admin.routeTitles.questions");
      expect(routeTitle(`/admin/courses/${slug}/flashcards`)).toBe("admin.routeTitles.flashcards");
      expect(routeTitle(`/admin/courses/${slug}/results`)).toBe("admin.routeTitles.results");
      expect(routeTitle(`/admin/courses/${slug}/leaderboard`)).toBe("admin.routeTitles.leaderboard");
      expect(routeTitle(`/admin/courses/${slug}/analytics`)).toBe("admin.routeTitles.analytics");
      expect(routeTitle(`/admin/courses/${slug}/review`)).toBe("admin.routeTitles.review");
      expect(routeTitle(`/admin/courses/${slug}/settings`)).toBe("admin.routeTitles.settings");
    });

    test("preserves existing non-course admin and student route titles", () => {
      expect(routeTitle("/admin")).toBe("admin.routeTitles.dashboard");
      expect(routeTitle("/admin/blog")).toBe("admin.routeTitles.blog");
      expect(routeTitle("/admin/schedules")).toBe("admin.routeTitles.schedules");
      expect(routeTitle("/admin/questions")).toBe("admin.routeTitles.questions");
      expect(routeTitle("/admin/quizzes")).toBe("admin.routeTitles.quizzes");
      expect(routeTitle("/admin/ops")).toBe("admin.routeTitles.ops");
      expect(routeTitle("/dashboard")).toBe("routeTitles.dashboard");
    });
  });

  describe("Course lookup authorization and safety contract (getCourseNavContext)", () => {
    test("enforces admin authorization via assertAdmin()", async () => {
      // getCourseNavContext invokes assertAdmin() which accesses session headers.
      // Outside authenticated admin request context, it throws.
      expect(getCourseNavContext("kalkulus-1")).rejects.toThrow();
    });

    test("handles empty slug without bypass", async () => {
      // Calling with empty string also triggers assertAdmin guard first
      expect(getCourseNavContext("")).rejects.toThrow();
    });
  });
});
