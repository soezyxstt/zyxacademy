import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductLearningVisual } from "@/components/course/product-learning-visual";
import { Geometry2dVisual } from "@/components/course/geometry-2d-visual";
import { LearningCanvasRenderer } from "@/components/course/learning-canvas/learning-canvas-renderer";
import { sanitizeVisualSpec } from "@/lib/articles/structured-read-model";
import { CanvasSpecSchema } from "@/lib/zyra/canvas/contracts";
import { geometryVisualFixture } from "@/tests/fixtures/product-learning/geometry-visual";

const fallback = { type: "table" as const, summary: "Presisi desimal.", headers: ["Nilai"], rows: [["1.700e-999"], ["1.7e999"]] };
function assertExact(html: string) {
  expect(html).toContain(String.raw`1.700\times 10^{-999}`);
  expect(html).toContain(String.raw`1.7\times 10^{999}`);
  expect(html).not.toContain("katex-error");
}
test("reader source, geometry and canvas tables preserve exponent literals outside numeric range", () => {
  const figure = sanitizeVisualSpec({ id: "source", kind: "source_figure", label: "Figure", description: "Source figure.", assetId: "a".repeat(64), materialId: "material", sourceChecksum: "b".repeat(64), staticFallback: fallback });
  const geometry = sanitizeVisualSpec({ ...geometryVisualFixture, staticFallback: fallback });
  if (figure?.kind !== "source_figure" || geometry?.kind !== "geometry_2d") throw new Error("Invalid fixture");
  assertExact(renderToStaticMarkup(<ProductLearningVisual spec={figure} />));
  assertExact(renderToStaticMarkup(<Geometry2dVisual spec={geometry} />));
  const table = CanvasSpecSchema.parse({ version: "zyra-learning-canvas-v1", type: "table", title: "Scientific data", purpose: "Preserve exact literal data.", altText: "Exact coefficient and exponent.", variables: [], controls: [], claimRefs: [], fallback: { summary: "Exact decimal values.", columns: [{ id: "value", label: "Value" }], rows: fallback.rows }, rows: fallback.rows });
  assertExact(renderToStaticMarkup(<LearningCanvasRenderer spec={table} />));
});
