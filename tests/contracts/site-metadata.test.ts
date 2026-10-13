import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

describe("Site metadata and Open Graph contract", () => {
  it("verifies the branded 1200 by 630 Open Graph image exists and is non-empty", () => {
    const ogImagePath = path.resolve(process.cwd(), "public/brand/zyx-og-1200x630.png");
    expect(existsSync(ogImagePath)).toBe(true);
    const stats = statSync(ogImagePath);
    expect(stats.size).toBeGreaterThan(1000);
  });

  it("registers exported browser and Apple icons and the canonical OG image", () => {
    const layoutPath = path.resolve(process.cwd(), "app/layout.tsx");
    const content = readFileSync(layoutPath, "utf8");

    expect(content).toContain("url: siteOgImage");
    expect(content).toContain("width: 1200");
    expect(content).toContain("height: 630");
    expect(content).toContain('card: "summary_large_image"');
    expect(content).toContain('images: [siteOgImage]');
    for (const icon of [
      "zyx-favicon-16.png",
      "zyx-favicon-32.png",
      "zyx-favicon-48.png",
      "zyx-app-180.png",
    ]) {
      expect(content).toContain(icon);
      expect(existsSync(path.resolve(process.cwd(), "public/brand", icon))).toBe(true);
    }

    const manifest = readFileSync(path.resolve(process.cwd(), "app/manifest.ts"), "utf8");
    expect(manifest).toContain('theme_color: "#1a2744"');
    expect(manifest).toContain('zyx-app-192.png');
    expect(manifest).toContain('zyx-app-512.png');
    expect(existsSync(path.resolve(process.cwd(), "public/brand/zyx-app-192.png"))).toBe(true);
    expect(existsSync(path.resolve(process.cwd(), "public/brand/zyx-app-512.png"))).toBe(true);
  });

  it("keeps article thumbnails and falls back to the canonical OG image", () => {
    const blogPagePath = path.resolve(process.cwd(), "app/(marketing)/blog/[slug]/page.tsx");
    const content = readFileSync(blogPagePath, "utf8");

    expect(content).toContain("image: article.thumbnailUrl || siteOgImage");
  });
});
