import { expect, test } from "bun:test";
import { visualFunctionToLatex } from "@/lib/math/visual-function-latex";

test("polynomial labels preserve signs, powers and zero terms", () => {
  expect(visualFunctionToLatex({ kind: "quadratic", a: 1, b: -1, c: 0 })).toBe("f(x)=x^2-x");
  expect(visualFunctionToLatex({ kind: "linear", m: -2, b: 3 })).toBe("f(x)=-2x+3");
  expect(visualFunctionToLatex({ kind: "constant", c: 0 })).toBe("f(x)=0");
  expect(visualFunctionToLatex({ kind: "linear", m: 0.0004, b: 0 })).toContain("10^{-4}");
  expect(visualFunctionToLatex({ kind: "linear", m: 1.00001, b: 0 })).toBe("f(x)=1.00001x");
});
