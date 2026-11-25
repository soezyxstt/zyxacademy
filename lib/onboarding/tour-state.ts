export const TOUR_VERSION = 1 as const;
export const TOUR_STEP_COUNT = 9;

export type TourRole = "student" | "tutor";
export type TourStatus = "in_progress" | "completed" | "skipped";
export type TourState = {
  version: typeof TOUR_VERSION;
  /** Increments on restart so a delayed write cannot alter a later run. */
  generation: number;
  status: TourStatus;
  stepIndex: number;
  /** Navigation context only. Course routes must independently enforce access. */
  courseId: string | null;
  updatedAt: string;
};
export type TourAction =
  | { action: "start" | "restart"; courseId?: string | null }
  | { action: "complete" | "skip" }
  | { action: "progress"; stepIndex: number };
/** Zero means the client has loaded an account with no stored tour choice. */
export type TourWriteAction = TourAction & { generation: number };
export type TourMutation = TourWriteAction & { role: TourRole; version: typeof TOUR_VERSION };

const MAX_GENERATION = 2_147_483_647;

export function isTourRole(value: unknown): value is TourRole {
  return value === "student" || value === "tutor";
}

export function isTourStepIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < TOUR_STEP_COUNT;
}

export function parseTourMutation(value: unknown): TourMutation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!isTourRole(input.role) || input.version !== TOUR_VERSION) return null;
  if (typeof input.generation !== "number" || !Number.isSafeInteger(input.generation) || input.generation < 0 || input.generation > MAX_GENERATION) return null;
  if (Object.keys(input).some(key => !["role", "version", "generation", "action", "stepIndex", "courseId"].includes(key))) return null;
  if (input.action === "progress") {
    if ("courseId" in input) return null;
    return isTourStepIndex(input.stepIndex)
      ? { role: input.role, version: TOUR_VERSION, generation: input.generation, action: "progress", stepIndex: input.stepIndex }
      : null;
  }
  if ("stepIndex" in input) return null;
  if (input.action === "start" || input.action === "restart") {
    const courseId = input.courseId ?? null;
    if (courseId !== null && (typeof courseId !== "string" || courseId.length === 0 || courseId.length > 128 || !courseId.trim() || /[\u0000-\u001f\u007f]/.test(courseId))) return null;
    return { role: input.role, version: TOUR_VERSION, generation: input.generation, action: input.action, courseId };
  }
  if ("courseId" in input || (input.action !== "complete" && input.action !== "skip")) return null;
  return { role: input.role, version: TOUR_VERSION, generation: input.generation, action: input.action };
}

/** Stored terminal choices and newer runs win over delayed requests from another tab. */
export function applyTourAction(current: TourState | null, action: TourWriteAction, updatedAt: string): TourState | null {
  if (!current) {
    if (action.generation === 0 && (action.action === "start" || action.action === "restart" || action.action === "skip")) {
      const courseId = action.action === "start" || action.action === "restart" ? action.courseId ?? null : null;
      return { version: TOUR_VERSION, generation: 1, status: action.action === "skip" ? "skipped" : "in_progress", stepIndex: 0, courseId, updatedAt };
    }
    return null;
  }
  // Resume never resets a row. Other actions must name the run the user saw.
  if (action.action === "start" || action.generation !== current.generation) return current;
  if (action.action === "restart") {
    return current.generation < MAX_GENERATION
      ? { version: TOUR_VERSION, generation: current.generation + 1, status: "in_progress", stepIndex: 0, courseId: action.courseId ?? null, updatedAt }
      : current;
  }
  if (current.status !== "in_progress") return current;
  if (action.action === "skip") return { ...current, status: "skipped", updatedAt };
  if (action.action === "complete" && current.stepIndex === TOUR_STEP_COUNT - 1) {
    return { ...current, status: "completed", updatedAt };
  }
  if (action.action === "progress" && isTourStepIndex(action.stepIndex) && action.stepIndex > current.stepIndex) {
    return { ...current, stepIndex: action.stepIndex, updatedAt };
  }
  return current;
}

/** Canonical roles come from active memberships; legacy role can only narrow access. */
export function canUseTour(role: TourRole, roles: readonly string[], legacyRole?: string | null): boolean {
  return legacyRole !== "admin" && !roles.includes("admin") && roles.includes(role === "student" ? "murid" : "tutor");
}
