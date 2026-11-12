import { renderKatexToString } from "@/lib/math/katex-render";
import { splitScientificText } from "@/lib/math/text-segments";
import { sceneValue, sceneVisible, type InteractiveSceneSpec, type SceneShape, type SceneState } from "./interactive-scene";

const colors = { foreground: "#1e293b", primary: "#164e87", muted: "#475569", success: "#146b43", warning: "#854d0e", destructive: "#991b1b" };
const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#x27;");

export function renderDiktatSceneSvg(spec: InteractiveSceneSpec, state: SceneState): string {
  const n = (value: number | string) => sceneValue(value, state);
  const width = spec.viewBox.width / 250;
  const fontSize = spec.viewBox.width / 455 * 13;
  const draw = (shape: SceneShape): string => {
    if (!sceneVisible(shape, state)) return "";
    const color = colors[shape.color];
    const style = `stroke="${color}" stroke-width="${width}" fill="${shape.fill ? color : "none"}"`;
    let content: string;
    if (shape.type === "line") {
      const x1 = n(shape.x1), y1 = n(shape.y1), x2 = n(shape.x2), y2 = n(shape.y2);
      const angle = Math.atan2(y2 - y1, x2 - x1), length = Math.hypot(x2 - x1, y2 - y1);
      const size = Math.min(width * 5, length * 0.35);
      content = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${style}></line>`;
      if (shape.arrow && size > 0) content += `<path d="M ${x2 - size * Math.cos(angle - .5)} ${y2 - size * Math.sin(angle - .5)} L ${x2} ${y2} L ${x2 - size * Math.cos(angle + .5)} ${y2 - size * Math.sin(angle + .5)}" stroke="${color}" stroke-width="${width}" fill="none"></path>`;
    } else if (shape.type === "circle") {
      const r = n(shape.r); if (r < 0) throw new Error("SCENE_GEOMETRY_INVALID");
      content = `<circle cx="${n(shape.cx)}" cy="${n(shape.cy)}" r="${r}" ${style}></circle>`;
    } else if (shape.type === "rect") {
      const w = n(shape.width), h = n(shape.height); if (w < 0 || h < 0) throw new Error("SCENE_GEOMETRY_INVALID");
      content = `<rect x="${n(shape.x)}" y="${n(shape.y)}" width="${w}" height="${h}" ${style}></rect>`;
    } else if (shape.type === "polygon") {
      const points = shape.points.map(p => `${n(p.x)},${n(p.y)}`).join(" ");
      const tag = shape.closed ? "polygon" : "polyline";
      content = `<${tag} points="${points}" stroke="${color}" stroke-width="${width}" fill="${shape.closed && shape.fill ? color : "none"}"></${tag}>`;
    } else if (shape.type === "path") {
      const d = shape.commands.map(command => command.op === "Z" ? "Z" : command.op === "C" ? `C ${n(command.x1)} ${n(command.y1)} ${n(command.x2)} ${n(command.y2)} ${n(command.x)} ${n(command.y)}` : command.op === "Q" ? `Q ${n(command.x1)} ${n(command.y1)} ${n(command.x)} ${n(command.y)}` : `${command.op} ${n(command.x)} ${n(command.y)}`).join(" ");
      content = `<path d="${d}" ${style}></path>`;
    } else {
      const suffix = shape.value === undefined ? "" : ` ${Number(n(shape.value).toPrecision(6))}`;
      const segments = splitScientificText(shape.text);
      if (!segments.some(segment => segment.type === "math")) content = `<text x="${n(shape.x)}" y="${n(shape.y)}" fill="${color}" font-size="${fontSize}">${escape(shape.text)}${suffix}</text>`;
      else {
        const text = segments.map(segment => segment.type === "math" ? `<span>${renderKatexToString(segment.value, { throwOnError: false, strict: false, trust: false, maxSize: 4, maxExpand: 1000 })}</span>` : escape(segment.value)).join("");
        content = `<foreignObject x="${n(shape.x)}" y="${n(shape.y) - fontSize * 1.2}" width="${fontSize * 20}" height="${fontSize * 3}" style="overflow:hidden;pointer-events:none"><div xmlns="http://www.w3.org/1999/xhtml" style="color:${color};display:inline-block;font-size:20px;line-height:1.2;white-space:nowrap;transform:scale(${fontSize / 20});transform-origin:top left;pointer-events:none">${text}${suffix}</div></foreignObject>`;
      }
    }
    return `<g pointer-events="none">${content}</g>`;
  };
  try {
    const { x, y, width, height } = spec.viewBox;
    return `<svg viewBox="${x} ${y} ${width} ${height}" class="block h-auto w-full" style="width:100%;height:auto;overflow:hidden" role="group" aria-label="${escape(spec.label)}"><title>${escape(spec.label)}</title><desc>${escape(spec.description)}</desc>${spec.shapes.map(draw).join("")}</svg>`;
  } catch {
    return `<p role="status" class="text-body-sm text-muted-foreground">Keadaan ini tidak dapat ditampilkan. ${escape(spec.description)} Ubah nilai atau reset.</p>`;
  }
}
