import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

describe("Site metadata and Open Graph contract", () => {
  it("verifies public/og-image.png exists and is non-empty", () => {
    const ogImagePath = path.resolve(process.cwd(), "public/og-image.png");
    expect(existsSync(ogImagePath)).toBe(true);
    const stats = statSync(ogImagePath);
    expect(stats.size).toBeGreaterThan(1000);
  });

  it("verifies app/layout.tsx configures openGraph and twitter cards with /og-image.png", () => {
    const layoutPath = path.resolve(process.cwd(), "app/layout.tsx");
    const content = readFileSync(layoutPath, "utf8");

    // Must define Open Graph image pointing to /og-image.png with width and height
    expect(content).toContain('url: "/og-image.png"');
    expect(content).toContain("width: 1200");
    expect(content).toContain("height: 630");

    // Must define Twitter summary_large_image pointing to /og-image.png
    expect(content).toContain('card: "summary_large_image"');
    expect(content).toContain('images: ["/og-image.png"]');
  });

  it("verifies blog detail page falls back to /og-image.png when no article thumbnail exists", () => {
    const blogPagePath = path.resolve(process.cwd(), "app/(marketing)/blog/[slug]/page.tsx");
    const content = readFileSync(blogPagePath, "utf8");

    expect(content).toContain('url: "/og-image.png"');
    expect(content).toContain('images: article.thumbnailUrl ? [article.thumbnailUrl] : ["/og-image.png"]');
  });
});
