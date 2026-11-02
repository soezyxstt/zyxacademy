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

    expect(content).toContain('<link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />');
    expect(existsSync(path.resolve(process.cwd(), "app/manifest.ts"))).toBe(false);
    const manifest = readFileSync(path.resolve(process.cwd(), "app/manifest.webmanifest/route.ts"), "utf8");
    expect(manifest).toContain('theme_color: "#1a2744"');
    expect(manifest).toContain('zyx-app-192.png');
    expect(manifest).toContain('zyx-app-512.png');
    expect(manifest).toContain('zyx-maskable-192.png');
    expect(manifest).toContain('zyx-maskable-512.png');
    expect(manifest).toContain('purpose: "any"');
    expect(manifest).toContain('purpose: "maskable"');
    expect(existsSync(path.resolve(process.cwd(), "public/brand/zyx-app-192.png"))).toBe(true);
    expect(existsSync(path.resolve(process.cwd(), "public/brand/zyx-app-512.png"))).toBe(true);
    expect(existsSync(path.resolve(process.cwd(), "public/icons/zyx-maskable-192.png"))).toBe(true);
    expect(existsSync(path.resolve(process.cwd(), "public/icons/zyx-maskable-512.png"))).toBe(true);
  });

  it("serves the exported multi-size ICO through Next's root favicon convention", () => {
    const appIcon = readFileSync(path.resolve(process.cwd(), "app/favicon.ico"));
    const exportedIcon = readFileSync(path.resolve(process.cwd(), "public/brand/zyx-favicon.ico"));

    expect(appIcon.equals(exportedIcon)).toBe(true);
    expect(appIcon.readUInt16LE(0)).toBe(0);
    expect(appIcon.readUInt16LE(2)).toBe(1);
    expect(appIcon.readUInt16LE(4)).toBe(3);
  });

  it("keeps article thumbnails and falls back to the canonical OG image", () => {
    const blogPagePath = path.resolve(process.cwd(), "app/(marketing)/blog/[slug]/page.tsx");
    const content = readFileSync(blogPagePath, "utf8");

    expect(content).toContain('image: article.thumbnailUrl?.startsWith("http") ? storage.getUrl(article.thumbnailUrl) : article.thumbnailUrl || siteOgImage');
  });
});
