type GeometryBounds = { xMin: number; xMax: number; yMin: number; yMax: number };

export const geometryWidth = 600;
const HEIGHT = 400;
const PAD = 45;

/** Wide, shallow bounds need less vertical space while retaining label padding. */
export function geometryHeight(bounds: GeometryBounds) {
  const width = bounds.xMax - bounds.xMin;
  const height = bounds.yMax - bounds.yMin;
  return Math.max(140, Math.min(HEIGHT, 2 * PAD + (geometryWidth - 2 * PAD) * height / width));
}

/** One physical scale for both axes preserves circles and angles. */
export function geometryProjection(bounds: GeometryBounds, height = HEIGHT) {
  const scale = Math.min((geometryWidth - 2 * PAD) / (bounds.xMax - bounds.xMin), (height - 2 * PAD) / (bounds.yMax - bounds.yMin));
  const xMid = (bounds.xMin + bounds.xMax) / 2;
  const yMid = (bounds.yMin + bounds.yMax) / 2;
  return { scale, x: (value: number) => geometryWidth / 2 + (value - xMid) * scale, y: (value: number) => height / 2 - (value - yMid) * scale };
}
