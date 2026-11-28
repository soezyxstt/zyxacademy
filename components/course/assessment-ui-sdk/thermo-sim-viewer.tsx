"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAppReducedMotion } from "@/components/appearance-preferences";
import { thermoSimSpecSchema } from "@/lib/assessment-ui-sdk/engineering-sim-schema";
import { solveThermoCycle } from "@/lib/assessment-ui-sdk/statics-thermo-solver";
import { SimulationShell, type SimulationReadout } from "./simulation-shell";

export function ThermoSimViewer({ spec: rawSpec }: { spec: Record<string, unknown> }) {
  const parsed = useMemo(() => thermoSimSpecSchema.safeParse(rawSpec), [rawSpec]);
  const spec = parsed.success ? parsed.data : null;
  const reduced = useAppReducedMotion();
  const [isPlaying, setIsPlaying] = useState(!reduced);
  const [speed, setSpeed] = useState(1);
  const [progress, setProgress] = useState(0); // 0..1 across cycle

  const solved = useMemo(() => (spec ? solveThermoCycle(spec, 28) : null), [spec]);

  useEffect(() => {
    if (!spec || reduced || !isPlaying) return;
    let raf = 0;
    let last: number | null = null;
    const tick = (now: number) => {
      if (last !== null) {
        const dp = ((now - last) / 6000) * speed;
        setProgress((prev) => (prev + dp) % 1);
      }
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, reduced, spec, speed]);

  if (!spec || !solved || solved.curve.length === 0) {
    return (
      <div
        role="status"
        data-assessment-visual-fallback="thermo"
        className="border-l-2 border-border pl-3 py-1 text-body-xs text-muted-foreground"
      >
        Spesifikasi siklus termodinamika belum lengkap untuk ditampilkan.
      </div>
    );
  }

  const idx = Math.min(
    solved.curve.length - 1,
    Math.max(0, Math.round(progress * (solved.curve.length - 1))),
  );
  const activePt = solved.curve[idx];
  const volSpan = Math.max(1e-4, solved.maxV - solved.minV);
  const volRatio = Math.max(0.15, Math.min(0.95, 0.2 + 0.72 * ((activePt.V - solved.minV) / volSpan)));
  const tempSpan = Math.max(1e-4, solved.maxT - solved.minT);
  const tempRatio = Math.max(0, Math.min(1, (activePt.T - solved.minT) / tempSpan));

  const readouts: SimulationReadout[] = [
    { label: "$P$", value: `${activePt.P.toFixed(1)} ${spec.unitP}`, tone: "primary" },
    { label: "$V$", value: `${activePt.V.toFixed(2)} ${spec.unitV}`, tone: "secondary" },
    { label: "$W_{\\text{net}}$", value: `${solved.workNet.toFixed(2)} ${spec.unitP}·${spec.unitV}`, tone: "success" },
    { label: "Proses", value: activePt.processType, tone: "warning" },
  ];

  const gasColor =
    tempRatio > 0.65
      ? "var(--color-status-error)"
      : tempRatio > 0.35
        ? "var(--color-status-warning)"
        : "var(--color-brand-primary)";

  const cylTop = 36;
  const cylHeight = 160;
  const pistonY = cylTop + (1 - volRatio) * (cylHeight - 24);

  return (
    <SimulationShell
      dataKind={`thermo-${spec.cycle}`}
      isPlaying={isPlaying}
      onTogglePlay={() => setIsPlaying((prev) => !prev)}
      onReset={() => setProgress(0)}
      speed={speed}
      onSpeedChange={setSpeed}
      time={progress * 6}
      duration={6}
      onTimeScrub={(t) => {
        setIsPlaying(false);
        setProgress(t / 6);
      }}
      readouts={readouts}
      summary={spec.summary}
    >
      <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_170px] sm:items-center">
        {/* P-V Cycle Plot */}
        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={solved.curve} margin={{ top: 10, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.5} />
              <XAxis
                dataKey="V"
                type="number"
                domain={["auto", "auto"]}
                tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                unit={` ${spec.unitV}`}
              />
              <YAxis
                dataKey="P"
                type="number"
                domain={["auto", "auto"]}
                tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                unit={` ${spec.unitP}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--color-card)",
                  borderColor: "var(--color-border)",
                  fontSize: "12px",
                  borderRadius: "8px",
                }}
              />
              <Line
                type="linear"
                dataKey="P"
                name="Tekanan P"
                stroke="var(--color-brand-primary)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <ReferenceDot
                x={activePt.V}
                y={activePt.P}
                r={6}
                fill={gasColor}
                stroke="var(--color-background)"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Synchronized Piston-Cylinder Illustration */}
        {spec.showPiston ? (
          <svg
            viewBox="0 0 160 220"
            role="img"
            aria-label="Ilustrasi silinder piston termodinamika"
            className="mx-auto block h-auto w-[155px] select-none"
          >
            {/* Gas chamber fill */}
            <rect
              x={36}
              y={pistonY + 14}
              width={88}
              height={Math.max(8, cylTop + cylHeight - (pistonY + 14))}
              fill={gasColor}
              fillOpacity={0.22 + tempRatio * 0.25}
            />
            {/* Cylinder walls */}
            <polyline
              fill="none"
              points={`34,${cylTop} 34,${cylTop + cylHeight} 126,${cylTop + cylHeight} 126,${cylTop}`}
              className="stroke-foreground"
              strokeWidth={3}
              strokeLinejoin="round"
            />
            {/* Piston head & rod */}
            <rect
              x={36}
              y={pistonY}
              width={88}
              height={14}
              rx={2}
              className="fill-muted stroke-foreground"
              strokeWidth={1.8}
            />
            <line
              x1={80}
              y1={pistonY}
              x2={80}
              y2={12}
              className="stroke-foreground"
              strokeWidth={5}
              strokeLinecap="round"
            />
            {/* Heat transfer Q indicator */}
            {activePt.qDirection !== "none" ? (
              <text
                x={80}
                y={cylTop + cylHeight + 18}
                textAnchor="middle"
                fill={
                  activePt.qDirection === "in"
                    ? "var(--color-status-error)"
                    : "var(--color-brand-primary)"
                }
                className="text-[11px] font-sans font-bold"
              >
                {activePt.qDirection === "in" ? "↑ Q masuk" : "↓ Q keluar"}
              </text>
            ) : (
              <text
                x={80}
                y={cylTop + cylHeight + 18}
                textAnchor="middle"
                className="fill-muted-foreground text-[11px] font-sans"
              >
                Adiabatik (Q = 0)
              </text>
            )}
          </svg>
        ) : null}
      </div>
    </SimulationShell>
  );
}
