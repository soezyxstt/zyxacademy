import { compileSafeExpression } from "./expression";
import type { CanvasVariable, FunctionPlotCanvas } from "./contracts";

export interface PlotPoint {
  x: number;
  y: number | null;
}

export interface EvaluatedSeries {
  id: string;
  label: string;
  points: PlotPoint[];
}

function defaultValues(variables: readonly CanvasVariable[]): Record<string, number> {
  return Object.fromEntries(variables.map((variable) => [variable.id, variable.defaultValue]));
}

function boundedValue(value: number, variable: CanvasVariable): number {
  return Math.min(variable.max, Math.max(variable.min, value));
}

export function evaluateFunctionPlot(
  spec: FunctionPlotCanvas,
  values: Record<string, number> = {},
  expressionOverrides: Record<string, string> = {},
): EvaluatedSeries[] {
  const variableDefaults = defaultValues(spec.variables);
  const variables = Object.fromEntries(spec.variables.map((variable) => [
    variable.id,
    boundedValue(values[variable.id] ?? variableDefaults[variable.id], variable),
  ]));
  const sampleCount = Math.min(400, Math.max(2, spec.domain.sampleCount));
  const step = (spec.domain.max - spec.domain.min) / (sampleCount - 1);

  return spec.series.map((series) => {
    let compiled: ReturnType<typeof compileSafeExpression> | null = null;
    try {
      compiled = compileSafeExpression(expressionOverrides[series.id] ?? series.expression, {
        variables: ["x", ...spec.variables.map((variable) => variable.id)],
      });
    } catch {
      compiled = null;
    }
    const points: PlotPoint[] = [];
    for (let index = 0; index < sampleCount; index += 1) {
      const x = spec.domain.min + index * step;
      if (!compiled) {
        points.push({ x, y: null });
        continue;
      }
      try {
        const y = compiled.evaluate({ ...variables, x });
        points.push({ x, y: Number.isFinite(y) ? y : null });
      } catch {
        points.push({ x, y: null });
      }
    }
    if (compiled) {
      for (let i = points.length - 1; i > 0; i -= 1) {
        const left = points[i - 1];
        const right = points[i];
        if ((left.y === null) === (right.y === null)) continue;
        let valid = left.y === null ? right : left;
        let invalidX = left.y === null ? left.x : right.x;
        for (let attempt = 0; attempt < 20; attempt += 1) {
          const x = (valid.x + invalidX) / 2;
          try {
            const y = compiled.evaluate({ ...variables, x });
            if (Number.isFinite(y)) { valid = { x, y }; continue; }
          } catch {}
          invalidX = x;
        }
        points.splice(i, 0, valid);
      }
    }
    return { id: series.id, label: series.label, points };
  });
}

export function resetCanvasValues(variables: readonly CanvasVariable[]): Record<string, number> {
  return defaultValues(variables);
}
