import { describe, expect, test, mock } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

mock.module("server-only", () => ({}));

const { parseAdminCourseSlug, getAdminCourseNavItems } = await import("@/components/admin-sidebar");
const { getRouteTitle } = await import("@/components/mobile-navbar");
const { matchesCourseIdentity } = await import("@/lib/admin/course-identity");
import type { ResolvedCourseIdentity } from "@/lib/admin/course-identity";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

const courseReviewRoot = "app/(admin)/admin/(academic)/courses/[slug]/review";
const globalReviewRoot = "app/(admin)/admin/(academic)/materials/review";

describe("CP3B Admin Course Workspace Review Materi Contract", () => {
  describe("Route presence and server-side structure", () => {
    test("provides course-scoped review list route with server-side identity resolution", () => {
      const pagePath = `${courseReviewRoot}/page.tsx`;
      expect(existsSync(pagePath)).toBe(true);

      const content = source(pagePath);
      expect(content).toContain("assertAdmin");
      expect(content).toContain("resolveCourseIdentity");
      expect(content).toContain("getCourseDetailData");
      expect(content).toContain("notFound()");
      expect(content).toContain("loadMaterialWorkspaceData");
      expect(content).toContain("courseIds: identity.allIds");
      expect(content).toContain("CourseDetailHeader");
      expect(content).toContain("<MaterialWorkspace");
      expect(content).toContain('mode="review"');
      expect(content).toContain("lockedCourse={lockedCourse}");
    });

    test("provides course-scoped Idea Bundle detail route with ownership validation", () => {
      const pagePath = `${courseReviewRoot}/idea/[bundleId]/page.tsx`;
      expect(existsSync(pagePath)).toBe(true);

      const content = source(pagePath);
      expect(content).toContain("assertAdmin");
      expect(content).toContain("resolveCourseIdentity");
      expect(content).toContain("getIdeaBundleImport");
      expect(content).toContain("matchesCourseIdentity");
      expect(content).toContain("notFound()");
      expect(content).toContain("loadMaterialWorkspaceData");
      expect(content).toContain("courseIds: identity.allIds");
      expect(content).toContain("CourseDetailHeader");
      expect(content).toContain("<MaterialWorkspace");
      expect(content).toContain('mode="idea-detail"');
      expect(content).toContain("detailId={bundleId}");
      expect(content).toContain("lockedCourse={lockedCourse}");
    });

    test("provides course-scoped Product Bundle detail route with ownership validation", () => {
      const pagePath = `${courseReviewRoot}/product/[bundleId]/page.tsx`;
      expect(existsSync(pagePath)).toBe(true);

      const content = source(pagePath);
      expect(content).toContain("assertAdmin");
      expect(content).toContain("resolveCourseIdentity");
      expect(content).toContain("getProductBundleImport");
      expect(content).toContain("matchesCourseIdentity");
      expect(content).toContain("notFound()");
      expect(content).toContain("loadMaterialWorkspaceData");
      expect(content).toContain("courseIds: identity.allIds");
      expect(content).toContain("CourseDetailHeader");
      expect(content).toContain("<MaterialWorkspace");
      expect(content).toContain('mode="product-detail"');
      expect(content).toContain("detailId={bundleId}");
      expect(content).toContain("lockedCourse={lockedCourse}");
    });
  });

  describe("Server-side course filtering contracts", () => {
    test("staging loaders accept courseIds filtering", () => {
      const ideaStaging = source("lib/bundle/staging.ts");
      expect(ideaStaging).toContain("courseIds?: string[]");
      expect(ideaStaging).toContain("inArray(imporBundle.courseId, courseIds)");

      const productStaging = source("lib/bundle/product-staging.ts");
      expect(productStaging).toContain("courseIds?: string[]");
      expect(productStaging).toContain("inArray(imporBundle.courseId, courseIds)");
    });

    test("loadMaterialWorkspaceData accepts courseIds and passes to staging loaders", () => {
      const dataModule = source("app/(admin)/admin/(academic)/materials/data.ts");
      expect(dataModule).toContain("courseIds?: string[]");
      expect(dataModule).toContain("const bundleOptions = courseIds && courseIds.length > 0 ? { limit: 50, courseIds } : 50");
      expect(dataModule).toContain("listIdeaBundleImports(bundleOptions)");
      expect(dataModule).toContain("listProductBundleImports(bundleOptions)");
    });
  });

  describe("Wrong-course denial contract (matchesCourseIdentity)", () => {
    const mockIdentity: ResolvedCourseIdentity = {
      slug: "fisika-dasar-1",
      primaryId: "mk-fisika-1",
      canonicalId: "mk-fisika-1",
      legacyId: "legacy-fisika-1",
      title: "Fisika Dasar I",
      category: "Sains",
      description: "Pengantar ilmu fisika",
      status: "active",
      allIds: ["fisika-dasar-1", "mk-fisika-1", "legacy-fisika-1"],
    };

    test("accepts matching canonical, legacy, or slug courseId", () => {
      expect(matchesCourseIdentity("fisika-dasar-1", mockIdentity)).toBe(true);
      expect(matchesCourseIdentity("mk-fisika-1", mockIdentity)).toBe(true);
      expect(matchesCourseIdentity("legacy-fisika-1", mockIdentity)).toBe(true);
      expect(matchesCourseIdentity("MK-FISIKA-1", mockIdentity)).toBe(true);
    });

    test("rejects mismatched foreign courseId", () => {
      expect(matchesCourseIdentity("kalkulus-1", mockIdentity)).toBe(false);
      expect(matchesCourseIdentity("mk-kimia-1", mockIdentity)).toBe(false);
      expect(matchesCourseIdentity(null, mockIdentity)).toBe(false);
      expect(matchesCourseIdentity(undefined, mockIdentity)).toBe(false);
      expect(matchesCourseIdentity("", mockIdentity)).toBe(false);
    });
  });

  describe("Component locking and course-scoped navigation", () => {
    test("MaterialWorkspace keeps navigation course-scoped when lockedCourse is set", () => {
      const workspace = source("components/admin/material-workspace.tsx");
      expect(workspace).toContain("lockedCourse?: LockedCourseInfo");
      expect(workspace).toContain("`/admin/courses/${encodeURIComponent(lockedCourse.slug)}/review/${kind}/${encodeURIComponent(id)}`");
      expect(workspace).toContain("`/admin/courses/${encodeURIComponent(lockedCourse.slug)}/review`");
      expect(workspace).toContain("lockedCourse={lockedCourse}");
    });

    test("MaterialArtifactList hides course filter dropdown when lockedCourse is present", () => {
      const artifactList = source("components/admin/material-artifact-list.tsx");
      expect(artifactList).toContain("lockedCourse?: LockedCourseInfo");
      expect(artifactList).toContain("!lockedCourse &&");
    });

    test("ProductCatalogPanel locks course selection when lockedCourse is present", () => {
      const catalogPanel = source("components/admin/product-catalog-panel.tsx");
      expect(catalogPanel).toContain("lockedCourse?: LockedCourseInfo");
      expect(catalogPanel).toContain("!lockedCourse &&");
      expect(catalogPanel).toContain("lockedCourse ? lockedCourse.id :");
    });
  });

  describe("Global review route compatibility redirects (CP6 cleanup)", () => {
    test("converts global review route to compatibility redirect", () => {
      const pagePath = `${globalReviewRoot}/page.tsx`;
      expect(existsSync(pagePath)).toBe(true);

      const content = source(pagePath);
      expect(content).toContain("assertAdmin");
      expect(content).toContain("resolveCourseIdentity");
      expect(content).toContain('redirect("/admin/courses")');
      expect(content).toContain("/review");
      expect(content).not.toContain("<MaterialWorkspace");
    });

    test("converts global idea detail route to server-side resolving redirect", () => {
      const pagePath = `${globalReviewRoot}/idea/[slug]/page.tsx`;
      expect(existsSync(pagePath)).toBe(true);

      const content = source(pagePath);
      expect(content).toContain("assertAdmin");
      expect(content).toContain("resolveBundleCourseIdentity");
      expect(content).toContain("notFound()");
      expect(content).toContain("/review/idea/");
      expect(content).not.toContain("<MaterialWorkspace");
    });

    test("converts global product detail route to server-side resolving redirect", () => {
      const pagePath = `${globalReviewRoot}/product/[slug]/page.tsx`;
      expect(existsSync(pagePath)).toBe(true);

      const content = source(pagePath);
      expect(content).toContain("assertAdmin");
      expect(content).toContain("resolveBundleCourseIdentity");
      expect(content).toContain("notFound()");
      expect(content).toContain("/review/product/");
      expect(content).not.toContain("<MaterialWorkspace");
    });
  });

  describe("Sidebar and navbar integration", () => {
    test("sidebar navigation includes Review Materi linking to course-scoped route", () => {
      const items = getAdminCourseNavItems("kalkulus-1");
      const reviewItem = items.find((item) => item.id === "review");
      expect(reviewItem).toBeDefined();
      expect(reviewItem?.href).toBe("/admin/courses/kalkulus-1/review");
      expect(reviewItem?.label).toBe("Review Materi");
    });

    test("mobile navbar maps course review path to Review Materi title", () => {
      const title = getRouteTitle("/admin/courses/kalkulus-1/review", "admin", (key) => key);
      expect(title).toBe("admin.routeTitles.review");
      expect(JSON.parse(source("messages/id/admin.json")).routeTitles.review).toBe("Review materi");
    });

    test("pathname parsing captures course slug from review path", () => {
      expect(parseAdminCourseSlug("/admin/courses/kalkulus-1/review")).toBe("kalkulus-1");
      expect(parseAdminCourseSlug("/admin/courses/kalkulus-1/review/idea/bundle-123")).toBe("kalkulus-1");
      expect(parseAdminCourseSlug("/admin/courses/kalkulus-1/review/product/bundle-456")).toBe("kalkulus-1");
    });
  });
});
