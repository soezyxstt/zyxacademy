import { createHash } from "node:crypto";
import katex from "@/lib/math/katex";
import { splitScientificText } from "@/lib/math/text-segments";
import { scientificNumberToLatex, scientificLiteralToLatex } from "@/lib/math/scientific-format";
import { evaluateFunctionPlot, safeExpressionToLatex, type FunctionPlotCanvas } from "@/lib/zyra/canvas";
import { fitNumericRange } from "@/lib/zyra/canvas/viewport";
import { deriveEpsilonDelta, sampleEpsilonDeltaCurve } from "./epsilon-delta";
import { visualSpecSchema, type VisualSpec } from "./visual-contract";

export const DIKTAT_STATIC_VISUAL_RENDERER = "zyx-static-visual-v1";
export interface DiktatSourceFigureAsset { bytes: Uint8Array; mimeType: "image/png" | "image/jpeg"; sourceChecksum: string; attribution?: string }
export type DiktatSourceFigureAssets = Readonly<Record<string, DiktatSourceFigureAsset>>;
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const math = (latex: string) => katex.renderToString(latex, { throwOnError: true, trust: false, output: "htmlAndMathml" });
const quantityLabel = (label: string, unit?: string | null) => prose(label) + (unit ? `&nbsp;${math(`\\left[\\pu{${unit}}\\right]`)}` : "");
const quantityValue = (value: number, unit?: string | null) => math(scientificNumberToLatex(value) + (unit ? `\\,\\pu{${unit}}` : ""));
function prose(value: string): string {
  const literal = scientificLiteralToLatex(value);
  if (literal) return math(literal);
  return splitScientificText(value).map(segment => segment.type === "math" ? math(segment.value) : escape(segment.value)).join("");
}
export function buildDiktatVisualSnapshot(input: VisualSpec) {
  const visual = visualSpecSchema.parse(input);
  const state = visual.kind === "epsilon_delta_graph" ? { epsilon: visual.defaultEpsilon, probe: visual.limitPoint }
    : visual.kind === "learning_canvas" ? Object.fromEntries(visual.canvas.variables.map(variable => [variable.id, variable.defaultValue])) : {};
  return { rendererVersion: DIKTAT_STATIC_VISUAL_RENDERER, visualHash: digest(visual), stateHash: digest(state) };
}
function label(x: number, y: number, text: string, width = 130, height = 48): string {
  return `<foreignObject x="${x}" y="${y}" width="${width}" height="${height}"><div xmlns="http://www.w3.org/1999/xhtml" style="font-size:24px;text-align:center">${text}</div></foreignObject>`;
}
const svg = (content: string, height = 300) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 ${height}" role="img" style="width:100%;height:auto">${content}</svg>`;
const colors = ["#164e87", "#af4510", "#146b43", "#7b3158", "#514900", "#334155"];
function plot(groups: { label: string; points: { x: number; y: number | null }[] }[], xLabel = math("x"), yLabel = math("y"), bounds?: { xMin: number; xMax: number; yMin: number; yMax: number }, bands?: { c: number; l: number; delta: number; epsilon: number }, functionSpec?: FunctionPlotCanvas): string {
  const points = [...groups.flatMap(group => group.points.filter((point): point is { x: number; y: number } => point.y !== null)), ...(functionSpec?.pointMarkers ?? [])];
  const xr = bounds ? { min: bounds.xMin, max: bounds.xMax } : fitNumericRange(points.map(point => point.x));
  const yr = bounds ? { min: bounds.yMin, max: bounds.yMax } : functionSpec?.yBounds ? { ...functionSpec.yBounds } : fitNumericRange(points.map(point => point.y));
  if (!xr || !yr) throw new Error("DIKTAT_VISUAL_DOMAIN_EMPTY");
  if (functionSpec?.equalAxisScale) {
    const xSpan = xr.max - xr.min, ySpan = yr.max - yr.min;
    if (xSpan / ySpan < 350 / 200) { const mid = (xr.min + xr.max) / 2; xr.min = mid - ySpan * 350 / 400; xr.max = mid + ySpan * 350 / 400; }
    else { const mid = (yr.min + yr.max) / 2; yr.min = mid - xSpan * 200 / 700; yr.max = mid + xSpan * 200 / 700; }
  }
  const px = (x: number) => 135 + (x - xr.min) / (xr.max - xr.min) * 350;
  const py = (y: number) => 240 - (y - yr.min) / (yr.max - yr.min) * 200;
  const exponent = (min: number, max: number) => { const magnitude = Math.max(Math.abs(min), Math.abs(max)); return magnitude > 0 && (magnitude < 0.01 || magnitude >= 10000) ? Math.max(-323, Math.min(308, Math.floor(Math.log10(magnitude)))) : 0; };
  const xe = exponent(xr.min, xr.max), ye = exponent(yr.min, yr.max);
  let content = bands ? `<rect x="${px(bands.c - bands.delta)}" y="40" width="${px(bands.c + bands.delta) - px(bands.c - bands.delta)}" height="200" fill="#fff1b8"/><rect x="135" y="${py(bands.l + bands.epsilon)}" width="350" height="${py(bands.l - bands.epsilon) - py(bands.l + bands.epsilon)}" fill="#dbeafe" fill-opacity=".65"/>` : "";
  for (let i = 0; i <= 2; i++) {
    const x = xr.min + i / 2 * (xr.max - xr.min), y = yr.min + i / 2 * (yr.max - yr.min);
    content += `<path d="M${px(x)} 40V240 M135 ${py(y)}H485" stroke="#d4d8de"/>`;
    content += label(px(x) - 55, 247, math(scientificNumberToLatex(x / 10 ** xe)), 110) + label(0, py(y) - 9, math(scientificNumberToLatex(y / 10 ** ye)), 130);
  }
  content += label(150, 290, xLabel, 220) + label(0, 0, yLabel, 220);
  if (xe) content += label(400, 290, math(`\\times10^{${xe}}`), 140);
  if (ye) content += label(385, 0, math(`\\times10^{${ye}}`), 130);
  groups.forEach((group, index) => {
    let path = ""; let open = false;
    for (const point of group.points) {
      if (point.y === null || point.y < yr.min || point.y > yr.max) { open = false; continue; }
      path += `${open ? "L" : "M"}${px(point.x)} ${py(point.y)} `; open = true;
    }
    content += `<path d="${path}" fill="none" stroke="${colors[index % colors.length]}" stroke-width="2"/>`;
    if (group.points.length === 1 && group.points[0].y !== null) content += `<circle cx="${px(group.points[0].x)}" cy="${py(group.points[0].y)}" r="3" fill="${colors[index % colors.length]}"/>`;
  });
  for (const marker of functionSpec?.pointMarkers ?? []) {
    if (marker.x < xr.min || marker.x > xr.max || marker.y < yr.min || marker.y > yr.max) throw new Error("DIKTAT_VISUAL_MARKER_OUTSIDE_VIEW");
    content += `<circle cx="${px(marker.x)}" cy="${py(marker.y)}" r="4" fill="${marker.kind === "open" ? "white" : "#164e87"}" stroke="#164e87"/>`;
  }
  return svg(content, 345) + `<div style="font-size:14px;line-height:1.8">${groups.filter(group => group.label).map((group, index) => `<p style="color:${colors[index % colors.length]}">${prose(group.label)}</p>`).join("")}${(functionSpec?.pointMarkers ?? []).map(marker => `<p>${prose(marker.label)}: ${math(`(${scientificNumberToLatex(marker.x)},${scientificNumberToLatex(marker.y)})`)} (${marker.kind === "open" ? "terbuka" : "tertutup"})</p>`).join("")}</div>`;
}
export function renderDiktatStaticVisual(input: VisualSpec, assets: DiktatSourceFigureAssets = {}): string {
  const visual = visualSpecSchema.parse(input), snapshot = buildDiktatVisualSnapshot(visual);
  let content: string;
  if (visual.kind === "epsilon_delta_graph") {
    const delta = deriveEpsilonDelta(visual, visual.defaultEpsilon);
    if (delta.status !== "guaranteed") throw new Error("DIKTAT_VISUAL_PRECISION_UNRESOLVED");
    const segments = sampleEpsilonDeltaCurve(visual);
    content = plot(segments.map(points => ({ label: "", points })), math("x"), math("f(x)"), visual.bounds, { c: visual.limitPoint, l: visual.limitValue, delta: delta.delta, epsilon: visual.defaultEpsilon });
    content += `<p>${math(`c=${scientificNumberToLatex(visual.limitPoint)},\\quad L=${scientificNumberToLatex(visual.limitValue)},\\quad\\varepsilon=${scientificNumberToLatex(visual.defaultEpsilon)},\\quad\\delta=${scientificNumberToLatex(delta.delta)}`)}</p><p>${math("0<|x-c|<\\delta\\implies |f(x)-L|<\\varepsilon")}</p>`;
  } else if (visual.kind === "geometry_2d") {
    const { xMin, xMax, yMin, yMax } = visual.bounds;
    const scale = Math.min(420 / (xMax - xMin), 260 / (yMax - yMin));
    const px = (x: number) => 260 + (x - (xMin + xMax) / 2) * scale;
    const py = (y: number) => 160 - (y - (yMin + yMax) / 2) * scale;
    const points = new Map(visual.geometry.points.map(point => [point.id, point]));
    const geometry = visual.geometry;
    let drawing = geometry.polygons.map(polygon => `<polygon points="${polygon.pointIds.map(id => { const point = points.get(id)!; return `${px(point.x)},${py(point.y)}`; }).join(" ")}" fill="#dbeafe" stroke="#164e87"/>`).join("");
    drawing += geometry.circles.map(circle => { const point = points.get(circle.center)!; return `<circle cx="${px(point.x)}" cy="${py(point.y)}" r="${circle.radius * scale}" fill="none" stroke="#164e87"/>`; }).join("");
    drawing += geometry.segments.map(segment => { const a = points.get(segment.from)!, b = points.get(segment.to)!; return `<path d="M${px(a.x)} ${py(a.y)}L${px(b.x)} ${py(b.y)}" stroke="#164e87"/>`; }).join("");
    drawing += geometry.points.map(point => `<circle cx="${px(point.x)}" cy="${py(point.y)}" r="3" fill="#164e87"/>${point.labelLatex ? label(px(point.x) - 45, py(point.y) + 5, math(point.labelLatex), 90) : ""}`).join("");
    content = svg(drawing, 330) + [...geometry.segments, ...geometry.circles, ...geometry.polygons].filter(shape => shape.labelLatex).map(shape => `<p>${escape(shape.id)}: ${math(shape.labelLatex!)}</p>`).join("");
  } else if (visual.kind === "source_figure") {
    const asset = assets[visual.assetId];
    if (!asset || asset.sourceChecksum !== visual.sourceChecksum) throw new Error("DIKTAT_SOURCE_FIGURE_ASSET_REQUIRED");
    const bytes = Buffer.from(asset.bytes);
    const valid = asset.mimeType === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!valid) throw new Error("DIKTAT_SOURCE_FIGURE_FORMAT_INVALID");
    content = `<img src="data:${asset.mimeType};base64,${bytes.toString("base64")}" alt="${escape(visual.description)}" style="width:100%;height:auto"/>${visual.captionMarkdown ? `<p>${prose(visual.captionMarkdown)}</p>` : ""}${asset.attribution ? `<p>${escape(asset.attribution)}</p>` : ""}`;
  } else {
    const spec = visual.canvas;
    if (spec.type === "table" && spec.rows.some(row => row.length !== spec.fallback.columns.length)) throw new Error("DIKTAT_VISUAL_TABLE_COLUMNS_INVALID");
    if ((spec.type === "flowchart" || spec.type === "concept_map") && new Set(spec.nodes.map(node => node.id)).size !== spec.nodes.length) throw new Error("DIKTAT_VISUAL_NODE_ID_DUPLICATE");
    switch (spec.type) {
      case "function_plot": {
        const units = [...new Set(spec.series.map(series => series.unit))];
        content = plot(evaluateFunctionPlot(spec).map((group, index) => ({ ...group, label: `$\\displaystyle f_{${index + 1}}(x)=${safeExpressionToLatex(spec.series[index].expression, ["x", ...spec.variables.map(variable => variable.id)])}$` })), quantityLabel("$x$", spec.domain.unit), quantityLabel("$f(x)$", units.length === 1 ? units[0] : undefined), undefined, undefined, spec); break;
      }
      case "data_plot": content = plot(spec.points.map(point => ({ label: point.label ?? "", points: [point] })), quantityLabel(spec.xLabel, spec.xUnit), quantityLabel(spec.yLabel, spec.yUnit)); break;
      case "derivation": content = spec.steps.map(step => `<p>${prose(step.label)}</p><p>${math(safeExpressionToLatex(step.expression, ["x", ...spec.variables.map(variable => variable.id)]))}</p><p>${prose(step.explanation)}</p>`).join(""); break;
      case "table": content = `<table class="diktat-table"><thead><tr>${spec.fallback.columns.map(column => `<th>${prose(column.label)}${column.unit ? math(`\\pu{${column.unit}}`) : ""}</th>`).join("")}</tr></thead><tbody>${spec.rows.map(row => `<tr>${row.map(cell => `<td>${prose(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`; break;
      case "flowchart": case "concept_map": {
        const columns = spec.direction === "down" ? 1 : 2;
        const rows = Math.ceil(spec.nodes.length / columns), positions = new Map(spec.nodes.map((node, index) => [node.id, { x: columns === 1 ? 180 : 20 + index % columns * 260, y: 20 + Math.floor(index / columns) * 160 }]));
        content = svg(`<defs><marker id="static-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8" fill="#334155"/></marker></defs>` + spec.edges.map(edge => {
          const from = positions.get(edge.source), to = positions.get(edge.target);
          if (!from || !to) throw new Error("DIKTAT_VISUAL_EDGE_MISSING");
          const dx = to.x - from.x, dy = to.y - from.y;
          if (dx === 0 && dy === 0) throw new Error("DIKTAT_VISUAL_SELF_EDGE_UNSUPPORTED");
          const scale = 1 / Math.max(Math.abs(dx) / 100, Math.abs(dy) / 50);
          return `<path d="M${from.x + 100 + dx * scale} ${from.y + 50 + dy * scale} L${to.x + 100 - dx * scale} ${to.y + 50 - dy * scale}" stroke="#334155" marker-end="url(#static-arrow)"/>`;
        }).join("") + spec.nodes.map(node => { const p = positions.get(node.id)!; return `<rect x="${p.x}" y="${p.y}" width="200" height="100" fill="white" stroke="#334155"/>${label(p.x + 5, p.y + 7, prose(node.label), 190, 88)}`; }).join(""), rows * 160 + 20);
        content += spec.edges.filter(edge => edge.label).map(edge => `<p>${prose(spec.nodes.find(node => node.id === edge.source)!.label)} ${math("\\to")} ${prose(spec.nodes.find(node => node.id === edge.target)!.label)}: ${prose(edge.label!)}</p>`).join(""); break;
      }
      case "vector_diagram": case "free_body": {
        const magnitude = Math.max(...spec.vectors.flatMap(vector => [Math.abs(vector.x), Math.abs(vector.y)])) || 1;
        content = svg(`<defs><marker id="vector-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0 0L7 3L0 6" fill="#164e87"/></marker></defs><path d="M20 150H500 M260 20V280" stroke="#cbd5e1"/>` + spec.vectors.map(vector => {
          const x = 260 + vector.x / magnitude * 120, y = 150 - vector.y / magnitude * 120;
          return `<path d="M260 150L${x} ${y}" stroke="#164e87" stroke-width="2" marker-end="url(#vector-arrow)"/>` + label(Math.max(0, Math.min(420, x + (vector.x < 0 ? -145 : 8))), Math.max(0, Math.min(250, y + (vector.y > 0 ? -10 : 8))), prose(vector.label), 140);
        }).join(""));
        content += (spec.originLabel ? `<p>${prose(spec.originLabel)}</p>` : "") + spec.vectors.map(vector => `<p>${prose(vector.label)}: ${math(`(${scientificNumberToLatex(vector.x)},${scientificNumberToLatex(vector.y)})\\,\\pu{${vector.unit}}`)}</p>`).join(""); break;
      }
      case "chemistry_reaction": content = `<p>${math(`\\ce{${spec.reactants.map(item => `${item.coefficient} ${item.formula}`).join(" + ")} -> ${spec.products.map(item => `${item.coefficient} ${item.formula}`).join(" + ")}}`)}</p>` + [...spec.reactants, ...spec.products].filter(item => item.amount !== undefined).map(item => `<p>${math(`\\ce{${item.formula}}`)}: ${quantityValue(item.amount!, item.unit)}</p>`).join(""); break;
    }
    content += spec.variables.map(variable => `<p>${prose(variable.label)}: ${math(scientificNumberToLatex(variable.defaultValue))}${variable.unit ? math(`\\pu{${variable.unit}}`) : ""}</p>`).join("");
  }
  content = content.replaceAll('id="static-arrow"', `id="static-arrow-${snapshot.visualHash}"`).replaceAll('url(#static-arrow)', `url(#static-arrow-${snapshot.visualHash})`).replaceAll('id="vector-arrow"', `id="vector-arrow-${snapshot.visualHash}"`).replaceAll('url(#vector-arrow)', `url(#vector-arrow-${snapshot.visualHash})`);
  return `<figure class="diktat-static-visual" data-visual-id="${escape(visual.id)}" data-renderer="${snapshot.rendererVersion}" data-visual-hash="${snapshot.visualHash}" data-state-hash="${snapshot.stateHash}"><figcaption>${prose(visual.label)}</figcaption>${content}<p>${prose(visual.description)}</p></figure>`;
}
