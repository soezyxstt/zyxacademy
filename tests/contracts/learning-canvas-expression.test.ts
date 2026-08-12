import { describe, expect, test } from "bun:test";
import { compileSafeExpression, normalizeLegacyGraphExpression, parseSafeExpression } from "@/lib/zyra/canvas";

describe("Learning Canvas safe expressions", () => {
  test("evaluates approved arithmetic and functions", () => {
    const expression = compileSafeExpression("sqrt(x^2 + a^2) + sin(pi / 2)", { variables: ["x", "a"] });
    expect(expression.evaluate({ x: 3, a: 4 })).toBeCloseTo(6);
  });

  test("rejects property access, assignment, and unknown identifiers", () => {
    for (const source of ["Math.random()", "x = 1", "window.alert(x)", "unknown + x", "import(x)"]) {
      expect(() => parseSafeExpression(source, { variables: ["x"] })).toThrow();
    }
  });

  test("rejects excessive expression complexity", () => {
    const source = Array.from({ length: 80 }, () => "x").join("+");
    expect(() => parseSafeExpression(source, { variables: ["x"] })).toThrow(/SAFE_EXPRESSION_TOO_COMPLEX/);
  });

  test("rejects division by zero and non-finite results", () => {
    const expression = compileSafeExpression("1 / x", { variables: ["x"] });
    expect(() => expression.evaluate({ x: 0 })).toThrow(/SAFE_EXPRESSION_DIVISION_BY_ZERO/);
  });

  test("keeps evaluation local and deterministic", () => {
    const expression = compileSafeExpression("a*x + b", { variables: ["x", "a", "b"] });
    expect(expression.evaluate({ x: 2, a: 3, b: 1 })).toBe(7);
    expect(expression.evaluate({ x: 2, a: 3, b: 1 })).toBe(7);
  });

  test("normalizes legacy graph notation before safe evaluation", () => {
    const normalized = normalizeLegacyGraphExpression("$y = 2x² - 4$");
    expect(normalized).toBe("2*x^2 - 4");
    expect(compileSafeExpression(normalized, { variables: ["x"] }).evaluate({ x: 2 })).toBe(4);
  });

  test("supports grouped arithmetic in the safe parser", () => {
    expect(compileSafeExpression("(x - 1) * (x + 1)", { variables: ["x"] }).evaluate({ x: 3 })).toBe(8);
  });
});
