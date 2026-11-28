import { describe, expect, test } from "bun:test";
import {
  staticsSimSpecSchema,
  thermoSimSpecSchema,
  vibrationSimSpecSchema,
} from "@/lib/assessment-ui-sdk/engineering-sim-schema";
import { solveVibrationSystem } from "@/lib/assessment-ui-sdk/vibration-solver";
import {
  solveStaticsBeam,
  solveThermoCycle,
} from "@/lib/assessment-ui-sdk/statics-thermo-solver";

describe("engineering simulation solvers", () => {
  test("solves vertical swinging bar with pivot at L/4, springs at 0 and 3L/4, damper at L accurately", () => {
    const spec = vibrationSimSpecSchema.parse({
      model: "swinging_bar",
      orientation: "vertical",
      length: 2,
      mass: 4,
      pivotPosition: 0.25,
      springs: [
        { position: 0, k: 400, side: "left", label: "k_1" },
        { position: 0.75, k: 600, side: "right", label: "k_2" },
      ],
      dampers: [{ position: 1, c: 25, side: "right", label: "c" }],
      initialDisplacement: 0.25,
      duration: 6,
    });

    const result = solveVibrationSystem(spec, 120);

    // I_O = (1/12)*4*4 + 4*(0.5^2) = 4/3 + 1 = 7/3
    expect(result.inertiaOrMass).toBeCloseTo(7 / 3, 5);
    // k_eq = 400*(0.5^2) + 600*(1.0^2) = 100 + 600 = 700
    expect(result.kEq).toBeCloseTo(700, 5);
    // c_eq = 25*(1.5^2) = 56.25
    expect(result.cEq).toBeCloseTo(56.25, 5);
    expect(result.omegaN).toBeCloseTo(Math.sqrt(700 / (7 / 3)), 4);
    expect(result.regime).toBe("Underdamped");
    expect(result.samples.length).toBe(121);
    expect(result.samples[0].q1).toBeCloseTo(0.25, 4);
    // Damped amplitude decays over time
    expect(Math.abs(result.samples[result.samples.length - 1].q1)).toBeLessThan(0.05);
  });

  test("solves 2-DOF vibration system with exact normal modes and stationary node location", () => {
    const spec = vibrationSimSpecSchema.parse({
      model: "two_dof_mass",
      mass: 2,
      mass2: 2,
      stiffness: 200,
      stiffness2: 200,
      stiffness3: 200,
      damping: 0,
      damping2: 0,
      initialDisplacement: 0.3,
      initialDisplacement2: -0.3,
      duration: 4,
    });

    const result = solveVibrationSystem(spec, 100);
    expect(result.modes).toBeDefined();
    const [mode1, mode2] = result.modes!;

    // Exact eigenvalues for symmetric k1=k2=k3=200, m1=m2=2:
    // omega_1 = sqrt(k/m) = 10 rad/s (in-phase), omega_2 = sqrt(3k/m) = sqrt(300) ~ 17.3205 rad/s (out-of-phase)
    expect(mode1.omega).toBeCloseTo(10, 4);
    expect(mode1.nodePositionBetweenMasses).toBeNull();
    expect(mode2.omega).toBeCloseTo(Math.sqrt(300), 4);
    expect(mode2.nodePositionBetweenMasses).toBeCloseTo(0.5, 4);
  });

  test("solves simply supported statics beam reactions and peak moment", () => {
    const spec = staticsSimSpecSchema.parse({
      beamLength: 6,
      supports: [
        { type: "pin", x: 0, label: "A" },
        { type: "roller", x: 6, label: "B" },
      ],
      loads: [{ type: "point", x: 3, magnitude: 10 }],
    });

    const result = solveStaticsBeam(spec, 60);
    expect(result.reactions).toHaveLength(2);
    expect(result.reactions[0].ry).toBeCloseTo(5, 4);
    expect(result.reactions[1].ry).toBeCloseTo(5, 4);
    // Peak bending moment for center point load P*L/4 = 10*6/4 = 15 kN*m
    expect(result.maxAbsM).toBeCloseTo(15, 3);
  });

  test("solves thermodynamic cycle work and pressure/volume bounds", () => {
    const spec = thermoSimSpecSchema.parse({
      cycle: "carnot",
      states: [
        { id: "1", P: 400, V: 1, T: 600 },
        { id: "2", P: 200, V: 2, T: 600 },
        { id: "3", P: 80, V: 3.8, T: 300 },
        { id: "4", P: 160, V: 1.9, T: 300 },
      ],
      processes: [
        { from: "1", to: "2", type: "isothermal", qDirection: "in" },
        { from: "2", to: "3", type: "adiabatic", qDirection: "none" },
        { from: "3", to: "4", type: "isothermal", qDirection: "out" },
        { from: "4", to: "1", type: "adiabatic", qDirection: "none" },
      ],
    });

    const result = solveThermoCycle(spec, 20);
    expect(result.curve.length).toBeGreaterThan(60);
    expect(result.workNet).toBeGreaterThan(0);
  });
});
