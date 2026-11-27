import { expect, test } from "bun:test";
import { courseScrollOffsetForMount } from "../../../../apps/mobile-native/features/student/courses/scroll-offset";

// ReactScrollView emits Float32 DIP and truncates the converted Float32 pixels
// on assignment to contentOffset on Android.
const toNativePixel = (dip: number, density: number) => Math.trunc(Math.fround(Math.fround(dip) * density));

test("restores the original Android pixel at fractional densities", () => {
  for (const [pixel, density] of [[2013, 2.625], [2005, 2.75]]) {
    const reported = Math.fround(pixel / density);
    expect(toNativePixel(reported, density)).toBe(pixel - 1);
    expect(toNativePixel(courseScrollOffsetForMount(reported, density), density)).toBe(pixel);
  }
});

test("keeps the origin and offsets requiring no Android correction", () => {
  expect(courseScrollOffsetForMount(0, 2.625)).toBe(0);
  expect(courseScrollOffsetForMount(2013, 1)).toBe(2013);
  expect(courseScrollOffsetForMount(766.8571166992188)).toBe(766.8571166992188);
});
