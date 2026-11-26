export const ornamentViewBox = { width: 1440, height: 900 };
export const ornamentGlowStop = 65;

type Corner = "top-right" | "top-left" | "bottom-right" | "bottom-left";

export function ornamentCornerOffsets<T>(corner: Corner, offset: T): Partial<Record<"left" | "right" | "top" | "bottom", T>> {
  return {
    [corner.endsWith("right") ? "right" : "left"]: offset,
    [corner.startsWith("bottom") ? "bottom" : "top"]: offset,
  };
}

export function ornamentCircles({ size, corner, count, r0, gap, opacity, strokeWidth = 1.2 }: {
  size: number; corner: Corner; count: number; r0: number; gap: number; opacity: number; strokeWidth?: number;
}) {
  const cx = corner.endsWith("right") ? size : 0;
  const cy = corner.startsWith("bottom") ? size : 0;
  return Array.from({ length: count }, (_, index) => ({
    cx, cy, r: r0 + index * gap,
    strokeWidth: Math.max(strokeWidth - index * 0.12, 0.4),
    opacity: Math.max(opacity - index * 0.016, 0.012),
  }));
}

export function ornamentPolygonPoints({ type, cx, cy, r, rotation = type === "hex" ? 30 : 0 }: {
  type: "hex" | "tri"; cx: number; cy: number; r: number; rotation?: number;
}) {
  const corners = type === "hex" ? 6 : 3;
  const x = (cx / 100) * ornamentViewBox.width;
  const y = (cy / 100) * ornamentViewBox.height;
  return Array.from({ length: corners }, (_, index) => {
    const angle = ((index * 360 / corners + rotation) * Math.PI) / 180;
    return `${(x + r * Math.cos(angle)).toFixed(3)},${(y + r * Math.sin(angle)).toFixed(3)}`;
  }).join(" ");
}

export const testimonialOrnaments = {
  opacity: { light: 0.35, dark: 0.25 },
  glows: [
    { color: "primary", corner: "top-right", offsetRem: -13, size: 760, intensity: 0.22 },
    { color: "brand-secondary", corner: "bottom-left", offsetRem: -11, size: 620, intensity: 0.19 },
  ],
  rings: [
    { corner: "top-right", size: 580, color: "primary", count: 8, r0: 90, gap: 76, opacity: 0.15 },
    { corner: "bottom-left", size: 400, color: "brand-secondary", count: 5, r0: 80, gap: 72, opacity: 0.13 },
  ],
  shapes: [
    { type: "hex", cx: 4, cy: 10, r: 58, rotation: 30, color: "primary", opacity: 0.09 },
    { type: "hex", cx: 93, cy: 7, r: 82, rotation: 0, color: "primary", opacity: 0.075 },
    { type: "hex", cx: 88, cy: 90, r: 48, rotation: 15, color: "brand-secondary", opacity: 0.1 },
    { type: "tri", cx: 12, cy: 82, r: 44, rotation: 15, color: "primary", opacity: 0.09 },
    { type: "tri", cx: 56, cy: 4, r: 32, rotation: 180, color: "brand-secondary", opacity: 0.085 },
    { type: "hex", cx: 47, cy: 94, r: 38, rotation: 0, color: "tertiary-1", opacity: 0.085 },
    { type: "tri", cx: 75, cy: 50, r: 28, rotation: 0, color: "primary", opacity: 0.065 },
  ],
  math: [
    { symbol: "∑", x: "9%", y: "32%", size: 80, rotation: -8, color: "primary", opacity: 0.08 },
    { symbol: "π", x: "83%", y: "18%", size: 88, rotation: 12, color: "primary", opacity: 0.085 },
    { symbol: "∫", x: "91%", y: "62%", size: 96, rotation: 5, color: "brand-secondary", opacity: 0.08 },
    { symbol: "√", x: "19%", y: "74%", size: 72, rotation: -5, color: "primary", opacity: 0.08 },
    { symbol: "∞", x: "60%", y: "87%", size: 66, rotation: 0, color: "brand-secondary", opacity: 0.085 },
    { symbol: "Δ", x: "45%", y: "13%", size: 58, rotation: 0, color: "primary", opacity: 0.09 },
    { symbol: "∂", x: "33%", y: "52%", size: 52, rotation: 15, color: "primary", opacity: 0.065 },
  ],
} as const;

export type TestimonialOrnamentColor = (typeof testimonialOrnaments.shapes)[number]["color"];
