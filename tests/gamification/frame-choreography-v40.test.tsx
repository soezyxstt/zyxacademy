import { describe, expect, test } from "bun:test";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { FRAME_COLLECTIONS } from "../../lib/gamification/collection-art";
import { FrameChoreography } from "../../components/gamification/frame-choreography";

const required: Record<string, string[]> = {
  "frame-classic": ["satellite-alpha", "satellite-beta", "mechanical-segments"],
  "frame-detailed": ["left-wing-art", "right-wing-art", "left-feather-fan", "right-feather-fan"],
  "frame-laurel": ["curling-wave-0", "foam-current", "water-stream"],
  "frame-circuit": ["komodo-head", "komodo-jaw", "flame-ribbon-0", "ember-stream"],
  "frame-celestial": ["ceremonial-pendant-0", "carved-light-arc"],
  "frame-merah-putih": ["flag-ribbon-0", "flag-ribbon-1", "confetti-stream"],
  "frame-borobudur": ["ceremonial-relief-rays", "stupa-halo-0", "tier-radiance-0"],
  "frame-khatulistiwa": ["astrolabe-arm-east", "astrolabe-arm-west", "compass-hands"],
  "frame-anggrek": ["orchid-crown", "orchid-right", "orchid-left", "opening-petals-0"],
  "frame-naga": ["dragon-head", "dragon-tail", "serpentine-energy-body", "dragon-scale-current"],
};

describe("v40 ornament structure and safety contracts", () => {
  test("all ten masters have separate, themed moving parts and a protected photo aperture", () => {
    for (const art of FRAME_COLLECTIONS) {
      const html = renderToStaticMarkup(createElement(FrameChoreography, { art, imageUrl: art.src }));
      expect(html).toContain('data-testid="frame-choreography"');
      expect(html).toContain(`data-theme="${art.id}"`);
      for (const part of required[art.id]) expect(html).toContain(`data-part="${part}"`);
      expect(html).toContain('clip-rule="evenodd"');
      expect(html).toContain("M50 10A40 40");
      expect(html).not.toContain("<canvas");
      expect((html.match(/class="frame-part frame-particle /g) ?? []).length).toBeLessThanOrEqual(24);
      expect(html.length).toBeLessThan(16000);
    }
  });
  test("multiple instances have distinct SVG IDs and resolve every paint/clip reference locally", () => {
    const html = renderToStaticMarkup(createElement(Fragment, null, ...FRAME_COLLECTIONS.flatMap(art => [0, 1].map(n => createElement(FrameChoreography, { key: `${art.id}-${n}`, art, imageUrl: art.src })))));
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map(match => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const svg of html.split("</svg>").filter(Boolean)) {
      const local = new Set([...svg.matchAll(/ id="([^"]+)"/g)].map(match => match[1]));
      for (const match of svg.matchAll(/url\(#([^\)]+)\)/g)) expect(local.has(match[1])).toBe(true);
    }
  });
  test("shared pause and reduced-motion rules apply to all parts; base and identity never animate", () => {
    const css = readFileSync("components/gamification/frame-choreography.css", "utf8");
    const baseCss = readFileSync("components/gamification/collectible-frame.css", "utf8");
    expect(css).toContain("animation-play-state:paused!important");
    expect(css).toContain('[data-running=true] .frame-part');
    expect(css).toContain("prefers-reduced-motion:reduce");
    expect(css).toContain(".frame-choreography{display:none}");
    expect(baseCss).not.toContain("animation:");
    expect(baseCss).not.toContain("transform:");
    expect(css).toContain("overflow:hidden");
  });
});
