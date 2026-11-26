import { expect, test } from "bun:test";
import { compileMarkdown } from "../../lib/markdown-compiler";
import { evaluationBlockMarkdown, evaluationPreviewTable, evaluationPreviewVisual } from "../../packages/native-parity/operations/evaluation-ast-preview";
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
