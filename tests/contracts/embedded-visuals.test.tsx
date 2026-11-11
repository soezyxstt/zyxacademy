import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { compileMarkdown } from "@/lib/markdown-compiler";
import { MAX_EMBEDDED_VISUAL_LENGTH, parseEmbeddedVisual } from "@/lib/materials/embedded-visuals";
import { geometryVisualFixture } from "../fixtures/product-learning/geometry-visual";
import { LIMIT_EPSILON_DELTA_GRAPH } from "../fixtures/product-learning/limit-epsilon-delta";

const embed = (payload: unknown) => `\n\n\`\`\`zyx-visual\n${JSON.stringify(payload)}\n\`\`\`\n\n`;

describe("shared learning content visuals", () => {
  test("validates the existing typed geometry and epsilon-delta contracts", () => {
    expect(parseEmbeddedVisual(JSON.stringify(geometryVisualFixture))).toEqual(geometryVisualFixture);
    expect(parseEmbeddedVisual(JSON.stringify(LIMIT_EPSILON_DELTA_GRAPH))?.kind).toBe("epsilon_delta_graph");
  });

  test("rejects malformed, executable, unknown and oversized payloads", () => {
    for (const source of ["", "{", "null", "[]", '{"kind":"custom_html","html":"<script>alert(1)</script>"}',
      JSON.stringify({ ...geometryVisualFixture, description: "<script>alert(1)</script>" }),
      JSON.stringify({ ...geometryVisualFixture, geometry: { ...geometryVisualFixture.geometry, script: "alert(1)" } }),
      " ".repeat(MAX_EMBEDDED_VISUAL_LENGTH) + JSON.stringify(geometryVisualFixture),
    ]) expect(parseEmbeddedVisual(source)).toBeNull();
  });

  test("compiler preserves hyphenated fence languages and surrounding reading order", () => {
    const blocks = compileMarkdown(`Sebelum${embed(geometryVisualFixture)}Sesudah`).ast.blocks;
    expect(blocks.map(block => block.type)).toEqual(["p", "code", "p"]);
    expect(blocks[1]).toMatchObject({ language: "zyx-visual", content: JSON.stringify(geometryVisualFixture) });
    expect(compileMarkdown("```desmos-graph\nx^2\n```").ast.blocks[0]).toMatchObject({ language: "desmos-graph" });
  });

  test("renders visuals in order with accessible fallback and keeps repeated embeds", () => {
    const html = renderToStaticMarkup(<MarkdownRenderer content={`Sebelum${embed(geometryVisualFixture)}Di tengah${embed(geometryVisualFixture)}Sesudah`} />);
    expect(html.match(/data-learning-visual/g)).toHaveLength(2);
    expect(html).toContain('data-geometry-id="triangle"');
    expect(html).toContain("Koordinat menentukan");
    expect(html.indexOf("Sebelum")).toBeLessThan(html.indexOf("data-learning-visual"));
    expect(html.lastIndexOf("data-learning-visual")).toBeLessThan(html.indexOf("Sesudah"));
    expect(html).not.toContain('"kind":"geometry_2d"');
  });

  test("invalid visuals recover locally without exposing their JSON or hiding other content", () => {
    const html = renderToStaticMarkup(<MarkdownRenderer content={`Sebelum${embed({ privateData: "should-not-be-shown" })}Sesudah${embed(geometryVisualFixture)}`} />);
    expect(html).toContain("data-content-visual-error");
    expect(html).toContain("Sebelum");
    expect(html).toContain("Sesudah");
    expect(html).toContain('data-geometry-id="triangle"');
    expect(html).not.toContain("should-not-be-shown");
  });

  test("ordinary JSON fences remain code", () => {
    const html = renderToStaticMarkup(<MarkdownRenderer content={'```json\n{"kind":"geometry_2d"}\n```'} />);
    expect(html).not.toContain("data-learning-visual");
    expect(html).toContain("<pre");
  });
});
