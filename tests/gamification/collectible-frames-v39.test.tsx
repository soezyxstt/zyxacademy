import { describe, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync } from "node:fs";
import { FRAME_COLLECTIONS, getFrameCollection } from "../../lib/gamification/collection-art";

mock.module("next/image", () => ({ default: ({ src, alt, width, height, className }: { src: string; alt: string; width: number; height: number; className?: string }) => createElement("img", { src, alt, width, height, className }) }));
mock.module("@/lib/utils", () => ({ cn: (...values: unknown[]) => values.filter(Boolean).join(" ") }));
const { CollectibleFrame } = await import("../../components/gamification/collectible-frame");
const portrait = createElement("img", { src: "/portrait.webp", alt: "Portrait" });

describe("collectible frame delivery and identity", () => {
  test("preserves six persisted IDs and adds exactly the four agreed frame IDs", () => {
    expect(FRAME_COLLECTIONS.map(frame => frame.id)).toEqual(["frame-classic", "frame-detailed", "frame-laurel", "frame-circuit", "frame-celestial", "frame-merah-putih", "frame-borobudur", "frame-khatulistiwa", "frame-anggrek", "frame-naga"]);
    for (const frame of FRAME_COLLECTIONS) {
      expect(existsSync(`public${frame.src}`)).toBe(true);
      expect(existsSync(`public${frame.src.replace(/webp$/, "png")}`)).toBe(true);
      expect(frame.depth).toBeLessThanOrEqual(8);
      expect(getFrameCollection(frame.id)).toBe(frame);
    }
    expect(getFrameCollection("missing")).toBeUndefined();
    expect(getFrameCollection(null)).toBeUndefined();
  });
  test("48px lists mount one artwork and no motion layers even if animation is requested", () => {
    for (const frame of FRAME_COLLECTIONS) {
      const html = renderToStaticMarkup(createElement(CollectibleFrame, { frameId: frame.id, size: 48, animated: true, children: portrait }));
      expect(html.match(/<img /g)).toHaveLength(2);
      expect(html).toContain('data-depth="false"');
      expect(html).toContain('data-running="false"');
      expect(html).not.toContain("collectible-frame__effects");
      expect(html).not.toContain("canvas");
    }
  });
  test("hero renders fixed photo independently from perspective scene and waits for loaded alpha", () => {
    const html = renderToStaticMarkup(createElement(CollectibleFrame, { frameId: "frame-naga", size: 192, animated: true, children: portrait }));
    expect(html).toContain('data-depth="true"');
    expect(html).toContain('data-running="false"');
    expect(html).toMatch(/collectible-frame__identity[^]*Portrait[^]*<\/span><span aria-hidden="true" class="collectible-frame__scene"/);
    expect(html).not.toContain("collectible-frame__effects");
  });
  test("unknown or absent frame preserves full-sized identity without decoration", () => {
    for (const frameId of [null, undefined, "unknown"]) {
      const html = renderToStaticMarkup(createElement(CollectibleFrame, { frameId, children: portrait }));
      expect(html.match(/<img /g)).toHaveLength(1);
      expect(html).toContain("inset:0");
      expect(html).not.toContain("collectible-frame__scene");
    }
  });
});
