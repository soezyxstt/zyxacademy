"use client";

import React from "react";
import { cn } from "@/lib/utils";
import type { MarkdownDensity } from "@/components/course/markdown-renderer";
import { renderRichText } from "@/components/course/markdown-renderer";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from "recharts";

export function BoxPlotChart({ data, xLabel, yLabel }: { data: any[]; xLabel?: string; yLabel?: string }) {
  const padding = { top: 20, right: 30, bottom: 50, left: 55 };
  const width = 500;
  const height = 300;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const allValues = data.flatMap(d => [d.min, d.q1, d.median, d.q3, d.max].filter(v => typeof v === "number"));
  if (allValues.length === 0) {
    return <div className="text-body-sm text-muted-foreground py-10">Tidak ada data untuk Box Plot</div>;
  }
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const valRange = maxVal - minVal || 1;
  const yMin = minVal - valRange * 0.15;
  const yMax = maxVal + valRange * 0.15;

  const mapY = (val: number) => {
    return padding.top + plotHeight - ((val - yMin) / (yMax - yMin)) * plotHeight;
  };

  const mapX = (index: number) => {
    return padding.left + (index + 0.5) * (plotWidth / data.length);
  };

  const ticksCount = 5;
  const ticks = Array.from({ length: ticksCount }).map((_, idx) => {
    return yMin + (idx * (yMax - yMin)) / (ticksCount - 1);
  });

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto max-w-[500px] mx-auto select-none">
        {ticks.map((tick, idx) => (
          <g key={idx}>
            <line
              x1={padding.left}
              y1={mapY(tick)}
              x2={width - padding.right}
              y2={mapY(tick)}
              className="stroke-border/45"
              strokeWidth={0.65}
            />
            <text
              x={padding.left - 10}
              y={mapY(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted-foreground text-[10px] font-sans"
            >
              {tick.toFixed(1)}
            </text>
          </g>
        ))}

        {yLabel && (
          <text
            transform={`rotate(-90 15 ${height / 2})`}
            x={15}
            y={height / 2}
            textAnchor="middle"
            className="fill-foreground text-body-xs font-heading font-bold"
          >
            {yLabel}
          </text>
        )}

        {data.map((d, idx) => {
          const cx = mapX(idx);
          const yMinPos = mapY(d.min ?? 0);
          const yQ1Pos = mapY(d.q1 ?? 0);
          const yMedPos = mapY(d.median ?? 0);
          const yQ3Pos = mapY(d.q3 ?? 0);
          const yMaxPos = mapY(d.max ?? 0);
          
          const boxWidth = Math.min(50, (plotWidth / data.length) * 0.5);
          const halfWidth = boxWidth / 2;

          return (
            <g key={idx}>
              <line x1={cx} y1={yMinPos} x2={cx} y2={yQ1Pos} className="stroke-brand-primary" strokeWidth={1.5} />
              <line x1={cx} y1={yQ3Pos} x2={cx} y2={yMaxPos} className="stroke-brand-primary" strokeWidth={1.5} />
              
              <line x1={cx - 6} y1={yMinPos} x2={cx + 6} y2={yMinPos} className="stroke-brand-primary" strokeWidth={1.5} />
              <line x1={cx - 6} y1={yMaxPos} x2={cx + 6} y2={yMaxPos} className="stroke-brand-primary" strokeWidth={1.5} />

              <rect
                x={cx - halfWidth}
                y={yQ3Pos}
                width={boxWidth}
                height={Math.max(2, yQ1Pos - yQ3Pos)}
                fill="var(--color-brand-primary)"
                fillOpacity={0.15}
                className="stroke-brand-primary hover:fill-opacity-25 transition-all"
                strokeWidth={1.5}
                rx={4}
              />

              <line
                x1={cx - halfWidth}
                y1={yMedPos}
                x2={cx + halfWidth}
                y2={yMedPos}
                className="stroke-brand-secondary"
                strokeWidth={2}
              />

              <text
                x={cx}
                y={height - padding.bottom + 20}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px] font-sans"
              >
                {d.x}
              </text>
            </g>
          );
        })}

        {xLabel && (
          <text
            x={padding.left + plotWidth / 2}
            y={height - 10}
            textAnchor="middle"
            className="fill-foreground text-body-xs font-heading font-bold"
          >
            {xLabel}
          </text>
        )}
      </svg>
    </div>
  );
}

export function ChartRenderer({
  data,
  title,
  caption,
  density,
}: {
  data: any;
  title?: string;
  caption?: string;
  density?: MarkdownDensity;
}) {
  const isCompact = density === "compact";
  const chartType = data.chartType;
  const xLabel = data.xLabel;
  const yLabel = data.yLabel;

  const formattedData = (data.data || []).map((point: any) => {
    if (chartType === "box") {
      if (point.length >= 6) {
        return {
          x: point[0],
          min: Number(point[1]),
          q1: Number(point[2]),
          median: Number(point[3]),
          q3: Number(point[4]),
          max: Number(point[5]),
        };
      }
      const val = Number(point[1]) || 0;
      return {
        x: point[0],
        min: val * 0.8,
        q1: val * 0.9,
        median: val,
        q3: val * 1.1,
        max: val * 1.2,
      };
    }
    return {
      x: point[0],
      y: Number(point[1]) || 0,
    };
  });

  const renderChart = () => {
    switch (chartType) {
      case "bar":
        return (
          <BarChart data={formattedData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
            <XAxis dataKey="x" label={xLabel ? { value: xLabel, position: "insideBottom", offset: -5 } : undefined} />
            <YAxis label={yLabel ? { value: yLabel, angle: -90, position: "insideLeft" } : undefined} />
            <Tooltip contentStyle={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)", borderRadius: "12px" }} />
            <Bar dataKey="y" fill="var(--color-brand-primary)" radius={[4, 4, 0, 0]} />
          </BarChart>
        );
      case "scatter":
        return (
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
            <XAxis type="number" dataKey="x" name={xLabel || "X"} />
            <YAxis type="number" dataKey="y" name={yLabel || "Y"} />
            <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)", borderRadius: "12px" }} />
            <Scatter name="Data" data={formattedData} fill="var(--color-brand-primary)" />
          </ScatterChart>
        );
      case "pie":
        const COLORS = ["var(--color-brand-primary)", "var(--color-brand-secondary)", "var(--color-tertiary-1)", "var(--color-tertiary-2)", "var(--color-tertiary-3)"];
        return (
          <PieChart>
            <Pie data={formattedData} dataKey="y" nameKey="x" cx="50%" cy="50%" outerRadius={80} fill="var(--color-brand-primary)" label>
              {formattedData.map((entry: any, index: number) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)", borderRadius: "12px" }} />
          </PieChart>
        );
      case "area":
        return (
          <AreaChart data={formattedData}>
            <defs>
              <linearGradient id="colorArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-brand-primary)" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="var(--color-brand-primary)" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
            <XAxis dataKey="x" label={xLabel ? { value: xLabel, position: "insideBottom", offset: -5 } : undefined} />
            <YAxis label={yLabel ? { value: yLabel, angle: -90, position: "insideLeft" } : undefined} />
            <Tooltip contentStyle={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)", borderRadius: "12px" }} />
            <Area type="monotone" dataKey="y" stroke="var(--color-brand-primary)" fillOpacity={1} fill="url(#colorArea)" strokeWidth={2} />
          </AreaChart>
        );
      case "line":
      default:
        return (
          <LineChart data={formattedData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
            <XAxis dataKey="x" label={xLabel ? { value: xLabel, position: "insideBottom", offset: -5 } : undefined} />
            <YAxis label={yLabel ? { value: yLabel, angle: -90, position: "insideLeft" } : undefined} />
            <Tooltip contentStyle={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)", borderRadius: "12px" }} />
            <Line type="monotone" dataKey="y" stroke="var(--color-brand-primary)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
          </LineChart>
        );
    }
  };

  if (chartType === "box") {
    return (
      <div className={cn("border border-border bg-card shadow-xs text-center", isCompact ? "my-3 p-3.5 rounded-lg" : "my-6 p-5 rounded-xl")}>
        {title && <h4 className={cn("font-heading text-body-base font-bold text-foreground", isCompact ? "mb-2" : "mb-4")}>{renderRichText(title)}</h4>}
        <BoxPlotChart data={formattedData} xLabel={xLabel} yLabel={yLabel} />
        {caption && <p className={cn("text-body-sm text-muted-foreground italic", isCompact ? "mt-2" : "mt-3")}>{renderRichText(caption)}</p>}
      </div>
    );
  }

  return (
    <div className={cn("border border-border bg-card shadow-xs text-center", isCompact ? "my-3 p-3.5 rounded-lg" : "my-6 p-5 rounded-xl")}>
      {title && <h4 className={cn("font-heading text-body-base font-bold text-foreground", isCompact ? "mb-2" : "mb-4")}>{renderRichText(title)}</h4>}
      <div className="w-full h-[300px] flex items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart()}
        </ResponsiveContainer>
      </div>
      {caption && <p className={cn("text-body-sm text-muted-foreground italic", isCompact ? "mt-2" : "mt-3")}>{renderRichText(caption)}</p>}
    </div>
  );
}
