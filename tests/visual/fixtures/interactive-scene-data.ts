export function machine(id: string, label: string) {
  return {
    id, kind: "interactive_scene", label, description: "Pilih langkah untuk membentuk susunan persegi.",
    viewBox: { x: 0, y: 0, width: 100, height: 48 },
    parameters: [
      { id: "step", label: "Langkah", min: 1, max: 4, step: 1, initial: 1, control: "select", options: [1, 2, 3, 4].map(value => ({ value, label: String(value) })) },
      { id: "branch", label: "Cabang", min: 0, max: 1, step: 1, initial: 0, control: "toggle", options: [{ value: 0, label: "Kiri" }, { value: 1, label: "Kanan" }] },
    ],
    shapes: [
      { type: "line", x1: 5, y1: 24, x2: 27, y2: 24, arrow: true },
      { type: "circle", cx: 30, cy: 24, r: 4, action: { type: "cycle", parameter: "branch" }, actionLabel: "Ubah cabang" },
      { type: "text", x: 70, y: 44, text: "$n^2$" },
      { type: "text", x: 36, y: 8, text: "Kiri", color: "muted" },
      { type: "text", x: 36, y: 44, text: "Kanan", color: "muted" },
      { type: "line", x1: 34, y1: 24, x2: 55, y2: 9, arrow: true, color: "primary", visibleWhen: { left: "branch", op: "eq", right: 0 } },
      { type: "line", x1: 34, y1: 24, x2: 44, y2: 36, color: "primary", visibleWhen: { left: "branch", op: "eq", right: 1 } },
      { type: "line", x1: 44, y1: 36, x2: 52, y2: 36, color: "primary", visibleWhen: { left: "branch", op: "eq", right: 1 } },
      { type: "line", x1: 52, y1: 36, x2: 52, y2: 9, color: "primary", visibleWhen: { left: "branch", op: "eq", right: 1 } },
      { type: "line", x1: 52, y1: 9, x2: 55, y2: 9, arrow: true, color: "primary", visibleWhen: { left: "branch", op: "eq", right: 1 } },
      ...Array.from({ length: 16 }, (_, i) => ({ type: "rect", x: 55 + (i % 4) * 8, y: 6 + Math.floor(i / 4) * 8, width: 6, height: 6, fill: true, color: "primary", visibleWhen: { left: "step", op: "gte", right: Math.max(i % 4, Math.floor(i / 4)) + 1 } })),
    ],
    outputs: [{ label: "Persegi", value: "step^2" }],
    staticFallback: { type: "text", summary: "Langkah awal menghasilkan satu persegi.", content: "Jumlah persegi mengikuti kuadrat langkah." },
  };
}
export function motion(id: string, label: string) {
  return {
    id, kind: "interactive_scene", label, description: "Ujung batang berputar terhadap waktu.", viewBox: { x: 0, y: 0, width: 100, height: 80 },
    parameters: [{ id: "t", label: "Waktu", min: 0, max: 6, step: 0.1, initial: 0, unit: "s", control: "range" }], time: { parameter: "t", rate: 1 },
    shapes: [{ type: "line", x1: 10, y1: 40, x2: 90, y2: 40, arrow: true, color: "muted" }, { type: "text", x: 84, y: 36, text: "x (m)", color: "muted" }, { type: "text", x: 48, y: 46, text: "0", color: "muted" }, { type: "line", x1: 50, y1: 40, x2: "50+25*cos(t)", y2: "40+25*sin(t)" }, { type: "circle", cx: "50+25*cos(t)", cy: "40+25*sin(t)", r: 3, fill: true }],
    outputs: [{ label: "Koordinat x", value: "25*cos(t)", unit: "m" }], staticFallback: { type: "text", summary: "Batang pada waktu awal.", content: "Ujung berada 25 m di kanan pusat." },
  };
}
export const drag = {
  id: "drag_point", kind: "interactive_scene", label: "Titik yang dapat dipindahkan", description: "Titik bergerak pada bidang.", viewBox: { x: 0, y: 0, width: 100, height: 60 },
  parameters: [{ id: "x", label: "Posisi x", min: 0, max: 100, step: 1, initial: 20, control: "range" }, { id: "y", label: "Posisi y", min: 0, max: 60, step: 1, initial: 30, control: "range" }],
  shapes: [{ type: "circle", cx: "x", cy: "y", r: 4, fill: true, action: { type: "drag", xParameter: "x", yParameter: "y" }, actionLabel: "Pindahkan titik" }],
  outputs: [{ label: "x", value: "x" }, { label: "y", value: "y" }], staticFallback: { type: "text", summary: "Titik awal.", content: "Titik berada pada x 20 dan y 30." },
};
export const singular = {
  id: "singular", kind: "interactive_scene", label: "Pembagi", description: "Nilai tidak terdefinisi pada satu.", viewBox: { x: 0, y: 0, width: 100, height: 30 },
  parameters: [{ id: "p", label: "Pembagi", min: 0, max: 2, step: 1, initial: 0, control: "range" }],
  shapes: [{ type: "circle", cx: "50+10/(p-1)", cy: 15, r: 3 }], outputs: [], staticFallback: { type: "text", summary: "Pembagi awal.", content: "Titik berada di x 40." },
};
export function embed(spec: unknown) { return `\`\`\`zyx-visual\n${JSON.stringify(spec)}\n\`\`\``; }
