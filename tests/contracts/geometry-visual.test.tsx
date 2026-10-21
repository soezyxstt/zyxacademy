import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { geometry2dVisualSpecSchema, sourceFigureVisualSpecSchema, visualSpecSchema } from "@/lib/materials/visual-contract";
import { sanitizeVisualSpec } from "@/lib/articles/structured-read-model";
import { geometryProjection, Geometry2dVisual } from "@/components/course/geometry-2d-visual";
import { VISUAL_CAPABILITIES, UNSUPPORTED_VISUAL_CAPABILITIES, visualCapabilityFor } from "@/lib/materials/visual-capabilities";
import { geometryVisualFixture } from "@/tests/fixtures/product-learning/geometry-visual";

describe("typed 2D geometry", () => {
 test("accepts bounded typed shapes and sanitizes the same contract", () => {
  expect(visualSpecSchema.parse(geometryVisualFixture)).toEqual(geometryVisualFixture);
  expect(sanitizeVisualSpec(geometryVisualFixture)).toEqual(geometryVisualFixture);
  expect(visualCapabilityFor(geometryVisualFixture)).toBe(VISUAL_CAPABILITIES.geometry_2d);
  expect(UNSUPPORTED_VISUAL_CAPABILITIES).toContain("implicit_plot");
 });
 test("uses exactly one scale for unequal numeric bounds", () => {
  const p = geometryProjection({ xMin: -20, xMax: 20, yMin: -2, yMax: 2 });
  expect(p.x(1) - p.x(0)).toBeCloseTo(p.y(0) - p.y(1));
  expect(p.x(0)).toBe(300);
  expect(p.y(0)).toBe(200);
 });
 test("rejects executable payloads, missing refs, duplicate IDs, unbounded shapes and invalid numeric geometry", () => {
  const base = geometryVisualFixture;
  const rejected = [
    { ...base, geometry: { ...base.geometry, script: "alert(1)" } },
    { ...base, geometry: { ...base.geometry, segments: [{ id: "s", from: "A", to: "missing" }] } },
    { ...base, geometry: { ...base.geometry, circles: [{ id: "A", center: "O", radius: 2 }] } },
    { ...base, geometry: { ...base.geometry, circles: [{ id: "c", center: "O", radius: 100 }] } },
    { ...base, geometry: { ...base.geometry, points: [{ id: "p", x: Infinity, y: 0 }] } },
    { ...base, geometry: { ...base.geometry, points: Array.from({ length: 101 }, (_, i) => ({ id: `p${i}`, x: 0, y: 0 })) } },
    { ...base, geometry: { ...base.geometry, polygons: [{ id: "p", pointIds: ["A", "B", "B"] }] } },
    { ...base, bounds: { xMin: 1e9, xMax: 1e9 + 1e-7, yMin: 0, yMax: 1 } },
    { ...base, description: "<script>alert(1)</script>" },
  ];
  for (const payload of rejected) expect(geometry2dVisualSpecSchema.safeParse(payload).success).toBe(false);
 });
 test("renders all labels mathematically and always includes accessible fallback", () => {
  const html = renderToStaticMarkup(<Geometry2dVisual spec={geometryVisualFixture} />);
  expect(html).toContain('data-geometry-id="triangle"');
  expect(html).toContain('data-geometry-label="height"');
  expect(html).toContain('class="katex"');
  expect(html).not.toContain("katex-error");
  expect(html).toContain("Koordinat menentukan");
  expect(html).toContain("<table");
 });
 test("source figures persist immutable identity instead of expiring URLs or authored markup", () => {
  const figure = { id: "source", kind: "source_figure", label: "Diagram sumber", description: "Hubungan gaya pada benda.", assetId: "a".repeat(64), materialId: "material", sourceChecksum: "b".repeat(64), staticFallback: { type: "text", summary: "Gaya searah sumbu.", content: "$F_x=F$" } };
  expect(sourceFigureVisualSpecSchema.safeParse(figure).success).toBe(true);
  expect(sourceFigureVisualSpecSchema.safeParse({ ...figure, url: "https://example.com/a.png" }).success).toBe(false);
  expect(sourceFigureVisualSpecSchema.safeParse({ ...figure, assetId: "unknown" }).success).toBe(false);
 });
});
