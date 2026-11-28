import { z } from "zod";

// ============================================================================
// 1. Mechanical Vibrations & Multi-Body Oscillations Schema
// ============================================================================

export const barAttachmentSpringSchema = z.object({
  /** Position along the bar from bottom/left end as a fraction 0..1 (or meters if > 1). */
  position: z.number().finite().min(0),
  k: z.number().finite().positive().default(200),
  side: z.enum(["left", "right", "top", "bottom"]).optional(),
  label: z.string().max(40).optional(),
});

export const barAttachmentDamperSchema = z.object({
  /** Position along the bar from bottom/left end as a fraction 0..1 (or meters if > 1). */
  position: z.number().finite().min(0),
  c: z.number().finite().nonnegative().default(15),
  side: z.enum(["left", "right", "top", "bottom"]).optional(),
  label: z.string().max(40).optional(),
});

export const vibrationSimSpecSchema = z.object({
  model: z
    .enum(["sdof_mass", "two_dof_mass", "swinging_bar"])
    .default("sdof_mass"),
  orientation: z.enum(["vertical", "horizontal"]).default("vertical"),
  mass: z.number().finite().positive().default(2),
  mass2: z.number().finite().positive().optional(),
  length: z.number().finite().positive().default(2),
  /** Pivot position along the bar from bottom/left end (0..1 fraction, or meters if > 1). */
  pivotPosition: z.number().finite().min(0).default(0.25),
  stiffness: z.number().finite().nonnegative().default(200),
  stiffness2: z.number().finite().nonnegative().optional(),
  stiffness3: z.number().finite().nonnegative().optional(),
  damping: z.number().finite().nonnegative().default(4),
  damping2: z.number().finite().nonnegative().optional(),
  damping3: z.number().finite().nonnegative().optional(),
  springs: z.array(barAttachmentSpringSchema).max(8).optional(),
  dampers: z.array(barAttachmentDamperSchema).max(8).optional(),
  gravity: z.number().finite().min(0).max(50).default(9.81),
  includeGravity: z.boolean().default(false),
  /** Initial displacement (m for mass, rad for swinging_bar). */
  initialDisplacement: z.number().finite().default(0.25),
  initialDisplacement2: z.number().finite().optional(),
  initialVelocity: z.number().finite().default(0),
  initialVelocity2: z.number().finite().optional(),
  forcingAmplitude: z.number().finite().default(0),
  forcingFrequency: z.number().finite().nonnegative().default(0),
  duration: z.number().finite().positive().max(30).default(8),
  summary: z.string().max(400).optional(),
});

export type VibrationSimSpec = z.infer<typeof vibrationSimSpecSchema>;
export type BarSpringAttachment = z.infer<typeof barAttachmentSpringSchema>;
export type BarDamperAttachment = z.infer<typeof barAttachmentDamperSchema>;

// ============================================================================
// 2. Kinematics & 2D Rigid-Body Collisions (Planck / Box2D SI) Schema
// ============================================================================

export const kinematicsBodySchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().max(40).optional(),
  shape: z.enum(["circle", "box"]).default("circle"),
  mass: z.number().finite().nonnegative().default(2),
  radius: z.number().finite().positive().default(0.45),
  width: z.number().finite().positive().optional(),
  height: z.number().finite().positive().optional(),
  x: z.number().finite().default(0),
  y: z.number().finite().default(0),
  vx: z.number().finite().default(0),
  vy: z.number().finite().default(0),
  /** Optional post-collision velocity hint for exact textbook 2D angle demonstrations. */
  vxAfter: z.number().finite().optional(),
  vyAfter: z.number().finite().optional(),
  restitution: z.number().finite().min(0).max(1).default(1),
  color: z.enum(["primary", "secondary", "success", "warning", "error", "muted"]).optional(),
});

export const kinematicsJointSchema = z.object({
  type: z.enum(["revolute", "distance", "prismatic"]),
  bodyA: z.string().min(1),
  bodyB: z.string().min(1),
  anchorX: z.number().finite().optional(),
  anchorY: z.number().finite().optional(),
  length: z.number().finite().positive().optional(),
  frequencyHz: z.number().finite().nonnegative().optional(),
  dampingRatio: z.number().finite().min(0).max(2).optional(),
});

export const kinematicsSimSpecSchema = z.object({
  mode: z.enum(["collision_1d", "collision_2d", "projectile", "linkage"]).default("collision_2d"),
  bodies: z.array(kinematicsBodySchema).min(1).max(12),
  joints: z.array(kinematicsJointSchema).max(12).optional(),
  gravity: z.tuple([z.number().finite(), z.number().finite()]).default([0, 0]),
  showVectors: z.array(z.enum(["velocity", "momentum"])).default(["momentum"]),
  showTrails: z.boolean().default(true),
  duration: z.number().finite().positive().max(20).default(4),
  summary: z.string().max(400).optional(),
});

export type KinematicsSimSpec = z.infer<typeof kinematicsSimSpecSchema>;

// ============================================================================
// 3. Statics, FBD & SFD/BMD Schema
// ============================================================================

export const staticsSupportSchema = z.object({
  type: z.enum(["pin", "roller", "fixed"]),
  x: z.number().finite().min(0),
  label: z.string().max(24).optional(),
});

export const staticsLoadSchema = z.object({
  type: z.enum(["point", "distributed", "moment"]),
  x: z.number().finite().min(0),
  xEnd: z.number().finite().min(0).optional(),
  /** Downward force in kN (positive = downward), distributed load in kN/m, or moment in kN*m (positive = CCW). */
  magnitude: z.number().finite(),
  label: z.string().max(32).optional(),
});

export const staticsSimSpecSchema = z.object({
  beamLength: z.number().finite().positive().default(6),
  unitLength: z.string().max(12).default("m"),
  unitForce: z.string().max(12).default("kN"),
  supports: z.array(staticsSupportSchema).min(1).max(2),
  loads: z.array(staticsLoadSchema).min(1).max(10),
  summary: z.string().max(400).optional(),
});

export type StaticsSimSpec = z.infer<typeof staticsSimSpecSchema>;

// ============================================================================
// 4. Thermodynamics Cycle & Piston-Cylinder Schema
// ============================================================================

export const thermoStatePointSchema = z.object({
  id: z.string().min(1).max(20),
  label: z.string().max(24).optional(),
  P: z.number().finite().positive(),
  V: z.number().finite().positive(),
  T: z.number().finite().positive().optional(),
});

export const thermoProcessSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  type: z.enum(["isothermal", "isobaric", "isochoric", "adiabatic"]),
  gamma: z.number().finite().min(1.05).max(2).default(1.4),
  label: z.string().max(40).optional(),
  qDirection: z.enum(["in", "out", "none"]).default("none"),
});

export const thermoSimSpecSchema = z.object({
  cycle: z.enum(["carnot", "otto", "diesel", "brayton", "custom"]).default("custom"),
  diagram: z.enum(["pv", "ts"]).default("pv"),
  states: z.array(thermoStatePointSchema).min(2).max(8),
  processes: z.array(thermoProcessSchema).min(1).max(8),
  unitP: z.string().max(16).default("kPa"),
  unitV: z.string().max(16).default("L"),
  showPiston: z.boolean().default(true),
  summary: z.string().max(400).optional(),
});

export type ThermoSimSpec = z.infer<typeof thermoSimSpecSchema>;
