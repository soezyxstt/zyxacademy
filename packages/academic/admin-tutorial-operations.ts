export type TutorialChoice = { id: string; label: string };
export type TutorialTutor = TutorialChoice & { courseIds: string[]; revision: string };
export type TutorialGroup = TutorialChoice & { courseIds: string[] };
export type TutorialBooking = {
  id: string; label: string; courseId: string; status: "scheduled" | "rescheduled" | "completed" | "cancelled"; revision: string;
};
export type TutorialSlot = {
  id: string; tutorId: string; tutorName: string; date: string; start: string; end: string;
  mode: "online" | "offline"; location: string | null; revision: string; booking: TutorialBooking | null; deletable: boolean;
};
export type AdminTutorialSchedule = { weekStart: string; tutors: TutorialTutor[]; courses: TutorialChoice[]; groups: TutorialGroup[]; slots: TutorialSlot[] };

type Version = { id: string; expectedRevision: string };
export type AdminTutorialCommand =
  | { action: "create-availability"; tutorId: string; sessionDate: string; startTime: string; endTime: string; mode: "online" | "offline"; location: string | null; reason: string }
  | (Version & { action: "delete-availability"; reason: string })
  | (Version & { action: "assign"; groupId: string; courseId: string; topic: string | null; reason: string })
  | (Version & { action: "move"; targetSlotId: string; expectedTargetRevision: string; reason: string })
  | (Version & { action: "cancel"; reason: string })
  | (Version & { action: "qualifications"; courseIds: string[] });

export function validTutorialTargetId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9:_-][A-Za-z0-9._:-]{0,255}$/.test(value);
}

const isRevision = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const time = (value: unknown): value is string => typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const date = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const label = (value: unknown) => typeof value === "string";
const array = (value: unknown, valid: (item: unknown) => boolean) => Array.isArray(value) && value.every(valid);
const bookingStatuses = new Set<unknown>(["scheduled", "rescheduled", "completed", "cancelled"]);
const choice = (value: unknown) => record(value) && validTutorialTargetId(value.id) && label(value.label);

export function isAdminTutorialSchedule(value: unknown): value is AdminTutorialSchedule {
  return record(value) && date(value.weekStart) && array(value.courses, choice) &&
    array(value.tutors, item => record(item) && choice(item) && isRevision(item.revision) && array(item.courseIds, validTutorialTargetId)) &&
    array(value.groups, item => record(item) && choice(item) && array(item.courseIds, validTutorialTargetId)) &&
    array(value.slots, item => record(item) && validTutorialTargetId(item.id) && validTutorialTargetId(item.tutorId) &&
      label(item.tutorName) && date(item.date) && time(item.start) && time(item.end) && (item.mode === "online" || item.mode === "offline") &&
      (item.location === null || label(item.location)) && isRevision(item.revision) && typeof item.deletable === "boolean" &&
      (item.booking === null || (record(item.booking) && choice(item.booking) && validTutorialTargetId(item.booking.courseId) &&
        isRevision(item.booking.revision) && bookingStatuses.has(item.booking.status))));
}
