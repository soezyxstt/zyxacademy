export const scheduleFilePolicy = {
  mimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
  maxBytes: 10 * 1024 * 1024,
} as const;

export const SCHEDULE_ACCOUNT = "x-native-schedule-account";
export const SCHEDULE_SESSION = "x-native-schedule-session";

export type ScheduleRole = "murid" | "tutor";
export type SchedulePhase = "pre" | "post";
export type ScheduleStatus = "scheduled" | "rescheduled" | "completed" | "cancelled";

export function writableSchedulePhase(role: ScheduleRole, status: ScheduleStatus): SchedulePhase | null {
  if (status === "cancelled") return null;
  if (role === "tutor") return "post";
  return status === "completed" ? null : "pre";
}

const id = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
export function validScheduleId(value: string): boolean {
  return id.test(value);
}

export function scheduleResourcePath(role: ScheduleRole, bookingId: string, attachmentId?: string): string | null {
  if ((role !== "murid" && role !== "tutor") || !validScheduleId(bookingId) ||
    (attachmentId !== undefined && !validScheduleId(attachmentId))) return null;
  return `/api/native/schedule/${role}/${bookingId}${attachmentId === undefined ? "" : `?download=${attachmentId}`}`;
}

export function safeScheduleLink(input: string): string | null {
  try {
    const parsed = new URL(input);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.href : null;
  } catch { return null; }
}

export type NativeScheduleResources = {
  bookingId: string;
  status: ScheduleStatus;
  topic: string | null;
  preNotes: string | null;
  postNotes: string | null;
  meetUrl: string | null;
  location: string | null;
  canWrite: SchedulePhase | null;
  resources: {
    id: string;
    label: string;
    phase: SchedulePhase;
    kind: "link" | "recording" | "file";
    url: string | null;
    available: boolean;
    canDelete: boolean;
  }[];
};

export type ScheduleCommand =
  | { action: "link"; kind: "link" | "recording"; label: string; url: string }
  | { action: "delete"; id: string }
  | { action: "summary"; notes: string };
