/**
 * Decorative background layer.
 * Three visual layers stacked:
 *   1. Radial glow blobs (brand colors, stronger than before)
 *   2. SVG ring clusters (concentric circles from corners)
 *   3. SVG geometric shapes (hexagons, triangles)
 *   4. Floating math/science symbols (HTML, uses heading font)
 *
 * Place as the FIRST child inside a `relative overflow-hidden` container.
 */

import type { CSSProperties } from "react";

// ─── Layer: Glow blobs ────────────────────────────────────────────────────────

function GlowBlob({
  colorVar,
  positionClasses,
  size = 700,
  intensity = 0.2,
}: {
  colorVar: string;
  positionClasses: string;
  size?: number;
  intensity?: number;
}) {
  return (
    <div
      className={`absolute rounded-full pointer-events-none ${positionClasses}`}
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle, color-mix(in oklch, ${colorVar} ${Math.round(intensity * 100)}%, transparent) 0%, transparent 65%)`,
      }}
    />
  );
}

// ─── Layer: Ring clusters ─────────────────────────────────────────────────────

function RingCluster({
  size,
  corner,
  color,
  count = 7,
  r0 = 100,
  gap = 76,
  opacity = 0.14,
  strokeWidth = 1.2,
}: {
  size: number;
  corner: "top-right" | "top-left" | "bottom-right" | "bottom-left";
  color: string;
  count?: number;
  r0?: number;
  gap?: number;
  opacity?: number;
  strokeWidth?: number;
}) {
  const cx = corner.includes("right") ? size : 0;
  const cy = corner.includes("bottom") ? size : 0;
  const posClass = {
    "top-right": "absolute top-0 right-0",
    "top-left": "absolute top-0 left-0",
    "bottom-right": "absolute bottom-0 right-0",
    "bottom-left": "absolute bottom-0 left-0",
  }[corner];

  return (
    <svg className={posClass} width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={r0 + i * gap}
          stroke={color}
          strokeWidth={Math.max(strokeWidth - i * 0.12, 0.4)}
          opacity={Math.max(opacity - i * 0.016, 0.012)}
        />
      ))}
    </svg>
  );
}

// ─── Layer: Geometric shapes (SVG) ────────────────────────────────────────────

type ShapeSpec = {
  type: "hex" | "tri";
  /** Position as % of a 1440×900 viewport (scaled via viewBox) */
  cx: number;
  cy: number;
  r: number;
  rotation?: number;
  color: string;
  opacity?: number;
  strokeWidth?: number;
};

function hexPoints(cx: number, cy: number, r: number, angleDeg = 30): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = ((i * 60 + angleDeg) * Math.PI) / 180;
    // Keep SVG attributes identical across server and browser math engines.
    return `${(cx + r * Math.cos(a)).toFixed(3)},${(cy + r * Math.sin(a)).toFixed(3)}`;
  }).join(" ");
}

function triPoints(cx: number, cy: number, r: number, angleDeg = 0): string {
  return Array.from({ length: 3 }, (_, i) => {
    const a = ((i * 120 + angleDeg) * Math.PI) / 180;
    // Keep SVG attributes identical across server and browser math engines.
    return `${(cx + r * Math.cos(a)).toFixed(3)},${(cy + r * Math.sin(a)).toFixed(3)}`;
  }).join(" ");
}

function GeometricLayer({ shapes }: { shapes: ShapeSpec[] }) {
  const VW = 1440;
  const VH = 900;
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox={`0 0 ${VW} ${VH}`}
      fill="none"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      {shapes.map((s, i) => {
        const cx = (s.cx / 100) * VW;
        const cy = (s.cy / 100) * VH;
        const pts = s.type === "hex" ? hexPoints(cx, cy, s.r, s.rotation) : triPoints(cx, cy, s.r, s.rotation);
        return (
          <polygon
            key={i}
            points={pts}
            stroke={s.color}
            strokeWidth={s.strokeWidth ?? 1.5}
            opacity={s.opacity ?? 0.09}
          />
        );
      })}
    </svg>
  );
}

// ─── Layer: Math/science symbols (HTML for proper font rendering) ─────────────

type MathSpec = {
  symbol: string;
  x: string;
  y: string;
  size: number;
  rotation?: number;
  color?: string;
  opacity?: number;
};

function MathLayer({ symbols }: { symbols: MathSpec[] }) {
  return (
    <>
      {symbols.map((s, i) => (
        <span
          key={i}
          aria-hidden
          className="absolute select-none pointer-events-none font-heading leading-none font-bold"
          style={
            {
              left: s.x,
              top: s.y,
              fontSize: s.size,
              color: s.color ?? "var(--primary)",
              opacity: s.opacity ?? 0.08,
              transform: `translate(-50%, -50%) rotate(${s.rotation ?? 0}deg)`,
            } as CSSProperties
          }
        >
          {s.symbol}
        </span>
      ))}
    </>
  );
}

// ─── Variant data ─────────────────────────────────────────────────────────────

const T_SHAPES: ShapeSpec[] = [
  { type: "hex", cx: 4,  cy: 10, r: 58,  rotation: 30,  color: "var(--primary)",               opacity: 0.09  },
  { type: "hex", cx: 93, cy: 7,  r: 82,  rotation: 0,   color: "var(--primary)",               opacity: 0.075 },
  { type: "hex", cx: 88, cy: 90, r: 48,  rotation: 15,  color: "var(--color-brand-secondary)", opacity: 0.1   },
  { type: "tri", cx: 12, cy: 82, r: 44,  rotation: 15,  color: "var(--primary)",               opacity: 0.09  },
  { type: "tri", cx: 56, cy: 4,  r: 32,  rotation: 180, color: "var(--color-brand-secondary)", opacity: 0.085 },
  { type: "hex", cx: 47, cy: 94, r: 38,  rotation: 0,   color: "var(--color-tertiary-1)",      opacity: 0.085 },
  { type: "tri", cx: 75, cy: 50, r: 28,  rotation: 0,   color: "var(--primary)",               opacity: 0.065 },
];

const T_MATH: MathSpec[] = [
  { symbol: "∑", x: "9%",  y: "32%", size: 80,  rotation: -8,  opacity: 0.08 },
  { symbol: "π", x: "83%", y: "18%", size: 88,  rotation: 12,  opacity: 0.085 },
  { symbol: "∫", x: "91%", y: "62%", size: 96,  rotation: 5,   color: "var(--color-brand-secondary)", opacity: 0.08 },
  { symbol: "√", x: "19%", y: "74%", size: 72,  rotation: -5,  opacity: 0.08 },
  { symbol: "∞", x: "60%", y: "87%", size: 66,  rotation: 0,   color: "var(--color-brand-secondary)", opacity: 0.085 },
  { symbol: "Δ", x: "45%", y: "13%", size: 58,  rotation: 0,   opacity: 0.09 },
  { symbol: "∂", x: "33%", y: "52%", size: 52,  rotation: 15,  opacity: 0.065 },
];

const P_SHAPES: ShapeSpec[] = [
  { type: "hex", cx: 6,  cy: 8,  r: 72,  rotation: 0,   color: "var(--primary)",               opacity: 0.085 },
  { type: "hex", cx: 95, cy: 12, r: 52,  rotation: 30,  color: "var(--primary)",               opacity: 0.09  },
  { type: "hex", cx: 91, cy: 87, r: 68,  rotation: 15,  color: "var(--color-brand-secondary)", opacity: 0.095 },
  { type: "tri", cx: 7,  cy: 87, r: 48,  rotation: 0,   color: "var(--color-tertiary-1)",      opacity: 0.1   },
  { type: "tri", cx: 50, cy: 6,  r: 38,  rotation: 30,  color: "var(--color-brand-secondary)", opacity: 0.085 },
  { type: "hex", cx: 44, cy: 95, r: 42,  rotation: 0,   color: "var(--primary)",               opacity: 0.075 },
  { type: "tri", cx: 22, cy: 45, r: 30,  rotation: 60,  color: "var(--primary)",               opacity: 0.07  },
];

const P_MATH: MathSpec[] = [
  { symbol: "∑", x: "89%", y: "26%", size: 88,  rotation: 10,  opacity: 0.085 },
  { symbol: "×", x: "11%", y: "24%", size: 78,  rotation: -15, color: "var(--color-brand-secondary)", opacity: 0.09 },
  { symbol: "∂", x: "79%", y: "74%", size: 84,  rotation: 8,   opacity: 0.08  },
  { symbol: "∇", x: "17%", y: "76%", size: 76,  rotation: -5,  color: "var(--color-tertiary-1)",      opacity: 0.085 },
  { symbol: "λ", x: "48%", y: "16%", size: 66,  rotation: 5,   opacity: 0.08  },
  { symbol: "σ", x: "61%", y: "89%", size: 62,  rotation: -10, color: "var(--color-brand-secondary)", opacity: 0.085 },
  { symbol: "θ", x: "36%", y: "60%", size: 54,  rotation: 0,   opacity: 0.065 },
];

const A_SHAPES: ShapeSpec[] = [
  { type: "hex", cx: 3,  cy: 7,  r: 85,  rotation: 30,  color: "var(--primary)",               opacity: 0.09  },
  { type: "hex", cx: 96, cy: 5,  r: 62,  rotation: 0,   color: "var(--primary)",               opacity: 0.08  },
  { type: "hex", cx: 93, cy: 52, r: 58,  rotation: 15,  color: "var(--color-brand-secondary)", opacity: 0.095 },
  { type: "hex", cx: 5,  cy: 93, r: 74,  rotation: 30,  color: "var(--color-brand-secondary)", opacity: 0.08  },
  { type: "tri", cx: 50, cy: 4,  r: 44,  rotation: 180, color: "var(--primary)",               opacity: 0.085 },
  { type: "tri", cx: 48, cy: 96, r: 38,  rotation: 0,   color: "var(--color-tertiary-1)",      opacity: 0.09  },
  { type: "hex", cx: 20, cy: 52, r: 34,  rotation: 0,   color: "var(--color-tertiary-1)",      opacity: 0.07  },
  { type: "tri", cx: 78, cy: 30, r: 28,  rotation: 45,  color: "var(--primary)",               opacity: 0.065 },
];

const A_MATH: MathSpec[] = [
  { symbol: "∑", x: "7%",  y: "20%", size: 96,  rotation: -10, opacity: 0.085 },
  { symbol: "∫", x: "91%", y: "14%", size: 104, rotation: 8,   opacity: 0.08  },
  { symbol: "π", x: "83%", y: "57%", size: 88,  rotation: -5,  color: "var(--color-brand-secondary)", opacity: 0.085 },
  { symbol: "∇", x: "14%", y: "67%", size: 84,  rotation: 10,  opacity: 0.08  },
  { symbol: "φ", x: "50%", y: "10%", size: 72,  rotation: -8,  color: "var(--color-brand-secondary)", opacity: 0.085 },
  { symbol: "∞", x: "40%", y: "89%", size: 80,  rotation: 0,   opacity: 0.08  },
  { symbol: "Δ", x: "70%", y: "83%", size: 68,  rotation: 15,  color: "var(--color-tertiary-1)",      opacity: 0.085 },
  { symbol: "∂", x: "24%", y: "37%", size: 62,  rotation: -12, opacity: 0.07  },
  { symbol: "λ", x: "62%", y: "42%", size: 56,  rotation: 8,   opacity: 0.065 },
];

// ─── Public export ────────────────────────────────────────────────────────────

type Variant = "testimonial" | "plans" | "about";

type VariantConfig = {
  glows: { colorVar: string; positionClasses: string; size?: number; intensity?: number }[];
  rings: { corner: "top-right" | "top-left" | "bottom-right" | "bottom-left"; size: number; color: string; count?: number; r0?: number; gap?: number; opacity?: number }[];
  shapes: ShapeSpec[];
  math: MathSpec[];
};

const CONFIGS: Record<Variant, VariantConfig> = {
  testimonial: {
    glows: [
      { colorVar: "var(--primary)",               positionClasses: "-top-52 -right-52", size: 760, intensity: 0.22 },
      { colorVar: "var(--color-brand-secondary)", positionClasses: "-bottom-44 -left-44", size: 620, intensity: 0.19 },
    ],
    rings: [
      { corner: "top-right",   size: 580, color: "var(--primary)",               count: 8, r0: 90,  gap: 76, opacity: 0.15 },
      { corner: "bottom-left", size: 400, color: "var(--color-brand-secondary)", count: 5, r0: 80,  gap: 72, opacity: 0.13 },
    ],
    shapes: T_SHAPES,
    math:   T_MATH,
  },
  plans: {
    glows: [
      { colorVar: "var(--primary)",               positionClasses: "-top-56 -left-48", size: 800, intensity: 0.20 },
      { colorVar: "var(--color-brand-secondary)", positionClasses: "-bottom-52 -right-44", size: 680, intensity: 0.18 },
      { colorVar: "var(--color-tertiary-1)",      positionClasses: "top-1/3 -right-56", size: 500, intensity: 0.15 },
    ],
    rings: [
      { corner: "top-right",   size: 620, color: "var(--primary)",          count: 8, r0: 100, gap: 78, opacity: 0.14 },
      { corner: "bottom-left", size: 420, color: "var(--color-tertiary-1)", count: 5, r0: 85,  gap: 72, opacity: 0.13 },
    ],
    shapes: P_SHAPES,
    math:   P_MATH,
  },
  about: {
    glows: [
      { colorVar: "var(--primary)",               positionClasses: "-top-56 -left-36", size: 840, intensity: 0.21 },
      { colorVar: "var(--color-brand-secondary)", positionClasses: "top-1/3 -right-44", size: 680, intensity: 0.18 },
      { colorVar: "var(--primary)",               positionClasses: "-bottom-48 left-1/4", size: 620, intensity: 0.16 },
    ],
    rings: [
      { corner: "top-right",   size: 700, color: "var(--primary)",               count: 9, r0: 110, gap: 78, opacity: 0.14 },
      { corner: "bottom-left", size: 480, color: "var(--color-brand-secondary)", count: 6, r0: 90,  gap: 76, opacity: 0.13 },
    ],
    shapes: A_SHAPES,
    math:   A_MATH,
  },
};

export function PageOrnaments({ variant }: { variant: Variant }) {
  const cfg = CONFIGS[variant];
  return (
    <div data-page-ornaments className="pointer-events-none select-none absolute inset-0 overflow-hidden" aria-hidden>
      {cfg.glows.map((g, i) => <GlowBlob key={i} {...g} />)}
      {cfg.rings.map((r, i) => <RingCluster key={i} {...r} />)}
      <GeometricLayer shapes={cfg.shapes} />
      <MathLayer symbols={cfg.math} />
    </div>
  );
}
