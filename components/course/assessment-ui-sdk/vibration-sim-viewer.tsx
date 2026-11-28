"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAppReducedMotion } from "@/components/appearance-preferences";
import {
  vibrationSimSpecSchema,
  type VibrationSimSpec,
} from "@/lib/assessment-ui-sdk/engineering-sim-schema";
import { solveVibrationSystem } from "@/lib/assessment-ui-sdk/vibration-solver";
import {
  SimulationShell,
  type SimulationParameterControl,
  type SimulationReadout,
  type SimulationViewOption,
} from "./simulation-shell";
import {
  EngineeringDamper,
  EngineeringGround,
  EngineeringSpring,
  EngineeringSupport,
} from "./engineering-svg-primitives";

const SVG_W = 540;
const SVG_H = 310;

export function VibrationSimViewer({ spec: rawSpec }: { spec: Record<string, unknown> }) {
  const parsed = useMemo(() => vibrationSimSpecSchema.safeParse(rawSpec), [rawSpec]);
  const baseSpec: VibrationSimSpec = parsed.success
    ? parsed.data
    : vibrationSimSpecSchema.parse({});

  const reduced = useAppReducedMotion();
  const [mass, setMass] = useState(baseSpec.mass);
  const [stiffnessScale, setStiffnessScale] = useState(1);
  const [dampingScale, setDampingScale] = useState(1);
  const [forcingAmp, setForcingAmp] = useState(baseSpec.forcingAmplitude);
  const [isPlaying, setIsPlaying] = useState(!reduced);
  const [speed, setSpeed] = useState(1);
  const [time, setTime] = useState(0);
  const [activeView, setActiveView] = useState<string>("sim");

  const effectiveSpec = useMemo<VibrationSimSpec>(
    () => ({
      ...baseSpec,
      mass,
      stiffness: baseSpec.stiffness * stiffnessScale,
      stiffness2: baseSpec.stiffness2 !== undefined ? baseSpec.stiffness2 * stiffnessScale : undefined,
      stiffness3: baseSpec.stiffness3 !== undefined ? baseSpec.stiffness3 * stiffnessScale : undefined,
      damping: baseSpec.damping * dampingScale,
      damping2: baseSpec.damping2 !== undefined ? baseSpec.damping2 * dampingScale : undefined,
      damping3: baseSpec.damping3 !== undefined ? baseSpec.damping3 * dampingScale : undefined,
      springs: baseSpec.springs?.map((s) => ({ ...s, k: s.k * stiffnessScale })),
      dampers: baseSpec.dampers?.map((d) => ({ ...d, c: d.c * dampingScale })),
      forcingAmplitude: forcingAmp,
    }),
    [baseSpec, dampingScale, forcingAmp, mass, stiffnessScale],
  );

  const solved = useMemo(() => solveVibrationSystem(effectiveSpec, 240), [effectiveSpec]);

  useEffect(() => {
    if (reduced || !isPlaying) return;
    let raf = 0;
    let last: number | null = null;
    const tick = (now: number) => {
      if (last !== null) {
        const dt = ((now - last) / 1000) * speed;
        setTime((prev) => {
          const next = prev + dt;
          return next >= effectiveSpec.duration ? next % effectiveSpec.duration : next;
        });
      }
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [effectiveSpec.duration, isPlaying, reduced, speed]);

  const currentSample = useMemo(() => {
    if (solved.samples.length === 0) return { t: 0, q1: 0, v1: 0, q2: 0, v2: 0 };
    const ratio = Math.max(0, Math.min(1, time / Math.max(0.01, effectiveSpec.duration)));
    const idx = Math.min(
      solved.samples.length - 1,
      Math.round(ratio * (solved.samples.length - 1)),
    );
    return solved.samples[idx];
  }, [effectiveSpec.duration, solved.samples, time]);

  const views = useMemo<SimulationViewOption[]>(() => {
    if (effectiveSpec.model === "two_dof_mass" && solved.modes) {
      return [
        { value: "sim", label: "Simulasi" },
        { value: "mode1", label: "Mode 1" },
        { value: "mode2", label: "Mode 2 (Node)" },
        { value: "chart", label: "Grafik x(t)" },
      ];
    }
    return [
      { value: "sim", label: "Simulasi" },
      {
        value: "chart",
        label: effectiveSpec.model === "swinging_bar" ? "Grafik θ(t)" : "Grafik x(t)",
      },
    ];
  }, [effectiveSpec.model, solved.modes]);

  const readouts = useMemo<SimulationReadout[]>(() => {
    if (effectiveSpec.model === "swinging_bar") {
      return [
        { label: "$I_O$", value: `${solved.inertiaOrMass.toFixed(3)} kg·m²` },
        { label: "$k_{eq}$", value: `${solved.kEq.toFixed(1)} N·m/rad`, tone: "primary" },
        { label: "$c_{eq}$", value: `${solved.cEq.toFixed(1)} N·m·s/rad`, tone: "secondary" },
        { label: "$\\omega_n$", value: `${solved.omegaN.toFixed(2)} rad/s`, tone: "success" },
        { label: "$\\zeta$", value: `${solved.zeta.toFixed(3)} (${solved.regime})` },
        {
          label: "$\\theta(t)$",
          value: `${((currentSample.q1 * 180) / Math.PI).toFixed(1)}°`,
          tone: "primary",
        },
      ];
    }
    if (effectiveSpec.model === "two_dof_mass" && solved.modes) {
      const [m1, m2] = solved.modes;
      return [
        { label: "$\\omega_{n1}$", value: `${m1.omega.toFixed(2)} rad/s`, tone: "primary" },
        { label: "$\\omega_{n2}$", value: `${m2.omega.toFixed(2)} rad/s`, tone: "secondary" },
        {
          label: "Node Mode 2",
          value:
            m2.nodePositionBetweenMasses !== null
              ? `${(m2.nodePositionBetweenMasses * 100).toFixed(0)}% antara m1 & m2`
              : "Di tumpuan",
          tone: "warning",
        },
        { label: "$x_1(t)$", value: `${currentSample.q1.toFixed(3)} m` },
        { label: "$x_2(t)$", value: `${(currentSample.q2 ?? 0).toFixed(3)} m` },
      ];
    }
    return [
      { label: "$\\omega_n$", value: `${solved.omegaN.toFixed(2)} rad/s`, tone: "primary" },
      { label: "$\\zeta$", value: `${solved.zeta.toFixed(3)} (${solved.regime})`, tone: "secondary" },
      { label: "$x(t)$", value: `${currentSample.q1.toFixed(3)} m` },
      { label: "$v(t)$", value: `${currentSample.v1.toFixed(3)} m/s` },
    ];
  }, [currentSample.q1, currentSample.q2, currentSample.v1, effectiveSpec.model, solved]);

  const parameters: SimulationParameterControl[] = [
    {
      id: "mass",
      label: effectiveSpec.model === "two_dof_mass" ? "Massa $m_1$" : "Massa $m$",
      value: mass,
      min: Math.max(0.2, Number((baseSpec.mass * 0.25).toFixed(2))),
      max: Number((baseSpec.mass * 3).toFixed(2)),
      step: 0.1,
      unit: "kg",
      onChange: setMass,
    },
    {
      id: "stiffness-scale",
      label: effectiveSpec.model === "swinging_bar" ? "Skala kekakuan pegas ($k$)" : "Kekakuan pegas ($k$)",
      value:
        effectiveSpec.model === "swinging_bar"
          ? stiffnessScale
          : baseSpec.stiffness * stiffnessScale,
      min: effectiveSpec.model === "swinging_bar" ? 0.2 : Math.max(10, baseSpec.stiffness * 0.2),
      max: effectiveSpec.model === "swinging_bar" ? 3 : baseSpec.stiffness * 3,
      step: effectiveSpec.model === "swinging_bar" ? 0.1 : 10,
      unit: effectiveSpec.model === "swinging_bar" ? "×" : "N/m",
      onChange: (val) =>
        setStiffnessScale(
          effectiveSpec.model === "swinging_bar"
            ? val
            : val / Math.max(1e-4, baseSpec.stiffness),
        ),
    },
    {
      id: "damping-scale",
      label: effectiveSpec.model === "swinging_bar" ? "Skala redaman ($c$)" : "Redaman ($c$)",
      value:
        effectiveSpec.model === "swinging_bar"
          ? dampingScale
          : baseSpec.damping * dampingScale,
      min: 0,
      max: effectiveSpec.model === "swinging_bar" ? 3 : Math.max(20, baseSpec.damping * 4),
      step: effectiveSpec.model === "swinging_bar" ? 0.1 : 0.5,
      unit: effectiveSpec.model === "swinging_bar" ? "×" : "N·s/m",
      onChange: (val) =>
        setDampingScale(
          effectiveSpec.model === "swinging_bar"
            ? val
            : baseSpec.damping > 0
              ? val / baseSpec.damping
              : val,
        ),
    },
    ...(baseSpec.forcingAmplitude !== 0
      ? [
          {
            id: "forcing",
            label: "Amplitudo eksitasi $F_0$",
            value: forcingAmp,
            min: 0,
            max: Math.max(50, Math.abs(baseSpec.forcingAmplitude) * 2.5),
            step: 1,
            unit: "N",
            onChange: setForcingAmp,
          },
        ]
      : []),
  ];

  const renderSwingingBarSvg = () => {
    const L = effectiveSpec.length;
    const pivotRatio = (solved.barPivotMeters ?? L * 0.25) / L;
    // Clamp visual angle slightly so extreme specs stay readable inside the frame
    const theta = Math.max(-0.55, Math.min(0.55, currentSample.q1));
    const barPx = 220;
    const cx = SVG_W / 2;
    const bottomY = SVG_H - 42;
    const pivotY = bottomY - pivotRatio * barPx;
    const wallLeftX = cx - 155;
    const wallRightX = cx + 155;

    const pointOnBar = (ratio: number) => {
      // Distance above pivot in px (positive = upward along bar)
      const distUp = (ratio - pivotRatio) * barPx;
      // Rotate clockwise by theta for positive theta
      const x = cx + distUp * Math.sin(theta);
      const y = pivotY - distUp * Math.cos(theta);
      return { x, y };
    };

    const pBottom = pointOnBar(0);
    const pTop = pointOnBar(1);

    return (
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        role="img"
        aria-label="Simulasi getaran batang kaku dengan pegas dan peredam"
        className="block h-auto w-full select-none"
      >
        {/* Reference vertical equilibrium line */}
        <line
          x1={cx}
          y1={bottomY + 12}
          x2={cx}
          y2={bottomY - barPx - 14}
          className="stroke-muted-foreground/35"
          strokeWidth={1.2}
          strokeDasharray="4 4"
        />

        {/* Fixed walls on left and right where springs/dampers anchor */}
        {solved.barSprings?.some((s) => s.side === "left") ||
        solved.barDampers?.some((d) => d.side === "left") ? (
          <EngineeringGround
            x1={wallLeftX}
            y1={bottomY - barPx - 16}
            x2={wallLeftX}
            y2={bottomY + 16}
            hatchSide={1}
          />
        ) : null}
        {solved.barSprings?.some((s) => s.side === "right") ||
        solved.barDampers?.some((d) => d.side === "right") ? (
          <EngineeringGround
            x1={wallRightX}
            y1={bottomY - barPx - 16}
            x2={wallRightX}
            y2={bottomY + 16}
            hatchSide={-1}
          />
        ) : null}

        {/* Springs attached at exact positions along the bar */}
        {solved.barSprings?.map((spring, idx) => {
          const attach = pointOnBar(spring.ratio);
          const wallX = spring.side === "left" ? wallLeftX : wallRightX;
          const wallY = bottomY - spring.ratio * barPx;
          return (
            <g key={`spring-${idx}`}>
              <EngineeringSpring
                x1={wallX}
                y1={wallY}
                x2={attach.x}
                y2={attach.y}
                label={`${spring.label} (${Math.round(spring.k)} N/m)`}
              />
              <circle cx={attach.x} cy={attach.y} r={3.5} className="fill-brand-primary" />
            </g>
          );
        })}

        {/* Dampers attached at exact positions along the bar */}
        {solved.barDampers?.map((damper, idx) => {
          const attach = pointOnBar(damper.ratio);
          const wallX = damper.side === "left" ? wallLeftX : wallRightX;
          const wallY = bottomY - damper.ratio * barPx;
          return (
            <g key={`damper-${idx}`}>
              <EngineeringDamper
                x1={wallX}
                y1={wallY}
                x2={attach.x}
                y2={attach.y}
                label={`${damper.label} (${damper.c.toFixed(1)} N·s/m)`}
              />
              <circle cx={attach.x} cy={attach.y} r={3.5} className="fill-brand-secondary" />
            </g>
          );
        })}

        {/* Rigid bar */}
        <line
          x1={pBottom.x}
          y1={pBottom.y}
          x2={pTop.x}
          y2={pTop.y}
          className="stroke-foreground"
          strokeWidth={8}
          strokeLinecap="round"
        />
        <line
          x1={pBottom.x}
          y1={pBottom.y}
          x2={pTop.x}
          y2={pTop.y}
          className="stroke-muted"
          strokeWidth={4}
          strokeLinecap="round"
        />

        {/* Pivot pin support at O */}
        <EngineeringSupport type="pin" x={cx} y={pivotY} label={`Pivot O (${(pivotRatio * 100).toFixed(0)}% L)`} />

        {/* Position labels on bar */}
        <text
          x={pTop.x + 12}
          y={pTop.y - 6}
          className="fill-muted-foreground text-[10px] font-sans"
        >
          y = L ({L} m)
        </text>
        <text
          x={pBottom.x + 12}
          y={pBottom.y + 12}
          className="fill-muted-foreground text-[10px] font-sans"
        >
          y = 0
        </text>
      </svg>
    );
  };

  const renderTwoDofSvg = () => {
    const modeView =
      activeView === "mode1"
        ? solved.modes?.[0]
        : activeView === "mode2"
          ? solved.modes?.[1]
          : null;

    let disp1 = currentSample.q1;
    let disp2 = currentSample.q2 ?? 0;

    if (modeView) {
      const phase = Math.cos(modeView.omega * time);
      disp1 = modeView.phi[0] * 0.45 * phase;
      disp2 = modeView.phi[1] * 0.45 * phase;
    }

    const maxAbs = Math.max(
      0.25,
      ...solved.samples.flatMap((s) => [Math.abs(s.q1), Math.abs(s.q2 ?? 0)]),
    );
    const scalePx = modeView ? 70 : Math.min(60, 42 / maxAbs);
    const dx1 = Math.max(-44, Math.min(44, disp1 * scalePx));
    const dx2 = Math.max(-44, Math.min(44, disp2 * scalePx));

    const yTrack = 135;
    const wallLeftX = 54;
    const wallRightX = SVG_W - 54;
    const m1RestX = 195;
    const m2RestX = 345;
    const m1X = m1RestX + dx1;
    const m2X = m2RestX + dx2;
    const boxW = 54;
    const boxH = 44;
    const hasK3 = (effectiveSpec.stiffness3 ?? 0) > 0;

    // Mode shape curve area at bottom (showing exact node location!)
    const modeBaseY = 250;
    const modeAmpPx = 32;
    const phaseNow = modeView ? Math.cos(modeView.omega * time) : 1;
    const m1ModeY = modeView ? modeBaseY - modeView.phi[0] * modeAmpPx * phaseNow : modeBaseY - disp1 * 45;
    const m2ModeY = modeView ? modeBaseY - modeView.phi[1] * modeAmpPx * phaseNow : modeBaseY - disp2 * 45;
    const nodeX =
      modeView && modeView.nodePositionBetweenMasses !== null
        ? m1RestX + modeView.nodePositionBetweenMasses * (m2RestX - m1RestX)
        : null;

    return (
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        role="img"
        aria-label="Simulasi getaran 2-DOF dengan mode getar dan titik node"
        className="block h-auto w-full select-none"
      >
        {/* Floor and left wall */}
        <EngineeringGround x1={wallLeftX} y1={yTrack - 38} x2={wallLeftX} y2={yTrack + 32} hatchSide={1} />
        <EngineeringGround x1={wallLeftX} y1={yTrack + 26} x2={wallRightX} y2={yTrack + 26} hatchSide={1} />
        {hasK3 ? (
          <EngineeringGround x1={wallRightX} y1={yTrack - 38} x2={wallRightX} y2={yTrack + 32} hatchSide={-1} />
        ) : null}

        {/* k1 & c1 */}
        <EngineeringSpring
          x1={wallLeftX}
          y1={yTrack - 10}
          x2={m1X - boxW / 2}
          y2={yTrack - 10}
          amplitude={6}
          label="k₁"
        />
        {effectiveSpec.damping > 0 ? (
          <EngineeringDamper
            x1={wallLeftX}
            y1={yTrack + 12}
            x2={m1X - boxW / 2}
            y2={yTrack + 12}
            width={10}
            label="c₁"
          />
        ) : null}

        {/* k2 & c2 between m1 and m2 */}
        <EngineeringSpring
          x1={m1X + boxW / 2}
          y1={yTrack - 10}
          x2={m2X - boxW / 2}
          y2={yTrack - 10}
          amplitude={6}
          label="k₂"
        />
        {(effectiveSpec.damping2 ?? 0) > 0 ? (
          <EngineeringDamper
            x1={m1X + boxW / 2}
            y1={yTrack + 12}
            x2={m2X - boxW / 2}
            y2={yTrack + 12}
            width={10}
            label="c₂"
          />
        ) : null}

        {/* Optional k3 to right wall */}
        {hasK3 ? (
          <EngineeringSpring
            x1={m2X + boxW / 2}
            y1={yTrack}
            x2={wallRightX}
            y2={yTrack}
            amplitude={6}
            label="k₃"
          />
        ) : null}

        {/* Mass 1 */}
        <rect
          x={m1X - boxW / 2}
          y={yTrack - boxH / 2}
          width={boxW}
          height={boxH}
          rx={6}
          className="fill-card stroke-brand-primary"
          strokeWidth={2}
        />
        <text x={m1X} y={yTrack + 4} textAnchor="middle" className="fill-foreground text-[12px] font-sans font-bold">
          m₁
        </text>

        {/* Mass 2 */}
        <rect
          x={m2X - boxW / 2}
          y={yTrack - boxH / 2}
          width={boxW}
          height={boxH}
          rx={6}
          className="fill-card stroke-brand-secondary"
          strokeWidth={2}
        />
        <text x={m2X} y={yTrack + 4} textAnchor="middle" className="fill-foreground text-[12px] font-sans font-bold">
          m₂
        </text>

        {/* Stationary Node vertical indicator in physical space when in Mode 2 */}
        {nodeX !== null ? (
          <g data-vibration-node="">
            <line
              x1={nodeX}
              y1={yTrack - 46}
              x2={nodeX}
              y2={modeBaseY + 28}
              stroke="var(--color-status-error)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
            <circle cx={nodeX} cy={yTrack - 10} r={5} fill="var(--color-status-error)" />
            <text
              x={nodeX}
              y={yTrack - 52}
              textAnchor="middle"
              fill="var(--color-status-error)"
              className="text-[11px] font-sans font-bold"
            >
              NODE (diam)
            </text>
          </g>
        ) : null}

        {/* Bottom Mode Shape / Displacement Diagram */}
        <line
          x1={wallLeftX}
          y1={modeBaseY}
          x2={hasK3 ? wallRightX : m2RestX + 30}
          y2={modeBaseY}
          className="stroke-muted-foreground/45"
          strokeWidth={1.2}
          strokeDasharray="3 3"
        />
        <polyline
          fill="none"
          points={`${wallLeftX},${modeBaseY} ${m1RestX},${m1ModeY.toFixed(1)} ${m2RestX},${m2ModeY.toFixed(1)}${hasK3 ? ` ${wallRightX},${modeBaseY}` : ""}`}
          stroke={modeView?.modeIndex === 2 ? "var(--color-brand-secondary)" : "var(--color-brand-primary)"}
          strokeWidth={2.2}
        />
        <circle cx={m1RestX} cy={m1ModeY} r={4} className="fill-brand-primary" />
        <circle cx={m2RestX} cy={m2ModeY} r={4} className="fill-brand-secondary" />
        {nodeX !== null ? (
          <g>
            <circle cx={nodeX} cy={modeBaseY} r={5} fill="var(--color-status-error)" />
            <text
              x={nodeX}
              y={modeBaseY + 18}
              textAnchor="middle"
              fill="var(--color-status-error)"
              className="text-[10px] font-sans font-semibold"
            >
              Node (x = 0)
            </text>
          </g>
        ) : null}
        <text x={wallLeftX} y={modeBaseY - 38} className="fill-muted-foreground text-[10px] font-sans font-semibold">
          {modeView
            ? `Bentuk Mode ${modeView.modeIndex}: ${modeView.description}`
            : "Profil simpangan instan x₁(t), x₂(t)"}
        </text>
      </svg>
    );
  };

  const renderSdofSvg = () => {
    const maxAbs = Math.max(0.25, ...solved.samples.map((s) => Math.abs(s.q1)));
    const scalePx = Math.min(70, 56 / maxAbs);
    const dx = Math.max(-64, Math.min(64, currentSample.q1 * scalePx));
    const yMid = SVG_H / 2;
    const wallX = 76;
    const massRestX = 310;
    const massX = massRestX + dx;
    const boxW = 64;
    const boxH = 54;

    return (
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        role="img"
        aria-label="Simulasi getaran 1-DOF massa pegas peredam"
        className="block h-auto w-full select-none"
      >
        <EngineeringGround x1={wallX} y1={yMid - 50} x2={wallX} y2={yMid + 42} hatchSide={1} />
        <EngineeringGround x1={wallX} y1={yMid + 34} x2={SVG_W - 60} y2={yMid + 34} hatchSide={1} />
        <line
          x1={massRestX}
          y1={yMid - 55}
          x2={massRestX}
          y2={yMid + 45}
          className="stroke-muted-foreground/35"
          strokeDasharray="4 4"
        />
        <EngineeringSpring
          x1={wallX}
          y1={yMid - 14}
          x2={massX - boxW / 2}
          y2={yMid - 14}
          label={`k = ${Math.round(effectiveSpec.stiffness)} N/m`}
        />
        {effectiveSpec.damping > 0 ? (
          <EngineeringDamper
            x1={wallX}
            y1={yMid + 14}
            x2={massX - boxW / 2}
            y2={yMid + 14}
            label={`c = ${effectiveSpec.damping.toFixed(1)} N·s/m`}
          />
        ) : null}
        <rect
          x={massX - boxW / 2}
          y={yMid - boxH / 2}
          width={boxW}
          height={boxH}
          rx={8}
          className="fill-card stroke-brand-primary"
          strokeWidth={2.2}
        />
        <text x={massX} y={yMid + 4} textAnchor="middle" className="fill-foreground text-[13px] font-sans font-bold">
          m = {mass.toFixed(1)} kg
        </text>
      </svg>
    );
  };

  const renderChart = () => {
    const isTwoDof = effectiveSpec.model === "two_dof_mass";
    const isBar = effectiveSpec.model === "swinging_bar";
    return (
      <div className="h-[270px] w-full p-3">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={solved.samples} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.5} />
            <XAxis
              dataKey="t"
              type="number"
              domain={[0, effectiveSpec.duration]}
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              unit="s"
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              unit={isBar ? " rad" : " m"}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--color-card)",
                borderColor: "var(--color-border)",
                fontSize: "12px",
                borderRadius: "8px",
              }}
            />
            <ReferenceLine x={Number(time.toFixed(2))} stroke="var(--color-brand-secondary)" strokeDasharray="3 3" />
            <Line
              type="monotone"
              dataKey="q1"
              name={isBar ? "θ(t)" : isTwoDof ? "x₁(t)" : "x(t)"}
              stroke="var(--color-brand-primary)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            {isTwoDof ? (
              <Line
                type="monotone"
                dataKey="q2"
                name="x₂(t)"
                stroke="var(--color-brand-secondary)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };

  return (
    <SimulationShell
      dataKind={`vibration-${effectiveSpec.model}`}
      isPlaying={isPlaying}
      onTogglePlay={() => setIsPlaying((prev) => !prev)}
      onReset={() => {
        setTime(0);
        setMass(baseSpec.mass);
        setStiffnessScale(1);
        setDampingScale(1);
        setForcingAmp(baseSpec.forcingAmplitude);
      }}
      speed={speed}
      onSpeedChange={setSpeed}
      time={time}
      duration={effectiveSpec.duration}
      onTimeScrub={(nextT) => {
        setIsPlaying(false);
        setTime(nextT);
      }}
      views={views}
      activeView={activeView}
      onViewChange={setActiveView}
      readouts={readouts}
      parameters={parameters}
      summary={effectiveSpec.summary}
    >
      {activeView === "chart"
        ? renderChart()
        : effectiveSpec.model === "swinging_bar"
          ? renderSwingingBarSvg()
          : effectiveSpec.model === "two_dof_mass"
            ? renderTwoDofSvg()
            : renderSdofSvg()}
    </SimulationShell>
  );
}
