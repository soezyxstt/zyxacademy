import { and, eq, inArray, isNotNull, isNull, ne, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  bookingAuditLogs,
  bookings,
  courses,
  groupCourses,
  groupMembers,
  groups,
  mataKuliah,
  tutorCourses,
  tutorSlots,
  user,
} from "@/db/schema";
import {
  type DbExecutor,
  resolveTutorCourseAccess,
  type TutorAccessSource,
} from "@/lib/auth/tutor-access";
import {
  INDONESIAN_DAYS,
  type IndonesianDay,
  normalizeDate,
  parseDateInput,
} from "@/lib/date-utils";

export { INDONESIAN_DAYS, type IndonesianDay };
import { isNinetyMinuteSlot, timeToMinutes } from "@/lib/schedule-lock";
import { canTutorDeleteAvailability } from "@/lib/schedule/week-policy";

const DAY_MAP_FROM_UTC_DAY: Record<number, IndonesianDay> = {
  0: "Minggu",
  1: "Senin",
  2: "Selasa",
  3: "Rabu",
  4: "Kamis",
  5: "Jumat",
  6: "Sabtu",
};

/**
 * Returns the Indonesian day name for a given ISO date string or Date instance.
 */
export function getIndonesianDayFromDate(date: Date | string): IndonesianDay {
  const d = parseDateInput(date);
  const utcDay = d.getUTCDay();
  return DAY_MAP_FROM_UTC_DAY[utcDay] ?? "Senin";
}

/* ────────────────────────────────────────────────────────────────────────────
 * 0. Traceable Cancellation Quota Refund
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Durable booking_audit_logs action that marks an approved pre-lock
 * cancellation whose package session was refunded. The booking row is never
 * deleted; this marker inside the existing audit log JSON row is what frees
 * weekly quota. Post-lock cancellations never receive it and stay counted.
 */
export const CANCELLED_QUOTA_REFUND_LOG_ACTION = "BOOKING_CANCELLED_QUOTA_REFUNDED";

/**
 * SQL condition asserting a booking still consumes its group's weekly session
 * quota. Every kept row counts, including post-lock cancellations (hangus).
 * Only cancelled bookings carrying the durable pre-lock refund marker above
 * are excluded, so freed quota stays traceable to an audit log row.
 */
export function countsTowardGroupWeeklyQuota(): ReturnType<typeof sql> {
  return sql`NOT (${bookings.status} = ${"cancelled"} AND EXISTS (
    SELECT 1 FROM ${bookingAuditLogs}
    WHERE ${bookingAuditLogs.bookingId} = ${bookings.id}
      AND ${bookingAuditLogs.action} = ${CANCELLED_QUOTA_REFUND_LOG_ACTION}
  ))`;
}

export const TERMINAL_BOOKING_STATUSES = ["completed", "cancelled"] as const;

export function isTerminalBookingStatus(status: string | null | undefined): boolean {
  return status === "completed" || status === "cancelled";
}

export function terminalStatusGuard(): ReturnType<typeof notInArray> {
  return notInArray(bookings.status, [...TERMINAL_BOOKING_STATUSES]);
}

/* ────────────────────────────────────────────────────────────────────────────
 * 1. Weekday and Date Consistency
 * ──────────────────────────────────────────────────────────────────────────── */

export interface WeekdayDateValidationResult {
  isValid: boolean;
  actualDayOfWeek: IndonesianDay | null;
  expectedDayOfWeek: string;
  reason?: string;
}

/**
 * Validates that an ISO date string (YYYY-MM-DD) matches the expected Indonesian day name.
 */
export function validateSlotWeekdayDate(
  sessionDateIso: string,
  expectedDayOfWeek: string,
): WeekdayDateValidationResult {
  if (!sessionDateIso || !/^\d{4}-\d{2}-\d{2}$/.test(sessionDateIso.trim())) {
    return {
      isValid: false,
      actualDayOfWeek: null,
      expectedDayOfWeek,
      reason: "INVALID_DATE_FORMAT",
    };
  }

  const trimmedExpected = expectedDayOfWeek ? expectedDayOfWeek.trim() : "";
  if (!INDONESIAN_DAYS.includes(trimmedExpected as IndonesianDay)) {
    return {
      isValid: false,
      actualDayOfWeek: null,
      expectedDayOfWeek,
      reason: "INVALID_DAY_OF_WEEK",
    };
  }

  const [yearStr, monthStr, dayStr] = sessionDateIso.trim().split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const parsed = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  if (
    isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return {
      isValid: false,
      actualDayOfWeek: null,
      expectedDayOfWeek: trimmedExpected,
      reason: "INVALID_CALENDAR_DATE",
    };
  }

  const actualDayOfWeek = getIndonesianDayFromDate(sessionDateIso.trim());
  if (actualDayOfWeek !== trimmedExpected) {
    return {
      isValid: false,
      actualDayOfWeek,
      expectedDayOfWeek: trimmedExpected,
      reason: "DAY_OF_WEEK_MISMATCH",
    };
  }

  return {
    isValid: true,
    actualDayOfWeek,
    expectedDayOfWeek: trimmedExpected,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * 2. Exact 90-Minute Duration Validation
 * ──────────────────────────────────────────────────────────────────────────── */

export interface DurationValidationResult {
  isValid: boolean;
  durationMinutes: number | null;
  startTime: string;
  endTime: string;
  reason?: string;
}

/**
 * Validates that slot start and end times in HH:MM format span exactly 90 minutes.
 */
export function validateSlotDuration(
  startTime: string,
  endTime: string,
): DurationValidationResult {
  const startMin = timeToMinutes(startTime);
  const endMin = timeToMinutes(endTime);

  if (startMin === null || endMin === null) {
    return {
      isValid: false,
      durationMinutes: null,
      startTime,
      endTime,
      reason: "INVALID_TIME_FORMAT",
    };
  }

  const duration = endMin - startMin;
  if (duration !== 90) {
    return {
      isValid: false,
      durationMinutes: duration,
      startTime,
      endTime,
      reason: "INVALID_DURATION_NOT_90_MINUTES",
    };
  }

  return {
    isValid: true,
    durationMinutes: 90,
    startTime,
    endTime,
  };
}

export function isExactNinetyMinuteDuration(
  startTime: string,
  endTime: string,
): boolean {
  return isNinetyMinuteSlot(startTime, endTime);
}

/** Returns true only when two valid half-open time ranges overlap. */
export function doTutorSlotsOverlap(
  startTime: string,
  endTime: string,
  otherStartTime: string,
  otherEndTime: string,
): boolean {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  const otherStart = timeToMinutes(otherStartTime);
  const otherEnd = timeToMinutes(otherEndTime);

  if (start === null || end === null || otherStart === null || otherEnd === null) {
    return false;
  }

  return start < otherEnd && end > otherStart;
}

export type LegacySlotDateBackfillConflictReason =
  | "AMBIGUOUS_BOOKING_DATE"
  | "INVALID_BOOKING_DATE"
  | "DATE_CONFLICT";

export interface LegacySlotDateBackfillConflict {
  slotId: string;
  bookingId: string | null;
  sessionDate: string | null;
  reason: LegacySlotDateBackfillConflictReason;
  existingSlotId?: string;
}

export interface LegacySlotDateBackfillResult {
  updatedCount: number;
  skippedCount: number;
  conflicts: LegacySlotDateBackfillConflict[];
}

/**
 * Repairs only legacy slots that already have a single, valid booking date.
 * Unbooked null-date rows are intentionally untouched because no recurrence
 * date can be inferred for them.
 */
export async function backfillBookedNullTutorSlotDates(
  executor?: DbExecutor,
): Promise<LegacySlotDateBackfillResult> {
  const client = (executor ?? db) as typeof db;

  return client.transaction(async (tx) => {
    const candidateRows = await tx
      .select({
        slotId: tutorSlots.id,
        tutorId: tutorSlots.tutorId,
        dayOfWeek: tutorSlots.dayOfWeek,
        startTime: tutorSlots.startTime,
        endTime: tutorSlots.endTime,
        bookingId: bookings.id,
        sessionDate: bookings.sessionDate,
      })
      .from(tutorSlots)
      .innerJoin(bookings, eq(bookings.slotId, tutorSlots.id))
      .where(
        and(
          isNull(tutorSlots.sessionDate),
          isNotNull(bookings.sessionDate),
        ),
      );

    const candidatesBySlot = new Map<string, typeof candidateRows>();
    for (const row of candidateRows) {
      const rows = candidatesBySlot.get(row.slotId) ?? [];
      rows.push(row);
      candidatesBySlot.set(row.slotId, rows);
    }

    const conflicts: LegacySlotDateBackfillConflict[] = [];
    let updatedCount = 0;
    let skippedCount = 0;

    for (const [slotId, rows] of candidatesBySlot) {
      const distinctDates = new Set(
        rows
          .map((row) => row.sessionDate?.trim())
          .filter((date): date is string => Boolean(date)),
      );
      const candidate = rows[0];
      const sessionDate = distinctDates.size === 1 ? Array.from(distinctDates)[0] : null;

      if (rows.length !== 1 || !sessionDate) {
        skippedCount += 1;
        conflicts.push({
          slotId,
          bookingId: rows.length === 1 ? rows[0].bookingId : null,
          sessionDate,
          reason: "AMBIGUOUS_BOOKING_DATE",
        });
        continue;
      }

      const dateCheck = validateSlotWeekdayDate(sessionDate, candidate.dayOfWeek);
      if (!dateCheck.isValid) {
        skippedCount += 1;
        conflicts.push({
          slotId,
          bookingId: candidate.bookingId,
          sessionDate,
          reason: "INVALID_BOOKING_DATE",
        });
        continue;
      }

      const existingSlots = await tx
        .select({
          id: tutorSlots.id,
          startTime: tutorSlots.startTime,
          endTime: tutorSlots.endTime,
        })
        .from(tutorSlots)
        .where(
          and(
            eq(tutorSlots.tutorId, candidate.tutorId),
            eq(tutorSlots.sessionDate, sessionDate),
            ne(tutorSlots.id, slotId),
          ),
        );

      const conflictingSlot = existingSlots.find(
        (existing) =>
          existing.startTime === candidate.startTime ||
          doTutorSlotsOverlap(
            candidate.startTime,
            candidate.endTime,
            existing.startTime,
            existing.endTime,
          ),
      );
      if (conflictingSlot) {
        skippedCount += 1;
        conflicts.push({
          slotId,
          bookingId: candidate.bookingId,
          sessionDate,
          reason: "DATE_CONFLICT",
          existingSlotId: conflictingSlot.id,
        });
        continue;
      }

      const updateResult = await tx
        .update(tutorSlots)
        .set({ sessionDate })
        .where(and(eq(tutorSlots.id, slotId), isNull(tutorSlots.sessionDate)));

      if ((updateResult.rowsAffected ?? 0) > 0) {
        updatedCount += 1;
      } else {
        skippedCount += 1;
      }
    }

    return { updatedCount, skippedCount, conflicts };
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * 3. Deterministic Active Group Representative Selection
 * ──────────────────────────────────────────────────────────────────────────── */

export interface GroupMemberCandidate {
  id?: string;
  userId: string;
  role: "leader" | "member" | string;
  joinedAt?: Date | number | string | null;
  user?: {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  } | null;
}

export interface GroupRepresentativeResult {
  userId: string;
  role: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  joinedAt?: Date | null;
}

/**
 * Deterministically selects the representative member for an active study group.
 * Priority:
 * 1. Member with role === "leader"
 * 2. Earliest joinedAt timestamp
 * 3. Lexicographical userId
 * 4. Lexicographical member record id
 */
export function getDeterministicGroupRepresentative(
  members: GroupMemberCandidate[],
): GroupRepresentativeResult | null {
  if (!members || members.length === 0) return null;

  const validMembers = members.filter(
    (m) =>
      Boolean(
        m &&
          m.userId &&
          typeof m.userId === "string" &&
          m.userId.trim().length > 0,
      ),
  );
  if (validMembers.length === 0) return null;

  const sorted = [...validMembers].sort((a, b) => {
    // 1. Leader priority
    const aIsLeader = a.role === "leader" ? 0 : 1;
    const bIsLeader = b.role === "leader" ? 0 : 1;
    if (aIsLeader !== bIsLeader) {
      return aIsLeader - bIsLeader;
    }

    // 2. Earliest joinedAt priority
    const aJoined = a.joinedAt ? normalizeDate(a.joinedAt).getTime() : 0;
    const bJoined = b.joinedAt ? normalizeDate(b.joinedAt).getTime() : 0;
    if (aJoined !== bJoined) {
      return aJoined - bJoined;
    }

    // 3. Deterministic userId sort
    const userIdCmp = a.userId.localeCompare(b.userId);
    if (userIdCmp !== 0) {
      return userIdCmp;
    }

    // 4. Deterministic id sort
    const aId = a.id ?? "";
    const bId = b.id ?? "";
    return aId.localeCompare(bId);
  });

  const rep = sorted[0];
  return {
    userId: rep.userId,
    role: rep.role,
    name: rep.user?.name ?? null,
    email: rep.user?.email ?? null,
    image: rep.user?.image ?? null,
    joinedAt: rep.joinedAt ? normalizeDate(rep.joinedAt) : null,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * 4. Tutor Slot Ownership Validation
 * ──────────────────────────────────────────────────────────────────────────── */

export interface SlotOwnershipResult {
  isOwner: boolean;
  slotId: string;
  tutorId: string;
  slotTutorId?: string | null;
  reason?: string;
}

/**
 * Validates that a slot record belongs to the specified tutor.
 */
export function validateSlotOwnership(
  slot: { id?: string; tutorId: string } | null | undefined,
  tutorId: string,
): SlotOwnershipResult {
  const targetTutorId = typeof tutorId === "string" ? tutorId.trim() : "";
  if (!targetTutorId) {
    return {
      isOwner: false,
      slotId: slot?.id ?? "",
      tutorId: targetTutorId,
      slotTutorId: slot?.tutorId ?? null,
      reason: "TUTOR_ID_REQUIRED",
    };
  }

  if (!slot) {
    return {
      isOwner: false,
      slotId: "",
      tutorId: targetTutorId,
      slotTutorId: null,
      reason: "SLOT_NOT_FOUND",
    };
  }

  if (slot.tutorId !== targetTutorId) {
    return {
      isOwner: false,
      slotId: slot.id ?? "",
      tutorId: targetTutorId,
      slotTutorId: slot.tutorId,
      reason: "SLOT_NOT_OWNED_BY_TUTOR",
    };
  }

  return {
    isOwner: true,
    slotId: slot.id ?? "",
    tutorId: targetTutorId,
    slotTutorId: slot.tutorId,
  };
}

/**
 * DB query helper checking tutor slot ownership.
 */
export async function checkTutorSlotOwnership(
  slotId: string,
  tutorId: string,
  executor?: DbExecutor,
): Promise<SlotOwnershipResult & { slot?: typeof tutorSlots.$inferSelect }> {
  const client = (executor ?? db) as typeof db;
  const targetSlotId = typeof slotId === "string" ? slotId.trim() : "";
  const targetTutorId = typeof tutorId === "string" ? tutorId.trim() : "";

  if (!targetSlotId) {
    return {
      isOwner: false,
      slotId: "",
      tutorId: targetTutorId,
      slotTutorId: null,
      reason: "SLOT_NOT_FOUND",
    };
  }

  const slotRows = await client
    .select()
    .from(tutorSlots)
    .where(eq(tutorSlots.id, targetSlotId))
    .limit(1);

  if (slotRows.length === 0) {
    return {
      isOwner: false,
      slotId: targetSlotId,
      tutorId: targetTutorId,
      slotTutorId: null,
      reason: "SLOT_NOT_FOUND",
    };
  }

  const slot = slotRows[0];
  const ownership = validateSlotOwnership(slot, targetTutorId);
  return {
    ...ownership,
    slot,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * 5. Booked-Slot Deletion Rejection Policy
 * ──────────────────────────────────────────────────────────────────────────── */

export interface SlotDeletionValidationResult {
  canDelete: boolean;
  slotId: string;
  tutorId: string;
  reason?: string;
  bookingId?: string | null;
}

/**
 * Pure policy validator for slot deletion.
 * Rejects deletion if slot is not owned by the tutor or if the slot has an existing booking.
 */
export function validateSlotDeletionPolicy(input: {
  slot: {
    id: string;
    tutorId: string;
    sessionDate?: string | null;
    dayOfWeek?: string | null;
  } | null;
  tutorId: string;
  existingBooking?: { id: string; status: string } | null;
  now?: Date;
}): SlotDeletionValidationResult {
  const ownership = validateSlotOwnership(input.slot, input.tutorId);
  if (!ownership.isOwner) {
    return {
      canDelete: false,
      slotId: input.slot?.id ?? "",
      tutorId: input.tutorId,
      reason: ownership.reason,
    };
  }

  if (input.existingBooking) {
    return {
      canDelete: false,
      slotId: input.slot!.id,
      tutorId: input.tutorId,
      reason: "CANNOT_DELETE_BOOKED_SLOT",
      bookingId: input.existingBooking.id,
    };
  }

  // Null-date rows are legacy availability records. They remain deletable for
  // cleanup, but they are never used as new booking targets.
  if (input.slot!.sessionDate) {
    const dateCheck = validateSlotWeekdayDate(
      input.slot!.sessionDate,
      input.slot!.dayOfWeek ?? "",
    );
    if (!dateCheck.isValid) {
      return {
        canDelete: false,
        slotId: input.slot!.id,
        tutorId: input.tutorId,
        reason: "INVALID_SESSION_DATE",
      };
    }

    if (!canTutorDeleteAvailability(input.slot!.sessionDate, input.now ?? new Date())) {
      return {
        canDelete: false,
        slotId: input.slot!.id,
        tutorId: input.tutorId,
        reason: "TUTOR_AVAILABILITY_DEADLINE_PASSED",
      };
    }
  }

  return {
    canDelete: true,
    slotId: input.slot!.id,
    tutorId: input.tutorId,
  };
}

/**
 * DB query helper validating slot deletion policy against the database.
 */
export async function checkCanDeleteTutorSlot(
  slotId: string,
  tutorId: string,
  executor?: DbExecutor,
  now: Date = new Date(),
): Promise<SlotDeletionValidationResult> {
  const client = (executor ?? db) as typeof db;
  const ownership = await checkTutorSlotOwnership(slotId, tutorId, client);
  if (!ownership.isOwner) {
    return {
      canDelete: false,
      slotId,
      tutorId,
      reason: ownership.reason,
    };
  }

  const bookingRows = await client
    .select({ id: bookings.id, status: bookings.status })
    .from(bookings)
    .where(eq(bookings.slotId, slotId))
    .limit(1);

  return validateSlotDeletionPolicy({
    slot: ownership.slot ?? null,
    tutorId,
    existingBooking: bookingRows[0] ?? null,
    now,
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * 6. Canonical-to-Legacy Course Resolution
 * ──────────────────────────────────────────────────────────────────────────── */

export interface CanonicalCourseResolution {
  found: boolean;
  canonicalCourseId: string | null;
  code: string | null;
  title: string | null;
  status: string | null;
  isActive: boolean;
  legacyCourseId: string | null;
  isCompatibilityFallback: boolean;
  reason?: string;
}

/**
 * Resolves a course identifier (canonical ID, code, or legacy course ID)
 * to its canonical mata_kuliah definition with legacy mappings.
 */
export async function resolveCourseCanonicalAndLegacy(
  courseIdentifier: string,
  executor?: DbExecutor,
): Promise<CanonicalCourseResolution> {
  const client = (executor ?? db) as typeof db;
  const rawId =
    typeof courseIdentifier === "string" ? courseIdentifier.trim() : "";

  if (!rawId) {
    return {
      found: false,
      canonicalCourseId: null,
      code: null,
      title: null,
      status: null,
      isActive: false,
      legacyCourseId: null,
      isCompatibilityFallback: false,
      reason: "COURSE_IDENTIFIER_EMPTY",
    };
  }

  // 1. Search canonical mata_kuliah table
  const mkRows = await client
    .select({
      id: mataKuliah.id,
      code: mataKuliah.code,
      title: mataKuliah.title,
      status: mataKuliah.status,
      legacyCourseId: mataKuliah.legacyCourseId,
    })
    .from(mataKuliah)
    .where(
      or(
        eq(mataKuliah.id, rawId),
        eq(mataKuliah.code, rawId),
        eq(mataKuliah.legacyCourseId, rawId),
      ),
    )
    .limit(1);

  if (mkRows.length > 0) {
    const row = mkRows[0];
    return {
      found: true,
      canonicalCourseId: row.id,
      code: row.code,
      title: row.title,
      status: row.status,
      isActive: row.status === "active",
      legacyCourseId: row.legacyCourseId ?? null,
      isCompatibilityFallback: false,
      reason: row.status !== "active" ? "COURSE_INACTIVE" : undefined,
    };
  }

  // 2. Search legacy courses table
  const legacyRows = await client
    .select({
      id: courses.id,
      title: courses.title,
    })
    .from(courses)
    .where(eq(courses.id, rawId))
    .limit(1);

  if (legacyRows.length > 0) {
    const row = legacyRows[0];
    return {
      found: true,
      canonicalCourseId: row.id,
      code: row.id,
      title: row.title,
      status: "active",
      isActive: true,
      legacyCourseId: row.id,
      isCompatibilityFallback: true,
    };
  }

  return {
    found: false,
    canonicalCourseId: null,
    code: null,
    title: null,
    status: null,
    isActive: false,
    legacyCourseId: null,
    isCompatibilityFallback: false,
    reason: "COURSE_NOT_FOUND",
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * 7. Canonical Tutor Assignment
 * ──────────────────────────────────────────────────────────────────────────── */

export interface TutorAssignmentCheckResult {
  isAssigned: boolean;
  tutorId: string;
  courseId: string | null;
  legacyCourseId: string | null;
  source: TutorAccessSource | null;
  isCompatibilityFallback: boolean;
  reason?: string;
}

/**
 * Validates tutor course assignment using canonical penugasan_tutor first,
 * falling back to legacy tutor_courses when needed.
 */
export async function checkCanonicalTutorAssignment(
  tutorId: string,
  courseIdentifier: string,
  options?: { allowAdmin?: boolean },
  executor?: DbExecutor,
): Promise<TutorAssignmentCheckResult> {
  const result = await resolveTutorCourseAccess(
    {
      penggunaId: tutorId,
      courseId: courseIdentifier,
      allowAdmin: options?.allowAdmin,
    },
    executor,
  );

  if (result.hasAccess) {
    return {
      isAssigned: true,
      tutorId: result.penggunaId,
      courseId: result.courseId,
      legacyCourseId: result.legacyCourseId,
      source: result.source,
      isCompatibilityFallback: result.isCompatibilityFallback,
      reason: result.reason,
    };
  }

  // Pure legacy courses fallback check when course is not in canonical mata_kuliah table
  const client = (executor ?? db) as typeof db;
  const courseRes = await resolveCourseCanonicalAndLegacy(courseIdentifier, client);
  if (courseRes.found && courseRes.isCompatibilityFallback && courseRes.canonicalCourseId) {
    const legacyRows = await client
      .select({ id: tutorCourses.id })
      .from(tutorCourses)
      .where(
        and(
          eq(tutorCourses.tutorId, tutorId),
          eq(tutorCourses.courseId, courseRes.canonicalCourseId),
        ),
      )
      .limit(1);

    if (legacyRows.length > 0) {
      return {
        isAssigned: true,
        tutorId,
        courseId: courseRes.canonicalCourseId,
        legacyCourseId: courseRes.canonicalCourseId,
        source: "compatibility_fallback",
        isCompatibilityFallback: true,
      };
    }
  }

  return {
    isAssigned: false,
    tutorId: result.penggunaId || tutorId,
    courseId: result.courseId,
    legacyCourseId: result.legacyCourseId,
    source: result.source,
    isCompatibilityFallback: result.isCompatibilityFallback,
    reason: result.reason === "COURSE_NOT_FOUND" && courseRes.found ? "NO_ACTIVE_ASSIGNMENT" : result.reason,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * 8. Active Group/Course Eligibility
 * ──────────────────────────────────────────────────────────────────────────── */

export interface GroupCourseEligibilityResult {
  isEligible: boolean;
  groupId: string;
  groupName: string | null;
  courseId: string | null;
  legacyCourseId: string | null;
  representative: GroupRepresentativeResult | null;
  membersCount: number;
  weeklyQuotaSessions: number;
  totalQuotaSessions: number;
  usedQuotaSessions: number;
  reason?: string;
}

/**
 * Checks if a study group is active and eligible to schedule sessions for a course.
 */
export async function checkActiveGroupCourseEligibility(
  groupId: string,
  courseIdentifier: string,
  executor?: DbExecutor,
): Promise<GroupCourseEligibilityResult> {
  const client = (executor ?? db) as typeof db;
  const rawGroupId = typeof groupId === "string" ? groupId.trim() : "";

  if (!rawGroupId) {
    return {
      isEligible: false,
      groupId: "",
      groupName: null,
      courseId: null,
      legacyCourseId: null,
      representative: null,
      membersCount: 0,
      weeklyQuotaSessions: 0,
      totalQuotaSessions: 0,
      usedQuotaSessions: 0,
      reason: "GROUP_ID_EMPTY",
    };
  }

  // 1. Resolve course
  const courseRes = await resolveCourseCanonicalAndLegacy(
    courseIdentifier,
    client,
  );
  if (!courseRes.found || !courseRes.isActive) {
    return {
      isEligible: false,
      groupId: rawGroupId,
      groupName: null,
      courseId: courseRes.canonicalCourseId,
      legacyCourseId: courseRes.legacyCourseId,
      representative: null,
      membersCount: 0,
      weeklyQuotaSessions: 0,
      totalQuotaSessions: 0,
      usedQuotaSessions: 0,
      reason: courseRes.reason ?? "COURSE_INACTIVE_OR_NOT_FOUND",
    };
  }

  // 2. Query group
  const groupRows = await client
    .select({
      id: groups.id,
      name: groups.name,
      status: groups.status,
      weeklyQuotaSessions: groups.weeklyQuotaSessions,
      totalQuotaSessions: groups.totalQuotaSessions,
      usedQuotaSessions: groups.usedQuotaSessions,
    })
    .from(groups)
    .where(eq(groups.id, rawGroupId))
    .limit(1);

  if (groupRows.length === 0) {
    return {
      isEligible: false,
      groupId: rawGroupId,
      groupName: null,
      courseId: courseRes.canonicalCourseId,
      legacyCourseId: courseRes.legacyCourseId,
      representative: null,
      membersCount: 0,
      weeklyQuotaSessions: 0,
      totalQuotaSessions: 0,
      usedQuotaSessions: 0,
      reason: "GROUP_NOT_FOUND",
    };
  }

  const group = groupRows[0];
  if (group.status !== "active") {
    return {
      isEligible: false,
      groupId: group.id,
      groupName: group.name,
      courseId: courseRes.canonicalCourseId,
      legacyCourseId: courseRes.legacyCourseId,
      representative: null,
      membersCount: 0,
      weeklyQuotaSessions: group.weeklyQuotaSessions,
      totalQuotaSessions: group.totalQuotaSessions,
      usedQuotaSessions: group.usedQuotaSessions,
      reason: "GROUP_NOT_ACTIVE",
    };
  }

  // 3. Check group course association
  const courseIdsToCheck = [
    courseRes.canonicalCourseId,
    courseRes.legacyCourseId,
    courseIdentifier,
  ].filter((id): id is string => Boolean(id && typeof id === "string"));

  const groupCourseRows = await client
    .select({ id: groupCourses.id })
    .from(groupCourses)
    .where(
      and(
        eq(groupCourses.groupId, rawGroupId),
        inArray(groupCourses.courseId, courseIdsToCheck),
      ),
    )
    .limit(1);

  if (groupCourseRows.length === 0) {
    return {
      isEligible: false,
      groupId: group.id,
      groupName: group.name,
      courseId: courseRes.canonicalCourseId,
      legacyCourseId: courseRes.legacyCourseId,
      representative: null,
      membersCount: 0,
      weeklyQuotaSessions: group.weeklyQuotaSessions,
      totalQuotaSessions: group.totalQuotaSessions,
      usedQuotaSessions: group.usedQuotaSessions,
      reason: "GROUP_COURSE_NOT_ENROLLED",
    };
  }

  // 4. Query group members
  const memberRows = await client
    .select({
      id: groupMembers.id,
      userId: groupMembers.userId,
      role: groupMembers.role,
      joinedAt: groupMembers.joinedAt,
      name: user.name,
      email: user.email,
      image: user.image,
    })
    .from(groupMembers)
    .leftJoin(user, eq(groupMembers.userId, user.id))
    .where(eq(groupMembers.groupId, rawGroupId));

  if (memberRows.length === 0) {
    return {
      isEligible: false,
      groupId: group.id,
      groupName: group.name,
      courseId: courseRes.canonicalCourseId,
      legacyCourseId: courseRes.legacyCourseId,
      representative: null,
      membersCount: 0,
      weeklyQuotaSessions: group.weeklyQuotaSessions,
      totalQuotaSessions: group.totalQuotaSessions,
      usedQuotaSessions: group.usedQuotaSessions,
      reason: "GROUP_HAS_NO_MEMBERS",
    };
  }

  const memberCandidates: GroupMemberCandidate[] = memberRows.map(
    (m: {
      id: string;
      userId: string;
      role: "leader" | "member";
      joinedAt: Date;
      name: string | null;
      email: string | null;
      image: string | null;
    }) => ({
      id: m.id,
      userId: m.userId,
      role: m.role,
      joinedAt: m.joinedAt,
      user: {
        id: m.userId,
        name: m.name,
        email: m.email,
        image: m.image,
      },
    }),
  );

  const representative = getDeterministicGroupRepresentative(memberCandidates);

  return {
    isEligible: true,
    groupId: group.id,
    groupName: group.name,
    courseId: courseRes.canonicalCourseId,
    legacyCourseId: courseRes.legacyCourseId,
    representative,
    membersCount: memberRows.length,
    weeklyQuotaSessions: group.weeklyQuotaSessions,
    totalQuotaSessions: group.totalQuotaSessions,
    usedQuotaSessions: group.usedQuotaSessions,
  };
}
