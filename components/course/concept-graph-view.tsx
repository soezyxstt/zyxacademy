"use client";

/**
 * EIF E5: navigable concept graph. Nodes colored by mastery, prerequisite edges
 * drawn left to right, node click opens the E0-backed term popover. No new
 * charting library: a deterministic layered SVG layout.
 */
import { useMemo, useState } from "react";
import { TermPopover } from "@/components/course/term-popover";

export interface GraphNode {
  conceptName: string;
  mastery: number | null;
}

export interface GraphEdge {
  from: string; // prerequisite
  to: string; // dependent
}

const NODE_W = 150;
const NODE_H = 44;
const COL_GAP = 90;
const ROW_GAP = 20;
const PAD = 16;

function nodeFill(mastery: number | null): string {
  if (mastery === null) return "var(--color-muted)";
  if (mastery >= 70) return "color-mix(in oklab, var(--color-status-success) 22%, var(--color-card))";
  if (mastery >= 40) return "color-mix(in oklab, var(--color-status-warning) 22%, var(--color-card))";
  return "color-mix(in oklab, var(--color-status-error) 22%, var(--color-card))";
}

export function ConceptGraphView({
  nodes,
  edges,
  courseId,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  courseId: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const layout = useMemo(() => {
    const names = nodes.map((n) => n.conceptName);
    const nameSet = new Set(names);
    // prerequisite sources per node
    const prereqs = new Map<string, string[]>();
    for (const e of edges) {
      if (!nameSet.has(e.from) || !nameSet.has(e.to)) continue;
      const list = prereqs.get(e.to) ?? [];
      list.push(e.from);
      prereqs.set(e.to, list);
    }

    // depth = longest prerequisite chain, cycle-safe.
    const depthCache = new Map<string, number>();
    const computing = new Set<string>();
    const depthOf = (name: string): number => {
      if (depthCache.has(name)) return depthCache.get(name)!;
      if (computing.has(name)) return 0; // cycle guard
      computing.add(name);
      const ps = prereqs.get(name) ?? [];
      let d = 0;
      for (const p of ps) d = Math.max(d, depthOf(p) + 1);
      computing.delete(name);
      depthCache.set(name, d);
      return d;
    };

    const byDepth = new Map<number, string[]>();
    let maxDepth = 0;
    for (const name of [...names].sort()) {
      const d = depthOf(name);
      maxDepth = Math.max(maxDepth, d);
      const col = byDepth.get(d) ?? [];
      col.push(name);
      byDepth.set(d, col);
    }

    const pos = new Map<string, { x: number; y: number }>();
    let maxRows = 0;
    for (let d = 0; d <= maxDepth; d++) {
      const col = byDepth.get(d) ?? [];
      maxRows = Math.max(maxRows, col.length);
      col.forEach((name, i) => {
        pos.set(name, {
          x: PAD + d * (NODE_W + COL_GAP),
          y: PAD + i * (NODE_H + ROW_GAP),
        });
      });
    }

    const width = PAD * 2 + (maxDepth + 1) * NODE_W + maxDepth * COL_GAP;
    const height = PAD * 2 + maxRows * NODE_H + (maxRows - 1) * ROW_GAP;
    return { pos, width: Math.max(width, 320), height: Math.max(height, 120) };
  }, [nodes, edges]);

  return (
    <div className="relative">
      <div className="overflow-x-auto rounded-xl border border-border bg-card/40 p-2">
        <svg
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          className="max-w-none"
          role="img"
          aria-label="Peta graf konsep"
        >
          <defs>
            <marker id="cg-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="var(--color-border)" />
            </marker>
          </defs>

          {/* Edges */}
          {edges.map((e, i) => {
            const a = layout.pos.get(e.from);
            const b = layout.pos.get(e.to);
            if (!a || !b) return null;
            const x1 = a.x + NODE_W;
            const y1 = a.y + NODE_H / 2;
            const x2 = b.x;
            const y2 = b.y + NODE_H / 2;
            const mid = (x1 + x2) / 2;
            return (
              <path
                key={i}
                d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke="var(--color-border)"
                strokeWidth={1.5}
                markerEnd="url(#cg-arrow)"
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((n) => {
            const p = layout.pos.get(n.conceptName);
            if (!p) return null;
            return (
              <g
                key={n.conceptName}
                transform={`translate(${p.x}, ${p.y})`}
                className="cursor-pointer"
                onClick={() => setSelected(n.conceptName)}
              >
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={10}
                  fill={nodeFill(n.mastery)}
                  stroke="var(--color-border)"
                  strokeWidth={1}
                />
                <text x={10} y={18} fontSize={12} fontWeight={600} fill="var(--color-foreground)">
                  {n.conceptName.length > 18 ? n.conceptName.slice(0, 17) + "…" : n.conceptName}
                </text>
                <text x={10} y={34} fontSize={11} fill="var(--color-muted-foreground)">
                  {n.mastery === null ? "belum ada data" : `penguasaan ${n.mastery}`}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Node popover */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-black/30" aria-hidden />
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <TermPopover
              courseId={courseId}
              conceptName={selected}
              onAskTutor={() => {
                setSelected(null);
                // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                window.location.href = `/courses/${courseId}/material`;
              }}
            />
          </div>
        </div>
      )}

      <p className="mt-2 text-body-sm text-muted-foreground">
        Hijau kuasai, kuning sedang, merah lemah. Panah menunjuk dari prasyarat ke konsep lanjutan. Klik simpul untuk aksi cepat.
      </p>
    </div>
  );
}
