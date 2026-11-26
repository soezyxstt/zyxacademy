import { expect, test } from "bun:test";
import { getSliderRange, sliderGeometry, sliderStartsAtRight, sliderValueAtOffset, snapSliderValue } from "../../packages/ui-primitives/slider";
import { sliderCases, sliderPosition } from "../../packages/ui-parity/slider-cases";
import { operationsCatalog } from "../../lib/admin-mcp/operations-catalog";

test("snaps pointer and accessibility values to the web step, including decimals and endpoints", () => {
  const bounds = getSliderRange(-0.5, 0.5, 0.1);
  expect(snapSliderValue(0.149, bounds)).toBe(0.1);
  expect(snapSliderValue(0.19 + bounds.step, bounds)).toBe(0.3);
  expect(snapSliderValue(1.4e-7, getSliderRange(0, 1, 1e-7))).toBe(1e-7);
  expect(sliderValueAtOffset(4, 10, bounds, false)).toBe(-0.1);
  expect(sliderValueAtOffset(-20, 10, bounds, false)).toBe(-0.5);
  expect(sliderValueAtOffset(11, 10, bounds, false)).toBe(0.5);
  expect(sliderValueAtOffset(50, 0, bounds, false)).toBe(-0.5);
});

test("places the same numeric start and range at the correct physical edge in RTL and inverted sliders", () => {
  const bounds = getSliderRange(0, 10, 1);
  expect(sliderStartsAtRight("ltr", false)).toBe(false);
  expect(sliderStartsAtRight("rtl", false)).toBe(true);
  expect(sliderStartsAtRight("ltr", true)).toBe(true);
  expect(sliderStartsAtRight("rtl", true)).toBe(false);
  expect(sliderValueAtOffset(20, 100, bounds, true)).toBe(8);
  expect(sliderGeometry(0, 100, 16, bounds, true)).toEqual({ fillStart: 100, fillWidth: 0, thumbStart: 84 });
  expect(sliderGeometry(5, 100, 16, bounds, true)).toEqual({ fillStart: 50, fillWidth: 50, thumbStart: 42 });
  expect(sliderGeometry(10, 100, 16, bounds, true)).toEqual({ fillStart: 0, fillWidth: 100, thumbStart: 0 });
});

test("keeps tiny, degenerate and invalid domains inside the track", () => {
  const bounds = getSliderRange(4, -2, 0);
  expect(bounds).toEqual({ min: 4, max: 4, step: 1 });
  expect(sliderGeometry(NaN, 10, 16, bounds, true)).toEqual({ fillStart: 10, fillWidth: 0, thumbStart: 0 });
  expect(sliderPosition.height).toBe(44);
  expect(sliderCases.map(item => [item.value, item.disabled, item.dir])).toEqual([
    [1, false, "ltr"], [10, true, "ltr"], [0, false, "rtl"],
  ]);
});

test("audio position adjustments remain device-local", () => {
  const entry = operationsCatalog.find(item => item.source === "apps/mobile-native/device/audio-controller.ts");
  expect(entry?.status).toBe("excluded");
  expect(entry?.actions).toContain("seekTo");
  expect(entry?.tools).toEqual([]);
});
