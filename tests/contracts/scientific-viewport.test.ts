import { expect, test } from "bun:test";
import { fitNumericRange, normalizedVectorComponent, zoomNumericRange } from "@/lib/zyra/canvas/viewport";

test("fits tiny and large quantities without inventing a scale floor or clipping", () => {
  for (const scale of [1e-300, 0.0004, 1e100, 1e300]) {
    const range = fitNumericRange([scale, scale * 2])!;
    expect(range).not.toBeNull();
    expect(range.min).toBeLessThan(scale);
    expect(range.max).toBeGreaterThan(scale * 2);
    expect((scale * 2 - scale) / (range.max - range.min)).toBeGreaterThan(0.5);
  }
});
test("fits constants relative to their own magnitude and treats zero explicitly", () => {
  expect(fitNumericRange([0, 0])).toEqual({ min: -1, max: 1 });
  expect(fitNumericRange([1e-200, 1e-200])!.max).toBeLessThan(2e-200);
  expect(fitNumericRange([1e200])!.min).toBeGreaterThan(0);
});
test("rejects unsupported floating point ranges instead of creating invalid geometry", () => {
  expect(fitNumericRange([-1e308, 1e308])).toBeNull();
  expect(fitNumericRange([Number.MIN_VALUE])).toBeNull();
  expect(fitNumericRange([Infinity])).toBeNull();
  expect(zoomNumericRange({ min: 1e20, max: 1e20 + 1e5 }, 1e-10, 0.5)).toBeNull();
});
test("zoom and vector normalization preserve tiny scales", () => {
  const range = zoomNumericRange({ min: 0, max: 1e-8 }, 0.5, 0.5)!;
  expect(range.max - range.min).toBeCloseTo(5e-9, 20);
  expect(normalizedVectorComponent(1e-320, 2e-320)).toBe(0.5);
  expect(normalizedVectorComponent(0, 0)).toBe(0);
});
