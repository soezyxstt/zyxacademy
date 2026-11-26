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
import { plansGlowOffsets, plansOrnaments } from "@/packages/design-tokens/plans-ornaments";
import {
  ornamentCircles, ornamentCornerOffsets, ornamentGlowStop, ornamentPolygonPoints, ornamentViewBox,
  testimonialOrnaments, type TestimonialOrnamentColor,
} from "@/packages/design-tokens/testimonial-ornaments";

// ─── Layer: Glow blobs ────────────────────────────────────────────────────────

function GlowBlob({
  colorVar,
  positionClasses = "",
  position,
  size = 700,
  intensity = 0.2,
}: {
  colorVar: string;
  positionClasses?: string;
  position?: CSSProperties;
  size?: number;
  intensity?: number;
}) {
  return (
    <div
      className={`absolute rounded-full pointer-events-none ${positionClasses}`}
      style={{
        ...position,
        width: size,
        height: size,
        background: `radial-gradient(circle, color-mix(in oklch, ${colorVar} ${Math.round(intensity * 100)}%, transparent) 0%, transparent ${ornamentGlowStop}%)`,
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
  const posClass = {
    "top-right": "absolute top-0 right-0",
    "top-left": "absolute top-0 left-0",
    "bottom-right": "absolute bottom-0 right-0",
    "bottom-left": "absolute bottom-0 left-0",
  }[corner];

  return (
    <svg className={posClass} width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" aria-hidden>
      {ornamentCircles({ size, corner, count, r0, gap, opacity, strokeWidth }).map((circle, i) => (
        <circle key={i} {...circle} stroke={color} />
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

function GeometricLayer({ shapes }: { shapes: ShapeSpec[] }) {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox={`0 0 ${ornamentViewBox.width} ${ornamentViewBox.height}`}
      fill="none"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      {shapes.map((s, i) => (
        <polygon
          key={i}
          points={ornamentPolygonPoints(s)}
          stroke={s.color}
          strokeWidth={s.strokeWidth ?? 1.5}
          opacity={s.opacity ?? 0.09}
        />
      ))}
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
  glows: { colorVar: string; positionClasses?: string; position?: CSSProperties; size?: number; intensity?: number }[];
  rings: { corner: "top-right" | "top-left" | "bottom-right" | "bottom-left"; size: number; color: string; count?: number; r0?: number; gap?: number; opacity?: number }[];
  shapes: ShapeSpec[];
  math: MathSpec[];
};

function ornamentColor(color: TestimonialOrnamentColor) {
  return color === "primary" ? "var(--primary)" : `var(--color-${color})`;
}

const CONFIGS: Record<Variant, VariantConfig> = {
  testimonial: {
    glows: testimonialOrnaments.glows.map(({ color, corner, offsetRem, ...glow }) => ({
      ...glow, colorVar: ornamentColor(color), position: ornamentCornerOffsets(corner, `${offsetRem}rem`),
    })),
    rings: testimonialOrnaments.rings.map(ring => ({ ...ring, color: ornamentColor(ring.color) })),
    shapes: testimonialOrnaments.shapes.map(shape => ({ ...shape, color: ornamentColor(shape.color) })),
    math: testimonialOrnaments.math.map(symbol => ({ ...symbol, color: ornamentColor(symbol.color) })),
  },
  plans: {
    glows: plansOrnaments.glows.map(({ color, position, ...glow }) => ({
      ...glow, colorVar: ornamentColor(color), position: plansGlowOffsets(position, value => `${value}rem`),
    })),
    rings: plansOrnaments.rings.map(ring => ({ ...ring, color: ornamentColor(ring.color) })),
    shapes: plansOrnaments.shapes.map(shape => ({ ...shape, color: ornamentColor(shape.color) })),
    math: plansOrnaments.math.map(symbol => ({ ...symbol, color: ornamentColor(symbol.color) })),
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
  const themeOpacity = variant === "testimonial" ? testimonialOrnaments.opacity : variant === "plans" ? plansOrnaments.opacity : null;
  const opacity = themeOpacity ? {
    "--ornament-opacity": themeOpacity.light,
    "--ornament-opacity-dark": themeOpacity.dark,
  } as CSSProperties : undefined;
  return (
    <div
      data-page-ornaments
      className={`pointer-events-none select-none absolute inset-0 overflow-hidden ${opacity
        ? "opacity-[var(--ornament-opacity)] dark:opacity-[var(--ornament-opacity-dark)]" : "opacity-35 dark:opacity-25"}`}
      style={opacity}
      aria-hidden
    >
      {cfg.glows.map((g, i) => <GlowBlob key={i} {...g} />)}
      {cfg.rings.map((r, i) => <RingCluster key={i} {...r} />)}
      <GeometricLayer shapes={cfg.shapes} />
      <MathLayer symbols={cfg.math} />
    </div>
  );
}
