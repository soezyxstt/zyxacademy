import React from "react";
import { sceneValue, sceneVisible, type InteractiveSceneSpec, type SceneShape, type SceneState } from "@/lib/materials/interactive-scene";
import { renderKatexToString } from "@/lib/math/katex-render";
import { splitScientificText } from "@/lib/math/text-segments";

const colors = { foreground: "var(--foreground)", primary: "var(--primary)", muted: "var(--muted-foreground)", success: "var(--color-status-success)", warning: "var(--color-status-warning)", destructive: "var(--destructive)" };
const printColors = { foreground: "#1e293b", primary: "#164e87", muted: "#475569", success: "#146b43", warning: "#854d0e", destructive: "#991b1b" };

export function SceneSvg({ spec, state, onAction, onDrag, printable = false }: {
  spec: InteractiveSceneSpec; state: SceneState; printable?: boolean;
  onAction?: (shape: SceneShape, direction?: string) => void;
  onDrag?: (shape: SceneShape, event: React.PointerEvent<SVGGElement>) => void;
}) {
  const prefix = React.useId();
  const [svg, setSvg] = React.useState<SVGSVGElement | null>(null);
  const [renderedWidth, setRenderedWidth] = React.useState(0);
  React.useEffect(() => {
    if (!svg || printable) return;
    const measure = (width: number) => { if (width > 0) setRenderedWidth(width); };
    measure(svg.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => measure(entry.contentRect.width));
    observer.observe(svg);
    return () => observer.disconnect();
  }, [svg, printable]);
  const n = (value: number | string) => sceneValue(value, state);
  const width = spec.viewBox.width / 250;
  const unitsPerPixel = renderedWidth > 0 && !printable ? spec.viewBox.width / renderedWidth : spec.viewBox.width / 455;
  const draw = (shape: SceneShape) => {
    if (!sceneVisible(shape, state)) return null;
    const color = (printable ? printColors : colors)[shape.color];
    const style = { stroke: color, strokeWidth: width, fill: shape.fill ? color : "none" };
    if (shape.type === "line") {
      const x1 = n(shape.x1), y1 = n(shape.y1), x2 = n(shape.x2), y2 = n(shape.y2);
      const angle = Math.atan2(y2 - y1, x2 - x1), length = Math.hypot(x2 - x1, y2 - y1);
      const size = Math.min(width * 5, length * 0.35);
      return <><line x1={x1} y1={y1} x2={x2} y2={y2} {...style} />{shape.arrow && size > 0 ? <path d={`M ${x2 - size * Math.cos(angle - .5)} ${y2 - size * Math.sin(angle - .5)} L ${x2} ${y2} L ${x2 - size * Math.cos(angle + .5)} ${y2 - size * Math.sin(angle + .5)}`} {...style} fill="none" /> : null}</>;
    }
    if (shape.type === "circle") { const r = n(shape.r); if (r < 0) throw new Error("SCENE_GEOMETRY_INVALID"); return <circle cx={n(shape.cx)} cy={n(shape.cy)} r={r} {...style} />; }
    if (shape.type === "rect") { const w = n(shape.width), h = n(shape.height); if (w < 0 || h < 0) throw new Error("SCENE_GEOMETRY_INVALID"); return <rect x={n(shape.x)} y={n(shape.y)} width={w} height={h} {...style} />; }
    if (shape.type === "polygon") { const points = shape.points.map(p => `${n(p.x)},${n(p.y)}`).join(" "); return shape.closed ? <polygon points={points} {...style} /> : <polyline points={points} {...style} fill="none" />; }
    if (shape.type === "path") { const d = shape.commands.map(command => command.op === "Z" ? "Z" : command.op === "C" ? `C ${n(command.x1)} ${n(command.y1)} ${n(command.x2)} ${n(command.y2)} ${n(command.x)} ${n(command.y)}` : command.op === "Q" ? `Q ${n(command.x1)} ${n(command.y1)} ${n(command.x)} ${n(command.y)}` : `${command.op} ${n(command.x)} ${n(command.y)}`).join(" "); return <path d={d} {...style} />; }
    const suffix = shape.value === undefined ? "" : ` ${Number(n(shape.value).toPrecision(6))}`;
    const segments = splitScientificText(shape.text);
    const fontSize = unitsPerPixel * 13;
    if (!segments.some(segment => segment.type === "math")) return <text x={n(shape.x)} y={n(shape.y)} fill={color} fontSize={fontSize}>{shape.text}{suffix}</text>;
    return <foreignObject x={n(shape.x)} y={n(shape.y) - fontSize * 1.2} width={fontSize * 20} height={fontSize * 3} style={{ overflow: "hidden", pointerEvents: "none" }}>
      <div xmlns="http://www.w3.org/1999/xhtml" style={{ color, display: "inline-block", fontSize: 20, lineHeight: 1.2, whiteSpace: "nowrap", transform: `scale(${fontSize / 20})`, transformOrigin: "top left", pointerEvents: shape.action && !printable ? "auto" : "none" }}>{segments.map((segment, index) => segment.type === "math" ? <span key={index} dangerouslySetInnerHTML={{ __html: renderKatexToString(segment.value, { throwOnError: false, strict: false, trust: false, maxSize: 4, maxExpand: 1000 }) }} /> : <React.Fragment key={index}>{segment.value}</React.Fragment>)}{suffix}</div>
    </foreignObject>;
  };
  let rendered: React.ReactNode[];
  try { rendered = spec.shapes.map((shape, index) => { const drawing = draw(shape); if (!drawing) return null; const drag = shape.action?.type === "drag" ? shape.action : undefined; const descriptionId = `${prefix}-drag-${index}`; return <g key={index} pointerEvents={shape.action && !printable ? "all" : "none"} role={shape.action && !printable ? drag ? "group" : "button" : undefined} tabIndex={shape.action && !printable ? 0 : undefined} aria-label={shape.action && !printable ? shape.actionLabel : undefined} aria-describedby={drag && !printable ? descriptionId : undefined} aria-keyshortcuts={drag && !printable ? "ArrowLeft ArrowRight ArrowUp ArrowDown" : undefined} className={shape.action && !printable ? "cursor-pointer focus-visible:outline focus-visible:outline-primary" : undefined} style={shape.action && !printable ? { outlineWidth: 2 * unitsPerPixel, outlineOffset: 4 * unitsPerPixel } : undefined}
      onClick={shape.action?.type !== "drag" ? () => onAction?.(shape) : undefined}
      onKeyDown={shape.action ? event => { if (shape.action?.type !== "drag" && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onAction?.(shape); } else if (shape.action?.type === "drag" && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) { event.preventDefault(); onAction?.(shape, event.key); } } : undefined}
      onPointerDown={shape.action?.type === "drag" ? event => { event.currentTarget.setPointerCapture(event.pointerId); onDrag?.(shape, event); } : undefined}
      onPointerMove={shape.action?.type === "drag" ? event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) onDrag?.(shape, event); } : undefined}>{drag && !printable ? <desc id={descriptionId}>Gunakan tombol panah untuk menggeser. {spec.parameters.filter(p => p.id === drag.xParameter || p.id === drag.yParameter).map(p => `${p.label}: ${state[p.id]}${p.unit ? ` ${p.unit}` : ""}`).join(", ")}</desc> : null}{drawing}</g>; }); }
  catch { return <p role="status" className="text-body-sm text-muted-foreground">Keadaan ini tidak dapat ditampilkan. {spec.description} Ubah nilai atau reset.</p>; }
  return <svg ref={printable ? undefined : setSvg} viewBox={`${spec.viewBox.x} ${spec.viewBox.y} ${spec.viewBox.width} ${spec.viewBox.height}`} className="block h-auto w-full" style={printable ? { width: "100%", height: "auto", overflow: "hidden" } : { overflow: "hidden", maxWidth: Math.max(480, 480 * spec.viewBox.width / spec.viewBox.height) }} role="group" aria-label={spec.label}>
    <title>{spec.label}</title><desc>{spec.description}</desc>
    {rendered}
  </svg>;
}
