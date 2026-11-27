import { visualSpecSchema, type VisualSpec, type VisualStaticFallback } from "../../../../lib/materials/visual-contract";
import type { CanvasFallback } from "../../../../lib/zyra/canvas/contracts";

type StaticVisual = Extract<VisualSpec, { staticFallback: VisualStaticFallback }>;

export function readSolutionVisual(value: unknown): VisualSpec | null {
  const parsed = visualSpecSchema.safeParse(value);
  // Released collections do not deliver source figures.
  return parsed.success && parsed.data.kind !== "source_figure" ? parsed.data : null;
}

export function solutionFallback(visual: StaticVisual): { summary: string; content: string } | { table: CanvasFallback } {
  const fallback = visual.staticFallback;
  if (fallback.type === "table") return {
    table: { summary: fallback.summary, columns: fallback.headers.map((label, index) => ({ id: `column_${index}`, label })),
      rows: fallback.rows.map(row => row.map(String)) },
  };
  return { summary: fallback.summary, content: fallback.content };
}
