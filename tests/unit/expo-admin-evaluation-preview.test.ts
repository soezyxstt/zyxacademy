import { expect, test } from "bun:test";
import { compileMarkdown } from "../../lib/markdown-compiler";
import { chartPreviewRows, evaluationBlockMarkdown, evaluationPreviewTable, evaluationPreviewVisual } from "../../packages/native-parity/operations/evaluation-ast-preview";
import { DEMO_TEMPLATES } from "../../packages/native-parity/operations/evaluation-ast-templates";

test("signed AST Inspector can display compiled pedagogy, formulas and tables", () => {
  const { ast } = compileMarkdown(DEMO_TEMPLATES.standard, "chapter", "course");
  const content = ast.blocks.map(block => evaluationBlockMarkdown(block, "id")).join("\n");
  expect(content).toContain("Tujuan pembelajaran");
  expect(content).toContain("Definisi Limit");
  expect(content).toContain("$$\n\\lim_{x \\to c} f(x) = L\n$$");
  expect(content).toContain("| Simbol | Satuan | Definisi |");
  expect(evaluationPreviewTable(["X"], [["a|b\nc"]], ["right"]))
    .toBe("| X |\n| ---: |\n| a\\|b c |");
});

test("signed AST Inspector passes the canonical demo diagram to the native diagram renderer", () => {
  const { ast } = compileMarkdown(DEMO_TEMPLATES.visual, "chapter", "course");
  const block = ast.blocks.find(block => block.type === "visual");
  if (!block || block.type !== "visual") throw new Error("Expected a compiled visual.");
  const visual = evaluationPreviewVisual(block, "id");
  expect(visual?.kind).toBe("diagram");
  if (visual?.kind === "diagram") {
    expect(visual.diagram.nodes).toHaveLength(3);
    expect(visual.diagram.edges).toHaveLength(3);
  }
});

test("graph preview preserves authored domain and uses the bounded safe-expression plot", () => {
  expect(evaluationPreviewVisual({
    id: "graph-1", type: "visual", globalOrderIndex: 0, visualType: "graph", version: 1, metadata: {},
    title: "y", data: { functions: ["y = x^2"], domain: { min: -5, max: 5 }, samples: 1000 },
  }, "en")).toMatchObject({
    kind: "graph",
    spec: { domain: { min: -5, max: 5, sampleCount: 400 }, series: [{ expression: "x^2" }] },
  });
});

test("native charts plot zero, leave gaps for absent readings and require actual box statistics", () => {
  expect(chartPreviewRows({ chartType: "line", data: [["A", 0], ["B", ""], ["C"], ["D", "invalid"], ["E", "2.5"]] }, 20))
    .toEqual([{ x: "A", y: 0, box: [] }, null, null, null, { x: "E", y: 2.5, box: [] }]);
  expect(chartPreviewRows({ chartType: "box", data: [["A", 4], ["B", 1, 2, 3, 4, 5], ["C", 1, 2, 4, 3, 5]] }, 20))
    .toEqual([null, { x: "B", y: 1, box: [1, 2, 3, 4, 5] }, null]);
  expect(chartPreviewRows({ chartType: "scatter", data: [["", 4], ["0", 0]] }, 20))
    .toEqual([null, { x: 0, y: 0, box: [] }]);
});
