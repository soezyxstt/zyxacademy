import { expect, test } from "bun:test";
import { expectedComputeFunctionCount, readComputeFunctionCount } from "../../scripts/neon/worker-function-count.mjs";

test("worker readiness follows the canonical registration list", () => {
  expect(expectedComputeFunctionCount).toBe(30);
  expect(readComputeFunctionCount("export const computeFunctions = [first, second,];")).toBe(2);
  for (const source of ["", "export const computeFunctions = [];", "export const computeFunctions = [first, first];", "export const computeFunctions = [factory()];"]) {
    expect(() => readComputeFunctionCount(source)).toThrow();
  }
});
