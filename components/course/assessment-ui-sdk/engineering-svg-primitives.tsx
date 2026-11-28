"use client";

import React from "react";
import { vec2 } from "math";

function unitAndNormal(x1: number, y1: number, x2: number, y2: number) {
  const delta = vec2.sub([0, 0], [x2, y2], [x1, y1]);
  const len = vec2.length(delta);
  if (len < 1e-4) {
    return { len: 0, ux: 1, uy: 0, nx: 0, ny: 1 };
  }
  const ux = delta[0] / len;
  const uy = delta[1] / len;
  return { len, ux, uy, nx: -uy, ny: ux };
}

export function EngineeringSpring({
  x1,
  y1,
  x2,
  y2,
  coils = 7,
  amplitude = 8,
  label,
  stroke = "var(--color-brand-primary)",
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  coils?: number;
  amplitude?: number;
  label?: string;
  stroke?: string;
}) {
  const { len, ux, uy, nx, ny } = unitAndNormal(x1, y1, x2, y2);
  if (len < 4) return null;

  const lead = Math.min(14, len * 0.16);
  const bodyLen = Math.max(4, len - lead * 2);
  const points: string[] = [
    `${x1.toFixed(1)},${y1.toFixed(1)}`,
    `${(x1 + ux * lead).toFixed(1)},${(y1 + uy * lead).toFixed(1)}`,
  ];

  const steps = coils * 2;
  for (let i = 1; i < steps; i++) {
    const along = lead + (bodyLen * i) / steps;
    const sign = i % 2 === 1 ? 1 : -1;
    const px = x1 + ux * along + nx * amplitude * sign;
    const py = y1 + uy * along + ny * amplitude * sign;
    points.push(`${px.toFixed(1)},${py.toFixed(1)}`);
  }

  points.push(
    `${(x2 - ux * lead).toFixed(1)},${(y2 - uy * lead).toFixed(1)}`,
    `${x2.toFixed(1)},${y2.toFixed(1)}`,
  );

  const midX = (x1 + x2) / 2 + nx * (amplitude + 11);
  const midY = (y1 + y2) / 2 + ny * (amplitude + 11);

  return (
    <g>
      <polyline
        fill="none"
        points={points.join(" ")}
        stroke={stroke}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {label ? (
        <text
          x={midX}
          y={midY}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-foreground text-[11px] font-sans font-semibold"
        >
          {label}
        </text>
      ) : null}
    </g>
  );
}

export function EngineeringDamper({
  x1,
  y1,
  x2,
  y2,
  width = 14,
  label,
  stroke = "var(--color-brand-secondary)",
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width?: number;
  label?: string;
  stroke?: string;
}) {
  const { len, ux, uy, nx, ny } = unitAndNormal(x1, y1, x2, y2);
  if (len < 12) return null;

  const cylStart = len * 0.28;
  const cylEnd = len * 0.68;
  const pistonPos = len * 0.5;
  const hw = width / 2;

  const pt = (along: number, offset: number) =>
    `${(x1 + ux * along + nx * offset).toFixed(1)},${(y1 + uy * along + ny * offset).toFixed(1)}`;

  const midX = (x1 + x2) / 2 + nx * (hw + 12);
  const midY = (y1 + y2) / 2 + ny * (hw + 12);

  return (
    <g stroke={stroke} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round">
      {/* Left stem to cylinder back */}
      <line x1={x1} y1={y1} x2={x1 + ux * cylStart} y2={y1 + uy * cylStart} />
      {/* Open-ended dashpot cylinder U-shape */}
      <polyline
        points={[
          pt(cylEnd, -hw),
          pt(cylStart, -hw),
          pt(cylStart, hw),
          pt(cylEnd, hw),
        ].join(" ")}
      />
      {/* Piston plate inside cylinder */}
      <line
        x1={x1 + ux * pistonPos - nx * (hw * 0.72)}
        y1={y1 + uy * pistonPos - ny * (hw * 0.72)}
        x2={x1 + ux * pistonPos + nx * (hw * 0.72)}
        y2={y1 + uy * pistonPos + ny * (hw * 0.72)}
        strokeWidth={2.4}
      />
      {/* Right stem from piston plate */}
      <line x1={x1 + ux * pistonPos} y1={y1 + uy * pistonPos} x2={x2} y2={y2} />
      {label ? (
        <text
          x={midX}
          y={midY}
          stroke="none"
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-foreground text-[11px] font-sans font-semibold"
        >
          {label}
        </text>
      ) : null}
    </g>
  );
}

export function EngineeringGround({
  x1,
  y1,
  x2,
  y2,
  hatchSide = 1,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  hatchSide?: 1 | -1;
}) {
  const { len, ux, uy, nx, ny } = unitAndNormal(x1, y1, x2, y2);
  if (len < 4) return null;
  const count = Math.max(3, Math.floor(len / 9));
  const hatches: React.ReactNode[] = [];
  for (let i = 0; i <= count; i++) {
    const along = (len * i) / count;
    const bx = x1 + ux * along;
    const by = y1 + uy * along;
    const tx = bx + (nx * hatchSide * 8 - ux * 5);
    const ty = by + (ny * hatchSide * 8 - uy * 5);
    hatches.push(
      <line
        key={i}
        x1={bx}
        y1={by}
        x2={tx}
        y2={ty}
        className="stroke-muted-foreground/55"
        strokeWidth={1.1}
      />,
    );
  }
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} className="stroke-muted-foreground" strokeWidth={2} />
      {hatches}
    </g>
  );
}

export function EngineeringSupport({
  type,
  x,
  y,
  label,
}: {
  type: "pin" | "roller" | "fixed";
  x: number;
  y: number;
  label?: string;
}) {
  return (
    <g>
      {type === "fixed" ? (
        <EngineeringGround x1={x} y1={y - 24} x2={x} y2={y + 24} hatchSide={-1} />
      ) : (
        <>
          <polygon
            points={`${x},${y} ${x - 11},${y + 16} ${x + 11},${y + 16}`}
            className="fill-muted stroke-foreground"
            strokeWidth={1.6}
          />
          <circle cx={x} cy={y} r={3.5} className="fill-background stroke-foreground" strokeWidth={1.6} />
          {type === "roller" ? (
            <>
              <circle cx={x - 6} cy={y + 20} r={3} className="fill-background stroke-muted-foreground" strokeWidth={1.4} />
              <circle cx={x + 6} cy={y + 20} r={3} className="fill-background stroke-muted-foreground" strokeWidth={1.4} />
              <EngineeringGround x1={x - 16} y1={y + 24} x2={x + 16} y2={y + 24} hatchSide={1} />
            </>
          ) : (
            <EngineeringGround x1={x - 16} y1={y + 16} x2={x + 16} y2={y + 16} hatchSide={1} />
          )}
        </>
      )}
      {label ? (
        <text
          x={x}
          y={y + 38}
          textAnchor="middle"
          className="fill-muted-foreground text-[11px] font-sans font-semibold"
        >
          {label}
        </text>
      ) : null}
    </g>
  );
}

export function EngineeringVector({
  x1,
  y1,
  x2,
  y2,
  color = "var(--color-brand-primary)",
  label,
  dashed = false,
  markerId = "eng-vec-arrow",
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color?: string;
  label?: string;
  dashed?: boolean;
  markerId?: string;
}) {
  const { len, nx, ny } = unitAndNormal(x1, y1, x2, y2);
  if (len < 2) return null;
  const midX = (x1 + x2) / 2 + nx * 12;
  const midY = (y1 + y2) / 2 + ny * 12;
  return (
    <g>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={color}
        strokeWidth={2.2}
        strokeDasharray={dashed ? "4 3" : undefined}
        markerEnd={`url(#${markerId})`}
      />
      {label ? (
        <text
          x={midX}
          y={midY}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={color}
          className="text-[11px] font-sans font-semibold"
        >
          {label}
        </text>
      ) : null}
    </g>
  );
}
