"use client";

import React, { useEffect, useMemo, useState } from "react";
import * as planck from "planck";
import { useAppReducedMotion } from "@/components/appearance-preferences";
import {
  kinematicsSimSpecSchema,
  type KinematicsSimSpec,
} from "@/lib/assessment-ui-sdk/engineering-sim-schema";
import { SimulationShell, type SimulationReadout } from "./simulation-shell";
import { EngineeringVector } from "./engineering-svg-primitives";

const SVG_W = 540;
const SVG_H = 310;
const AUTO_PALETTE = [
  "var(--color-brand-primary)",
  "var(--color-brand-secondary)",
  "var(--color-status-success)",
  "var(--color-status-warning)",
  "var(--color-status-error)",
];

function resolveColor(color: string | undefined, idx: number): string {
  switch (color) {
    case "primary":
      return "var(--color-brand-primary)";
    case "secondary":
      return "var(--color-brand-secondary)";
    case "success":
      return "var(--color-status-success)";
    case "warning":
      return "var(--color-status-warning)";
    case "error":
      return "var(--color-status-error)";
    case "muted":
      return "var(--color-muted-foreground)";
    default:
      return AUTO_PALETTE[idx % AUTO_PALETTE.length];
  }
}

interface BodyFrameState {
  id: string;
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  radius: number;
  color: string;
}

interface KinematicsFrame {
  t: number;
  bodies: BodyFrameState[];
}

function simulatePlanckTrajectory(spec: KinematicsSimSpec): KinematicsFrame[] {
  const dt = 1 / 60;
  const totalSteps = Math.max(30, Math.min(900, Math.round(spec.duration / dt)));
  const world = new planck.World({
    gravity: planck.Vec2(spec.gravity[0], spec.gravity[1]),
  });

  const bodyMap = new Map<string, planck.Body>();
  const metaList = spec.bodies.map((b, idx) => ({
    ...b,
    colorResolved: resolveColor(b.color, idx),
    labelResolved: b.label ?? b.id,
  }));

  for (const b of metaList) {
    const body = world.createBody({
      type: b.mass > 0 ? "dynamic" : "static",
      position: planck.Vec2(b.x, b.y),
      linearVelocity: planck.Vec2(b.vx, b.vy),
      linearDamping: 0,
      angularDamping: 0,
      bullet: true,
    });
    const area = Math.PI * b.radius * b.radius;
    const density = b.mass > 0 ? b.mass / Math.max(0.05, area) : 0;
    if (b.shape === "box") {
      body.createFixture(planck.Box((b.width ?? 1) / 2, (b.height ?? 1) / 2), {
        density,
        restitution: b.restitution,
        friction: 0,
      });
    } else {
      body.createFixture(planck.Circle(b.radius), {
        density,
        restitution: b.restitution,
        friction: 0,
      });
    }
    bodyMap.set(b.id, body);
  }

  // Optional Planck joints (revolute, distance/spring, prismatic)
  for (const j of spec.joints ?? []) {
    const bodyA = bodyMap.get(j.bodyA);
    const bodyB = bodyMap.get(j.bodyB);
    if (!bodyA || !bodyB) continue;
    const anchor = planck.Vec2(
      j.anchorX ?? bodyA.getPosition().x,
      j.anchorY ?? bodyA.getPosition().y,
    );
    if (j.type === "revolute") {
      world.createJoint(new planck.RevoluteJoint({}, bodyA, bodyB, anchor));
    } else if (j.type === "distance") {
      world.createJoint(
        new planck.DistanceJoint(
          {
            frequencyHz: j.frequencyHz ?? 0,
            dampingRatio: j.dampingRatio ?? 0,
            length: j.length,
          },
          bodyA,
          bodyA.getPosition(),
          bodyB,
          bodyB.getPosition(),
        ),
      );
    } else if (j.type === "prismatic") {
      world.createJoint(new planck.PrismaticJoint({}, bodyA, bodyB, anchor, planck.Vec2(1, 0)));
    }
  }

  // If textbook post-collision velocities are specified, apply them cleanly on first contact
  const hasTextbookAfter = metaList.some(
    (b) => typeof b.vxAfter === "number" || typeof b.vyAfter === "number",
  );
  let appliedAfter = false;
  if (hasTextbookAfter) {
    world.on("begin-contact", () => {
      if (appliedAfter) return;
      appliedAfter = true;
    });
  }

  const frames: KinematicsFrame[] = [];
  let pendingApply = false;

  for (let step = 0; step <= totalSteps; step++) {
    const t = step * dt;
    if (appliedAfter && !pendingApply) {
      pendingApply = true;
      for (const b of metaList) {
        const body = bodyMap.get(b.id);
        if (!body) continue;
        if (typeof b.vxAfter === "number" || typeof b.vyAfter === "number") {
          body.setLinearVelocity(
            planck.Vec2(
              b.vxAfter ?? body.getLinearVelocity().x,
              b.vyAfter ?? body.getLinearVelocity().y,
            ),
          );
        }
      }
    }

    frames.push({
      t,
      bodies: metaList.map((b) => {
        const body = bodyMap.get(b.id)!;
        const pos = body.getPosition();
        const vel = body.getLinearVelocity();
        return {
          id: b.id,
          label: b.labelResolved,
          x: pos.x,
          y: pos.y,
          vx: vel.x,
          vy: vel.y,
          mass: b.mass,
          radius: b.radius,
          color: b.colorResolved,
        };
      }),
    });

    world.step(dt, 8, 3);
  }

  return frames;
}

export function KinematicsSimViewer({ spec: rawSpec }: { spec: Record<string, unknown> }) {
  const parsed = useMemo(() => kinematicsSimSpecSchema.safeParse(rawSpec), [rawSpec]);
  const spec = parsed.success ? parsed.data : null;
  const reduced = useAppReducedMotion();
  const [isPlaying, setIsPlaying] = useState(!reduced);
  const [speed, setSpeed] = useState(1);
  const [time, setTime] = useState(0);

  const frames = useMemo(() => (spec ? simulatePlanckTrajectory(spec) : []), [spec]);

  useEffect(() => {
    if (!spec || reduced || !isPlaying) return;
    let raf = 0;
    let last: number | null = null;
    const tick = (now: number) => {
      if (last !== null) {
        const dt = ((now - last) / 1000) * speed;
        setTime((prev) => {
          const next = prev + dt;
          return next >= spec.duration ? next % spec.duration : next;
        });
      }
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, reduced, spec, speed]);

  if (!spec || frames.length === 0) {
    return (
      <div
        role="status"
        data-assessment-visual-fallback="kinematics"
        className="border-l-2 border-border pl-3 py-1 text-body-xs text-muted-foreground"
      >
        Spesifikasi simulasi kinematika belum lengkap untuk ditampilkan.
      </div>
    );
  }

  const frameIndex = Math.min(
    frames.length - 1,
    Math.max(0, Math.round((time / Math.max(0.01, spec.duration)) * (frames.length - 1))),
  );
  const frame = frames[frameIndex];

  // Auto-fit world bounds across entire trajectory
  const allX = frames.flatMap((f) => f.bodies.map((b) => b.x));
  const allY = frames.flatMap((f) => f.bodies.map((b) => b.y));
  const minX = Math.min(...allX) - 2;
  const maxX = Math.max(...allX) + 2;
  const minY = Math.min(...allY) - 2;
  const maxY = Math.max(...allY) + 2;
  const spanX = Math.max(4, maxX - minX);
  const spanY = Math.max(3, maxY - minY);
  const pad = 34;
  const scale = Math.min((SVG_W - pad * 2) / spanX, (SVG_H - pad * 2) / spanY);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const toSvg = (wx: number, wy: number) => ({
    x: SVG_W / 2 + (wx - centerX) * scale,
    y: SVG_H / 2 - (wy - centerY) * scale,
  });

  const pxTotal = frame.bodies.reduce((sum, b) => sum + b.mass * b.vx, 0);
  const pyTotal = frame.bodies.reduce((sum, b) => sum + b.mass * b.vy, 0);
  const ekTotal = frame.bodies.reduce(
    (sum, b) => sum + 0.5 * b.mass * (b.vx * b.vx + b.vy * b.vy),
    0,
  );

  const readouts: SimulationReadout[] = [
    { label: "$p_x$ total", value: `${pxTotal.toFixed(2)} kg·m/s`, tone: "primary" },
    { label: "$p_y$ total", value: `${pyTotal.toFixed(2)} kg·m/s`, tone: "secondary" },
    { label: "$E_k$ total", value: `${ekTotal.toFixed(2)} J`, tone: "success" },
  ];

  const originSvg = toSvg(0, 0);

  return (
    <SimulationShell
      dataKind={`kinematics-${spec.mode}`}
      isPlaying={isPlaying}
      onTogglePlay={() => setIsPlaying((prev) => !prev)}
      onReset={() => setTime(0)}
      speed={speed}
      onSpeedChange={setSpeed}
      time={time}
      duration={spec.duration}
      onTimeScrub={(nextT) => {
        setIsPlaying(false);
        setTime(nextT);
      }}
      readouts={readouts}
      summary={spec.summary}
    >
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        role="img"
        aria-label="Simulasi kinematika dan tumbukan 2D"
        className="block h-auto w-full select-none"
      >
        <defs>
          <marker
            id="kin-vec-arrow"
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

        {/* Subtle coordinate axes */}
        <line x1={0} y1={originSvg.y} x2={SVG_W} y2={originSvg.y} className="stroke-border/60" strokeWidth={1} />
        <line x1={originSvg.x} y1={0} x2={originSvg.x} y2={SVG_H} className="stroke-border/60" strokeWidth={1} />

        {/* Motion trails up to current frame */}
        {spec.showTrails
          ? frame.bodies.map((b, bIdx) => {
              const trailPts: string[] = [];
              for (let i = 0; i <= frameIndex; i += 2) {
                const pt = toSvg(frames[i].bodies[bIdx].x, frames[i].bodies[bIdx].y);
                trailPts.push(`${pt.x.toFixed(1)},${pt.y.toFixed(1)}`);
              }
              return (
                <polyline
                  key={`trail-${b.id}`}
                  fill="none"
                  points={trailPts.join(" ")}
                  stroke={b.color}
                  strokeWidth={1.6}
                  strokeOpacity={0.45}
                  strokeDasharray="4 3"
                />
              );
            })
          : null}

        {/* Joint links */}
        {(spec.joints ?? []).map((j, idx) => {
          const bA = frame.bodies.find((b) => b.id === j.bodyA);
          const bB = frame.bodies.find((b) => b.id === j.bodyB);
          if (!bA || !bB) return null;
          const pA = toSvg(bA.x, bA.y);
          const pB = toSvg(bB.x, bB.y);
          return (
            <line
              key={`joint-${idx}`}
              x1={pA.x}
              y1={pA.y}
              x2={pB.x}
              y2={pB.y}
              className="stroke-muted-foreground"
              strokeWidth={2}
            />
          );
        })}

        {/* Bodies and live velocity/momentum vectors */}
        {frame.bodies.map((b) => {
          const p = toSvg(b.x, b.y);
          const rPx = Math.max(12, Math.min(28, b.radius * scale));
          const showMom = spec.showVectors.includes("momentum");
          const vecX = showMom ? b.mass * b.vx : b.vx;
          const vecY = showMom ? b.mass * b.vy : b.vy;
          const vecMag = Math.hypot(vecX, vecY);
          const vecScale = 12;
          const tipX = p.x + vecX * vecScale;
          const tipY = p.y - vecY * vecScale;

          return (
            <g key={b.id}>
              {vecMag > 0.05 ? (
                <EngineeringVector
                  x1={p.x}
                  y1={p.y}
                  x2={tipX}
                  y2={tipY}
                  color={b.color}
                  markerId="kin-vec-arrow"
                  label={`${showMom ? "p" : "v"}=${vecMag.toFixed(1)}`}
                />
              ) : null}
              <circle
                cx={p.x}
                cy={p.y}
                r={rPx}
                fill={b.color}
                fillOpacity={0.22}
                stroke={b.color}
                strokeWidth={2.2}
              />
              <text
                x={p.x}
                y={p.y + 4}
                textAnchor="middle"
                className="fill-foreground text-[11px] font-sans font-bold"
              >
                {b.label}
              </text>
            </g>
          );
        })}
      </svg>
    </SimulationShell>
  );
}
