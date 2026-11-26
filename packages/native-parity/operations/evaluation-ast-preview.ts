import {
  ChartVisualDataSchema,
  FlowchartDiagramVisualDataSchema,
  GraphVisualDataSchema,
  type ASTBlock,
} from "../../../lib/ast-validator";
import type { z } from "zod";
import { FlowchartNodeKindSchema } from "../../../lib/flowchart";
import { FunctionPlotCanvasSchema, LEARNING_CANVAS_VERSION } from "../../../lib/zyra/canvas/contracts";
import { compileSafeExpression, normalizeLegacyGraphExpression } from "../../../lib/zyra/canvas/expression";
import { createPreviewDiagram } from "./admin-markdown-preview";

const bullets = (items: string[]) => items.map(item => `- ${item}`).join("\n");
const math = (formula: string) => `$$\n${formula.trim().replace(/^\$\$?|\$\$?$/g, "")}\n$$`;
const section = (title: string | undefined, ...body: Array<string | undefined>) =>
  [title ? `### ${title}` : undefined, ...body].filter(Boolean).join("\n\n");

function tableCell(value: string | number) {
  return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

export function evaluationPreviewTable(headers: string[], rows: Array<Array<string | number>>, align?: Array<"left" | "right" | "center">) {
  const line = (cells: Array<string | number>) => `| ${cells.map(tableCell).join(" | ")} |`;
  return [
    line(headers),
    line(headers.map((_, index) => ({ left: ":---", right: "---:", center: ":---:" }[align?.[index] ?? "left"]))),
    ...rows.map(row => line(headers.map((_, index) => row[index] ?? ""))),
  ].join("\n");
}

function chartNumber(value: string | number | undefined) {
  if (value === undefined || (typeof value === "string" && !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function chartPreviewRows(chart: z.infer<typeof ChartVisualDataSchema>, limit: number) {
  const { chartType, data } = chart;
  return data.slice(0, limit).map(row => {
    const x = chartType === "scatter" ? chartNumber(row[0]) : row[0];
    const y = chartNumber(row[1]);
    if (x === undefined || x === null || (typeof x === "string" && !x.trim()) || y === null || (chartType === "pie" && y < 0)) return null;
    if (chartType !== "box") return { x, y, box: [] };
    const values = [1, 2, 3, 4, 5].map(index => chartNumber(row[index]));
    if (!values.every(value => value !== null)) return null;
    if (values.some((value, index) => index > 0 && value < values[index - 1])) return null;
    return { x, y, box: values };
  });
}

export function previewFunctionPlot(
  { functions, domain, samples }: z.infer<typeof GraphVisualDataSchema>,
  locale: "en" | "id",
  authoredTitle?: string,
) {
  if (functions.length < 1 || functions.length > 6) return;
  const label = locale === "en" ? "Function graph" : "Grafik fungsi";
  const title = authoredTitle?.trim().slice(0, 160);
  const series = functions.map((formula, index) => ({
    id: `series${index + 1}`, label: formula.trim().slice(0, 120), expression: normalizeLegacyGraphExpression(formula),
  }));
  try {
    for (const item of series) compileSafeExpression(item.expression, { variables: ["x"] });
  } catch {
    return;
  }
  const spec = FunctionPlotCanvasSchema.safeParse({
    type: "function_plot", version: LEARNING_CANVAS_VERSION,
    title: title && title.length >= 3 ? title : label,
    domain: { ...domain, sampleCount: Math.min(400, Math.max(2, samples)) },
    series,
    purpose: label, altText: `${label}. ${functions.join(", ")}`.slice(0, 500),
    fallback: { summary: label, columns: [{ id: "formula", label: locale === "en" ? "Formula" : "Rumus" }], rows: functions.map(formula => [formula]) },
  });
  if (spec.success) return spec.data;
}

export function evaluationBlockMarkdown(block: ASTBlock, locale: "en" | "id"): string | undefined {
  const en = locale === "en";
  switch (block.type) {
    case "p": return block.content;
    case "h": return `${"#".repeat(block.level)} ${block.content}`;
    case "list": return block.items.map((item, index) => `${item.ordered ? `${index + 1}.` : "-"} ${item.text}`).join("\n");
    case "blockquote": return block.content.split("\n").map(line => `> ${line}`).join("\n");
    case "table": return evaluationPreviewTable(block.headers, block.rows, block.alignments);
    case "code": {
      const fence = "`".repeat(Math.max(3, ...Array.from(block.content.matchAll(/`+/g), match => match[0].length + 1)));
      const language = /^[\w+-]*$/.test(block.language ?? "") ? block.language ?? "" : "";
      return `${fence}${language}\n${block.content}\n${fence}`;
    }
    case "hr": return "---";
    case "learning_objective": return section(en ? "Learning objectives" : "Tujuan pembelajaran", bullets(block.content.objectives));
    case "concept": return section(block.content.title, block.content.bodyMarkdown);
    case "engineering_insight": return section(block.content.title, block.content.applicationMarkdown);
    case "formula": {
      const { title, latex, interpretation, derivationMarkdown, symbols, assumptions, usage } = block.content;
      const symbolTable = symbols?.length ? evaluationPreviewTable(en ? ["Symbol", "Unit", "Definition"] : ["Simbol", "Satuan", "Definisi"],
        symbols.map(symbol => [symbol.symbol, symbol.unit ?? "-", symbol.definition])) : undefined;
      return section(title, math(latex), symbolTable, interpretation, derivationMarkdown !== interpretation ? derivationMarkdown : undefined, bullets(assumptions ?? []), bullets(usage ?? []));
    }
    case "formula_reference": return section(block.content.label, math(block.content.latex));
    case "example": {
      const { problemStatement, setupCheck, solutionSteps } = block.content;
      return section(en ? "Example" : "Contoh", problemStatement,
        setupCheck && section(setupCheck.prompt, bullets(setupCheck.options ?? []), setupCheck.correctAnswer, setupCheck.explanation),
        ...solutionSteps.map(step => section(step.label, step.explanationMarkdown, step.mathProof && math(step.mathProof))));
    }
    case "misconception": return section(en ? "Misconception" : "Miskonsepsi", block.content.myth, block.content.correctionMarkdown, block.content.physicalRationaleMarkdown);
    case "exercise": return section(en ? "Exercise" : "Latihan", block.content.questionMarkdown, bullets(block.content.options ?? []),
      block.content.evaluationParameters?.expectedUnit);
    case "summary": return section(en ? "Summary" : "Rangkuman", bullets(block.content.bullets));
    case "glossary_term": return section(block.content.term, block.content.definition);
    case "warning":
    case "note": return section(block.content.title || (block.type === "warning" ? (en ? "Warning" : "Peringatan") : (en ? "Note" : "Catatan")), block.content.messageMarkdown);
    case "visual":
    case "media":
    case "image":
      return undefined;
  }
}

export function evaluationPreviewVisual(block: Extract<ASTBlock, { type: "visual" }>, locale: "en" | "id") {
  switch (block.visualType) {
    case "flowchart":
    case "diagram": {
      const parsed = FlowchartDiagramVisualDataSchema.safeParse(block.data);
      if (!parsed.success) return;
      const { nodes, edges, diagramType = "" } = parsed.data;
      const diagram = createPreviewDiagram(nodes.map(({ id, label }, index) => ({
        id, label: label.slice(0, 180), kind: FlowchartNodeKindSchema.safeParse(block.data.nodes?.[index]?.kind).data,
      })), edges, /^(?:LR|RL|RIGHT)$/i.test(diagramType) ? "right" : "down", /^(?:RL|BT)$/i.test(diagramType));
      if (diagram) return { kind: "diagram" as const, diagram };
      return;
    }
    case "graph": {
      const parsed = GraphVisualDataSchema.safeParse(block.data);
      if (!parsed.success) return;
      const spec = previewFunctionPlot(parsed.data, locale, block.title);
      if (spec) return { kind: "graph" as const, spec };
      return;
    }
    case "chart": {
      const chart = ChartVisualDataSchema.safeParse(block.data);
      if (chart.success) return { kind: "chart" as const, chart: chart.data };
    }
  }
}
