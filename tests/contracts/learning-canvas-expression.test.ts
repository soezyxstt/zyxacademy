import { describe, expect, test } from "bun:test";
import {
  compileSafeExpression,
  normalizeLegacyGraphExpression,
  parseSafeExpression,
  safeExpressionToLatex,
} from "@/lib/zyra/canvas";

describe("Learning Canvas safe expressions", () => {
  test("evaluates approved arithmetic and functions", () => {
    const expression = compileSafeExpression("sqrt(x^2 + a^2) + sin(pi / 2)", { variables: ["x", "a"] });
    expect(expression.evaluate({ x: 3, a: 4 })).toBeCloseTo(6);
  });

  test("rejects property access, assignment, and unknown identifiers", () => {
    for (const source of ["Math.random()", "x = 1", "window.alert(x)", "unknown + x", "import(x)", "constructor(0)", "toString(0)", "valueOf(0)", "__proto__(0)"]) {
      expect(() => parseSafeExpression(source, { variables: ["x"] })).toThrow();
    }
  });

  test("evaluates every allowed function", () => {
    for (const [source, expected] of [["abs(-2)", 2], ["cos(0)", 1], ["exp(0)", 1], ["log(1)", 0], ["max(1,2)", 2], ["min(1,2)", 1], ["sin(0)", 0], ["sqrt(4)", 2], ["tan(0)", 0]] as const) {
      expect(compileSafeExpression(source, { variables: [] }).evaluate({})).toBe(expected);
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

  test("tracks bounded arithmetic scale without changing evaluation", () => {
    const expression = compileSafeExpression("(0.1+0.2-0.3)*x", { variables: ["x"] });
    const tracked = expression.evaluateWithScale({ x: 1000000 });
    expect(tracked.value).toBe(expression.evaluate({ x: 1000000 }));
    expect(tracked.scale).toBeGreaterThanOrEqual(300000);
    expect(Number.isFinite(tracked.scale)).toBe(true);
    expect(compileSafeExpression("0/(1e308-1e308+1e-300)", { variables: [] }).evaluateWithScale({})).toEqual({ value: 0, scale: 0 });
    expect(() => compileSafeExpression("1/x", { variables: ["x"] }).evaluateWithScale({ x: 0 })).toThrow(/SAFE_EXPRESSION_DIVISION_BY_ZERO/);
  });

  test("normalizes legacy graph notation before safe evaluation", () => {
    const normalized = normalizeLegacyGraphExpression("$y = 2x\u00b2 - 4$");
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

  test("formats evaluator syntax as readable mathematical notation", () => {
    expect(safeExpressionToLatex("a*x^2 + b*x + c", ["x", "a", "b", "c"]))
      .toBe("ax^{2} + bx + c");
    expect(safeExpressionToLatex("(x^2 - 1)/(x - 1)", ["x"]))
      .toBe("\\frac{x^{2} - 1}{x - 1}");
  });
});


test("scientific graph labels preserve natural logarithms and coefficient precision", () => {
  expect(safeExpressionToLatex("log(x)", ["x"])).toContain("\\ln");
  expect(compileSafeExpression("log(x)", { variables: ["x"] }).evaluate({ x: Math.E })).toBeCloseTo(1);
  const label = safeExpressionToLatex("0.0000001234567*x", ["x"]);
  expect(label).toContain("1.234567\\times 10^{-7}");
  expect(label).not.toContain("e-7");
  expect(safeExpressionToLatex("(0.0000001234567)^x", ["x"])).toContain("\\left(1.234567\\times 10^{-7}\\right)");
});
