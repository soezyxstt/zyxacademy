import { parseCanonicalMarkdown } from "../../../lib/markdown-compiler";
import { FlowchartNodeKindSchema, type FlowchartNodeKind } from "../../../lib/flowchart";
import type { ASTBlock } from "../../../lib/ast-validator";
import { EMBEDDED_VISUAL_LANGUAGE } from "../../../lib/materials/embedded-visuals";
import { parseMermaidToDiagramData } from "../../../lib/materials/markdown-mermaid";

type DiagramNode = { id: string; label: string; kind?: FlowchartNodeKind };
type DiagramEdge = { source: string; target: string; label?: string };
export type MarkdownDiagram = { nodes: DiagramNode[]; edges: DiagramEdge[]; direction: "down" | "right"; reverse?: boolean };
type MarkdownMedia = { src: string; caption?: string; sourceLabel?: string; sourceUrl?: string };

export type MarkdownPreviewBlock =
  | { type: "markdown"; source: string }
  | { type: "media"; media: MarkdownMedia }
  | { type: "diagram"; diagram: MarkdownDiagram | null; source: string; title?: string; caption?: string }
  | { type: "visual"; visual: Extract<ASTBlock, { type: "visual" }>; source: string }
  | { type: "code"; content: string; source: string }
  | { type: "function-widget" | "embedded-visual"; content: string; source: string };

const nodeLimit = 80;
const edgeLimit = 160;
export function createPreviewDiagram(nodes: DiagramNode[], edges: DiagramEdge[], direction: MarkdownDiagram["direction"], reverse = false): MarkdownDiagram | null {
  const ids = new Set(nodes.map(node => node.id));
  if (nodes.length === 0 || ids.size !== nodes.length || nodes.length > nodeLimit || edges.length > edgeLimit ||
    edges.some(edge => !ids.has(edge.source) || !ids.has(edge.target))) return null;
  return { nodes, edges, direction, reverse };
}

const mermaidHeader = /^(?:graph|flowchart)\s+(TD|TB|LR|BT|RL)\s*;?$/i;
const nodeToken = /^([A-Za-z0-9_-]{1,64})(?:\["([^"]{0,180})"\]|\[([^\]]{0,180})\]|\("([^"]{0,180})"\)|\(([^)]{0,180})\)|\{"([^"]{0,180})"\}|\{([^}]{0,180})\})?/;
const edgeToken = /^(?:-->\s*\|([^|]{0,180})\||--\s+(.{1,180}?)\s+-->|-->)/;

function parseMermaidFlowchart(markdown: string): MarkdownDiagram | null {
  const lines = markdown.split("\n").map(line => line.trim()).filter(line => line && !line.startsWith("%%"));
  const header = mermaidHeader.exec(lines.shift() ?? "");
  if (!header || lines.length > edgeLimit) return null;
  const nodes = new Map<string, DiagramNode>();
  const edges: DiagramEdge[] = [];
  function register(match: RegExpMatchArray) {
    const id = match[1];
    const label = match.slice(2).find(value => value !== undefined);
    const kind = match[6] !== undefined || match[7] !== undefined ? "decision" : undefined;
    if (!nodes.has(id) || label !== undefined) nodes.set(id, { id, label: label || id, kind });
    return id;
  }
  for (const line of lines) {
    let rest = line.replace(/;$/, "");
    let node = nodeToken.exec(rest);
    if (!node) return null;
    let source = register(node);
    rest = rest.slice(node[0].length).trimStart();
    while (rest) {
      const edge = edgeToken.exec(rest);
      if (!edge || edges.length >= edgeLimit) return null;
      rest = rest.slice(edge[0].length).trimStart();
      node = nodeToken.exec(rest);
      if (!node) return null;
      const target = register(node);
      edges.push({ source, target, label: (edge[1] ?? edge[2])?.trim() });
      source = target;
      rest = rest.slice(node[0].length).trimStart();
    }
  }
  const orientation = header[1].toUpperCase();
  return createPreviewDiagram([...nodes.values()], edges, ["LR", "RL"].includes(orientation) ? "right" : "down", ["RL", "BT"].includes(orientation));
}

function previewMermaid(markdown: string) {
  const flowchart = parseMermaidFlowchart(markdown);
  if (flowchart) return flowchart;
  // The web projection also accepts headerless arrows. Check that every line is an
  // arrow before using it so other Mermaid grammars or styling stay authored code.
  const lines = markdown.split("\n").map(line => line.trim()).filter(line => line && !line.startsWith("%%"));
  if (!lines.length || !lines.every(line => line.includes("-->"))) return null;
  const validated = parseMermaidFlowchart("graph LR\n" + markdown);
  if (!validated) return null;
  const { nodes, edges } = parseMermaidToDiagramData(markdown);
  return nodes.length === validated.nodes.length && edges.length === validated.edges.length
    ? createPreviewDiagram(nodes, edges, "right")
    : validated;
}

function readDirective(source: string): MarkdownPreviewBlock {
  const [block] = parseCanonicalMarkdown(source);
  if (block?.type === "media" && block.metadata) return { type: "media", media: block.metadata };
  if (block?.type === "visual" && (block.visualType === "chart" || block.visualType === "graph")) {
    return { type: "visual", visual: block, source };
  }
  if (block?.type !== "visual" || (block.visualType !== "flowchart" && block.visualType !== "diagram")) return { type: "markdown", source };
  const data = block.data as { nodes: DiagramNode[]; edges: DiagramEdge[]; diagramType?: string };
  const nodes = data.nodes.map(node => ({
    id: node.id, label: node.label.slice(0, 180),
    kind: FlowchartNodeKindSchema.safeParse(node.kind).data,
  }));
  const direction = /^(?:LR|RL|RIGHT)$/i.test(data.diagramType ?? "") ? "right" : "down";
  return { type: "diagram", source, title: block.title, caption: block.caption,
    diagram: createPreviewDiagram(nodes, data.edges, direction, /^(?:RL|BT)$/i.test(data.diagramType ?? "")) };
}

export function splitMarkdownPreview(markdown: string): MarkdownPreviewBlock[] {
  const blocks: MarkdownPreviewBlock[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let text: string[] = [];
  let size = 0;
  const flush = () => {
    const source = text.join("\n").trim();
    if (source) blocks.push({ type: "markdown", source });
    text = [];
    size = 0;
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const fence = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    const directive = /^ {0,3}:::(?:media|chart|graph|flowchart|diagram)\b/.test(line);
    if (fence) {
      const endFence = new RegExp(`^ {0,3}${fence[1][0]}{${fence[1].length},}\\s*$`);
      let end = index + 1;
      while (end < lines.length && !endFence.test(lines[end])) end++;
      const source = lines.slice(index, end + 1).join("\n");
      const language = fence[2].trim().toLowerCase();
      if (end < lines.length && language === "mermaid") {
        flush();
        blocks.push({ type: "diagram", source, diagram: source.length <= 12_000 ? previewMermaid(lines.slice(index + 1, end).join("\n")) : null });
      } else if (end < lines.length && [EMBEDDED_VISUAL_LANGUAGE, "desmos", "desmos-graph"].includes(language)) {
        flush();
        blocks.push({ type: language === EMBEDDED_VISUAL_LANGUAGE ? "embedded-visual" : "function-widget", content: lines.slice(index + 1, end).join("\n"), source });
      } else if (end < lines.length) {
        flush();
        blocks.push({ type: "code", content: lines.slice(index + 1, end).join("\n"), source });
      } else {
        text.push(source);
        size += source.length;
      }
      index = end;
    } else if (directive) {
      let end = index;
      if (!line.trimEnd().endsWith(":::")) {
        end++;
        while (end < lines.length && !/^ {0,3}:::\s*$/.test(lines[end]) && !lines[end].trimStart().startsWith(":::")) end++;
        if (end === lines.length || !/^ {0,3}:::\s*$/.test(lines[end])) end = index;
      }
      const source = lines.slice(index, end + 1).join("\n");
      flush();
      blocks.push(source.length <= 12_000 && (end > index || line.trimEnd().endsWith(":::"))
        ? readDirective(source) : { type: "markdown", source });
      index = end;
    } else {
      text.push(line);
      size += line.length + 1;
      if (!line.trim() && size >= 12_000) flush();
    }
  }
  flush();
  return blocks;
}

export const diagramNodeSize = { width: 140, height: 56 };
export function layoutMarkdownDiagram(diagram: MarkdownDiagram) {
  const groups: string[][] = [];
  const incoming = new Set(diagram.edges.map(edge => edge.target));
  const pending = new Set(diagram.nodes.map(node => node.id));
  const targets = new Map<string, string[]>();
  for (const edge of diagram.edges) {
    if (!targets.has(edge.source)) targets.set(edge.source, []);
    targets.get(edge.source)?.push(edge.target);
  }
  let queue = [...pending].filter(id => !incoming.has(id));
  while (pending.size > 0) {
    if (!queue.length) queue = [pending.values().next().value!];
    const group = [...new Set(queue)].filter(id => pending.delete(id));
    if (group.length) groups.push(group);
    queue = group.flatMap(id => targets.get(id) ?? []).filter(id => pending.has(id));
  }
  if (diagram.reverse) groups.reverse();
  const { width, height } = diagramNodeSize;
  const horizontal = diagram.direction === "right";
  const columnGap = 78;
  const rowGap = 58;
  const span = Math.max(...groups.map(group => group.length), 1);
  const columns = horizontal ? groups.length : span;
  const rows = horizontal ? span : groups.length;
  const positions = new Map<string, { x: number; y: number }>();
  groups.forEach((group, rank) => group.forEach((id, index) => {
    const aligned = index + (span - group.length) / 2;
    const column = horizontal ? rank : aligned;
    const row = horizontal ? aligned : rank;
    positions.set(id, { x: 16 + column * (width + columnGap), y: 16 + row * (height + rowGap) });
  }));
  return {
    width: 32 + columns * width + Math.max(0, columns - 1) * columnGap,
    height: 32 + rows * height + Math.max(0, rows - 1) * rowGap,
    positions,
  };
}
