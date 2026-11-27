import { isTourStepIndex, TOUR_VERSION, type TourAction, type TourRole, type TourState } from "../../../../lib/onboarding/tour-state";
import type { NativeSessionTransport } from "../../network/transport";

export async function nativeTourState(session: NativeSessionTransport, role: TourRole, signal: AbortSignal, change?: { action: TourAction; generation: number }): Promise<TourState | null> {
  const response = await session.request("/api/onboarding/tour" + (change ? "" : "?role=" + role), {
    method: change ? "PUT" : "GET", signal, requiredRole: role === "tutor" ? "tutor" : "murid",
    headers: { "x-user-id": session.scope.accountId, "Content-Type": "application/json" },
    ...(change && { body: JSON.stringify({ ...change.action, role, generation: change.generation, version: TOUR_VERSION }) }),
  });
  try {
    if (!response.ok) throw new Error("Tour unavailable");
    const data = await response.json() as { state?: TourState | null };
    session.assertCurrent();
    if (data?.state === null) return null;
    const value = data?.state;
    if (!value || value.version !== TOUR_VERSION || !Number.isSafeInteger(value.generation) || value.generation < 1 ||
        !isTourStepIndex(value.stepIndex) || !["in_progress", "skipped", "completed"].includes(value.status) ||
        (value.courseId !== null && (typeof value.courseId !== "string" || !value.courseId.trim() || value.courseId.length > 128))) throw new Error("Invalid tour state");
    return value;
  } finally { response.dispose(); }
}
