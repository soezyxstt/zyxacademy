import { compileSafeExpression, normalizeLegacyGraphExpression } from "../zyra/canvas/expression";

export const markdownGraphDomain = { min: -10, max: 10 } as const;
export const defaultMarkdownGraphExpression = "x^2 - 4x + 3";

export function markdownGraphEntries(source: string) {
  const lines = source.split("\n").map(line => line.trim()).filter(Boolean);
  return lines.length ? lines : [defaultMarkdownGraphExpression];
}

const pointPattern = /^(?:([A-Za-z])\s*=\s*)?\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)$/;

export function parseMarkdownGraphPoint(raw: string) {
  const match = pointPattern.exec(raw.trim());
  if (!match) return null;
  const x = Number(match[2]);
  const y = Number(match[3]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { kind: "point" as const, name: match[1], x, y };
}

export type MarkdownGraphPoint = NonNullable<ReturnType<typeof parseMarkdownGraphPoint>>;

export function formatMarkdownGraphPoint(point: MarkdownGraphPoint, x: number, y: number) {
  const prefix = point.name ? `${point.name} = ` : "";
  return `${prefix}(${x}, ${y})`;
}

export function compileMarkdownGraphFormula(raw: string) {
  return compileSafeExpression(normalizeLegacyGraphExpression(raw), { variables: ["x"] });
}
