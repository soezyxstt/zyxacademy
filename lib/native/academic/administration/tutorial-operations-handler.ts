import { z } from "zod";
import { validTutorialTargetId, type AdminTutorialCommand } from "@/packages/academic/admin-tutorial-operations";

const id = z.string().refine(validTutorialTargetId);
const revision = z.string().regex(/^[a-f0-9]{64}$/);
const base = { id, expectedRevision: revision };
const text = (max: number) => z.string().trim().min(1).max(max).refine(value => !value.includes("\0"));
const reason = text(2_000);
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

export const tutorialOperation = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("create-availability"), tutorId: id, sessionDate: z.iso.date(),
    startTime: time, endTime: time, mode: z.enum(["online", "offline"]), location: text(500).nullable(), reason })
    .refine(value => value.mode === "online" ? value.location === null : value.location !== null),
  z.strictObject({ action: z.literal("delete-availability"), ...base, reason }),
  z.strictObject({ action: z.literal("assign"), ...base, groupId: id, courseId: id, topic: text(2_000).nullable(), reason }),
  z.strictObject({ action: z.literal("move"), ...base, targetSlotId: id, expectedTargetRevision: revision, reason }),
  z.strictObject({ action: z.literal("cancel"), ...base, reason }),
  z.strictObject({ action: z.literal("qualifications"), ...base, courseIds: z.array(id).max(500).refine(ids => new Set(ids).size === ids.length) }),
]) satisfies z.ZodType<AdminTutorialCommand>;

export const tutorialRejectionStatus: Readonly<Record<string, 404 | 409 | 422>> = {
  TUTOR_NOT_FOUND: 404, TUTOR_ASSIGNMENT_SUBJECT_NOT_FOUND: 404, SLOT_NOT_FOUND: 404, TARGET_SLOT_NOT_FOUND: 404, BOOKING_NOT_FOUND: 404,
  NOT_A_TUTOR: 422, TUTOR_INACTIVE: 422, COURSE_NOT_FOUND: 422, COURSE_INACTIVE_OR_NOT_FOUND: 422,
  GROUP_NOT_FOUND: 404, GROUP_NOT_ACTIVE: 409, GROUP_COURSE_NOT_ENROLLED: 409, GROUP_HAS_NO_MEMBERS: 409,
  INVALID_SESSION_DATE: 422, INVALID_DURATION_NOT_90_MINUTES: 422, INVALID_TIME_FORMAT: 422, INVALID_TIME_ORDER: 422, INVALID_TIME_RANGE: 422,
  LOCATION_REQUIRED_FOR_OFFLINE: 422, TARGET_SLOT_SAME: 422, LEGACY_SLOT_NO_DATE: 422,
  TUTOR_SLOT_OVERLAP: 409, DUPLICATE_TUTOR_SLOT: 409, SLOT_ALREADY_BOOKED: 409, TARGET_SLOT_BOOKED: 409,
  TUTOR_NOT_ASSIGNED_TO_COURSE: 409, GROUP_NOT_ELIGIBLE: 409, TOTAL_QUOTA_EXCEEDED: 409, WEEKLY_QUOTA_EXCEEDED: 409, BOOKING_TERMINAL_STATE: 409,
};
