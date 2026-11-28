"use client";

import React, { useId, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { staticsSimSpecSchema } from "@/lib/assessment-ui-sdk/engineering-sim-schema";
import { solveStaticsBeam } from "@/lib/assessment-ui-sdk/statics-thermo-solver";
import { SimulationShell, type SimulationReadout } from "./simulation-shell";
import { EngineeringSupport, EngineeringVector } from "./engineering-svg-primitives";

const SVG_W = 540;
const SVG_H = 220;

export function StaticsSimViewer({ spec: rawSpec }: { spec: Record<string, unknown> }) {
  const parsed = useMemo(() => staticsSimSpecSchema.safeParse(rawSpec), [rawSpec]);
  const baseSpec = parsed.success ? parsed.data : null;
  const [loadScale, setLoadScale] = useState(1);
  const [activeView, setActiveView] = useState("fbd");
  const markerId = `${useId().replace(/:/g, "")}-statics-vec-arrow`;

  const effectiveSpec = useMemo(() => {
    if (!baseSpec) return null;
    return {
      ...baseSpec,
      loads: baseSpec.loads.map((l) => ({ ...l, magnitude: l.magnitude * loadScale })),
    };
  }, [baseSpec, loadScale]);

  const solved = useMemo(
    () => (effectiveSpec ? solveStaticsBeam(effectiveSpec, 100) : null),
    [effectiveSpec],
  );

  if (!effectiveSpec || !solved) {
    return (
      <div
        role="status"
        data-assessment-visual-fallback="statics"
        className="border-l-2 border-border pl-3 py-1 text-body-xs text-muted-foreground"
      >
        Spesifikasi diagram statika belum lengkap untuk ditampilkan.
      </div>
    );
  }

  const L = effectiveSpec.beamLength;
  const padX = 64;
  const beamY = 128;
  const toX = (x: number) => padX + (x / L) * (SVG_W - padX * 2);

  const readouts: SimulationReadout[] = [
    ...solved.reactions.flatMap((r) => {
      const items: SimulationReadout[] = [
        {
          label: `$R_${r.label}$`,
          value: `${r.ry.toFixed(2)} ${effectiveSpec.unitForce}`,
          tone: "success",
        },
      ];
      if (r.ma !== undefined) {
        items.push({
          label: `$M_${r.label}$`,
          value: `${r.ma.toFixed(2)} ${effectiveSpec.unitForce}·${effectiveSpec.unitLength}`,
          tone: "success",
        });
      }
      return items;
    }),
    {
      label: "$|V|_{\\max}$",
      value: `${solved.maxAbsV.toFixed(2)} ${effectiveSpec.unitForce}`,
      tone: "primary",
    },
    {
      label: "$|M|_{\\max}$",
      value: `${solved.maxAbsM.toFixed(2)} ${effectiveSpec.unitForce}·${effectiveSpec.unitLength}`,
      tone: "secondary",
    },
  ];

  const renderFbdSvg = () => (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      role="img"
      aria-label="Diagram benda bebas balok statika"
      className="block h-auto w-full select-none"
    >
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 1 L 10 5 L 0 9 z" fill="context-stroke" />
        </marker>
      </defs>

      {/* Beam body */}
      <rect
        x={toX(0)}
        y={beamY - 6}
        width={toX(L) - toX(0)}
        height={12}
        rx={3}
        className="fill-muted stroke-foreground"
        strokeWidth={1.8}
      />

      {/* Supports & Reaction vectors */}
      {solved.reactions.map((r, idx) => {
        const sx = toX(r.x);
        return (
          <g key={`sup-${idx}`}>
            <EngineeringSupport type={r.type} x={sx} y={beamY + 6} label={`${r.label} (${r.x}${effectiveSpec.unitLength})`} />
            {Math.abs(r.ry) > 1e-3 ? (
              <EngineeringVector
                x1={sx}
                y1={beamY + 66}
                x2={sx}
                y2={beamY + 26}
                color="var(--color-status-success)"
                markerId={markerId}
                label={`R${r.label}=${r.ry.toFixed(1)}`}
              />
            ) : null}
          </g>
        );
      })}

      {/* Applied loads */}
      {effectiveSpec.loads.map((load, idx) => {
        if (load.type === "point") {
          const lx = toX(load.x);
          const downward = load.magnitude >= 0;
          return (
            <EngineeringVector
              key={`load-${idx}`}
              x1={lx}
              y1={downward ? beamY - 62 : beamY + 62}
              x2={lx}
              y2={downward ? beamY - 8 : beamY + 8}
              color="var(--color-status-error)"
              markerId={markerId}
              label={load.label ?? `${Math.abs(load.magnitude).toFixed(1)} ${effectiveSpec.unitForce}`}
            />
          );
        }
        if (load.type === "distributed") {
          const x1 = toX(load.x);
          const x2 = toX(load.xEnd ?? L);
          const arrows = 6;
          return (
            <g key={`dist-${idx}`}>
              <rect
                x={x1}
                y={beamY - 46}
                width={Math.max(4, x2 - x1)}
                height={38}
                fill="var(--color-status-warning)"
                fillOpacity={0.14}
                stroke="var(--color-status-warning)"
                strokeWidth={1.3}
              />
              {Array.from({ length: arrows + 1 }).map((_, aIdx) => {
                const ax = x1 + ((x2 - x1) * aIdx) / arrows;
                return (
                  <line
                    key={aIdx}
                    x1={ax}
                    y1={beamY - 46}
                    x2={ax}
                    y2={beamY - 10}
                    stroke="var(--color-status-warning)"
                    strokeWidth={1.4}
                    markerEnd={`url(#${markerId})`}
                  />
                );
              })}
              <text
                x={(x1 + x2) / 2}
                y={beamY - 54}
                textAnchor="middle"
                fill="var(--color-status-warning)"
                className="text-[11px] font-sans font-semibold"
              >
                {load.label ?? `w = ${load.magnitude.toFixed(1)} ${effectiveSpec.unitForce}/${effectiveSpec.unitLength}`}
              </text>
            </g>
          );
        }
        if (load.type === "moment") {
          const mx = toX(load.x);
          const ccw = load.magnitude >= 0;
          const arcD = ccw
            ? `M ${mx - 14} ${beamY - 22} A 18 18 0 1 1 ${mx + 14} ${beamY - 22}`
            : `M ${mx + 14} ${beamY - 22} A 18 18 0 1 0 ${mx - 14} ${beamY - 22}`;
          return (
            <g key={`mom-${idx}`}>
              <path
                d={arcD}
                fill="none"
                stroke="var(--color-primary)"
                strokeWidth={2}
                markerEnd={`url(#${markerId})`}
              />
              <text
                x={mx}
                y={beamY - 46}
                textAnchor="middle"
                fill="var(--color-primary)"
                className="text-[11px] font-sans font-semibold"
              >
                {load.label ?? `M = ${Math.abs(load.magnitude).toFixed(1)} ${effectiveSpec.unitForce}·${effectiveSpec.unitLength}`}
              </text>
            </g>
          );
        }
        return null;
      })}
    </svg>
  );

  const renderDiagram = (key: "V" | "M", label: string, unit: string, color: string) => (
    <div className="h-[230px] w-full p-3">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={solved.points} margin={{ top: 10, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.5} />
          <XAxis
            dataKey="x"
            type="number"
            domain={[0, L]}
            tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            unit={effectiveSpec.unitLength}
          />
          <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} unit={` ${unit}`} />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-card)",
              borderColor: "var(--color-border)",
              fontSize: "12px",
              borderRadius: "8px",
            }}
          />
          <ReferenceLine y={0} stroke="var(--color-muted-foreground)" strokeWidth={1.2} />
          <Area
            type={key === "V" ? "stepAfter" : "monotone"}
            dataKey={key}
            name={label}
            stroke={color}
            fill={color}
            fillOpacity={0.18}
            strokeWidth={2}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );

  return (
    <SimulationShell
      dataKind="statics-beam"
      onReset={() => setLoadScale(1)}
      views={[
        { value: "fbd", label: "Diagram Gaya (FBD)" },
        { value: "sfd", label: "Geser V(x)" },
        { value: "bmd", label: "Momen M(x)" },
      ]}
      activeView={activeView}
      onViewChange={setActiveView}
      readouts={readouts}
      parameters={[
        {
          id: "load-scale",
          label: "Skala beban luar",
          value: loadScale,
          min: 0.25,
          max: 2.5,
          step: 0.05,
          unit: "×",
          onChange: setLoadScale,
        },
      ]}
      summary={effectiveSpec.summary}
    >
      {activeView === "fbd"
        ? renderFbdSvg()
        : activeView === "sfd"
          ? renderDiagram("V", "Gaya Geser V(x)", effectiveSpec.unitForce, "var(--color-brand-primary)")
          : renderDiagram(
              "M",
              "Momen Lentur M(x)",
              `${effectiveSpec.unitForce}·${effectiveSpec.unitLength}`,
              "var(--color-brand-secondary)",
            )}
    </SimulationShell>
  );
}
