import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("public sitemap routes", () => {
  it("uses the shared production origin and lists only public pages", () => {
    const root = process.cwd();
    const sitemap = readFileSync(path.resolve(root, "app/sitemap.ts"), "utf8");
    const robots = readFileSync(path.resolve(root, "app/robots.ts"), "utf8");
    const site = readFileSync(path.resolve(root, "lib/site.ts"), "utf8");

    expect(site).toContain('export const siteBaseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.zyxacademy.com"');
    expect(sitemap).toContain('import { siteBaseUrl } from "@/lib/site"');
    expect(robots).toContain('import { siteBaseUrl } from "@/lib/site"');
    expect(sitemap).toContain('const staticPaths = ["", "/about", "/plans", "/testimonial"]');
    expect(sitemap).toContain('url: `${siteBaseUrl}/blog/${b.slug}`');
    expect(sitemap).toContain('url: `${siteBaseUrl}/blog`');
    expect(sitemap).not.toContain('"/courses"');
    expect(sitemap).not.toContain("courseIds.map");
    expect(sitemap).not.toContain("mataKuliah");
  });
});
