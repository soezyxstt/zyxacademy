"use client";

import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  evaluateFunctionPlot,
  resetCanvasValues,
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

function pathForPoints(
  points: Array<{ x: number; y: number | null }>,
  mapX: (value: number) => number,
  mapY: (value: number) => number,
): string {
  let path = "";
  let open = false;
  for (const point of points) {
    if (point.y === null) {
      open = false;
      continue;
    }
    const command = open ? "L" : "M";
    path += `${command} ${mapX(point.x).toFixed(2)} ${mapY(point.y).toFixed(2)} `;
    open = true;
  }
  return path.trim();
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
  const yMin = yValues.length > 0 ? Math.min(...yValues) : -1;
  const yMax = yValues.length > 0 ? Math.max(...yValues) : 1;
  const ySpan = Math.max(1, yMax - yMin);
  const plotYMin = yMin - ySpan * 0.1;
  const plotYMax = yMax + ySpan * 0.1;
  const width = 720;
  const height = 340;
  const pad = { left: 48, right: 20, top: 20, bottom: 38 };
  const mapX = (value: number) => pad.left + ((value - spec.domain.min) / (spec.domain.max - spec.domain.min)) * (width - pad.left - pad.right);
  const mapY = (value: number) => pad.top + ((plotYMax - value) / (plotYMax - plotYMin)) * (height - pad.top - pad.bottom);

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
          </label>
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-background">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={spec.altText}
          className="h-auto min-w-[560px] w-full"
        >
          <rect x={pad.left} y={pad.top} width={width - pad.left - pad.right} height={height - pad.top - pad.bottom} fill="var(--color-muted)" fillOpacity="0.18" />
          <line x1={pad.left} y1={mapY(0)} x2={width - pad.right} y2={mapY(0)} stroke="var(--color-border)" />
          <line x1={mapX(0)} y1={pad.top} x2={mapX(0)} y2={height - pad.bottom} stroke="var(--color-border)" />
          {evaluated.map((series, index) => (
            <path
              key={series.id}
              d={pathForPoints(series.points, mapX, mapY)}
              fill="none"
              stroke={index % 2 === 0 ? "var(--color-primary)" : "var(--color-secondary)"}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </svg>
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
  const width = 720;
  const height = 300;
  const pad = { left: 48, right: 20, top: 20, bottom: 38 };
  const xValues = spec.points.map((point) => point.x);
  const yValues = spec.points.map((point) => point.y);
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);
  const xSpan = Math.max(1, xMax - xMin);
  const ySpan = Math.max(1, yMax - yMin);
  const mapX = (value: number) => pad.left + ((value - xMin) / xSpan) * (width - pad.left - pad.right);
  const mapY = (value: number) => pad.top + ((yMax - value) / ySpan) * (height - pad.top - pad.bottom);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border bg-background">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={spec.altText} className="h-auto min-w-[560px] w-full">
          <title>{spec.altText}</title>
          <rect x={pad.left} y={pad.top} width={width - pad.left - pad.right} height={height - pad.top - pad.bottom} fill="var(--color-muted)" fillOpacity="0.18" />
          {spec.points.map((point, index) => (
            <circle key={`${point.x}-${point.y}-${index}`} cx={mapX(point.x)} cy={mapY(point.y)} r="5" fill="var(--color-primary)" />
          ))}
        </svg>
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
          <div className="space-y-1"><p className="font-semibold text-foreground">{step.label}</p><p className="font-mono text-body-sm text-foreground">{step.expression}</p><p className="text-body-sm text-muted-foreground">{step.explanation}</p></div>
        </li>
      ))}
    </ol>
  );
}

function Diagram({ spec }: { spec: DiagramCanvas }) {
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
          {spec.edges.map((edge, index) => {
            const source = positions.get(edge.source);
            const target = positions.get(edge.target);
            if (!source || !target) return null;
            return <line key={`${edge.source}-${edge.target}-${index}`} x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke="var(--color-border)" strokeWidth="2" />;
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
    <section aria-labelledby={titleId} className="my-6 space-y-4 rounded-xl border border-border bg-card p-4 md:p-5">
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
