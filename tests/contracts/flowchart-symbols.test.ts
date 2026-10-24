import { describe, expect, test } from "bun:test";
import { resolveFlowchartKind } from "@/lib/flowchart";
import { CanvasSpecSchema, canvasToLegacyVisualSpec } from "@/lib/zyra/canvas";
import { serializeVisualSpec } from "@/lib/tutor/visual-serializer";
import { parseCanonicalMarkdown } from "@/lib/markdown-compiler";

const canvas = {
  version: "zyra-learning-canvas-v1", type: "flowchart", title: "Jumlah positif",
  purpose: "Memeriksa alur keputusan.", variables: [], controls: [], claimRefs: [],
  altText: "Baca bilangan lalu pilih keluaran sesuai tanda bilangan.", direction: "down",
  nodes: [
    { id: "a", label: "Mulai", kind: "start" },
    { id: "b", label: "Baca n", kind: "input" },
    { id: "c", label: "n > 0?", kind: "decision" },
    { id: "d", label: "Tampilkan n", kind: "output" },
    { id: "e", label: "Selesai", kind: "end" },
  ],
  edges: [{ source: "a", target: "b" }, { source: "b", target: "c" }, { source: "c", target: "d", label: "Ya" }, { source: "c", target: "e", label: "Tidak" }, { source: "d", target: "e" }],
  fallback: { summary: "Tampilkan bilangan jika positif.", columns: [{ id: "step", label: "Langkah" }], rows: [["Baca n"]] },
};

describe("flowchart semantic symbols", () => {
  test("preserves typed kinds and rejects arbitrary shapes", () => {
    const parsed = CanvasSpecSchema.parse(canvas);
    expect(parsed.type === "flowchart" && parsed.nodes[2].kind).toBe("decision");
    expect(CanvasSpecSchema.safeParse({ ...canvas, nodes: [{ ...canvas.nodes[0], kind: "html" }, ...canvas.nodes.slice(1)] }).success).toBe(false);
  });

  test("retains old diagrams and gives explicit semantics priority over label inference", () => {
    expect(CanvasSpecSchema.safeParse({ ...canvas, nodes: canvas.nodes.map(({ kind, ...node }) => node) }).success).toBe(true);
    expect(resolveFlowchartKind({ label: "Mulai" })).toBe("start");
    expect(resolveFlowchartKind({ label: "Baca n" })).toBe("input");
    expect(resolveFlowchartKind({ label: "Tampilkan n" })).toBe("output");
    expect(resolveFlowchartKind({ label: "n > 0?" })).toBe("decision");
    expect(resolveFlowchartKind({ label: "total = total + n" })).toBe("process");
    expect(resolveFlowchartKind({ label: "Input tersedia?", kind: "decision" })).toBe("decision");
  });

  test("roundtrips kinds and branch labels through the legacy Markdown path", () => {
    const spec = CanvasSpecSchema.parse(canvas);
    const legacy = canvasToLegacyVisualSpec(spec)!;
    expect(legacy.relationships[0].sourceNode).toBe("Mulai");
    const markdown = serializeVisualSpec(legacy)!;
    expect(markdown).toContain('"Baca n" [input]');
    const block = parseCanonicalMarkdown(markdown).find(item => item.type === "visual");
    if (!block || block.type !== "visual") throw new Error("FLOWCHART_MISSING");
    expect(block.data.nodes.map((node: { kind: string }) => node.kind)).toEqual(["start", "input", "decision", "output", "end"]);
    expect(block.data.edges.filter((edge: { label?: string }) => edge.label).map((edge: { label: string }) => edge.label)).toEqual(["Ya", "Tidak"]);
    expect(block.data.nodes.some((node: { label: string }) => node.label.includes("[decision]"))).toBe(false);
  });
});
