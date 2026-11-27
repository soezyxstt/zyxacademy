export type CalendarCommand =
  | { action: "copy"; week: string }
  | { action: "delete"; slotId: string; expectedRevision: string; confirmed: true }
  | { action: "move"; bookingId: string; expectedSlotId: string; targetSlotId: string; date: string; reason: string };

export type CalendarOutcome =
  | { action: "copy"; created: number; skipped: number }
  | { action: "delete" }
  | { action: "move"; moved: boolean };

export function validCalendarOutcome(value: unknown, action: CalendarCommand["action"]): value is CalendarOutcome {
  if (!value || typeof value !== "object" || !("action" in value) || value.action !== action) return false;
  if (value.action === "move") return "moved" in value && typeof value.moved === "boolean";
  if (value.action === "delete") return true;
  return value.action === "copy" && "created" in value && typeof value.created === "number" && Number.isInteger(value.created) && value.created >= 0 &&
    "skipped" in value && typeof value.skipped === "number" && Number.isInteger(value.skipped) && value.skipped >= 0;
}
export type CalendarAttempt = { requestId: string; command: CalendarCommand };
export type CalendarEditor = {
  pending(): CalendarAttempt | undefined;
  save(attempt: CalendarAttempt, signal: AbortSignal): Promise<CalendarOutcome | "denied" | "conflict" | "unknown" | "invalid">;
};
