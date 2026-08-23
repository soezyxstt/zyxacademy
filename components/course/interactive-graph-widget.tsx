"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { compileSafeExpression } from "@/lib/zyra/canvas";

const SVG_W = 620;
const SVG_H = 380;
const PAD_L = 46;
const PAD_R = 18;
const PAD_T = 18;
const PAD_B = 34;
const PLOT_W = SVG_W - PAD_L - PAD_R;
const PLOT_H = SVG_H - PAD_T - PAD_B;

const X_MIN_DEFAULT = -10;
const X_MAX_DEFAULT = 10;

const ENTRY_COLORS = [
  "var(--color-brand-primary)",
  "var(--color-brand-secondary)",
  "var(--color-tertiary-1)",
  "var(--color-status-warning)",
  "var(--color-tertiary-2)",
  "var(--color-status-error)",
];

interface GraphEntry {
  id: string;
  raw: string;
}

interface ParsedPoint {
  kind: "point";
  name?: string;
  x: number;
  y: number;
}

type Compiled = ReturnType<typeof compileSafeExpression>;

const POINT_PATTERN = /^(?:([A-Za-z])\s*=\s*)?\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)$/;

let entryIdCounter = 0;
function nextEntryId(): string {
  entryIdCounter += 1;
  return `entry-${entryIdCounter}`;
}

function parsePoint(raw: string): ParsedPoint | null {
  const match = raw.trim().match(POINT_PATTERN);
  if (!match) return null;
  const x = Number(match[2]);
  const y = Number(match[3]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { kind: "point", name: match[1], x, y };
}

function niceStep(rawStep: number): number {
  const candidates = [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 25, 50, 100];
  for (const candidate of candidates) {
    if (candidate >= rawStep) return candidate;
  }
  return 200;
}

function formatTick(value: number): string {
  return String(parseFloat(value.toFixed(4)));
}

export function InteractiveGraphWidget({ initialFormula }: { initialFormula: string }) {
  const initialEntries = useMemo<GraphEntry[]>(() => {
    const lines = (initialFormula || "x^2 - 4x + 3")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    return (lines.length > 0 ? lines : ["x^2 - 4x + 3"]).map((raw) => ({
      id: nextEntryId(),
      raw,
    }));
  }, [initialFormula]);

  const [entries, setEntries] = useState<GraphEntry[]>(initialEntries);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const parsed = useMemo(
    () =>
      entries.map((entry, index) => {
        const point = parsePoint(entry.raw);
        if (point) return { entry, index, point };
        let compiled: Compiled | null = null;
        try {
          compiled = compileSafeExpression(entry.raw, { variables: ["x"] });
        } catch {
          compiled = null;
        }
        return { entry, index, compiled };
      }),
    [entries],
  );

  const yDomain = useMemo(() => {
    const values: number[] = [];
    for (const item of parsed) {
      if ("point" in item && item.point) {
        values.push(item.point.y);
        continue;
      }
      const compiled = "compiled" in item ? item.compiled : null;
      if (!compiled) continue;
      const step = (X_MAX_DEFAULT - X_MIN_DEFAULT) / 120;
      for (let i = 0; i <= 120; i++) {
        try {
          const y = compiled.evaluate({ x: X_MIN_DEFAULT + i * step });
          if (typeof y === "number" && Number.isFinite(y)) values.push(y);
        } catch {}
      }
    }
    if (values.length === 0) return { min: -8, max: 8 };
    let min = Math.min(...values);
    let max = Math.max(...values);
    const pad = (max - min) * 0.14 || 2;
    min -= pad;
    max += pad;
    if (max - min < 1) max = min + 1;
    return { min: Math.max(min, -500), max: Math.min(max, 500) };
  }, [parsed]);

  const mapX = useCallback(
    (x: number) => PAD_L + ((x - X_MIN_DEFAULT) / (X_MAX_DEFAULT - X_MIN_DEFAULT)) * PLOT_W,
    [],
  );
  const mapY = useCallback(
    (y: number) => PAD_T + ((yDomain.max - y) / (yDomain.max - yDomain.min)) * PLOT_H,
    [yDomain],
  );
  const unmapClient = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) return null;
      const sx = ((clientX - rect.left) / rect.width) * SVG_W;
      const sy = ((clientY - rect.top) / rect.height) * SVG_H;
      const x = X_MIN_DEFAULT + ((sx - PAD_L) / PLOT_W) * (X_MAX_DEFAULT - X_MIN_DEFAULT);
      const y = yDomain.min + ((sy - PAD_T) / PLOT_H) * (yDomain.max - yDomain.min);
      return {
        x: parseFloat(Math.min(X_MAX_DEFAULT, Math.max(X_MIN_DEFAULT, x)).toFixed(2)),
        y: parseFloat(Math.min(yDomain.max, Math.max(yDomain.min, y)).toFixed(2)),
      };
    },
    [yDomain],
  );

  const updatePoint = useCallback((id: string, x: number, y: number) => {
    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== id) return entry;
        const point = parsePoint(entry.raw);
        const prefix = point?.name ? `${point.name} = ` : "";
        return { ...entry, raw: `${prefix}(${x}, ${y})` };
      }),
    );
  }, []);

  const onPointPointerDown = (event: React.PointerEvent<SVGCircleElement>, id: string) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingId(id);
  };

  const onPointPointerMove = (event: React.PointerEvent<SVGCircleElement>, id: string) => {
    if (draggingId !== id) return;
    const coords = unmapClient(event.clientX, event.clientY);
    if (coords) updatePoint(id, coords.x, coords.y);
  };

  const endDrag = (event: React.PointerEvent<SVGCircleElement>) => {
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {}
    setDraggingId(null);
  };

  const curves = parsed
    .filter((item) => !("point" in item && item.point))
    .filter((item) => "compiled" in item && item.compiled)
    .map((item) => ({
      id: item.entry.id,
      color: ENTRY_COLORS[item.index % ENTRY_COLORS.length],
      compiled: (item as { compiled: Compiled }).compiled,
    }));

  const points = parsed
    .filter((item) => "point" in item && item.point)
    .map((item) => ({
      id: item.entry.id,
      color: ENTRY_COLORS[item.index % ENTRY_COLORS.length],
      label: item.entry.raw.trim().match(/^[A-Za-z]/)?.[0] ?? String.fromCharCode(65 + item.index),
      point: item.point as ParsedPoint,
    }));

  const invalidRows = entries.filter((entry) => {
    const trimmed = entry.raw.trim();
    if (trimmed.length === 0) return false;
    if (parsePoint(trimmed)) return false;
    try {
      compileSafeExpression(trimmed, { variables: ["x"] });
      return false;
    } catch {
      return true;
    }
  });

  const hasContent = curves.length > 0 || points.length > 0;
  const xStep = niceStep((X_MAX_DEFAULT - X_MIN_DEFAULT) / 10);
  const ySpan = yDomain.max - yDomain.min;
  const yStep = niceStep(ySpan / 6);

  const xTicks: number[] = [];
  for (let v = Math.ceil(X_MIN_DEFAULT / xStep) * xStep; v <= X_MAX_DEFAULT; v += xStep) xTicks.push(parseFloat(v.toFixed(4)));
  const yTicks: number[] = [];
  for (let v = Math.ceil(yDomain.min / yStep) * yStep; v <= yDomain.max; v += yStep) yTicks.push(parseFloat(v.toFixed(4)));
  const originVisible = X_MIN_DEFAULT < 0 && X_MAX_DEFAULT > 0 && yDomain.min < 0 && yDomain.max > 0;

  const addEntry = () => {
    const id = nextEntryId();
    setEntries((prev) => [...prev, { id, raw: "" }]);
    setFocusId(id);
  };

  return (
    <div className="my-6 overflow-hidden rounded-2xl border border-border bg-card shadow-md">
      <div className="border-b border-border bg-muted/30 px-3 py-1.5 flex items-center gap-2">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-primary text-white text-[10px] font-bold font-mono">f</span>
        <span className="text-body-xs font-semibold text-muted-foreground">Grafik Interaktif</span>
        <span className="text-body-xs text-muted-foreground/60 select-none">seret titik untuk mengubah nilai</span>
      </div>

      <div className="px-3 pt-2 pb-1 max-h-44 overflow-y-auto space-y-1" role="listbox" aria-label="Daftar ekspresi">
        {entries.map((entry, index) => (
          <div key={entry.id} className="flex items-center gap-2 group/row">
            <span
              aria-hidden="true"
              className="size-3.5 shrink-0 rounded-full border border-background shadow-2xs"
              style={{ backgroundColor: ENTRY_COLORS[index % ENTRY_COLORS.length] }}
            />
            <input
              ref={(element) => {
                if (element && focusId === entry.id) {
                  element.focus();
                  setFocusId(null);
                }
              }}
              value={entry.raw}
              onChange={(event) =>
                setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, raw: event.target.value } : e)))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addEntry();
                }
              }}
              placeholder={index === entries.length - 1 ? "y = x^2 atau A = (1, 2)" : ""}
              aria-label={`Ekspresi ${index + 1}`}
              spellCheck={false}
              className={`min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 font-mono text-body-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-brand-primary/40 focus:bg-background transition-colors ${
                invalidRows.some((row) => row.id === entry.id) ? "text-status-error" : ""
              }`}
            />
            <button
              type="button"
              onClick={() => setEntries((prev) => prev.filter((e) => e.id !== entry.id))}
              aria-label={`Hapus baris ${index + 1}`}
              className="shrink-0 rounded-md p-1 text-muted-foreground/0 group-hover/row:text-muted-foreground hover:!text-status-error hover:bg-muted transition-colors"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addEntry}
          className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left text-body-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
        >
          <Plus className="size-3.5 shrink-0" />
          <span>Tambah ekspresi atau titik</span>
        </button>
      </div>

      <div className="relative border-t border-border bg-zinc-50/60 dark:bg-zinc-950/30">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className={`w-full h-auto touch-none ${draggingId ? "cursor-grabbing" : ""}`}
        >
          {xTicks.map((tick) => (
            <line
              key={`gx-${tick}`}
              x1={mapX(tick)}
              y1={PAD_T}
              x2={mapX(tick)}
              y2={PAD_T + PLOT_H}
              stroke="var(--color-border)"
              strokeWidth={Math.abs(tick) < 1e-9 ? 1.4 : 0.6}
            />
          ))}
          {yTicks.map((tick) => (
            <line
              key={`gy-${tick}`}
              x1={PAD_L}
              y1={mapY(tick)}
              x2={PAD_L + PLOT_W}
              y2={mapY(tick)}
              stroke="var(--color-border)"
              strokeWidth={Math.abs(tick) < 1e-9 ? 1.4 : 0.6}
            />
          ))}
          {originVisible && (
            <>
              <line x1={mapX(0)} y1={PAD_T} x2={mapX(0)} y2={PAD_T + PLOT_H} stroke="var(--color-foreground)" strokeWidth={1.4} opacity={0.75} />
              <line x1={PAD_L} y1={mapY(0)} x2={PAD_L + PLOT_W} y2={mapY(0)} stroke="var(--color-foreground)" strokeWidth={1.4} opacity={0.75} />
            </>
          )}
          {xTicks.map((tick) =>
            Math.abs(tick) < 1e-9 ? null : (
              <text key={`xt-${tick}`} x={mapX(tick)} y={PAD_T + PLOT_H + 16} textAnchor="middle" fontSize={10} fill="var(--color-muted-foreground)">
                {formatTick(tick)}
              </text>
            ),
          )}
          {yTicks.map((tick) =>
            Math.abs(tick) < 1e-9 ? null : (
              <text key={`yt-${tick}`} x={PAD_L - 7} y={mapY(tick)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="var(--color-muted-foreground)">
                {formatTick(tick)}
              </text>
            ),
          )}

          {curves.map((curve) => {
            let path = "";
            const stepCount = 240;
            const stepSize = (X_MAX_DEFAULT - X_MIN_DEFAULT) / stepCount;
            for (let i = 0; i <= stepCount; i++) {
              const xValue = X_MIN_DEFAULT + i * stepSize;
              try {
                const yValue = curve.compiled.evaluate({ x: xValue });
                if (typeof yValue !== "number" || !Number.isFinite(yValue)) continue;
                path += `${path === "" ? "M" : "L"} ${mapX(xValue).toFixed(2)} ${mapY(yValue).toFixed(2)} `;
              } catch {}
            }
            if (path === "") return null;
            return <path key={curve.id} d={path.trim()} fill="none" stroke={curve.color} strokeWidth={2.4} strokeLinecap="round" />;
          })}

          {points.map(({ id, color, label, point }) => (
            <g key={id}>
              <circle
                cx={mapX(point.x)}
                cy={mapY(point.y)}
                r={draggingId === id ? 8 : 6}
                fill={color}
                stroke="white"
                strokeWidth={2}
                style={{ cursor: draggingId === id ? "grabbing" : "grab" }}
                onPointerDown={(event) => onPointPointerDown(event, id)}
                onPointerMove={(event) => onPointPointerMove(event, id)}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                <title>{`${label} = (${point.x}, ${point.y})`}</title>
              </circle>
              <text
                x={mapX(point.x) + 9}
                y={mapY(point.y) - 9}
                fontSize={11}
                fontWeight={700}
                fill={color}
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {label}
              </text>
            </g>
          ))}

          {!hasContent && (
            <foreignObject x={PAD_L} y={SVG_H / 2 - 34} width={PLOT_W} height={68}>
              <div className="rounded-lg border border-status-warning/30 bg-background/95 p-2.5 text-center text-body-xs text-foreground">
                Tulis fungsi seperti <code className="font-mono">x^2 - 4x + 3</code> atau titik seperti{" "}
                <code className="font-mono">A = (1, 2)</code>.
              </div>
            </foreignObject>
          )}
        </svg>
      </div>
    </div>
  );
}
