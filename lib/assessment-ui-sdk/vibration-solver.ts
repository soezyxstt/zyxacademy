import { solveODE } from "mathjs";
import type { VibrationSimSpec } from "./engineering-sim-schema";

export interface VibrationTimeSample {
  t: number;
  q1: number;
  v1: number;
  q2?: number;
  v2?: number;
}

export interface ModalShapeInfo {
  modeIndex: 1 | 2;
  omega: number; // rad/s
  freqHz: number;
  ratio: number; // phi_2 / phi_1 (normalized so phi_1 = 1)
  phi: [number, number];
  /** Normalized coordinate along chain (0 = mass 1, 1 = mass 2) where displacement = 0, if a node exists between masses. */
  nodePositionBetweenMasses: number | null;
  description: string;
}

export interface VibrationSolveResult {
  model: VibrationSimSpec["model"];
  samples: VibrationTimeSample[];
  omegaN: number;
  zeta: number;
  regime: "Undamped" | "Underdamped" | "Critically damped" | "Overdamped";
  inertiaOrMass: number;
  kEq: number;
  cEq: number;
  /** Resolved positions along bar in meters (for swinging_bar). */
  barPivotMeters?: number;
  barSprings?: Array<{ posMeters: number; ratio: number; k: number; side: "left" | "right"; label: string }>;
  barDampers?: Array<{ posMeters: number; ratio: number; c: number; side: "left" | "right"; label: string }>;
  /** Exact 2-DOF normal modes and node locations (for two_dof_mass). */
  modes?: [ModalShapeInfo, ModalShapeInfo];
}

function resolveBarPosMeters(rawPos: number, length: number): number {
  if (rawPos <= 1.0001) {
    return Math.max(0, Math.min(length, rawPos * length));
  }
  return Math.max(0, Math.min(length, rawPos));
}

function classifyRegime(zeta: number): VibrationSolveResult["regime"] {
  if (zeta < 1e-4) return "Undamped";
  if (zeta < 0.995) return "Underdamped";
  if (zeta <= 1.005) return "Critically damped";
  return "Overdamped";
}

function resampleSolution(
  rawT: number[],
  rawY: number[][],
  duration: number,
  count: number,
  isTwoDof: boolean,
): VibrationTimeSample[] {
  if (rawT.length === 0) return [];
  const samples: VibrationTimeSample[] = [];
  let cursor = 0;
  for (let i = 0; i <= count; i++) {
    const t = (duration * i) / count;
    while (cursor < rawT.length - 2 && rawT[cursor + 1] < t) {
      cursor += 1;
    }
    const t0 = rawT[cursor];
    const t1 = rawT[Math.min(cursor + 1, rawT.length - 1)];
    const alpha = t1 > t0 ? Math.max(0, Math.min(1, (t - t0) / (t1 - t0))) : 0;
    const y0 = rawY[cursor];
    const y1 = rawY[Math.min(cursor + 1, rawY.length - 1)];
    const lerp = (idx: number) => (y0[idx] ?? 0) + ((y1[idx] ?? 0) - (y0[idx] ?? 0)) * alpha;
    samples.push({
      t: Number(t.toFixed(4)),
      q1: lerp(0),
      v1: lerp(1),
      ...(isTwoDof ? { q2: lerp(2), v2: lerp(3) } : {}),
    });
  }
  return samples;
}

export function solveVibrationSystem(
  spec: VibrationSimSpec,
  sampleCount = 240,
): VibrationSolveResult {
  const duration = Math.max(1, Math.min(30, spec.duration));

  if (spec.model === "swinging_bar") {
    const L = Math.max(0.2, spec.length);
    const m = Math.max(0.05, spec.mass);
    const pivotM = resolveBarPosMeters(spec.pivotPosition, L);
    // Parallel Axis Theorem: I_O = (1/12) m L^2 + m (L/2 - pivotM)^2
    const dCg = L / 2 - pivotM;
    const I_O = (1 / 12) * m * L * L + m * dCg * dCg;

    const rawSprings =
      spec.springs && spec.springs.length > 0
        ? spec.springs
        : [{ position: 1, k: spec.stiffness, side: "right" as const, label: "k" }];

    const rawDampers =
      spec.dampers && spec.dampers.length > 0
        ? spec.dampers
        : spec.damping > 0
          ? [{ position: 1, c: spec.damping, side: "left" as const, label: "c" }]
          : [];

    const barSprings = rawSprings.map((s, idx) => {
      const posMeters = resolveBarPosMeters(s.position, L);
      const side: "left" | "right" = s.side === "left" ? "left" : "right";
      return {
        posMeters,
        ratio: posMeters / L,
        k: s.k,
        side,
        label: s.label ?? (rawSprings.length > 1 ? `k_${idx + 1}` : "k"),
      };
    });

    const barDampers = rawDampers.map((d, idx) => {
      const posMeters = resolveBarPosMeters(d.position, L);
      const side: "left" | "right" = d.side === "left" ? "left" : "right";
      return {
        posMeters,
        ratio: posMeters / L,
        c: d.c,
        side,
        label: d.label ?? (rawDampers.length > 1 ? `c_${idx + 1}` : "c"),
      };
    });

    const kEq = barSprings.reduce((sum, s) => {
      const arm = s.posMeters - pivotM;
      return sum + s.k * arm * arm;
    }, 0);

    const cEq = barDampers.reduce((sum, d) => {
      const arm = d.posMeters - pivotM;
      return sum + d.c * arm * arm;
    }, 0);

    // For a vertical bar with CG above pivot (dCg > 0), gravity is destabilizing (-m g dCg sin(theta));
    // for a horizontal bar or hanging pendulum (dCg < 0), gravity provides restoring torque.
    const gravCoeff = spec.includeGravity ? m * spec.gravity * dCg : 0;
    const effectiveStiffness = Math.max(1e-6, kEq - gravCoeff);
    const omegaN = Math.sqrt(effectiveStiffness / I_O);
    const zeta = cEq / (2 * Math.sqrt(effectiveStiffness * I_O));

    const F0 = spec.forcingAmplitude;
    const wF = spec.forcingFrequency;
    const theta0 = spec.initialDisplacement;
    const omega0 = spec.initialVelocity;

    const sol = solveODE(
      (t: number, y: number[]) => {
        const theta = y[0];
        const dTheta = y[1];
        const forcing = F0 !== 0 ? F0 * Math.cos(wF * t) : 0;
        const ddTheta =
          (forcing - cEq * dTheta - kEq * theta + gravCoeff * Math.sin(theta)) / I_O;
        return [dTheta, ddTheta];
      },
      [0, duration],
      [theta0, omega0],
      { method: "RK45", tol: 1e-5, maxStep: duration / 60 },
    );

    const rawT = Array.from(sol.t as number[]);
    const rawY = (sol.y as unknown as number[][]).map((row) =>
      Array.isArray(row) ? row.map(Number) : [Number(row), 0],
    );

    return {
      model: "swinging_bar",
      samples: resampleSolution(rawT, rawY, duration, sampleCount, false),
      omegaN,
      zeta,
      regime: classifyRegime(zeta),
      inertiaOrMass: I_O,
      kEq,
      cEq,
      barPivotMeters: pivotM,
      barSprings,
      barDampers,
    };
  }

  if (spec.model === "two_dof_mass") {
    const m1 = Math.max(0.05, spec.mass);
    const m2 = Math.max(0.05, spec.mass2 ?? spec.mass);
    const k1 = Math.max(0, spec.stiffness);
    const k2 = Math.max(0.01, spec.stiffness2 ?? spec.stiffness);
    const k3 = Math.max(0, spec.stiffness3 ?? 0);
    const c1 = Math.max(0, spec.damping);
    const c2 = Math.max(0, spec.damping2 ?? spec.damping * 0.5);
    const c3 = Math.max(0, spec.damping3 ?? 0);

    // Eigenvalue problem for undamped 2-DOF system:
    // K = [[k1 + k2, -k2], [-k2, k2 + k3]], M = diag(m1, m2)
    const a11 = (k1 + k2) / m1;
    const a12 = -k2 / m1;
    const a21 = -k2 / m2;
    const a22 = (k2 + k3) / m2;
    const trace = a11 + a22;
    const det = a11 * a22 - a12 * a21;
    const disc = Math.sqrt(Math.max(0, trace * trace - 4 * det));
    const lam1 = Math.max(1e-6, (trace - disc) / 2);
    const lam2 = Math.max(lam1 + 1e-6, (trace + disc) / 2);
    const omega1 = Math.sqrt(lam1);
    const omega2 = Math.sqrt(lam2);

    const buildMode = (modeIndex: 1 | 2, lam: number, omega: number): ModalShapeInfo => {
      // (a11 - lam)*phi1 + a12*phi2 = 0 => phi2 / phi1 = (lam - a11) / a12
      const ratio = Math.abs(a12) > 1e-9 ? (lam - a11) / a12 : modeIndex === 1 ? 1 : -1;
      const maxAbs = Math.max(1, Math.abs(ratio));
      const phi: [number, number] = [1 / maxAbs, ratio / maxAbs];
      // Linear interpolation between mass 1 (s=0, disp=phi[0]) and mass 2 (s=1, disp=phi[1]):
      // phi[0] + s*(phi[1] - phi[0]) = 0 => s = phi[0] / (phi[0] - phi[1])
      const nodePos =
        phi[0] * phi[1] < 0 ? phi[0] / (phi[0] - phi[1]) : null;
      return {
        modeIndex,
        omega,
        freqHz: omega / (2 * Math.PI),
        ratio,
        phi,
        nodePositionBetweenMasses: nodePos,
        description:
          nodePos !== null
            ? `Berlawanan fase (1 node di ${(nodePos * 100).toFixed(0)}% antara m1 dan m2)`
            : "Sefase (tidak ada node di antara m1 dan m2)",
      };
    };

    const modes: [ModalShapeInfo, ModalShapeInfo] = [
      buildMode(1, lam1, omega1),
      buildMode(2, lam2, omega2),
    ];

    const F0 = spec.forcingAmplitude;
    const wF = spec.forcingFrequency;
    const y0 = [
      spec.initialDisplacement,
      spec.initialVelocity,
      spec.initialDisplacement2 ?? 0,
      spec.initialVelocity2 ?? 0,
    ];

    const sol = solveODE(
      (t: number, y: number[]) => {
        const [x1, v1, x2, v2] = y;
        const forcing = F0 !== 0 ? F0 * Math.cos(wF * t) : 0;
        const a1 =
          (forcing - (c1 + c2) * v1 + c2 * v2 - (k1 + k2) * x1 + k2 * x2) / m1;
        const a2 = (c2 * v1 - (c2 + c3) * v2 + k2 * x1 - (k2 + k3) * x2) / m2;
        return [v1, a1, v2, a2];
      },
      [0, duration],
      y0,
      { method: "RK45", tol: 1e-5, maxStep: duration / 60 },
    );

    const rawT = Array.from(sol.t as number[]);
    const rawY = (sol.y as unknown as number[][]).map((row) =>
      Array.isArray(row) ? row.map(Number) : [0, 0, 0, 0],
    );

    const zetaApprox = (c1 + c2) / (2 * Math.sqrt(Math.max(1e-6, (k1 + k2) * m1)));

    return {
      model: "two_dof_mass",
      samples: resampleSolution(rawT, rawY, duration, sampleCount, true),
      omegaN: omega1,
      zeta: zetaApprox,
      regime: classifyRegime(zetaApprox),
      inertiaOrMass: m1 + m2,
      kEq: k1 + k2,
      cEq: c1 + c2,
      modes,
    };
  }

  // Default: SDOF mass-spring-damper
  const m = Math.max(0.05, spec.mass);
  const k = Math.max(1e-4, spec.stiffness);
  const c = Math.max(0, spec.damping);
  const omegaN = Math.sqrt(k / m);
  const zeta = c / (2 * Math.sqrt(k * m));
  const F0 = spec.forcingAmplitude;
  const wF = spec.forcingFrequency;

  const sol = solveODE(
    (t: number, y: number[]) => {
      const x = y[0];
      const v = y[1];
      const forcing = F0 !== 0 ? F0 * Math.cos(wF * t) : 0;
      return [v, (forcing - c * v - k * x) / m];
    },
    [0, duration],
    [spec.initialDisplacement, spec.initialVelocity],
    { method: "RK45", tol: 1e-5, maxStep: duration / 60 },
  );

  const rawT = Array.from(sol.t as number[]);
  const rawY = (sol.y as unknown as number[][]).map((row) =>
    Array.isArray(row) ? row.map(Number) : [Number(row), 0],
  );

  return {
    model: "sdof_mass",
    samples: resampleSolution(rawT, rawY, duration, sampleCount, false),
    omegaN,
    zeta,
    regime: classifyRegime(zeta),
    inertiaOrMass: m,
    kEq: k,
    cEq: c,
  };
}
