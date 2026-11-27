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

export function niceStep(range: number) {
  const raw = range / 8;
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const multiplier of [1, 2, 5, 10]) {
    if (raw <= multiplier * magnitude) return multiplier * magnitude;
  }
  return 10 * magnitude;
}

export function computeValueTableSampling(
  domainMin: number,
  domainMax: number,
  viewMin: number,
  viewMax: number,
): { min: number; max: number; sampleCount: number } | null {
  const min = Math.max(domainMin, viewMin);
  const max = Math.min(domainMax, viewMax);
  if (!Number.isFinite(min) || !Number.isFinite(max) || !(min < max)) return null;
  const span = max - min;
  for (const step of [niceStep(span * 2), niceStep(span)]) {
    if (!Number.isFinite(step) || step <= 0) continue;
    const start = Math.max(min, Math.ceil((min - step * 1e-9) / step) * step);
    const end = Math.min(max, Math.floor((max + step * 1e-9) / step) * step);
    if (start < end) {
      const sampleCount = Math.min(400, Math.max(2, Math.round((end - start) / step) + 1));
      return { min: start, max: end, sampleCount };
    }
  }
  return { min, max, sampleCount: 5 };
}
