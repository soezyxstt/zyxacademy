"use client";

import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MathText } from "@/components/course/math-text";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  evaluateFunctionPlot,
  resetCanvasValues,
  safeExpressionToLatex,
  type ChemistryCanvas,
  type CanvasSpec,
  type DataPlotCanvas,
  type DerivationCanvas,
  type DiagramCanvas,
  type FunctionPlotCanvas,
  type VectorCanvas,
} from "@/lib/zyra/canvas";

function valuesForSpec(spec: CanvasSpec): Record<string, number> {
  return resetCanvasValues(spec.variables);
}

function FunctionPlot({ spec }: { spec: FunctionPlotCanvas }) {
  const [values, setValues] = useState(() => valuesForSpec(spec));
  const [expressions, setExpressions] = useState<Record<string, string>>(() => (
    Object.fromEntries(spec.series.map((series) => [series.id, series.expression]))
  ));
  const evaluated = useMemo(
    () => evaluateFunctionPlot(spec, values, expressions),
    [expressions, spec, values],
  );
  const yValues = evaluated.flatMap((series) => series.points.flatMap((point) => point.y ?? []));
  const invalidSeries = evaluated.filter((series) => series.points.every((point) => point.y === null));
  const yMin = yValues.length > 0 ? Math.min(...yValues) : -1;
  const yMax = yValues.length > 0 ? Math.max(...yValues) : 1;
  const ySpan = Math.max(1, yMax - yMin);
  const plotYMin = yMin - ySpan * 0.1;
  const plotYMax = yMax + ySpan * 0.1;
  const chartData = evaluated[0]?.points.map((point, pointIndex) => ({
    x: point.x,
    ...Object.fromEntries(evaluated.map((series) => [series.id, series.points[pointIndex]?.y ?? null])),
  })) ?? [];
  const roots = evaluated.flatMap((series, seriesIndex) => series.points.slice(1).flatMap((point, pointIndex) => {
    const previous = series.points[pointIndex];
    if (!previous || previous.y === null || point.y === null || Math.sign(previous.y) === Math.sign(point.y) || previous.y === point.y) return [];
    const ratio = Math.abs(previous.y) / (Math.abs(previous.y) + Math.abs(point.y));
    return [{
      id: `${series.id}-${pointIndex}`,
      x: previous.x + (point.x - previous.x) * ratio,
      color: seriesIndex % 2 === 0 ? "var(--color-primary)" : "var(--color-brand-secondary)",
    }];
  }));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        {spec.controls.map((control) => {
          const variable = spec.variables.find((item) => item.id === control.variableId);
          if (!variable) return null;
          const value = values[variable.id] ?? variable.defaultValue;
          return (
            <label key={control.variableId} className="space-y-1 text-body-sm text-foreground">
              <span className="flex items-center justify-between gap-2 font-semibold">
                <span>{control.label}</span>
                <span className="font-mono text-muted-foreground">
                  {value} {control.unit ?? variable.unit ?? ""}
                </span>
              </span>
              <input
                type="range"
                min={control.min}
                max={control.max}
                step={control.step}
                value={value}
                aria-label={control.label}
                className="w-full accent-[var(--color-primary)]"
                onChange={(event) => setValues((current) => ({
                  ...current,
                  [variable.id]: Number(event.target.value),
                }))}
              />
            </label>
          );
        })}
      </div>
      <div className="space-y-2">
        {spec.series.map((series) => (
          <label key={series.id} className="block space-y-1 text-body-sm font-semibold text-foreground">
            <span>{series.label}</span>
            <Input
              value={expressions[series.id] ?? ""}
              aria-label={`Formula ${series.label}`}
              onChange={(event) => setExpressions((current) => ({
                ...current,
                [series.id]: event.target.value,
              }))}
              className="font-mono"
            />
            {invalidSeries.some((item) => item.id === series.id) && (
              <span role="alert" className="block text-body-xs font-normal text-status-error">
                Rumus belum dapat dibaca. Gunakan angka, variabel yang tersedia, dan operasi matematika dasar.
              </span>
            )}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 text-body-sm text-muted-foreground" aria-label="Rumus yang diplot">
        {spec.series.map((series, index) => (
          <span key={series.id} className="inline-flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ backgroundColor: index % 2 === 0 ? "var(--color-primary)" : "var(--color-brand-secondary)" }} />
            <MathText>{`$${series.label} = ${safeExpressionToLatex(
              expressions[series.id] ?? series.expression,
              ["x", ...spec.variables.map((variable) => variable.id)],
            )}$`}</MathText>
          </span>
        ))}
      </div>
      <div className="h-[360px] w-full rounded-lg border border-border bg-background p-2" role="img" aria-label={spec.altText}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 16, right: 18, bottom: 18, left: 2 }}>
            <CartesianGrid stroke="var(--color-border)" strokeOpacity={0.55} strokeDasharray="4 4" />
            <XAxis
              type="number"
              dataKey="x"
              domain={[spec.domain.min, spec.domain.max]}
              tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
              tickLine={{ stroke: "var(--color-border)" }}
              axisLine={{ stroke: "var(--color-foreground)", strokeOpacity: 0.65 }}
              label={{ value: spec.domain.unit ? `x (${spec.domain.unit})` : "x", position: "insideBottomRight", offset: -8, fill: "var(--color-muted-foreground)" }}
            />
            <YAxis
              domain={[plotYMin, plotYMax]}
              width={52}
              tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
              tickLine={{ stroke: "var(--color-border)" }}
              axisLine={{ stroke: "var(--color-foreground)", strokeOpacity: 0.65 }}
            />
            <Tooltip
              cursor={{ stroke: "var(--color-muted-foreground)", strokeDasharray: "3 3" }}
              contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, color: "var(--color-popover-foreground)" }}
              labelFormatter={(value) => `x = ${Number(value).toFixed(3)}`}
              formatter={(value, name) => [typeof value === "number" ? Number(value).toFixed(4) : "Tidak terdefinisi", String(name)]}
            />
            {plotYMin <= 0 && plotYMax >= 0 && <ReferenceLine y={0} stroke="var(--color-foreground)" strokeOpacity={0.75} />}
            {spec.domain.min <= 0 && spec.domain.max >= 0 && <ReferenceLine x={0} stroke="var(--color-foreground)" strokeOpacity={0.75} />}
            {evaluated.map((series, index) => (
              <Line
                key={series.id}
                type="linear"
                dataKey={series.id}
                name={series.label}
                stroke={index % 2 === 0 ? "var(--color-primary)" : "var(--color-brand-secondary)"}
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 5 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
            {roots.map((root) => (
              <ReferenceDot key={root.id} x={root.x} y={0} r={5} fill="var(--color-background)" stroke={root.color} strokeWidth={2} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table className="w-full border-collapse text-body-sm">
        <caption className="sr-only">{spec.altText}</caption>
        <thead>
          <tr className="border-b border-border text-left">
            <th className="px-2 py-1 font-semibold">Fungsi</th>
            <th className="px-2 py-1 font-semibold">Rentang x</th>
            <th className="px-2 py-1 font-semibold">Jumlah titik</th>
          </tr>
        </thead>
        <tbody>
          {evaluated.map((series) => (
            <tr key={series.id} className="border-b border-border/60">
              <td className="px-2 py-1">{series.label}</td>
              <td className="px-2 py-1 font-mono">{spec.domain.min} sampai {spec.domain.max}</td>
              <td className="px-2 py-1">{series.points.filter((point) => point.y !== null).length}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Button type="button" variant="outline" onClick={() => {
        setValues(valuesForSpec(spec));
        setExpressions(Object.fromEntries(spec.series.map((series) => [series.id, series.expression])));
      }}>
        Reset visual
      </Button>
    </div>
  );
}

function FallbackTable({ spec }: { spec: CanvasSpec }) {
  return (
    <div className="space-y-3">
      <p className="text-body-sm text-muted-foreground">{spec.fallback.summary}</p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-body-sm">
          <caption className="sr-only">{spec.altText}</caption>
          <thead>
            <tr className="border-b border-border text-left">
              {spec.fallback.columns.map((column) => <th key={column.id} className="px-2 py-1 font-semibold">{column.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {spec.fallback.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-border/60">
                {spec.fallback.columns.map((column, columnIndex) => <td key={column.id} className="px-2 py-1">{row[columnIndex] ?? ""}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DataPlot({ spec }: { spec: DataPlotCanvas }) {
  const xValues = spec.points.map((point) => point.x);
  const yValues = spec.points.map((point) => point.y);
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);
  const xSpan = Math.max(1, xMax - xMin);
  const ySpan = Math.max(1, yMax - yMin);
  const xDomain: [number, number] = [xMin - xSpan * 0.08, xMax + xSpan * 0.08];
  const yDomain: [number, number] = [yMin - ySpan * 0.08, yMax + ySpan * 0.08];

  return (
    <div className="space-y-3">
      <div className="h-[330px] w-full rounded-lg border border-border bg-background p-2" role="img" aria-label={spec.altText}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 16, right: 18, bottom: 24, left: 2 }}>
            <CartesianGrid stroke="var(--color-border)" strokeOpacity={0.55} strokeDasharray="4 4" />
            <XAxis type="number" dataKey="x" domain={xDomain} name={spec.xLabel} unit={spec.xUnit ?? undefined} tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }} label={{ value: spec.xLabel, position: "insideBottom", offset: -12, fill: "var(--color-muted-foreground)" }} />
            <YAxis type="number" dataKey="y" domain={yDomain} name={spec.yLabel} unit={spec.yUnit ?? undefined} width={54} tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }} label={{ value: spec.yLabel, angle: -90, position: "insideLeft", fill: "var(--color-muted-foreground)" }} />
            <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
            <Scatter data={spec.points} fill="var(--color-primary)" line={{ stroke: "var(--color-primary)", strokeWidth: 2 }} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <table className="w-full border-collapse text-body-sm">
        <caption className="sr-only">{spec.altText}</caption>
        <thead><tr className="border-b border-border text-left"><th className="px-2 py-1 font-semibold">{spec.xLabel}</th><th className="px-2 py-1 font-semibold">{spec.yLabel}</th></tr></thead>
        <tbody>{spec.points.map((point, index) => <tr key={`${point.x}-${point.y}-${index}`} className="border-b border-border/60"><td className="px-2 py-1">{point.x}</td><td className="px-2 py-1">{point.y}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function Derivation({ spec }: { spec: DerivationCanvas }) {
  return (
    <ol className="space-y-3" aria-label={spec.altText}>
      {spec.steps.map((step, index) => (
        <li key={step.id} className="grid gap-1 rounded-lg border border-border bg-background p-3 md:grid-cols-[2rem_1fr]">
          <span className="font-semibold text-muted-foreground">{index + 1}.</span>
          <div className="space-y-1"><p className="font-semibold text-foreground">{step.label}</p><MathText as="div" className="overflow-x-auto text-body-sm text-foreground">{`$$${step.expression}$$`}</MathText><p className="text-body-sm text-muted-foreground">{step.explanation}</p></div>
        </li>
      ))}
    </ol>
  );
}

function Diagram({ spec }: { spec: DiagramCanvas }) {
  const markerId = useId().replace(/:/g, "");
  const width = 720;
  const columns = spec.direction === "down" ? 1 : Math.min(4, Math.max(1, Math.ceil(Math.sqrt(spec.nodes.length))));
  const rows = Math.ceil(spec.nodes.length / columns);
  const height = Math.max(180, rows * 84 + 36);
  const positions = new Map(spec.nodes.map((node, index) => [
    node.id,
    {
      x: columns === 1 ? width / 2 : ((index % columns) + 0.5) * (width / columns),
      y: (Math.floor(index / columns) + 0.5) * (height / rows),
    },
  ]));

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border bg-background">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={spec.altText} className="h-auto min-w-[560px] w-full">
          <title>{spec.altText}</title>
          <defs><marker id={`${markerId}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-muted-foreground)" /></marker></defs>
          {spec.edges.map((edge, index) => {
            const source = positions.get(edge.source);
            const target = positions.get(edge.target);
            if (!source || !target) return null;
            return <g key={`${edge.source}-${edge.target}-${index}`}><line x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke="var(--color-muted-foreground)" strokeWidth="2" markerEnd={`url(#${markerId}-arrow)`} />{edge.label && <text x={(source.x + target.x) / 2} y={(source.y + target.y) / 2 - 6} textAnchor="middle" fill="var(--color-muted-foreground)" fontSize="11">{edge.label.slice(0, 28)}</text>}</g>;
          })}
          {spec.nodes.map((node) => {
            const position = positions.get(node.id);
            if (!position) return null;
            return <g key={node.id}><rect x={position.x - 76} y={position.y - 22} width="152" height="44" rx="8" fill="var(--color-muted)" stroke="var(--color-primary)" /><text x={position.x} y={position.y + 5} textAnchor="middle" fill="var(--color-foreground)" fontSize="13">{node.label.slice(0, 24)}</text></g>;
          })}
        </svg>
      </div>
      <FallbackTable spec={spec} />
    </div>
  );
}

function VectorDiagram({ spec }: { spec: VectorCanvas }) {
  const width = 720;
  const height = 320;
  const max = Math.max(1, ...spec.vectors.flatMap((vector) => [Math.abs(vector.x), Math.abs(vector.y)]));
  const origin = { x: width / 2, y: height / 2 };
  const scale = Math.min(width, height) * 0.34 / max;
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border bg-background">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={spec.altText} className="h-auto min-w-[560px] w-full">
          <title>{spec.altText}</title>
          <line x1={origin.x} y1="20" x2={origin.x} y2={height - 20} stroke="var(--color-border)" />
          <line x1="20" y1={origin.y} x2={width - 20} y2={origin.y} stroke="var(--color-border)" />
          {spec.vectors.map((vector, index) => {
            const endX = origin.x + vector.x * scale;
            const endY = origin.y - vector.y * scale;
            return <g key={vector.id}><line x1={origin.x} y1={origin.y} x2={endX} y2={endY} stroke={index % 2 === 0 ? "var(--color-primary)" : "var(--color-secondary)"} strokeWidth="3" /><circle cx={endX} cy={endY} r="5" fill="var(--color-primary)" /><text x={endX + 7} y={endY - 7} fill="var(--color-foreground)" fontSize="13">{vector.label.slice(0, 20)}</text></g>;
          })}
        </svg>
      </div>
      <FallbackTable spec={spec} />
    </div>
  );
}

function ChemistryReaction({ spec }: { spec: ChemistryCanvas }) {
  const format = (items: ChemistryCanvas["reactants"]) => items.map((item) => `${item.coefficient === 1 ? "" : `${item.coefficient} `}${item.formula}`).join(" + ");
  return (
    <div className="space-y-3">
      <p className="rounded-lg border border-border bg-background p-4 text-center font-mono text-body-md text-foreground" aria-label={spec.altText}>{format(spec.reactants)} → {format(spec.products)}</p>
      <FallbackTable spec={spec} />
    </div>
  );
}

export function LearningCanvasRenderer({ spec }: { spec: CanvasSpec }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="my-6 w-full min-w-0 space-y-4 rounded-xl border border-border bg-card p-4 md:p-5">
      <div>
        <h3 id={titleId} className="font-heading text-h5 text-foreground">{spec.title}</h3>
        <p className="mt-1 text-body-sm text-muted-foreground">{spec.purpose}</p>
      </div>
      {spec.type === "function_plot" ? <FunctionPlot spec={spec} />
        : spec.type === "data_plot" ? <DataPlot spec={spec} />
          : spec.type === "derivation" ? <Derivation spec={spec} />
            : spec.type === "flowchart" || spec.type === "concept_map" ? <Diagram spec={spec} />
              : spec.type === "vector_diagram" || spec.type === "free_body" ? <VectorDiagram spec={spec} />
                : spec.type === "chemistry_reaction" ? <ChemistryReaction spec={spec} />
                  : <FallbackTable spec={spec} />}
    </section>
  );
}
