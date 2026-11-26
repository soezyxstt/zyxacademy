import { expect, test } from "bun:test";

import { componentNames, galleryCases } from "../../packages/ui-parity/gallery";
import { getProgressPosition, progressCases } from "../../packages/ui-parity/progress-cases";
import { getIntegerProgressRange, getProgressValue } from "../../packages/ui-primitives/progress";

test("the Expo and web galleries share three centered progress cases", () => {
  expect(componentNames).toContain("progress");
  expect(galleryCases.filter(item => item.component === "progress").map(item => item.id))
    .toEqual(progressCases.map(item => item.id));
  expect(getProgressPosition()).toEqual({ position: "absolute", left: 32, top: 46, width: 256, height: 8 });
  expect(progressCases.map(({ value, max, theme }) => {
    const state = getProgressValue(value, max);
    return { theme, width: getProgressPosition().width * state.percent / 100, range: getIntegerProgressRange(state) };
  })).toEqual([
    { theme: "light", width: 0, range: { min: 0, max: 100, now: 0 } },
    { theme: "dark", width: 96, range: { min: 0, max: 8, now: 3 } },
    { theme: "light", width: 256, range: { min: 0, max: 8, now: 8 } },
  ]);
});

test("the visual and accessible ranges both clamp progress to the supplied bounds", () => {
  expect(getProgressValue(-1, 8)).toEqual({ min: 0, max: 8, now: 0, percent: 0 });
  expect(getProgressValue(11, 8)).toEqual({ min: 0, max: 8, now: 8, percent: 100 });
  expect(getProgressValue(Number.NaN, 8)).toEqual({ min: 0, max: 8, now: 0, percent: 0 });
  expect(getProgressValue(37, 0)).toEqual({ min: 0, max: 100, now: 37, percent: 37 });
  expect(getProgressValue(37)).toEqual({ min: 0, max: 100, now: 37, percent: 37 });
});

test("native accessibility converts fractional or out-of-range integers to an integer percentage", () => {
  const fractional = getProgressValue(1.5, 3);
  expect(fractional.percent).toBe(50);
  expect(getIntegerProgressRange(fractional)).toEqual({ min: 0, max: 100, now: 50 });
  const large = getProgressValue(3_000_000_000, 4_000_000_000);
  expect(getIntegerProgressRange(large)).toEqual({ min: 0, max: 100, now: 75 });
});
