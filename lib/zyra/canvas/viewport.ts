export interface NumericRange { min: number; max: number }

export function isRepresentableRange(range: NumericRange): boolean {
  const span = range.max - range.min;
  return Number.isFinite(range.min) && Number.isFinite(range.max) && Number.isFinite(span)
    && span > 0 && span / 400 > 0
    && range.min + span / 400 > range.min && range.max - span / 400 < range.max;
}

export function fitNumericRange(values: readonly number[], padding = 0.15): NumericRange | null {
  if (values.length === 0 || values.some(value => !Number.isFinite(value))) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  if (!Number.isFinite(span)) return null;
  // A constant zero has no intrinsic scale; use a symmetric unit interval.
  const radius = span === 0 ? (min === 0 ? 1 : Math.abs(min) * 0.1) : span * padding;
  const lower = Number.isFinite(min - radius) ? min - radius : min;
  const upper = Number.isFinite(max + radius) ? max + radius : max;
  const range = { min: lower, max: upper };
  return isRepresentableRange(range) ? range : null;
}

export function zoomNumericRange(range: NumericRange, factor: number, fraction: number): NumericRange | null {
  if (!isRepresentableRange(range) || !Number.isFinite(factor) || factor <= 0) return null;
  const span = (range.max - range.min) * factor;
  const anchor = range.min + fraction * (range.max - range.min);
  const min = anchor - fraction * span;
  const result = { min, max: min + span };
  return isRepresentableRange(result) ? result : null;
}

export function normalizedVectorComponent(value: number, magnitude: number): number {
  return magnitude === 0 ? 0 : value / magnitude;
}
