import { describe, expect, test } from "bun:test";
import { parseCanonicalMarkdown } from "@/lib/markdown-compiler";

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
});
