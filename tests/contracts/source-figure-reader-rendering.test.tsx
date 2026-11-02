import { describe, expect, test } from "bun:test";
import { renderWithMessages } from "../helpers/render-with-messages";
import { ProductLearningVisual } from "@/components/course/product-learning-visual";
import { sanitizeVisualSpec, type PublicSourceFigureVisualSpec } from "@/lib/articles/structured-read-model";

const raw = { id: "source", kind: "source_figure", label: "Diagram sumber", description: "Panjang $r=2$.", assetId: "a".repeat(64), materialId: "material", sourceChecksum: "b".repeat(64), captionMarkdown: "Luas $\\pi r^2$.", staticFallback: { type: "text", summary: "Lingkaran berjari-jari $2$.", content: "Luas $4\\pi$." } };

describe("source figure public renderer", () => {
 test("unresolved figures render mathematical accessible fallback without a network image", () => {
  const figure = sanitizeVisualSpec(raw);
  if (figure?.kind !== "source_figure") throw Error("fixture invalid");
  const html = renderWithMessages(<ProductLearningVisual spec={figure} />);
  expect(html).toContain("Gambar belum tersedia.");
  expect(html).toContain('class="katex"');
  expect(html).not.toContain("<img");
  expect(html).not.toContain("katex-error");
 });
 test("trusted image uses defensive QuestionImage and keeps attribution without a repeated caption", () => {
  const parsed = sanitizeVisualSpec(raw);
  if (parsed?.kind !== "source_figure") throw Error("fixture invalid");
  const figure: PublicSourceFigureVisualSpec = { ...parsed, asset: { assetId: raw.assetId, imageUrl: "/api/courses/c/articles/a/source-figures/source", attribution: "Sumber berizin", width: 640, height: 480 } };
  const html = renderWithMessages(<ProductLearningVisual spec={figure} />);
  expect(html).toContain('src="/api/courses/c/articles/a/source-figures/source"');
  expect(html).toContain('aria-label="Perbesar gambar diagram"');
  expect(html).toContain("Sumber berizin");
  expect(html.match(/<figcaption/g)?.length).toBe(1);
  expect(html).not.toContain(raw.sourceChecksum);
 });
});
