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

  test("normalizes LaTeX functions and implicit products emitted by Zyra", () => {
    const cases = [
      { source: String.raw`$y = \sin(x)$`, normalized: "sin(x)", x: Math.PI / 2, y: 1 },
      { source: String.raw`\(f(x)=2\cos(\pi x)\)`, normalized: "2*cos(pi*x)", x: 2, y: 2 },
      { source: "$y=x(x-1)$", normalized: "x*(x-1)", x: 2, y: 2 },
      { source: String.raw`\[y = \ln(x)\]`, normalized: "log(x)", x: Math.E, y: 1 },
      { source: String.raw`$y=\sin^{2}(x)$`, normalized: "(sin(x))^2", x: Math.PI / 2, y: 1 },
      { source: String.raw`$y=\left|x\right|$`, normalized: "abs(x)", x: -2, y: 2 },
      { source: String.raw`$y=\frac{x^2-1}{x-1}, x \ne 1$`, normalized: "((x^2-1)/(x-1))", x: 2, y: 3 },
    ];

    for (const item of cases) {
      const normalized = normalizeLegacyGraphExpression(item.source);
      expect(normalized).toBe(item.normalized);
      expect(compileSafeExpression(normalized, { variables: ["x"] }).evaluate({ x: item.x })).toBeCloseTo(item.y);
    }
  });

  test("supports grouped arithmetic in the safe parser", () => {
    expect(compileSafeExpression("(x - 1) * (x + 1)", { variables: ["x"] }).evaluate({ x: 3 })).toBe(8);
  });
});
