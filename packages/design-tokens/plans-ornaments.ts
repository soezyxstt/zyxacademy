type GlowPosition = Partial<Record<"top" | "bottom" | "left" | "right", number | `${number}%`>>;

export function plansGlowOffsets<T>(position: GlowPosition, rem: (value: number) => T) {
  const entries = Object.entries(position).map(([side, value]) => [side, typeof value === "number" ? rem(value) : value]);
  return Object.fromEntries(entries) as Partial<Record<keyof GlowPosition, T | `${number}%`>>;
}

const shapes = [
  { type: "hex", cx: 6, cy: 8, r: 72, rotation: 0, color: "primary", opacity: 0.085 },
  { type: "hex", cx: 95, cy: 12, r: 52, rotation: 30, color: "primary", opacity: 0.09 },
  { type: "hex", cx: 91, cy: 87, r: 68, rotation: 15, color: "brand-secondary", opacity: 0.095 },
  { type: "tri", cx: 7, cy: 87, r: 48, rotation: 0, color: "tertiary-1", opacity: 0.1 },
  { type: "tri", cx: 50, cy: 6, r: 38, rotation: 30, color: "brand-secondary", opacity: 0.085 },
  { type: "hex", cx: 44, cy: 95, r: 42, rotation: 0, color: "primary", opacity: 0.075 },
  { type: "tri", cx: 22, cy: 45, r: 30, rotation: 60, color: "primary", opacity: 0.07  },
] as const;

const math = [
  { symbol: "∑", x: "89%", y: "26%", size: 88, rotation: 10, color: "primary", opacity: 0.085 },
  { symbol: "×", x: "11%", y: "24%", size: 78, rotation: -15, color: "brand-secondary", opacity: 0.09 },
  { symbol: "∂", x: "79%", y: "74%", size: 84, rotation: 8, color: "primary", opacity: 0.08  },
  { symbol: "∇", x: "17%", y: "76%", size: 76, rotation: -5, color: "tertiary-1", opacity: 0.085 },
  { symbol: "λ", x: "48%", y: "16%", size: 66, rotation: 5, color: "primary", opacity: 0.08  },
  { symbol: "σ", x: "61%", y: "89%", size: 62, rotation: -10, color: "brand-secondary", opacity: 0.085 },
  { symbol: "θ", x: "36%", y: "60%", size: 54, rotation: 0, color: "primary", opacity: 0.065 },
] as const;

export const plansOrnaments = {
  opacity: { light: 0.35, dark: 0.25 },
  glows: [
    { color: "primary", position: { top: -14, left: -12 }, size: 800, intensity: 0.20 },
    { color: "brand-secondary", position: { bottom: -13, right: -11 }, size: 680, intensity: 0.18 },
    { color: "tertiary-1", position: { top: "33.333333%", right: -14 }, size: 500, intensity: 0.15 },
  ],
  rings: [
    { corner: "top-right", size: 620, color: "primary", count: 8, r0: 100, gap: 78, opacity: 0.14 },
    { corner: "bottom-left", size: 420, color: "tertiary-1", count: 5, r0: 85, gap: 72, opacity: 0.13 },
  ],
  shapes,
  math,
} as const;
