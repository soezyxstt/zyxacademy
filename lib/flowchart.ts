import { z } from "zod";

export const FlowchartNodeKindSchema = z.enum(["start", "end", "input", "output", "process", "decision"]);
export type FlowchartNodeKind = z.infer<typeof FlowchartNodeKindSchema>;

/** Explicit semantics win. Conservative inference keeps older saved diagrams readable. */
export function resolveFlowchartKind(node: { label: string; kind?: FlowchartNodeKind }): FlowchartNodeKind {
  if (node.kind) return node.kind;
  const label = node.label.trim().replace(/^["']|["']$/g, "");
  if (/^(mulai|start|begin)$/i.test(label)) return "start";
  if (/^(selesai|akhir|end|stop|finish)$/i.test(label)) return "end";
  if (/^(baca|masukkan|input|read)\b/i.test(label)) return "input";
  if (/^(tampilkan|cetak|keluarkan|output|print|display)\b/i.test(label)) return "output";
  if (/\?$/.test(label) || /^(apakah|jika|if)\b/i.test(label)) return "decision";
  return "process";
}

export function flowchartNodeSize(kind: FlowchartNodeKind, label = "") {
  const lines = Math.ceil(label.length / (kind === "decision" ? 12 : 18));
  const base = kind === "decision" ? 112 : kind === "start" || kind === "end" ? 56 : 80;
  return { width: 184, height: Math.max(base, (lines * 20 + 16) * (kind === "decision" ? 2 : 1)) };
}

export const FLOWCHART_SYMBOL_INSTRUCTIONS = "For flowchart nodes, explicitly set kind to start, end, input, output, process, or decision. Use start/end terminators, input/output parallelograms, process rectangles, and decision diamonds. Include start/end for a complete algorithm. Conditions and loop checks are decision nodes with labeled outgoing branches (Ya/Tidak or Benar/Salah); connect loop-back edges to the condition. Do not invent a decision when the algorithm has no branch.";
