import { describe, expect, it } from "bun:test";
import {
  isMarketingHref,
  isMarketingDocument,
  getMarketingShortcutDocs,
  getSiteSearchDocuments,
} from "@/lib/site-search-index";
import { parseSearchQueryString } from "@/lib/search/parser";

describe("Marketing CMDK search scoping", () => {
  it("recognizes English and Indonesian administrative prefix aliases", () => {
    expect(parseSearchQueryString("groups: chemistry")).toMatchObject({
      isScoped: true,
      entityType: "group",
      cleanQuery: "chemistry",
    });
    expect(parseSearchQueryString("students: Alex")).toMatchObject({
      isScoped: true,
      entityType: "user",
      cleanQuery: "Alex",
    });
    expect(parseSearchQueryString("jadwal: kalkulus")).toMatchObject({
      isScoped: true,
      entityType: "schedule",
      cleanQuery: "kalkulus",
    });
  });

  describe("isMarketingHref", () => {
    it("recognizes marketing pages correctly", () => {
      // Specified in requirements: testi, tentang, blog, paket, sign-in, etc.
      expect(isMarketingHref("/")).toBe(true);
      expect(isMarketingHref("/#features")).toBe(true);
      expect(isMarketingHref("/plans")).toBe(true);
      expect(isMarketingHref("/plans#pricing")).toBe(true);
      expect(isMarketingHref("/about")).toBe(true);
      expect(isMarketingHref("/testimonial")).toBe(true);
      expect(isMarketingHref("/blog")).toBe(true);
      expect(isMarketingHref("/blog/tips-belajar-kalkulus")).toBe(true);
      expect(isMarketingHref("/sign-in")).toBe(true);
      expect(isMarketingHref("/sign-up")).toBe(true);
      expect(isMarketingHref("/terms")).toBe(true);
      expect(isMarketingHref("/privacy")).toBe(true);
    });

    it("rejects non-marketing internal student and admin routes", () => {
      expect(isMarketingHref("/courses")).toBe(false);
      expect(isMarketingHref("/courses/kalkulus-1")).toBe(false);
      expect(isMarketingHref("/courses/kalkulus-1/material/123")).toBe(false);
      expect(isMarketingHref("/courses/kalkulus-1/quiz/456")).toBe(false);
      expect(isMarketingHref("/courses/tutorial-pka")).toBe(false);
      expect(isMarketingHref("/dashboard")).toBe(false);
      expect(isMarketingHref("/dashboard/schedule")).toBe(false);
      expect(isMarketingHref("/dashboard/groups")).toBe(false);
      expect(isMarketingHref("/leaderboard")).toBe(false);
      expect(isMarketingHref("/calendar")).toBe(false);
      expect(isMarketingHref("/profile")).toBe(false);
      expect(isMarketingHref("/settings")).toBe(false);
      expect(isMarketingHref("/admin")).toBe(false);
      expect(isMarketingHref("/admin/courses")).toBe(false);
      expect(isMarketingHref("/admin/bundles/idea")).toBe(false);
      expect(isMarketingHref("/tutor")).toBe(false);
    });
  });

  describe("getMarketingShortcutDocs", () => {
    it("returns quick picks limited to marketing pages", () => {
      const allDocs = getSiteSearchDocuments();
      const shortcuts = getMarketingShortcutDocs(allDocs);

      expect(shortcuts.length).toBeGreaterThan(0);
      for (const doc of shortcuts) {
        expect(isMarketingHref(doc.href)).toBe(true);
      }

      const hrefs = shortcuts.map((s) => s.href);
      expect(hrefs).toContain("/plans");
      expect(hrefs).toContain("/about");
      expect(hrefs).toContain("/testimonial");
      expect(hrefs).toContain("/blog");
      expect(hrefs).toContain("/sign-in");
      expect(hrefs).not.toContain("/dashboard");
      expect(hrefs).not.toContain("/courses");
    });
  });

  describe("document filtering for unauthenticated search", () => {
    it("filters out course materials, exams, and admin pages", () => {
      const allDocs = getSiteSearchDocuments();
      const marketingOnlyDocs = allDocs.filter(isMarketingDocument);

      const internalDocs = marketingOnlyDocs.filter(
        (d) =>
          d.href.startsWith("/courses") ||
          d.href.startsWith("/admin") ||
          d.href.startsWith("/dashboard") ||
          d.href.startsWith("/tutor")
      );
      expect(internalDocs.length).toBe(0);

      const marketingHrefs = marketingOnlyDocs.map((d) => d.href);
      expect(marketingHrefs).toContain("/");
      expect(marketingHrefs).toContain("/plans");
      expect(marketingHrefs).toContain("/about");
      expect(marketingHrefs).toContain("/testimonial");
      expect(marketingHrefs).toContain("/blog");
      expect(marketingHrefs).toContain("/sign-in");
    });
  });
});
