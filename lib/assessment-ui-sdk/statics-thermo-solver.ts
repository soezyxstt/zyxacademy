import type { StaticsSimSpec, ThermoSimSpec } from "./engineering-sim-schema";

// ============================================================================
// 1. Statics: Beam Reactions, SFD V(x) & BMD M(x)
// ============================================================================

export interface StaticsReaction {
  x: number;
  type: "pin" | "roller" | "fixed";
  label: string;
  ry: number; // upward reaction force (kN)
  ma?: number; // reaction moment (kN*m, CCW positive) for cantilever/fixed support
}

export interface StaticsDiagramPoint {
  x: number;
  V: number; // shear force (kN)
  M: number; // bending moment (kN*m)
}

export interface StaticsSolveResult {
  reactions: StaticsReaction[];
  points: StaticsDiagramPoint[];
  maxAbsV: number;
  maxAbsM: number;
}

export function solveStaticsBeam(spec: StaticsSimSpec, sampleCount = 120): StaticsSolveResult {
  const L = Math.max(0.5, spec.beamLength);

  // Total downward vertical force & total clockwise moment about x = 0
  let totalDownForce = 0;
  let totalMomentAboutOrigin = 0; // downward force at x creates clockwise moment F*x; CCW applied moment reduces it

  for (const load of spec.loads) {
    if (load.type === "point") {
      const x = Math.max(0, Math.min(L, load.x));
      totalDownForce += load.magnitude;
      totalMomentAboutOrigin += load.magnitude * x;
    } else if (load.type === "distributed") {
      const x1 = Math.max(0, Math.min(L, load.x));
      const x2 = Math.max(x1, Math.min(L, load.xEnd ?? L));
      const span = x2 - x1;
      const resultant = load.magnitude * span;
      const centroid = (x1 + x2) / 2;
      totalDownForce += resultant;
      totalMomentAboutOrigin += resultant * centroid;
    } else if (load.type === "moment") {
      // Positive magnitude = CCW external moment
      totalMomentAboutOrigin -= load.magnitude;
    }
  }

  const reactions: StaticsReaction[] = [];
  const fixedSupport = spec.supports.find((s) => s.type === "fixed");

  if (fixedSupport) {
    const xF = Math.max(0, Math.min(L, fixedSupport.x));
    const ry = totalDownForce;
    // Equilibrium about xF: M_A (CCW) - sum(F_i * (x_i - xF)) + sum(M_ext) = 0
    let momentAtFixed = 0;
    for (const load of spec.loads) {
      if (load.type === "point") {
        momentAtFixed += load.magnitude * (load.x - xF);
      } else if (load.type === "distributed") {
        const x1 = Math.max(0, Math.min(L, load.x));
        const x2 = Math.max(x1, Math.min(L, load.xEnd ?? L));
        const resultant = load.magnitude * (x2 - x1);
        momentAtFixed += resultant * ((x1 + x2) / 2 - xF);
      } else if (load.type === "moment") {
        momentAtFixed -= load.magnitude;
      }
    }
    reactions.push({
      x: xF,
      type: "fixed",
      label: fixedSupport.label ?? "A",
      ry,
      ma: momentAtFixed,
    });
  } else if (spec.supports.length >= 2) {
    const sorted = [...spec.supports].sort((a, b) => a.x - b.x);
    const sA = sorted[0];
    const sB = sorted[1];
    const xA = Math.max(0, Math.min(L, sA.x));
    const xB = Math.max(xA + 1e-4, Math.min(L, sB.x));
    const spanAB = xB - xA;
    // Sum M about A = 0 => R_B * (xB - xA) = sum(F_i * (x_i - xA)) - sum(M_ext)
    const momentAboutA = totalMomentAboutOrigin - totalDownForce * xA;
    const rB = momentAboutA / spanAB;
    const rA = totalDownForce - rB;
    reactions.push(
      { x: xA, type: sA.type, label: sA.label ?? "A", ry: rA },
      { x: xB, type: sB.type, label: sB.label ?? "B", ry: rB },
    );
  } else if (spec.supports.length === 1) {
    const sA = spec.supports[0];
    reactions.push({
      x: Math.max(0, Math.min(L, sA.x)),
      type: sA.type,
      label: sA.label ?? "A",
      ry: totalDownForce,
    });
  }

  // Evaluate V(x) and M(x) along the beam
  const points: StaticsDiagramPoint[] = [];
  let maxAbsV = 0;
  let maxAbsM = 0;

  for (let i = 0; i <= sampleCount; i++) {
    const x = (L * i) / sampleCount;
    let V = 0;
    let M = 0;

    for (const r of reactions) {
      if (x >= r.x - 1e-9) {
        V += r.ry;
        M += r.ry * (x - r.x);
        if (r.ma !== undefined) {
          M -= r.ma;
        }
      }
    }

    for (const load of spec.loads) {
      if (load.type === "point" && x >= load.x - 1e-9) {
        V -= load.magnitude;
        M -= load.magnitude * (x - load.x);
      } else if (load.type === "distributed") {
        const x1 = Math.max(0, Math.min(L, load.x));
        const x2 = Math.max(x1, Math.min(L, load.xEnd ?? L));
        if (x > x1) {
          const activeEnd = Math.min(x, x2);
          const activeSpan = activeEnd - x1;
          const f = load.magnitude * activeSpan;
          const centroid = (x1 + activeEnd) / 2;
          V -= f;
          M -= f * (x - centroid);
        }
      } else if (load.type === "moment" && x >= load.x - 1e-9) {
        M -= load.magnitude;
      }
    }

    maxAbsV = Math.max(maxAbsV, Math.abs(V));
    maxAbsM = Math.max(maxAbsM, Math.abs(M));
    points.push({
      x: Number(x.toFixed(4)),
      V: Number(V.toFixed(4)),
      M: Number(M.toFixed(4)),
    });
  }

  return {
    reactions,
    points,
    maxAbsV: Math.max(maxAbsV, 1e-3),
    maxAbsM: Math.max(maxAbsM, 1e-3),
  };
}

// ============================================================================
// 2. Thermodynamics: P-V Process Sampling, Work W_net & Piston State
// ============================================================================

export interface ThermoCurvePoint {
  progress: number; // 0..1 across whole cycle
  processIndex: number;
  processType: ThermoSimSpec["processes"][number]["type"];
  qDirection: "in" | "out" | "none";
  P: number;
  V: number;
  T: number;
}

export interface ThermoSolveResult {
  curve: ThermoCurvePoint[];
  workNet: number; // integral P dV (same unit as P*V)
  minP: number;
  maxP: number;
  minV: number;
  maxV: number;
  minT: number;
  maxT: number;
}

export function solveThermoCycle(spec: ThermoSimSpec, stepsPerProcess = 28): ThermoSolveResult {
  const stateMap = new Map(spec.states.map((s) => [s.id, s]));
  const curve: ThermoCurvePoint[] = [];
  let workNet = 0;

  const totalProcesses = Math.max(1, spec.processes.length);

  for (let pIdx = 0; pIdx < spec.processes.length; pIdx++) {
    const proc = spec.processes[pIdx];
    const s1 = stateMap.get(proc.from);
    const s2 = stateMap.get(proc.to);
    if (!s1 || !s2) continue;

    const T1 = s1.T ?? s1.P * s1.V;
    const T2 = s2.T ?? s2.P * s2.V;
    const gamma = proc.gamma ?? 1.4;

    let prevP = s1.P;
    let prevV = s1.V;

    for (let i = 0; i <= stepsPerProcess; i++) {
      const u = i / stepsPerProcess;
      let V = s1.V + (s2.V - s1.V) * u;
      let P = s1.P + (s2.P - s1.P) * u;
      let T = T1 + (T2 - T1) * u;

      if (proc.type === "isobaric") {
        P = s1.P;
        V = s1.V + (s2.V - s1.V) * u;
        T = T1 * (V / Math.max(1e-6, s1.V));
      } else if (proc.type === "isochoric") {
        V = s1.V;
        P = s1.P + (s2.P - s1.P) * u;
        T = T1 * (P / Math.max(1e-6, s1.P));
      } else if (proc.type === "isothermal") {
        V = s1.V + (s2.V - s1.V) * u;
        const c = s1.P * s1.V;
        P = c / Math.max(1e-6, V);
        T = T1;
      } else if (proc.type === "adiabatic") {
        V = s1.V + (s2.V - s1.V) * u;
        const c = s1.P * Math.pow(s1.V, gamma);
        P = c / Math.pow(Math.max(1e-6, V), gamma);
        T = T1 * Math.pow(s1.V / Math.max(1e-6, V), gamma - 1);
      }

      if (i > 0) {
        workNet += 0.5 * (prevP + P) * (V - prevV);
      }
      prevP = P;
      prevV = V;

      if (i < stepsPerProcess || pIdx === spec.processes.length - 1) {
        curve.push({
          progress: (pIdx + u) / totalProcesses,
          processIndex: pIdx,
          processType: proc.type,
          qDirection: proc.qDirection,
          P: Number(P.toFixed(4)),
          V: Number(V.toFixed(4)),
          T: Number(T.toFixed(2)),
        });
      }
    }
  }

  const Ps = curve.map((c) => c.P);
  const Vs = curve.map((c) => c.V);
  const Ts = curve.map((c) => c.T);

  return {
    curve,
    workNet,
    minP: Ps.length ? Math.min(...Ps) : 0,
    maxP: Ps.length ? Math.max(...Ps) : 100,
    minV: Vs.length ? Math.min(...Vs) : 0,
    maxV: Vs.length ? Math.max(...Vs) : 10,
    minT: Ts.length ? Math.min(...Ts) : 200,
    maxT: Ts.length ? Math.max(...Ts) : 600,
  };
}
