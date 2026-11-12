import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseEmbeddedVisual } from "@/lib/materials/embedded-visuals";
import { visualSpecSchema } from "@/lib/materials/visual-contract";
import { initialSceneState, sceneValue, sceneVisible, setSceneParameter } from "@/lib/materials/interactive-scene";
import { SceneSvg } from "@/components/course/interactive-scene-svg";
import { stopSceneKey } from "@/components/course/interactive-scene-renderer";
import { buildDiktatVisualSnapshot, renderDiktatStaticVisual } from "@/lib/materials/diktat-static-visual";
import { sanitizeDemoArticle, sanitizeDemoMarkdown } from "@/lib/demo/public-content-sanitizer";
import type { PublicArticleReadModel } from "@/lib/articles/structured-read-model";
import { machine, motion } from "../visual/fixtures/interactive-scene-data";

const payload = {
  id: "mechanism", kind: "interactive_scene", label: "Batang", description: "Batang bergerak.",
  viewBox: { x: 0, y: 0, width: 100, height: 60 },
  parameters: [
    { id: "t", label: "Waktu", min: 0, max: 10, step: 0.1, initial: 0, control: "range" },
    { id: "switch1", label: "Saklar", min: 0, max: 1, step: 1, initial: 0, control: "toggle", options: [{ value: 0, label: "Mati" }, { value: 1, label: "Hidup" }] },
    { id: "x", label: "Posisi x", min: 0, max: 100, step: 1, initial: 20, control: "range" },
    { id: "y", label: "Posisi y", min: 0, max: 60, step: 1, initial: 30, control: "range" },
  ],
  time: { parameter: "t", rate: 1 },
  shapes: [
    { type: "line", x1: 10, y1: 30, x2: "10+20*cos(t)", y2: "30+20*sin(t)", arrow: true },
    { type: "circle", cx: "x", cy: "y", r: 4, action: { type: "drag", xParameter: "x", yParameter: "y" }, actionLabel: "Pindahkan titik" },
    { type: "rect", x: 40, y: 10, width: 10, height: 10, visibleWhen: { left: "switch1", op: "eq", right: 1 }, action: { type: "cycle", parameter: "switch1" }, actionLabel: "Ubah saklar" },
    { type: "path", commands: [{ op: "M", x: 0, y: 40 }, { op: "Q", x1: 20, y1: "20+t", x: 40, y: 40 }] },
  ],
  outputs: [{ label: "Tinggi", value: "30+20*sin(t)", unit: "m" }],
  staticFallback: { type: "text", summary: "Batang pada waktu awal.", content: "Titik awal berada di kanan." },
};
const scene = () => { const parsed = visualSpecSchema.parse(payload); if (parsed.kind !== "interactive_scene") throw new Error("kind"); return parsed; };

describe("bounded interactive scenes", () => {
  test("stops scene keyboard events without preventing select keyboard behavior", () => {
    for (const [key, tagName, expectedPrevented] of [["Enter", "INPUT", true], ["Enter", "DIV", false], [" ", "INPUT", false]] as const) {
      let stopped = false, prevented = false;
      stopSceneKey({ key, target: { tagName }, stopPropagation: () => { stopped = true; }, preventDefault: () => { prevented = true; } } as unknown as React.KeyboardEvent);
      expect(stopped).toBe(true);
      expect(prevented).toBe(expectedPrevented);
    }
  });
  test("fixture scenes retain their geometry, branches and desktop size bound", () => {
    const branch = visualSpecSchema.parse(machine("fixture", "Diagram"));
    const moving = visualSpecSchema.parse(motion("moving", "Batang"));
    if (branch.kind !== "interactive_scene" || moving.kind !== "interactive_scene") throw new Error("kind");
    const initial = initialSceneState(branch);
    const left = renderToStaticMarkup(<SceneSvg spec={branch} state={initial} />);
    const right = renderToStaticMarkup(<SceneSvg spec={branch} state={setSceneParameter(branch, initial, "branch", 1)} />);
    expect(left).toContain('x2="55" y2="9"');
    expect(right).toContain('x2="55" y2="9"');
    expect(right).toContain('x2="52" y2="36"');
    const printable = renderDiktatStaticVisual(branch);
    for (const output of [left, printable]) expect(output).toContain(`font-size="${100 / 455 * 13}"`);
    expect(printable).not.toContain("focus-visible:outline");
    expect((renderToStaticMarkup(<SceneSvg spec={branch} state={setSceneParameter(branch, initial, "step", 4)} />).match(/<rect/g) ?? [])).toHaveLength(16);
    expect(renderToStaticMarkup(<SceneSvg spec={moving} state={initialSceneState(moving)} />)).toContain("max-width:600px");
    expect(moving.outputs[0].unit).toBe("m");
    expect(sceneValue(moving.outputs[0].value, initialSceneState(moving))).toBe(25);
    expect(sceneValue(moving.outputs[0].value, setSceneParameter(moving, initialSceneState(moving), "t", 3.1))).toBeCloseTo(25 * Math.cos(3.1));
    const printed = renderDiktatStaticVisual(moving);
    expect(printed).toContain('x2="75"');
    expect(printed).toContain("Koordinat x: 25 m");
    expect(printed).toContain("Ujung berada 25 m di kanan pusat.");
  });
  test("shares one contract with embedded visual and default printable state", () => {
    const spec = scene();
    expect(parseEmbeddedVisual(JSON.stringify(payload))).toEqual(spec);
    const printed = renderDiktatStaticVisual(spec);
    expect(printed).toContain("<svg"); expect(printed).toContain('x2="30"'); expect(printed).toContain('cx="20"'); expect(printed).toContain('d="M 0 40 Q 20 20 40 40"');
    expect(printed).not.toContain("foreignObject"); expect(printed).not.toContain("<script");
    expect(buildDiktatVisualSnapshot(spec)).toEqual(buildDiktatVisualSnapshot(structuredClone(spec)));
  });
  test("binds geometry and conditions to the same bounded state", () => {
    const spec = scene(), initial = initialSceneState(spec);
    expect(sceneValue("30+20*sin(t)", initial)).toBe(30);
    expect(renderToStaticMarkup(<SceneSvg spec={spec} state={initial} />)).not.toContain("<rect");
    const next = setSceneParameter(spec, setSceneParameter(spec, initial, "switch1", 1), "x", 500);
    expect(next.x).toBe(100);
    const svg = renderToStaticMarkup(<SceneSvg spec={spec} state={next} />);
    expect(svg).toContain("<rect"); expect(svg).toContain('cx="100"'); expect(svg).toContain('aria-label="Pindahkan titik"');
  });
  test("normalizes decimal steps and compares conditions at floating point precision", () => {
    const spec = scene(), initial = initialSceneState(spec);
    const next = setSceneParameter(spec, initial, "t", 0.3);
    expect(next.t).toBe(0.3);
    const condition = { ...spec.shapes[0], visibleWhen: { left: "t", op: "eq" as const, right: 0.3 } };
    expect(sceneVisible(condition, next)).toBe(true);
    expect(sceneVisible({ ...condition, visibleWhen: { left: "t+0.1", op: "eq", right: 0.4 } }, next)).toBe(true);
    expect(sceneVisible({ ...condition, visibleWhen: { left: "t+0.1", op: "ne", right: 0.4 } }, next)).toBe(false);
    expect(sceneVisible({ ...condition, visibleWhen: { left: "t", op: "ne", right: 0.300001 } }, next)).toBe(true);
    expect(sceneVisible({ ...condition, visibleWhen: { left: "t", op: "eq", right: 0.300001 } }, next)).toBe(false);
    expect(sceneVisible({ ...condition, visibleWhen: { left: 0, op: "eq", right: 1e-16 } }, next)).toBe(false);
    for (const expression of ["0.1+0.2-0.3", "-0.1-0.2+0.3", "999999.1+0.2-999999.3", "-999999.1-0.2+999999.3", "(0.1+0.2-0.3)*1000000", "(0.1+0.2-0.3)/1000000"]) {
      expect(sceneVisible({ ...condition, visibleWhen: { left: expression, op: "eq", right: 0 } }, next)).toBe(true);
      expect(sceneVisible({ ...condition, visibleWhen: { left: expression, op: "ne", right: 0 } }, next)).toBe(false);
    }
    expect(sceneVisible({ ...condition, visibleWhen: { left: "0", op: "eq", right: "1e-16" } }, next)).toBe(false);
    for (const [left, right] of [[0, 1e-16], [-1e-16, 0], [9999999, 10000000], [0, 5e-324]]) {
      expect(sceneVisible({ ...condition, visibleWhen: { left, op: "eq", right } }, next)).toBe(false);
      expect(sceneVisible({ ...condition, visibleWhen: { left, op: "ne", right } }, next)).toBe(true);
    }
    expect(() => sceneVisible({ ...condition, visibleWhen: { left: "1e8", op: "eq", right: 0 } }, next)).toThrow("SCENE_VALUE_INVALID");
    const negative = { ...spec, parameters: spec.parameters.map(p => p.id === "t" ? { ...p, min: -0.3, max: 1, step: 1e-6 } : p) };
    expect(setSceneParameter(negative, initial, "t", -0.299997).t).toBe(-0.299997);
    expect(setSceneParameter(negative, initial, "t", -2).t).toBe(-0.3);
    const tinyMin = { ...spec, parameters: spec.parameters.map(p => p.id === "t" ? { ...p, min: -5e-324, step: 1e-6 } : p) };
    expect(setSceneParameter(tinyMin, initial, "t", 1e-6).t).toBe(1e-6);
    expect(setSceneParameter(spec, initial, "t", Infinity)).toBe(initial);
    expect(setSceneParameter(spec, initial, "switch1", 0.8).switch1).toBe(1);
  });
  test("exposes two-axis handles with keyboard guidance and current coordinates", () => {
    const spec = scene(), svg = renderToStaticMarkup(<SceneSvg spec={spec} state={initialSceneState(spec)} />);
    expect(svg).toMatch(/role="group" tabindex="0" aria-label="Pindahkan titik" aria-describedby="[^"]+" aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"/);
    expect(svg).toContain("Gunakan tombol panah untuk menggeser. Posisi x: 20, Posisi y: 30");
    expect(svg).not.toContain('role="button" tabindex="0" aria-label="Pindahkan titik"');
    expect(svg).toContain("focus-visible:outline-primary");
    expect(svg).toContain(`outline-width:${2 * 100 / 455}px;outline-offset:${4 * 100 / 455}px`);
    const moved = setSceneParameter(spec, initialSceneState(spec), "x", 25);
    expect(renderToStaticMarkup(<SceneSvg spec={spec} state={moved} />)).toContain("Posisi x: 25, Posisi y: 30");
  });
  test("renders math labels through host KaTeX in interactive and printable scenes", () => {
    const parsed = visualSpecSchema.parse({ ...payload, shapes: [{ type: "text", x: 10, y: 10, text: String.raw`Sudut $\theta$`, value: "t" }] });
    if (parsed.kind !== "interactive_scene") throw new Error("kind");
    const web = renderToStaticMarkup(<SceneSvg spec={parsed} state={initialSceneState(parsed)} />);
    const printed = renderDiktatStaticVisual(parsed);
    expect(web).toContain(`transform:scale(${(100 / 455 * 13) / 20})`);
    expect(printed).toContain(`transform:scale(${(100 / 455 * 13) / 20})`);
    for (const result of [web, printed]) {
      expect(result).toContain("<foreignObject");
      expect(result).toContain('xmlns="http://www.w3.org/1999/xhtml"');
      expect(result).toContain("font-size:20px");
      expect(result).toContain("transform:scale(");
      expect(result).toContain('class="katex"');
      expect(result).toContain("<mi>θ</mi>");
      expect(result).not.toContain(String.raw`$\theta$`);
      expect(result).toContain("Sudut ");
    }
  });
  test("bounds oversized math labels in web and Diktat output", () => {
    const parsed = visualSpecSchema.parse({ ...payload, shapes: [{ type: "text", x: 10, y: 10, text: String.raw`$\rule{1000000em}{1000000em}$` }] });
    if (parsed.kind !== "interactive_scene") throw new Error("kind");
    const web = renderToStaticMarkup(<SceneSvg spec={parsed} state={initialSceneState(parsed)} />);
    for (const result of [web, renderDiktatStaticVisual(parsed)]) {
      const foreign = result.match(/<foreignObject[^>]*>/)?.[0] ?? "";
      expect(foreign).toContain('width="57.142857142857146"');
      expect(foreign).toContain('height="8.571428571428571"');
      expect(foreign).toContain("overflow:hidden");
      expect(result).toContain("border-right-width:4em");
      expect(result).toContain("border-top-width:4em");
      expect(result).not.toMatch(/(?:width|height):1000000em/);
    }
  });
  test("rejects executable, external, unbounded and invalid contracts", () => {
    for (const invalid of [
      { ...payload, description: "<script>bad()</script>" },
      { ...payload, label: "https://example.test" },
      { ...payload, parameters: [{ ...payload.parameters[0], label: "[x](/private)" }] },
      { ...payload, staticFallback: { ...payload.staticFallback, content: "![x](relative.png)" } },
      { ...payload, shapes: [{ type: "circle", cx: "globalThis.alert(1)", cy: 0, r: 1 }] },
      { ...payload, shapes: [{ type: "circle", cx: 0, cy: 0, r: 1, onClick: "alert(1)" }] },
      { ...payload, shapes: Array(101).fill(payload.shapes[0]) },
      { ...payload, parameters: [...payload.parameters, payload.parameters[0]] },
      { ...payload, time: { parameter: "missing", rate: 1 } },
    ]) expect(visualSpecSchema.safeParse(invalid).success).toBe(false);
  });
  test("renders allowed markup-like text as inert text and rejects executable structure", () => {
    const spec = visualSpecSchema.parse({ ...payload, label: "<div>hello</div>", shapes: [{ type: "text", x: 10, y: 10, text: "<div>hello</div> alert(1)", action: { type: "cycle", parameter: "switch1" }, actionLabel: 'titik" autofocus="true' }] });
    if (spec.kind !== "interactive_scene") throw new Error("kind");
    const svg = renderToStaticMarkup(<SceneSvg spec={spec} state={initialSceneState(spec)} />);
    expect(svg).toContain("&lt;div&gt;hello&lt;/div&gt;");
    expect(svg).toContain("alert(1)");
    expect(svg).not.toContain("<div>"); expect(svg).not.toContain(' autofocus="true"');
    expect(renderDiktatStaticVisual(spec)).not.toContain("<div>hello</div>");
    expect(visualSpecSchema.safeParse({ ...payload, shapes: [{ type: "path", d: 'M0 0" onload="alert(1)' }] }).success).toBe(false);
    expect(visualSpecSchema.safeParse({ ...payload, shapes: [{ type: "foreignObject", html: "<script>alert(1)</script>" }] }).success).toBe(false);
  });
  test("recovers from singular values when state is changed", () => {
    const spec = visualSpecSchema.parse({ ...payload, shapes: [{ type: "circle", cx: "1/(t-1)", cy: 10, r: 3 }] });
    if (spec.kind !== "interactive_scene") throw new Error("kind");
    const invalid = renderToStaticMarkup(<SceneSvg spec={spec} state={setSceneParameter(spec, initialSceneState(spec), "t", 1)} />);
    expect(invalid).toContain("tidak dapat ditampilkan");
    expect(invalid).toContain(spec.description);
    expect(renderToStaticMarkup(<SceneSvg spec={spec} state={setSceneParameter(spec, initialSceneState(spec), "t", 2)} />)).toContain('cx="1"');
  });
  test("preserves validated demo scene expressions without preserving unsafe links", () => {
    const input = { ...payload, shapes: [{ type: "circle", cx: "1 /sqrt(t+1)", cy: 10, r: 3 }] };
    const spec = visualSpecSchema.parse(input);
    const article = { id: "article", courseId: "course", chapterId: null, slug: "article", title: "Judul", courseTitle: "Kursus", chapterTitle: null, chapterNumber: null, version: 1, totalEstimatedReadingMinutes: 1, visuals: [spec], sections: [] } as PublicArticleReadModel;
    expect(sanitizeDemoArticle(article).visuals).toHaveLength(1);
    const fence = `\`\`\`zyx-visual\n${JSON.stringify(input)}\n\`\`\``;
    expect(sanitizeDemoMarkdown(fence)).toBe(fence);
    expect(sanitizeDemoMarkdown(`Baca https://example.test\n${fence}`)).not.toContain("https://example.test");
    expect(sanitizeDemoMarkdown(fence.replace("Batang bergerak.", "https://example.test"))).not.toContain("https://example.test");
  });
});
