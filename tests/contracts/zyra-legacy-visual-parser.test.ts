import { describe, expect, test } from "bun:test";
import { parseCanonicalMarkdown } from "@/lib/markdown-compiler";
import { compileSafeExpression, normalizeLegacyGraphExpression } from "@/lib/zyra/canvas";

function graphData(markdown: string) {
  const block = parseCanonicalMarkdown(markdown).find((item) => item.type === "visual");
  if (!block || block.type !== "visual") throw new Error("GRAPH_NOT_PARSED");
  return block.data as { functions: string[]; domain: { min: number; max: number } };
}

describe("Zyra legacy graph compatibility", () => {
  test("parses inline arrays and inline domains", () => {
    const data = graphData(`:::graph {title="Akar fungsi kuadrat"}
functions: ["y = x^2 - 4"]
domain: { min: -5, max: 5 }
:::`);

    expect(data.functions).toEqual(["y = x^2 - 4"]);
    expect(data.domain).toEqual({ min: -5, max: 5 });
  });

  test("accepts common singular function fields", () => {
    const data = graphData(`:::graph {title="Fungsi linear"}
function: y = 2x + 1
:::`);

    expect(data.functions).toEqual(["y = 2x + 1"]);
  });

  test("keeps Zyra LaTeX graph functions renderable by the bounded parser", () => {
    const data = graphData(String.raw`:::graph {title="Fungsi trigonometri"}
functions:
  - $y = \sin(x)$
  - \(f(x) = 2\cos(\pi x)\)
:::`);

    const compiled = data.functions.map((source) => compileSafeExpression(
      normalizeLegacyGraphExpression(source),
      { variables: ["x"] },
    ));
    expect(compiled[0].evaluate({ x: Math.PI / 2 })).toBeCloseTo(1);
    expect(compiled[1].evaluate({ x: 2 })).toBeCloseTo(2);
  });
});
