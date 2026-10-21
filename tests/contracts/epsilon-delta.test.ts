import { describe, expect, test } from "bun:test";
import { deriveEpsilonDelta, sampleEpsilonDeltaCurve } from "@/lib/materials/epsilon-delta";
import { evaluateVisualFunction, type VisualFunctionModel } from "@/lib/materials/visual-contract";

function modelSpec(functionModel: VisualFunctionModel, limitPoint = 0) {
  return {
    functionModel,
    limitPoint,
    limitValue: evaluateVisualFunction(functionModel, limitPoint),
    bounds: { xMin: limitPoint - 4, xMax: limitPoint + 4, yMin: -100, yMax: 100 },
  };
}

describe("analytical epsilon-delta bound", () => {
  test("a clipped quadratic arch has separate visible branches, without an invented chord", () => {
    const spec = {
      ...modelSpec({ kind: "quadratic", a: -1, b: 0, c: 0 }),
      bounds: { xMin: -3, xMax: 3, yMin: -4, yMax: -1 },
    };
    const segments = sampleEpsilonDeltaCurve(spec);
    expect(segments).toHaveLength(2);
    expect(segments[0]!.every(({ x, y }) => x <= -1 && y >= -4 && y <= -1)).toBe(true);
    expect(segments[1]!.every(({ x, y }) => x >= 1 && y >= -4 && y <= -1)).toBe(true);
  });

  test("overflowing samples cannot become SVG coordinates", () => {
    const segments = sampleEpsilonDeltaCurve({
      ...modelSpec({ kind: "quadratic", a: Number.MAX_VALUE, b: 0, c: 0 }),
      bounds: { xMin: -3, xMax: 3, yMin: -10, yMax: 10 },
    });
    expect(segments.flat().every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
    expect(segments.flat()).toEqual([{ x: 0, y: 0 }]);
  });

  test("x squared does not scale delta proportionally to epsilon", () => {
    const result = deriveEpsilonDelta(modelSpec({ kind: "quadratic", a: 1, b: 0, c: 0 }), 2);
    expect(result.status).toBe("guaranteed");
    expect(result.delta!).toBeLessThan(Math.sqrt(2));
    // The old delta=2 included x=1.5, whose output 2.25 violates epsilon=2.
    expect(result.delta!).toBeLessThan(1.5);
  });

  test("supported polynomial families satisfy their analytical bound across epsilon ranges", () => {
    const cases = [
      modelSpec({ kind: "constant", c: 3 }, 2),
      modelSpec({ kind: "linear", m: 0, b: 3 }, 2),
      modelSpec({ kind: "linear", m: -3, b: 2 }, 1),
      modelSpec({ kind: "quadratic", a: -2, b: 3, c: 5 }, 1),
      modelSpec({ kind: "quadratic", a: 1, b: -4, c: 4 }, 2),
    ];
    for (const spec of cases) {
      for (const epsilon of [1e-8, 0.01, 0.5, 2, 20]) {
        const result = deriveEpsilonDelta(spec, epsilon);
        expect(result.status).toBe("guaranteed");
        const delta = result.delta!;
        const a = spec.functionModel.kind === "quadratic" ? spec.functionModel.a : 0;
        const b = spec.functionModel.kind === "constant" ? 0
          : spec.functionModel.kind === "linear" ? spec.functionModel.m : spec.functionModel.b;
        // This upper bound applies to every h in the interval, not only sampled x values.
        expect(delta * (Math.abs(2 * a * spec.limitPoint + b) + Math.abs(a) * delta)).toBeLessThan(epsilon);
        expect(spec.limitPoint - delta).toBeGreaterThanOrEqual(spec.bounds.xMin);
        expect(spec.limitPoint + delta).toBeLessThanOrEqual(spec.bounds.xMax);
      }
    }
  });

  test("a nonzero center mismatch consumes the available epsilon", () => {
    const spec = { ...modelSpec({ kind: "linear", m: 1, b: 0 }), limitValue: 5e-7 };
    expect(deriveEpsilonDelta(spec, 1e-8).status).toBe("resolution_limited");
    const result = deriveEpsilonDelta(spec, 1e-6);
    expect(result.status).toBe("guaranteed");
    expect(result.delta!).toBeLessThan(5e-7);
  });

  test("never raises a small delta to a fixed display minimum", () => {
    const result = deriveEpsilonDelta(modelSpec({ kind: "linear", m: 1e5, b: 0 }), 1e-6);
    expect(result.status).toBe("guaranteed");
    expect(result.delta!).toBeLessThanOrEqual(1e-11);
    expect(result.delta!).toBeGreaterThan(0);
  });

  test("refuses invalid, overflowing, cancellation-limited, and unrepresentable cases", () => {
    const ordinary = modelSpec({ kind: "linear", m: 1, b: 0 });
    for (const epsilon of [0, -1, Number.NaN, Infinity, Number.MIN_VALUE]) {
      expect(deriveEpsilonDelta(ordinary, epsilon).status).toBe("resolution_limited");
    }
    expect(deriveEpsilonDelta({ ...ordinary, bounds: { ...ordinary.bounds, xMin: 0 } }, 1).status).toBe("resolution_limited");
    expect(deriveEpsilonDelta(modelSpec({ kind: "quadratic", a: 1e308, b: 0, c: 0 }, 2), 1).status).toBe("resolution_limited");
    expect(deriveEpsilonDelta(modelSpec({ kind: "quadratic", a: 1e16, b: -2e16, c: 1e16 }, 1), 1).status).toBe("resolution_limited");
    expect(deriveEpsilonDelta(modelSpec({ kind: "linear", m: 1, b: 0 }, 1e16), 1).status).toBe("resolution_limited");
  });
});
