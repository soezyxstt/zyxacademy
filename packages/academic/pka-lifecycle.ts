import type { PkaScheduleRevision } from "./pka-schedule-edit";

export type PkaAnnouncementState = { archived: boolean; pinned: boolean; revision: string };
export type PkaLifecycleCommand =
  | { action: "create-schedule"; title: string; sessionAt: string; meetLink: string | null }
  | { action: "send-announcement"; title: string; body: string }
  | { action: "delete-schedule"; id: string; expectedRevision: string }
  | { action: "announcement-state"; id: string; expectedRevision: string; field: "archived" | "pinned"; value: boolean };

export type PkaLifecycleReceipt =
  | { status: "saved"; id: string; delivery?: "queued" }
  | { status: "conflict"; id: string; current: PkaAnnouncementState | PkaScheduleRevision };

export function pkaScheduleCreationNeedsDelivery(sessionAt: Date, now = Date.now()): boolean {
  return sessionAt.getTime() > now;
}

export function isPkaAnnouncementState(value: unknown): value is PkaAnnouncementState {
  return value !== null && typeof value === "object" &&
    "archived" in value && typeof value.archived === "boolean" &&
    "pinned" in value && typeof value.pinned === "boolean" &&
    "revision" in value && typeof value.revision === "string" && /^[a-f0-9]{64}$/.test(value.revision);
}
