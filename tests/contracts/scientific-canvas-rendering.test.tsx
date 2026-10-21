import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LearningCanvasRenderer } from "@/components/course/learning-canvas/learning-canvas-renderer";
import { CanvasSpecSchema } from "@/lib/zyra/canvas/contracts";

const base = {
  version: "zyra-learning-canvas-v1", title: "Ilmiah", purpose: "Representasi matematis.",
  variables: [], controls: [], claimRefs: ["science"], altText: "Data ilmiah.",
  fallback: { summary: "Besaran $x$.", columns: [{ id: "x", label: "$x$", unit: "m" }], rows: [["$1$"]] },
};
const render = (value: object) => renderToStaticMarkup(<LearningCanvasRenderer spec={CanvasSpecSchema.parse({ ...base, ...value })} />);

describe("Scientific canvas rendering", () => {
  test("typesets chemical subscripts through mhchem", () => {
    const html = render({ type: "chemistry_reaction", reactants: [{ formula: "H2", coefficient: 2 }, { formula: "O2", coefficient: 1 }], products: [{ formula: "H2O", coefficient: 2 }] });
    expect(html).toContain('class="katex"');
    expect(html).not.toContain('class="katex-error"');
    expect(html).toContain("msub");
  });
  test("preserves vector direction and full scientific labels and units", () => {
    const html = render({ type: "vector_diagram", originLabel: "$O$", vectors: [{ id: "f", label: "Gaya resultan $\\vec F$", x: 0.0004, y: 2, unit: "N" }] });
    expect(html).toContain("marker-end");
    expect(html).toContain("Gaya resultan");
    expect(html).toContain("10^{-4}");
    expect(html).not.toContain('class="katex-error"');
  });
  test("renders authored table rows instead of unrelated fallback values", () => {
    const html = render({ type: "table", rows: [["$\\frac{2}{7}$"]] });
    expect(html).toContain("mfrac");
  });
  test("typesets strict exponent literals without rewriting identifiers", () => {
    const html = render({ type: "table", rows: [["1.7e-5"], ["ID-1.7e-5"], ["001e3"]] });
    expect(html).toContain("10^{-5}");
    expect(html).toContain("ID-1.7e-5");
    expect(html).toContain("001e3");
  });
  test("retains data quantity units and typesets tiny table values", () => {
    const html = render({ type: "data_plot", xLabel: "$t$", yLabel: "$F$", xUnit: "s", yUnit: "N", points: [{ x: 0.0002, y: 0.0004 }, { x: 0.0004, y: 0.0008 }] });
    expect(html).toContain("foreignObject");
    expect(html).toContain("10^{-4}");
    expect(html).not.toContain('class="katex-error"');
    expect(html).not.toContain("0.0004e");
    const xCoordinates = [...html.matchAll(/<circle[^>]*cx="([^"]+)"/g)].map(match => Number(match[1]));
    expect(Math.max(...xCoordinates) - Math.min(...xCoordinates)).toBeGreaterThan(100);
  });
  test("normalizes tiny vectors without erasing direction or overflowing coordinates", () => {
    const html = render({ type: "vector_diagram", vectors: [{ id: "f", label: "$\\vec F$", x: 1e-320, y: 2e-320, unit: "N" }] });
    expect(html).not.toMatch(/(?:NaN|Infinity)/);
    expect(html).toContain('x2="414.4"');
  });
  test("shows an honest resolution fallback for unsupported data ranges", () => {
    const html = render({ type: "data_plot", xLabel: "$x$", yLabel: "$y$", points: [{ x: -1e308, y: 0 }, { x: 1e308, y: 1 }] });
    expect(html).toContain("melampaui presisi numerik");
    expect(html).not.toContain("<svg");
  });
  test("keeps diagram math in naturally sized HTML nodes without SVG font scaling or truncation", () => {
    const label = "Hubungan gaya terhadap percepatan $\\vec F=m\\vec a$";
    for (const type of ["flowchart", "concept_map"]) {
      const html = render({ type, direction: "down", nodes: [{ id: "source", label }, { id: "target", label: "$a=\\frac{F}{m}$" }], edges: [{ source: "source", target: "target", label: "$m>0$" }] });
      expect(html).toContain('data-diagram-node="source"');
      expect(html).toContain("Hubungan gaya terhadap percepatan");
      expect(html).toContain("max-w-[360px]");
      expect(html).not.toContain("min-w-[560px]");
      expect(html).not.toContain('class="katex-error"');
      expect(html).toContain("grid-template-columns:repeat(1");
    }
  });
});
