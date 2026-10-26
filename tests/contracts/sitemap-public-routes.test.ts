import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("public sitemap routes", () => {
  it("lists public pages and published blog posts without gated course routes", () => {
    const sitemapPath = path.resolve(process.cwd(), "app/sitemap.ts");
    const sitemap = readFileSync(sitemapPath, "utf8");

    expect(sitemap).toContain('const staticPaths = ["", "/about", "/plans", "/testimonial"]');
    expect(sitemap).toContain('url: `${baseUrl}/blog/${b.slug}`');
    expect(sitemap).toContain('url: `${baseUrl}/blog`');
    expect(sitemap).not.toContain('"/courses"');
    expect(sitemap).not.toContain("courseIds.map");
    expect(sitemap).not.toContain("mataKuliah");
  });
});
