"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, gte, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  bookingAuditLogs,
  bookingRescheduleTickets,
  bookingTicketMessages,
  bookings,
  groupMembers,
  groups,
  pengguna,
  penggunaPeran,
  peran,
  tutorSlots,
  user,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import {
  type DbExecutor,
  resolveTutorCourseAccess,
} from "@/lib/auth/tutor-access";
import {
  recordMutationAudit,
  recordTutorMutationAudit,
} from "@/lib/audit/mutasi";
import { getIsoWeekRange } from "@/lib/schedule-lock";
import { getJakartaCalendarDate } from "@/lib/date-utils";
import {
  addTutorialDays,
  getTutorialWeekRange,
  isTutorialWeekLocked,
} from "@/lib/schedule/week-policy";
import {
  CANCELLED_QUOTA_REFUND_LOG_ACTION,
  checkActiveGroupCourseEligibility,
  checkCanDeleteTutorSlot,
  checkTutorSlotOwnership,
  countsTowardGroupWeeklyQuota,
  doTutorSlotsOverlap,
  INDONESIAN_DAYS,
  type IndonesianDay,
  isTerminalBookingStatus,
  terminalStatusGuard,
  validateSlotDeletionPolicy,
  validateSlotDuration,
  validateSlotWeekdayDate,
} from "@/lib/schedule/tutor-policy";
import { sendToMany } from "@/lib/notifications/send";
import {
  tutorScheduleMovedPayload,
  tutorTicketDecisionPayload,
  tutorTicketMessagePayload,
} from "@/lib/notifications/templates";
import {
  recordTutorFailureAudit,
  recordUnauthenticatedRejectAudit,
} from "@/lib/schedule/tutor-audit";

export interface TutorAuthContext {
  userId: string;
  name: string | null;
  email: string | null;
  roles: string[];
  isAdmin: boolean;
}

/**
 * Resolves current tutor authentication context.
 */
export async function getTutorAuthContext(
  explicitActorId?: string,
  executor?: DbExecutor,
): Promise<TutorAuthContext> {
  const client = (executor ?? db) as typeof db;
  let actorId: string;

  if (executor && explicitActorId?.trim()) {
    actorId = explicitActorId.trim();
  } else {
    let sessionHeaders: Headers | undefined;
    try {
      sessionHeaders = await headers();
    } catch {
      sessionHeaders = undefined;
    }
    const session = await auth.api.getSession({
      headers: sessionHeaders ?? new Headers(),
    });
    if (!session?.user?.id) {
      throw new Error("UNAUTHORIZED");
    }
    actorId = session.user.id;
  }

  const userRows = await client
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    })
    .from(user)
    .where(eq(user.id, actorId))
    .limit(1);

  if (userRows.length === 0) {
    throw new Error("USER_NOT_FOUND");
  }

  const penggunaRows = await client
    .select({
      id: pengguna.id,
      status: pengguna.status,
    })
    .from(pengguna)
    .where(eq(pengguna.id, actorId))
    .limit(1);

  if (penggunaRows.length > 0 && penggunaRows[0].status !== "active") {
    throw new Error("TUTOR_INACTIVE");
  }

  const roleRows = await client
    .select({ code: peran.code })
    .from(penggunaPeran)
    .innerJoin(peran, eq(penggunaPeran.peranId, peran.id))
    .where(eq(penggunaPeran.penggunaId, actorId));

  const roleCodes = new Set(roleRows.map((r: { code: string }) => r.code));
  if (userRows[0].role) {
    roleCodes.add(userRows[0].role === "teacher" ? "tutor" : userRows[0].role);
  }

  const roles = Array.from(roleCodes);
  const isTutor = roles.includes("tutor") || roles.includes("teacher");
  const isAdmin = roles.includes("admin");

  if (!isTutor && !isAdmin) {
    throw new Error("FORBIDDEN_NOT_A_TUTOR");
  }

  return {
    userId: actorId,
    name: userRows[0].name ?? null,
    email: userRows[0].email ?? null,
    roles: roles.length > 0 ? roles : ["tutor"],
    isAdmin,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Action 1: Add 90-Minute Slot
 * ──────────────────────────────────────────────────────────────────────────── */

export interface AddTutorSlotInput {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  mode?: "online" | "offline";
  location?: string;
  sessionDate?: string;
}

export interface AddTutorSlotOptions {
  actorId?: string;
  executor?: DbExecutor;
  courseId?: string;
  now?: Date;
}

function isTutorSlotUniqueViolation(error: unknown): boolean {
  const message = [
    error instanceof Error ? error.message : String(error),
    (error as { code?: string })?.code ?? "",
  ].join(" ");
  return /unique|constraint failed/i.test(message) && /tutor_slots|session_date|start_time/i.test(message);
}

export async function executeAddTutorSlot(
  input: AddTutorSlotInput,
  options?: AddTutorSlotOptions,
) {
  const requestId = randomUUID();
  let authContext: TutorAuthContext;

  try {
    authContext = await getTutorAuthContext(options?.actorId, options?.executor);
  } catch (err: any) {
    await recordUnauthenticatedRejectAudit({
      action: "tutor.slot.create",
      entityType: "tutor_slot",
      entityId: "new_slot",
      courseId: options?.courseId?.trim() || "global",
      requestId,
      reason: err?.message || "UNAUTHORIZED",
      input: { ...input },
      executor: options?.executor,
    });

    return {
      success: false,
      error: err?.message || "UNAUTHORIZED",
      reason: "AUTH_FAILED",
    };
  }

  const client = (options?.executor ?? db) as typeof db;
  const courseIdForAudit = options?.courseId?.trim() || "global";
  const sessionDateIso = typeof input.sessionDate === "string" ? input.sessionDate.trim() : "";
  const now = options?.now ?? new Date();

  // A slot without a concrete date is a legacy record, not a new bookable
  // availability row.
  if (!sessionDateIso) {
    await recordTutorMutationAudit({
      actorId: authContext.userId,
      actorRoles: authContext.roles,
      courseId: courseIdForAudit,
      entityType: "tutor_slot",
      entityId: "new_slot",
      entityVersion: 1,
      action: "tutor.slot.create",
      outcome: "rejected",
      requestId,
      reason: "SESSION_DATE_REQUIRED",
      before: null,
      after: { ...input },
    }, client);

    return {
      success: false,
      error: "Tanggal sesi wajib diisi untuk slot baru.",
      reason: "SESSION_DATE_REQUIRED",
    };
  }

  // 1. Validate duration
  const startTime = typeof input.startTime === "string" ? input.startTime.trim() : "";
  const endTime = typeof input.endTime === "string" ? input.endTime.trim() : "";
  const durationCheck = validateSlotDuration(startTime, endTime);
  if (!durationCheck.isValid) {
    await recordTutorMutationAudit({
      actorId: authContext.userId,
      actorRoles: authContext.roles,
      courseId: courseIdForAudit,
      entityType: "tutor_slot",
      entityId: "new_slot",
      entityVersion: 1,
      action: "tutor.slot.create",
      outcome: "rejected",
      requestId,
      reason: durationCheck.reason ?? "INVALID_DURATION",
      before: null,
      after: { ...input },
    }, client);

    return {
      success: false,
      error: "Durasi slot harus tepat 90 menit (HH:MM).",
      reason: durationCheck.reason,
    };
  }

  // 2. Validate day name
  const dayName = input.dayOfWeek?.trim() as IndonesianDay;
  if (!INDONESIAN_DAYS.includes(dayName)) {
    await recordTutorMutationAudit({
      actorId: authContext.userId,
      actorRoles: authContext.roles,
      courseId: courseIdForAudit,
      entityType: "tutor_slot",
      entityId: "new_slot",
      entityVersion: 1,
      action: "tutor.slot.create",
      outcome: "rejected",
      requestId,
      reason: "INVALID_DAY_OF_WEEK",
      before: null,
      after: { ...input },
    }, client);

    return {
      success: false,
      error: "Hari dalam seminggu tidak valid.",
      reason: "INVALID_DAY_OF_WEEK",
    };
  }

  // 3. Validate the mandatory concrete date and its weekday.
  const weekdayDateCheck = validateSlotWeekdayDate(sessionDateIso, dayName);
  if (!weekdayDateCheck.isValid) {
    await recordTutorMutationAudit({
      actorId: authContext.userId,
      actorRoles: authContext.roles,
      courseId: courseIdForAudit,
      entityType: "tutor_slot",
      entityId: "new_slot",
      entityVersion: 1,
      action: "tutor.slot.create",
      outcome: "rejected",
      requestId,
      reason: weekdayDateCheck.reason ?? "DATE_WEEKDAY_MISMATCH",
      before: null,
      after: { ...input },
    }, client);

    return {
      success: false,
      error: "Tanggal tidak cocok dengan hari yang ditentukan atau tanggal tidak valid.",
      reason: weekdayDateCheck.reason,
    };
  }

  if (sessionDateIso < getJakartaCalendarDate(now)) {
    await recordTutorMutationAudit({
      actorId: authContext.userId,
      actorRoles: authContext.roles,
      courseId: courseIdForAudit,
      entityType: "tutor_slot",
      entityId: "new_slot",
      entityVersion: 1,
      action: "tutor.slot.create",
      outcome: "rejected",
      requestId,
      reason: "SESSION_DATE_IN_PAST",
      before: null,
      after: { ...input },
    }, client);

    return {
      success: false,
      error: "Tanggal sesi tidak boleh sebelum hari ini.",
      reason: "SESSION_DATE_IN_PAST",
    };
  }

  // 4. Validate mode, lifecycle, and offline location.
  if (input.mode !== undefined && input.mode !== "online" && input.mode !== "offline") {
    await recordTutorMutationAudit({
      actorId: authContext.userId,
      actorRoles: authContext.roles,
      courseId: courseIdForAudit,
      entityType: "tutor_slot",
      entityId: "new_slot",
      entityVersion: 1,
      action: "tutor.slot.create",
      outcome: "rejected",
      requestId,
      reason: "INVALID_MODE",
      before: null,
      after: { ...input },
    }, client);

    return {
      success: false,
      error: "Mode sesi tidak valid.",
      reason: "INVALID_MODE",
    };
  }



  const mode = input.mode ?? "online";
  if (mode === "offline" && (!input.location || input.location.trim().length === 0)) {
    await recordTutorMutationAudit({
      actorId: authContext.userId,
      actorRoles: authContext.roles,
      courseId: courseIdForAudit,
      entityType: "tutor_slot",
      entityId: "new_slot",
      entityVersion: 1,
      action: "tutor.slot.create",
      outcome: "rejected",
      requestId,
      reason: "LOCATION_REQUIRED_FOR_OFFLINE",
      before: null,
      after: { ...input },
    }, client);

    return {
      success: false,
      error: "Lokasi wajib diisi untuk slot tatap muka.",
      reason: "LOCATION_REQUIRED_FOR_OFFLINE",
    };
  }

  const slotId = randomUUID();

  try {
    await client.transaction(async (tx) => {
      const sameDateSlots = await tx
        .select({
          id: tutorSlots.id,
          startTime: tutorSlots.startTime,
          endTime: tutorSlots.endTime,
        })
        .from(tutorSlots)
        .where(
          and(
            eq(tutorSlots.tutorId, authContext.userId),
            eq(tutorSlots.sessionDate, sessionDateIso),
          ),
        );

      const exactDuplicate = sameDateSlots.find(
        (existing) => existing.startTime === startTime && existing.endTime === endTime,
      );
      if (exactDuplicate) {
        throw new Error("DUPLICATE_TUTOR_SLOT");
      }

      const overlap = sameDateSlots.find((existing) =>
        doTutorSlotsOverlap(startTime, endTime, existing.startTime, existing.endTime),
      );
      if (overlap) {
        throw new Error("TUTOR_SLOT_OVERLAP");
      }

      await tx.insert(tutorSlots).values({
        id: slotId,
        tutorId: authContext.userId,
        dayOfWeek: dayName,
        startTime,
        endTime,
        mode,
        location: mode === "offline" ? input.location?.trim() ?? null : null,
        sessionDate: sessionDateIso,
        createdAt: now,
      });

      await recordTutorMutationAudit({
        actorId: authContext.userId,
        actorRoles: authContext.roles,
        courseId: courseIdForAudit,
        entityType: "tutor_slot",
        entityId: slotId,
        entityVersion: 1,
        action: "tutor.slot.create",
        outcome: "success",
        requestId,
        reason: "TUTOR_SLOT_CREATED",
        before: null,
        after: {
          id: slotId,
          tutorId: authContext.userId,
          dayOfWeek: dayName,
          startTime,
          endTime,
          mode,
          location: mode === "offline" ? input.location?.trim() : null,
          sessionDate: sessionDateIso,
        },
      }, tx);
    });

    try {
      revalidatePath("/tutor/schedule");
    } catch {
      // Ignored in non-request test runners
    }

    return { success: true, slotId };
  } catch (err: any) {
    const duplicateRace = isTutorSlotUniqueViolation(err);
    if (
      err?.message === "DUPLICATE_TUTOR_SLOT" ||
      err?.message === "TUTOR_SLOT_OVERLAP" ||
      duplicateRace
    ) {
      const reason = duplicateRace ? "DUPLICATE_TUTOR_SLOT" : err.message;
      await recordTutorFailureAudit({
        actorId: authContext.userId,
        actorRoles: authContext.roles,
        courseId: courseIdForAudit,
        entityType: "tutor_slot",
        entityId: slotId,
        entityVersion: 1,
        action: "tutor.slot.create",
        outcome: "rejected",
        requestId,
        reason,
        before: null,
        after: { ...input },
      }, options?.executor ?? client);

      return {
        success: false,
        error:
          reason === "DUPLICATE_TUTOR_SLOT"
            ? "Slot dengan waktu yang sama sudah tersedia pada tanggal tersebut."
            : "Waktu slot bertumpang tindih dengan slot tutor lain pada tanggal tersebut.",
        reason,
      };
    }

    await recordTutorFailureAudit({
      actorId: authContext.userId,
      actorRoles: authContext.roles,
      courseId: courseIdForAudit,
      entityType: "tutor_slot",
      entityId: slotId,
      entityVersion: 1,
      action: "tutor.slot.create",
      outcome: "failed",
      requestId,
      reason: err?.message ?? "DATABASE_TRANSACTION_FAILED",
      before: null,
      after: { ...input },
    }, options?.executor);

    return {
      success: false,
      error: "Gagal menambahkan slot ketersediaan.",
      reason: "DATABASE_ERROR",
    };
  }
}

export async function addTutorSlotAction(input: AddTutorSlotInput) {
  return executeAddTutorSlot(input);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Action 2: Delete Slot (Rejects Booked Slots)
 * ──────────────────────────────────────────────────────────────────────────── */

export interface DeleteTutorSlotInput {
  slotId: string;
}

export interface DeleteTutorSlotOptions {
  actorId?: string;
  executor?: DbExecutor;
  courseId?: string;
  now?: Date;
}

export async function executeDeleteTutorSlot(
  input: DeleteTutorSlotInput,
  options?: DeleteTutorSlotOptions,
) {
  const requestId = randomUUID();
  let authContext: TutorAuthContext;

  try {
    authContext = await getTutorAuthContext(options?.actorId, options?.executor);
  } catch (err: any) {
    await recordUnauthenticatedRejectAudit({
      action: "tutor.slot.delete",
      entityType: "tutor_slot",
      entityId: typeof input.slotId === "string" ? input.slotId.trim() || "unknown" : "unknown",
      courseId: options?.courseId?.trim() || "global",
      requestId,
      reason: err?.message || "UNAUTHORIZED",
      input: { ...input },
      executor: options?.executor,
    });

    return {
      success: false,
      error: err?.message || "UNAUTHORIZED",
      reason: "AUTH_FAILED",
    };
  }

  const client = (options?.executor ?? db) as typeof db;
  const targetSlotId = typeof input.slotId === "string" ? input.slotId.trim() : "";
  const courseIdForAudit = options?.courseId?.trim() || "global";

  const deletionCheck = await checkCanDeleteTutorSlot(
    targetSlotId,
    authContext.userId,
    client,
    options?.now ?? new Date(),
  );

  if (!deletionCheck.canDelete) {
    await recordTutorMutationAudit({
      actorId: authContext.userId,
      actorRoles: authContext.roles,
      courseId: courseIdForAudit,
      entityType: "tutor_slot",
      entityId: targetSlotId || "unknown",
      entityVersion: 1,
      action: "tutor.slot.delete",
      outcome: "rejected",
      requestId,
      reason: deletionCheck.reason ?? "CANNOT_DELETE_SLOT",
      before: { slotId: targetSlotId },
      after: null,
    }, client);

    const errorMessage =
      deletionCheck.reason === "CANNOT_DELETE_BOOKED_SLOT"
        ? "Slot yang sudah dibooking tidak dapat dihapus."
          : deletionCheck.reason === "SLOT_NOT_OWNED_BY_TUTOR"
            ? "Anda tidak memiliki wewenang untuk menghapus slot ini."
            : deletionCheck.reason === "TUTOR_AVAILABILITY_DEADLINE_PASSED"
              ? "Perubahan ketersediaan tutor untuk minggu ini sudah ditutup."
              : deletionCheck.reason === "INVALID_SESSION_DATE"
                ? "Tanggal slot tidak valid."
            : "Slot tidak ditemukan.";

    return {
      success: false,
      error: errorMessage,
      reason: deletionCheck.reason,
    };
  }

  try {
    await client.transaction(async (tx) => {
      // Re-verify under transaction write lock to prevent race condition with concurrent booking
      const bookingInTx = await tx
        .select({ id: bookings.id })
        .from(bookings)
        .where(eq(bookings.slotId, targetSlotId))
        .limit(1);

      if (bookingInTx.length > 0) {
        throw new Error("CANNOT_DELETE_BOOKED_SLOT");
      }

      const slotInTx = await tx
        .select({
          id: tutorSlots.id,
          tutorId: tutorSlots.tutorId,
          dayOfWeek: tutorSlots.dayOfWeek,
          sessionDate: tutorSlots.sessionDate,
        })
        .from(tutorSlots)
        .where(eq(tutorSlots.id, targetSlotId))
        .limit(1);

      if (slotInTx.length === 0) {
        throw new Error("SLOT_NOT_FOUND");
      }

      if (slotInTx[0].tutorId !== authContext.userId && !authContext.isAdmin) {
        throw new Error("SLOT_NOT_OWNED_BY_TUTOR");
      }

      const txPolicy = validateSlotDeletionPolicy({
        slot: slotInTx[0],
        tutorId: slotInTx[0].tutorId,
        existingBooking: null,
        now: options?.now ?? new Date(),
      });
      if (!txPolicy.canDelete) {
        throw new Error(txPolicy.reason ?? "CANNOT_DELETE_SLOT");
      }

      const deleteRes = await tx
        .delete(tutorSlots)
        .where(
          and(
            eq(tutorSlots.id, targetSlotId),
            eq(tutorSlots.tutorId, slotInTx[0].tutorId),
          ),
        );

      if ((deleteRes.rowsAffected ?? 0) === 0) {
        throw new Error("SLOT_NOT_FOUND");
      }

      await recordTutorMutationAudit({
        actorId: authContext.userId,
        actorRoles: authContext.roles,
        courseId: courseIdForAudit,
        entityType: "tutor_slot",
        entityId: targetSlotId,
        entityVersion: 1,
        action: "tutor.slot.delete",
        outcome: "success",
        requestId,
        reason: "TUTOR_SLOT_DELETED",
        before: { slotId: targetSlotId },
        after: null,
      }, tx);
    });

    try {
      revalidatePath("/tutor/schedule");
    } catch {
      // Ignored in tests
    }

    return { success: true };
  } catch (err: any) {
    const deleteFailureReason = err?.message ?? "DATABASE_TRANSACTION_FAILED";

    if (
      deleteFailureReason === "CANNOT_DELETE_BOOKED_SLOT" ||
      deleteFailureReason === "SLOT_NOT_OWNED_BY_TUTOR" ||
      deleteFailureReason === "SLOT_NOT_FOUND" ||
      deleteFailureReason === "TUTOR_AVAILABILITY_DEADLINE_PASSED" ||
      deleteFailureReason === "INVALID_SESSION_DATE"
    ) {
      await recordTutorFailureAudit({
        actorId: authContext.userId,
        actorRoles: authContext.roles,
        courseId: courseIdForAudit,
        entityType: "tutor_slot",
        entityId: targetSlotId || "unknown",
        entityVersion: 1,
        action: "tutor.slot.delete",
        outcome: "rejected",
        requestId,
        reason: deleteFailureReason,
        before: { slotId: targetSlotId },
        after: null,
      }, options?.executor);

      const errorMessage =
        deleteFailureReason === "CANNOT_DELETE_BOOKED_SLOT"
          ? "Slot yang sudah dibooking tidak dapat dihapus."
          : deleteFailureReason === "SLOT_NOT_OWNED_BY_TUTOR"
            ? "Anda tidak memiliki wewenang untuk menghapus slot ini."
            : deleteFailureReason === "TUTOR_AVAILABILITY_DEADLINE_PASSED"
              ? "Perubahan ketersediaan tutor untuk minggu ini sudah ditutup."
              : deleteFailureReason === "INVALID_SESSION_DATE"
                ? "Tanggal slot tidak valid."
            : "Slot tidak ditemukan.";

      return {
        success: false,
        error: errorMessage,
        reason: deleteFailureReason,
      };
    }

    await recordTutorFailureAudit({
      actorId: authContext.userId,
      actorRoles: authContext.roles,
      courseId: courseIdForAudit,
      entityType: "tutor_slot",
      entityId: targetSlotId,
      entityVersion: 1,
      action: "tutor.slot.delete",
      outcome: "failed",
      requestId,
      reason: deleteFailureReason,
      before: { slotId: targetSlotId },
      after: null,
    }, options?.executor);

    return {
      success: false,
      error: "Gagal menghapus slot.",
      reason: "DATABASE_ERROR",
    };
  }
}

export async function deleteTutorSlotAction(input: DeleteTutorSlotInput) {
  return executeDeleteTutorSlot(input);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Action 2b: Copy Previous Week Availability
 * ──────────────────────────────────────────────────────────────────────────── */

export interface CopyTutorAvailabilityOptions {
  actorId?: string;
  executor?: DbExecutor;
  courseId?: string;
  now?: Date;
}

export interface TutorAvailabilityCopyConflict {
  sourceSlotId: string;
  destinationDate: string | null;
  reason: "OVERLAP" | "INVALID_SOURCE_SLOT";
  existingSlotId?: string | null;
}

export interface CopyTutorAvailabilityResult {
  success: boolean;
  createdCount: number;
  skippedCount: number;
  conflicts: TutorAvailabilityCopyConflict[];
  error?: string;
  reason?: string;
}

/**
 * Copies only dated availability rows from the immediately preceding week.
 * The destination rows are fresh slots and therefore cannot carry booking or
 * session context from the source week.
 */
export async function copyTutorAvailabilityFromPreviousWeek(
  targetWeekStart: string,
  options?: CopyTutorAvailabilityOptions,
): Promise<CopyTutorAvailabilityResult> {
  const requestId = randomUUID();
  let authContext: TutorAuthContext;

  try {
    authContext = await getTutorAuthContext(options?.actorId, options?.executor);
  } catch (err: any) {
    await recordUnauthenticatedRejectAudit({
      action: "tutor.slot.copy_previous_week",
      entityType: "tutor_slot",
      entityId: "copy_previous_week",
      courseId: options?.courseId?.trim() || "global",
      requestId,
      reason: err?.message || "UNAUTHORIZED",
      input: { targetWeekStart },
      executor: options?.executor,
    });

    return {
      success: false,
      createdCount: 0,
      skippedCount: 0,
      conflicts: [],
      error: err?.message || "UNAUTHORIZED",
      reason: "AUTH_FAILED",
    };
  }

  const client = (options?.executor ?? db) as typeof db;
  const courseIdForAudit = options?.courseId?.trim() || "global";
  const targetIso = typeof targetWeekStart === "string" ? targetWeekStart.trim() : "";
  const targetWeekCheck = validateSlotWeekdayDate(targetIso, "Senin");

  if (!targetWeekCheck.isValid) {
    return {
      success: false,
      createdCount: 0,
      skippedCount: 0,
      conflicts: [],
      error: "Minggu tujuan harus dimulai pada Senin dengan tanggal yang valid.",
      reason: "TARGET_WEEK_MUST_START_MONDAY",
    };
  }

  const targetRange = getTutorialWeekRange(targetIso);
  const sourceRange = getTutorialWeekRange(addTutorialDays(targetRange.startIso, -7));
  const now = options?.now ?? new Date();


  try {
    return await client.transaction(async (tx) => {
      const sourceSlots = await tx
        .select({
          id: tutorSlots.id,
          dayOfWeek: tutorSlots.dayOfWeek,
          startTime: tutorSlots.startTime,
          endTime: tutorSlots.endTime,
          mode: tutorSlots.mode,
          location: tutorSlots.location,
          sessionDate: tutorSlots.sessionDate,
        })
        .from(tutorSlots)
        .where(
          and(
            eq(tutorSlots.tutorId, authContext.userId),
            gte(tutorSlots.sessionDate, sourceRange.startIso),
            lte(tutorSlots.sessionDate, sourceRange.endIso),
          ),
        )
        .orderBy(
          asc(tutorSlots.sessionDate),
          asc(tutorSlots.startTime),
          asc(tutorSlots.id),
        );

      const destinationSlots = await tx
        .select({
          id: tutorSlots.id,
          sessionDate: tutorSlots.sessionDate,
          startTime: tutorSlots.startTime,
          endTime: tutorSlots.endTime,
        })
        .from(tutorSlots)
        .where(
          and(
            eq(tutorSlots.tutorId, authContext.userId),
            gte(tutorSlots.sessionDate, targetRange.startIso),
            lte(tutorSlots.sessionDate, targetRange.endIso),
          ),
        );

      const occupied = destinationSlots.map((slot) => ({ ...slot }));
      const conflicts: TutorAvailabilityCopyConflict[] = [];
      let createdCount = 0;
      let skippedCount = 0;

      for (const sourceSlot of sourceSlots) {
        if (!sourceSlot.sessionDate) {
          skippedCount += 1;
          conflicts.push({
            sourceSlotId: sourceSlot.id,
            destinationDate: null,
            reason: "INVALID_SOURCE_SLOT",
          });
          continue;
        }

        const sourceDateCheck = validateSlotWeekdayDate(
          sourceSlot.sessionDate,
          sourceSlot.dayOfWeek,
        );
        const durationCheck = validateSlotDuration(
          sourceSlot.startTime,
          sourceSlot.endTime,
        );
        if (!sourceDateCheck.isValid || !durationCheck.isValid) {
          skippedCount += 1;
          conflicts.push({
            sourceSlotId: sourceSlot.id,
            destinationDate: null,
            reason: "INVALID_SOURCE_SLOT",
          });
          continue;
        }

        const destinationDate = addTutorialDays(sourceSlot.sessionDate, 7);
        const exactDuplicate = occupied.find(
          (slot) =>
            slot.sessionDate === destinationDate &&
            slot.startTime === sourceSlot.startTime &&
            slot.endTime === sourceSlot.endTime,
        );
        if (exactDuplicate) {
          skippedCount += 1;
          continue;
        }

        const overlap = occupied.find(
          (slot) =>
            slot.sessionDate === destinationDate &&
            doTutorSlotsOverlap(
              sourceSlot.startTime,
              sourceSlot.endTime,
              slot.startTime,
              slot.endTime,
            ),
        );
        if (overlap) {
          skippedCount += 1;
          conflicts.push({
            sourceSlotId: sourceSlot.id,
            destinationDate,
            reason: "OVERLAP",
            existingSlotId: overlap.id,
          });
          continue;
        }

        const newSlotId = randomUUID();
        await tx.insert(tutorSlots).values({
          id: newSlotId,
          tutorId: authContext.userId,
          dayOfWeek: sourceSlot.dayOfWeek,
          startTime: sourceSlot.startTime,
          endTime: sourceSlot.endTime,
          mode: sourceSlot.mode,
          location: sourceSlot.location,
          sessionDate: destinationDate,
          createdAt: now,
        });

        await recordTutorMutationAudit({
          actorId: authContext.userId,
          actorRoles: authContext.roles,
          courseId: courseIdForAudit,
          entityType: "tutor_slot",
          entityId: newSlotId,
          entityVersion: 1,
          action: "tutor.slot.copy_previous_week",
          outcome: "success",
          requestId,
          reason: "TUTOR_SLOT_COPIED_FROM_PREVIOUS_WEEK",
          before: {
            sourceSlotId: sourceSlot.id,
            sourceDate: sourceSlot.sessionDate,
          },
          after: {
            id: newSlotId,
            sessionDate: destinationDate,
            startTime: sourceSlot.startTime,
            endTime: sourceSlot.endTime,
            mode: sourceSlot.mode,
            location: sourceSlot.location,
          },
        }, tx);

        occupied.push({
          id: newSlotId,
          sessionDate: destinationDate,
          startTime: sourceSlot.startTime,
          endTime: sourceSlot.endTime,
        });
        createdCount += 1;
      }

      return { success: true, createdCount, skippedCount, conflicts };
    });
  } catch (err: any) {
    await recordTutorFailureAudit({
      actorId: authContext.userId,
      actorRoles: authContext.roles,
      courseId: courseIdForAudit,
      entityType: "tutor_slot",
      entityId: "copy_previous_week",
      entityVersion: 1,
      action: "tutor.slot.copy_previous_week",
      outcome: "failed",
      requestId,
      reason: err?.message ?? "DATABASE_TRANSACTION_FAILED",
      before: { targetWeekStart: targetIso },
      after: null,
    }, options?.executor ?? client);

    return {
      success: false,
      createdCount: 0,
      skippedCount: 0,
      conflicts: [],
      error: "Gagal menyalin ketersediaan tutor.",
      reason: "DATABASE_ERROR",
    };
  }
}

export async function copyTutorAvailabilityAction(targetWeekStart: string) {
  return copyTutorAvailabilityFromPreviousWeek(targetWeekStart);
}

/* Direct tutor assignment was retired in PR 3. Exceptional assignment lives in admin scheduling operations. */
/* ────────────────────────────────────────────────────────────────────────────
 * Action 3: Move Tutor Session (Direct or Ticket based on Lock Policy)
 * ──────────────────────────────────────────────────────────────────────────── */

export interface MoveTutorSessionInput {
  bookingId: string;
  targetSlotId: string;
  targetSessionDate: string;
  reason?: string;
}

export interface MoveTutorSessionOptions {
  actorId?: string;
  executor?: DbExecutor;
  skipExternalMeet?: boolean;
  skipNotifications?: boolean;
  now?: Date;
}

export async function executeMoveTutorSession(
  input: MoveTutorSessionInput,
  options?: MoveTutorSessionOptions,
) {
  const requestId = randomUUID();
  let authContext: TutorAuthContext;

  try {
    authContext = await getTutorAuthContext(options?.actorId, options?.executor);
  } catch (err: any) {
    await recordUnauthenticatedRejectAudit({
      action: "tutor.session.move",
      entityType: "booking",
      entityId: typeof input.bookingId === "string" ? input.bookingId.trim() || "unknown" : "unknown",
      courseId: "unknown",
      requestId,
      reason: err?.message || "UNAUTHORIZED",
      input: { ...input },
      executor: options?.executor,
    });

    return {
      success: false,
      error: err?.message || "UNAUTHORIZED",
      reason: "AUTH_FAILED",
    };
  }

  const client = (options?.executor ?? db) as typeof db;
  const targetBookingId = typeof input.bookingId === "string" ? input.bookingId.trim() : "";
  const targetSlotId = typeof input.targetSlotId === "string" ? input.targetSlotId.trim() : "";
  const targetSessionDateIso = typeof input.targetSessionDate === "string" ? input.targetSessionDate.trim() : "";

  // 1. Fetch booking
  const bookingRows = await client
    .select()
    .from(bookings)
    .where(eq(bookings.id, targetBookingId))
    .limit(1);

  if (bookingRows.length === 0) {
    await recordTutorMutationAudit({
      actorId: authContext.userId,
      actorRoles: authContext.roles,
      courseId: "unknown",
      entityType: "booking",
      entityId: targetBookingId || "unknown",
      entityVersion: 1,
      action: "tutor.session.move",
      outcome: "rejected",
      requestId,
      reason: "BOOKING_NOT_FOUND",
      before: null,
      after: { ...input },
    }, client);

    return {
      success: false,
      error: "Jadwal sesi tidak ditemukan.",
      reason: "BOOKING_NOT_FOUND",
    };
  }

  const booking = bookingRows[0];

  // 2. Reject terminal bookings (completed/cancelled cannot move or spawn tickets)
  if (isTerminalBookingStatus(booking.status)) {
    await recordTutorMutationAudit({
      actorId: authContext.userId,
      actorRoles: authContext.roles,
      courseId: booking.courseId,
      entityType: "booking",
      entityId: targetBookingId,
      entityVersion: 1,
      action: "tutor.session.move",
      outcome: "rejected",
      requestId,
      reason: "BOOKING_TERMINAL_STATE",
      before: { bookingId: targetBookingId, status: booking.status, currentSlotId: booking.slotId },
      after: { ...input },
    }, client);

    return {
      success: false,
      error: "Sesi yang sudah selesai atau dibatalkan tidak dapat dipindahkan.",
      reason: "BOOKING_TERMINAL_STATE",
    };
  }

  // 2. Verify actor owns the CURRENT slot (no cross-tutor mutation)
  const currentSlotOwnership = await checkTutorSlotOwnership(
    booking.slotId,
    authContext.userId,
    client,
  );

  if (!currentSlotOwnership.isOwner && !authContext.isAdmin) {
    await recordTutorMutationAudit({
      actorId: authContext.userId,
      actorRoles: authContext.roles,
      courseId: booking.courseId,
      entityType: "booking",
      entityId: targetBookingId,
      entityVersion: 1,
      action: "tutor.session.move",
      outcome: "rejected",
      requestId,
      reason: "CURRENT_SLOT_NOT_OWNED_BY_TUTOR",
      before: { bookingId: targetBookingId, currentSlotId: booking.slotId },
      after: { ...input },
    }, client);

    return {
      success: false,
      error: "Anda tidak memiliki wewenang atas sesi ini.",
      reason: "CURRENT_SLOT_NOT_OWNED_BY_TUTOR",
    };
  }

  // 3. Verify tutor ownership of TARGET slot
  const targetSlotOwnership = await checkTutorSlotOwnership(
    targetSlotId,
    authContext.userId,
    client,
  );

  if ((!targetSlotOwnership.isOwner && !authContext.isAdmin) || !targetSlotOwnership.slot) {
    await recordTutorMutationAudit({
      actorId: authContext.userId,
      actorRoles: authContext.roles,
      courseId: booking.courseId,
      entityType: "booking",
      entityId: targetBookingId,
      entityVersion: 1,
      action: "tutor.session.move",
      outcome: "rejected",
      requestId,
      reason: targetSlotOwnership.reason ?? "SLOT_NOT_OWNED_BY_TUTOR",
      before: { bookingId: targetBookingId, currentSlotId: booking.slotId },
      after: { ...input },
    }, client);

    return {
      success: false,
      error: "Slot tujuan tidak ditemukan atau bukan milik tutor.",
      reason: targetSlotOwnership.reason ?? "SLOT_NOT_OWNED_BY_TUTOR",
    };
  }

  const targetSlot = targetSlotOwnership.slot;

  // Keep the legacy tutor move path usable for a null-date target. The
  // requested date is still validated against the target weekday below, while
  // canonical student booking continues to require targetSlot.sessionDate.
  if (targetSlot.sessionDate && targetSessionDateIso !== targetSlot.sessionDate) {
    await recordTutorMutationAudit({
      actorId: authContext.userId,
      actorRoles: authContext.roles,
      courseId: booking.courseId,
      entityType: "booking",
      entityId: targetBookingId,
      entityVersion: 1,
      action: "tutor.session.move",
      outcome: "rejected",
      requestId,
      reason: "SLOT_DATE_MISMATCH",
      before: { targetSlotSessionDate: targetSlot.sessionDate },
      after: { requestedSessionDate: targetSessionDateIso },
    }, client);

    return {
      success: false,
      error: "Tanggal tujuan harus sama dengan tanggal slot tujuan.",
      reason: "SLOT_DATE_MISMATCH",
    };
  }

  // 4. Validate target slot duration (exact 90m)
  const targetDurationCheck = validateSlotDuration(targetSlot.startTime, targetSlot.endTime);
  if (!targetDurationCheck.isValid) {
    await recordTutorMutationAudit({
      actorId: authContext.userId,
      actorRoles: authContext.roles,
      courseId: booking.courseId,
      entityType: "booking",
      entityId: targetBookingId,
      entityVersion: 1,
      action: "tutor.session.move",
      outcome: "rejected",
      requestId,
      reason: targetDurationCheck.reason ?? "INVALID_DURATION_NOT_90_MINUTES",
      before: { bookingId: targetBookingId, currentSlotId: booking.slotId },
      after: { ...input, targetStartTime: targetSlot.startTime, targetEndTime: targetSlot.endTime },
    }, client);

    return {
      success: false,
      error: "Durasi slot tujuan harus tepat 90 menit.",
      reason: targetDurationCheck.reason,
    };
  }

  // 5. Verify target slot is available (respecting unique constraint on slotId)
  const existingSlotBooking = await client
    .select({ id: bookings.id })
    .from(bookings)
    .where(eq(bookings.slotId, targetSlotId))
    .limit(1);

  if (existingSlotBooking.length > 0 && existingSlotBooking[0].id !== targetBookingId) {
    await recordTutorMutationAudit({
      actorId: authContext.userId,
      actorRoles: authContext.roles,
      courseId: booking.courseId,
      entityType: "booking",
      entityId: targetBookingId,
      entityVersion: 1,
      action: "tutor.session.move",
      outcome: "rejected",
      requestId,
      reason: "TARGET_SLOT_OCCUPIED",
      before: { bookingId: targetBookingId, currentSlotId: booking.slotId },
      after: { ...input },
    }, client);

    return {
      success: false,
      error: "Slot tujuan sudah terisi.",
      reason: "TARGET_SLOT_OCCUPIED",
    };
  }

  // 6. Validate weekday and target date match
  const weekdayCheck = validateSlotWeekdayDate(
    targetSessionDateIso,
    targetSlot.dayOfWeek,
  );
  if (!weekdayCheck.isValid) {
    await recordTutorMutationAudit({
      actorId: authContext.userId,
      actorRoles: authContext.roles,
      courseId: booking.courseId,
      entityType: "booking",
      entityId: targetBookingId,
      entityVersion: 1,
      action: "tutor.session.move",
      outcome: "rejected",
      requestId,
      reason: weekdayCheck.reason ?? "DATE_WEEKDAY_MISMATCH",
      before: { bookingId: targetBookingId, currentSlotId: booking.slotId },
      after: { ...input },
    }, client);

    return {
      success: false,
      error: "Tanggal tujuan tidak sesuai dengan hari slot atau tanggal tidak valid.",
      reason: weekdayCheck.reason,
    };
  }

  // 7. Evaluate weekly lock rules
  const scheduleNow = options?.now ?? new Date();
  const isCurrentLocked = booking.sessionDate
    ? isTutorialWeekLocked(booking.sessionDate, scheduleNow)
    : false;
  const isTargetLocked = isTutorialWeekLocked(targetSessionDateIso, scheduleNow);

  const isLocked = isCurrentLocked || isTargetLocked;

  if (isLocked) {
    // Cannot move directly when locked. Create pending reschedule ticket.
    const ticketId = randomUUID();
    const now = new Date();

    try {
      await client.transaction(async (tx) => {
        const existingPending = await tx
          .select({ id: bookingRescheduleTickets.id })
          .from(bookingRescheduleTickets)
          .where(
            and(
              eq(bookingRescheduleTickets.bookingId, targetBookingId),
              eq(bookingRescheduleTickets.status, "pending"),
            ),
          )
          .limit(1);

        if (existingPending.length > 0) {
          throw new Error("DUPLICATE_PENDING_TICKET");
        }

        await tx.insert(bookingRescheduleTickets).values({
          id: ticketId,
          bookingId: targetBookingId,
          groupId: booking.groupId,
          requestedById: authContext.userId,
          tutorId: authContext.userId,
          type: "reschedule",
          status: "pending",
          reason: input.reason?.trim() || "Perubahan jadwal pasca-lock diajukan oleh pengajar.",
          proposedSlotId: targetSlotId,
          proposedDate: targetSessionDateIso,
          createdAt: now,
          updatedAt: now,
        });

        await recordTutorMutationAudit({
          actorId: authContext.userId,
          actorRoles: authContext.roles,
          courseId: booking.courseId,
          entityType: "reschedule_ticket",
          entityId: ticketId,
          entityVersion: 1,
          action: "tutor.ticket.create",
          outcome: "success",
          requestId,
          reason: "LOCKED_SESSION_TICKET_CREATED",
          before: { bookingId: targetBookingId, currentSlotId: booking.slotId },
          after: { ticketId, proposedSlotId: targetSlotId, proposedDate: targetSessionDateIso },
        }, tx);
      });

      try {
        revalidatePath("/tutor/schedule");
      } catch {
        // Ignored
      }

      return {
        success: true,
        movedDirectly: false,
        ticketId,
        requiresTicket: true,
        message: "Jadwal telah terkunci. Tiket reschedule telah dibuat.",
      };
    } catch (err: any) {
      const moveLockedReason = err?.message ?? "DATABASE_TRANSACTION_FAILED";

      if (moveLockedReason === "DUPLICATE_PENDING_TICKET") {
        await recordTutorFailureAudit({
          actorId: authContext.userId,
          actorRoles: authContext.roles,
          courseId: booking.courseId,
          entityType: "reschedule_ticket",
          entityId: "new_ticket",
          entityVersion: 1,
          action: "tutor.ticket.create",
          outcome: "rejected",
          requestId,
          reason: "DUPLICATE_PENDING_TICKET",
          before: { bookingId: targetBookingId, currentSlotId: booking.slotId },
          after: { ...input },
        }, options?.executor);

        return {
          success: false,
          error: "Masih terdapat permohonan tiket yang sedang menunggu keputusan untuk sesi ini.",
          reason: "DUPLICATE_PENDING_TICKET",
        };
      }

      await recordTutorFailureAudit({
        actorId: authContext.userId,
        actorRoles: authContext.roles,
        courseId: booking.courseId,
        entityType: "reschedule_ticket",
        entityId: ticketId,
        entityVersion: 1,
        action: "tutor.ticket.create",
        outcome: "failed",
        requestId,
        reason: moveLockedReason,
        before: { bookingId: targetBookingId, currentSlotId: booking.slotId },
        after: { ...input },
      }, options?.executor);

      return {
        success: false,
        error: "Gagal membuat tiket reschedule.",
        reason: "DATABASE_ERROR",
      };
    }
  }

  // 8. Direct move (when unlocked) inside transaction
  const now = new Date();
  try {
    await client.transaction(async (tx) => {
      // Re-read and enforce refund-aware group weekly quota for target ISO week under write lock
      const { startIso, endIso } = getIsoWeekRange(targetSessionDateIso);
      const groupQuotaRows = await tx
        .select({ weeklyQuotaSessions: groups.weeklyQuotaSessions })
        .from(groups)
        .where(eq(groups.id, booking.groupId))
        .limit(1);
      const weeklyQuota = groupQuotaRows[0]?.weeklyQuotaSessions || 2;

      const weekCountRows = await tx
        .select({ value: sql<number>`count(*)` })
        .from(bookings)
        .where(
          and(
            eq(bookings.groupId, booking.groupId),
            ne(bookings.id, targetBookingId),
            gte(bookings.sessionDate, startIso),
            lte(bookings.sessionDate, endIso),
            countsTowardGroupWeeklyQuota(),
          ),
        );
      const targetWeekBookingCount = Number(weekCountRows[0]?.value ?? 0);

      if (targetWeekBookingCount >= weeklyQuota) {
        throw new Error("WEEKLY_QUOTA_EXCEEDED");
      }

      // Guarded update: a booking that turned completed/cancelled between the
      // pre-checks and this statement must not be moved.
      const moveUpdate = await tx
        .update(bookings)
        .set({
          slotId: targetSlotId,
          sessionDate: targetSessionDateIso,
          startTime: targetSlot.startTime,
          endTime: targetSlot.endTime,
          mode: targetSlot.mode,
          location: targetSlot.location ?? null,
          lastModifiedBy: authContext.userId,
          lastModifiedAt: now,
        })
        .where(
          and(
            eq(bookings.id, targetBookingId),
            terminalStatusGuard(),
          ),
        );

      if ((moveUpdate.rowsAffected ?? 0) === 0) {
        throw new Error("BOOKING_TERMINAL_STATE");
      }

      // Audit log entry for booking
      await tx.insert(bookingAuditLogs).values({
        id: randomUUID(),
        bookingId: targetBookingId,
        groupId: booking.groupId,
        actorId: authContext.userId,
        action: "TUTOR_SESSION_MOVED",
        summary: `Tutor ${authContext.name ?? "Pengajar"} memindahkan sesi ke ${targetSlot.dayOfWeek}, ${targetSessionDateIso} (${targetSlot.startTime} - ${targetSlot.endTime})`,
        metadata: {
          oldSlotId: booking.slotId,
          newSlotId: targetSlotId,
          newDate: targetSessionDateIso,
        },
        createdAt: now,
      });

      await recordTutorMutationAudit({
        actorId: authContext.userId,
        actorRoles: authContext.roles,
        courseId: booking.courseId,
        entityType: "booking",
        entityId: targetBookingId,
        entityVersion: 1,
        action: "tutor.session.move",
        outcome: "success",
        requestId,
        reason: "TUTOR_SESSION_MOVED_DIRECTLY",
        before: {
          slotId: booking.slotId,
          sessionDate: booking.sessionDate,
        },
        after: {
          slotId: targetSlotId,
          sessionDate: targetSessionDateIso,
          startTime: targetSlot.startTime,
          endTime: targetSlot.endTime,
          mode: targetSlot.mode,
        },
      }, tx);
    });
  } catch (err: any) {
    const moveFailureReason = err?.message ?? "DATABASE_TRANSACTION_FAILED";

    if (moveFailureReason === "WEEKLY_QUOTA_EXCEEDED") {
      await recordTutorFailureAudit({
        actorId: authContext.userId,
        actorRoles: authContext.roles,
        courseId: booking.courseId,
        entityType: "booking",
        entityId: targetBookingId,
        entityVersion: 1,
        action: "tutor.session.move",
        outcome: "rejected",
        requestId,
        reason: "WEEKLY_QUOTA_EXCEEDED",
        before: { slotId: booking.slotId, sessionDate: booking.sessionDate },
        after: { ...input },
      }, options?.executor);

      return {
        success: false,
        error: "Kuota sesi mingguan kelompok telah tercapai.",
        reason: "WEEKLY_QUOTA_EXCEEDED",
      };
    }

    if (moveFailureReason === "BOOKING_TERMINAL_STATE") {
      await recordTutorFailureAudit({
        actorId: authContext.userId,
        actorRoles: authContext.roles,
        courseId: booking.courseId,
        entityType: "booking",
        entityId: targetBookingId,
        entityVersion: 1,
        action: "tutor.session.move",
        outcome: "rejected",
        requestId,
        reason: "BOOKING_TERMINAL_STATE",
        before: { slotId: booking.slotId, sessionDate: booking.sessionDate },
        after: { ...input },
      }, options?.executor);

      return {
        success: false,
        error: "Status sesi berubah sebelum pemindahan; tidak ada perubahan yang disimpan.",
        reason: "BOOKING_TERMINAL_STATE",
      };
    }

    await recordTutorFailureAudit({
      actorId: authContext.userId,
      actorRoles: authContext.roles,
      courseId: booking.courseId,
      entityType: "booking",
      entityId: targetBookingId,
      entityVersion: 1,
      action: "tutor.session.move",
      outcome: "failed",
      requestId,
      reason: moveFailureReason,
      before: { slotId: booking.slotId, sessionDate: booking.sessionDate },
      after: { ...input },
    }, options?.executor);

    return {
      success: false,
      error: "Gagal memindahkan sesi.",
      reason: "DATABASE_ERROR",
    };
  }

  // 9. AFTER COMMIT: Notifications
  if (!options?.skipNotifications) {
    try {
      const memberRows = await client
        .select({ userId: groupMembers.userId })
        .from(groupMembers)
        .where(eq(groupMembers.groupId, booking.groupId));

      const memberUserIds = memberRows.map((m: { userId: string }) => m.userId);
      if (memberUserIds.length > 0) {
        await sendToMany(memberUserIds, tutorScheduleMovedPayload({
          dayOfWeek: targetSlot.dayOfWeek,
          sessionDate: targetSessionDateIso,
          startTime: targetSlot.startTime,
          endTime: targetSlot.endTime,
        }));
      }
    } catch (notifErr) {
      console.error("[TUTOR_SCHEDULE] Move notification failed:", notifErr);
    }
  }

  try {
    revalidatePath("/tutor/schedule");
  } catch {
    // Ignored
  }

  return {
    success: true,
    movedDirectly: true,
  };
}

export async function moveTutorSessionAction(input: MoveTutorSessionInput) {
  return executeMoveTutorSession(input);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Action 4: Decide Reschedule Ticket (Tutor Decision)
 * ──────────────────────────────────────────────────────────────────────────── */
export interface DecideTutorRescheduleTicketInput {
  ticketId: string;
  decision: "approved" | "rejected";
  decisionNotes?: string;
}

export interface DecideTutorRescheduleTicketOptions {
  actorId?: string;
  executor?: DbExecutor;
  skipNotifications?: boolean;
  now?: Date;
}

export async function executeDecideTutorRescheduleTicket(
  input: DecideTutorRescheduleTicketInput,
  options?: DecideTutorRescheduleTicketOptions,
) {
  const requestId = randomUUID();
  let authContext: TutorAuthContext;

  try {
    authContext = await getTutorAuthContext(options?.actorId, options?.executor);
  } catch (err: any) {
    await recordUnauthenticatedRejectAudit({
      action: "tutor.ticket.decide",
      entityType: "reschedule_ticket",
      entityId: typeof input.ticketId === "string" ? input.ticketId.trim() || "unknown" : "unknown",
      courseId: "unknown",
      requestId,
      reason: err?.message || "UNAUTHORIZED",
      input: { ...input },
      executor: options?.executor,
    });

    return {
      success: false,
      error: err?.message || "UNAUTHORIZED",
      reason: "AUTH_FAILED",
    };
  }

  const client = (options?.executor ?? db) as typeof db;
  const targetTicketId = typeof input.ticketId === "string" ? input.ticketId.trim() : "";

  // 1. Fetch ticket
  const ticketRows = await client
    .select()
    .from(bookingRescheduleTickets)
    .where(eq(bookingRescheduleTickets.id, targetTicketId))
    .limit(1);

  if (ticketRows.length === 0) {
    await recordTutorMutationAudit({
      actorId: authContext.userId,
      actorRoles: authContext.roles,
      courseId: "unknown",
      entityType: "reschedule_ticket",
      entityId: targetTicketId || "unknown",
      entityVersion: 1,
      action: "tutor.ticket.decide",
      outcome: "rejected",
      requestId,
      reason: "TICKET_NOT_FOUND",
      before: null,
      after: { ...input },
    }, client);

    return {
      success: false,
      error: "Tiket tidak ditemukan.",
      reason: "TICKET_NOT_FOUND",
    };
  }

  const ticket = ticketRows[0];
  const decision = input.decision === "approved" ? "approved" : "rejected";
  const notes = input.decisionNotes?.trim() || null;
  let proposedSlotData: typeof tutorSlots.$inferSelect | null = null;

  // 2. Revalidate pending status (Scope 3)
  if (ticket.status !== "pending") {
    await recordTutorMutationAudit({
      actorId: authContext.userId,
      actorRoles: authContext.roles,
      courseId: "unknown",
      entityType: "reschedule_ticket",
      entityId: targetTicketId,
      entityVersion: 1,
      action: "tutor.ticket.decide",
      outcome: "rejected",
      requestId,
      reason: "TICKET_ALREADY_DECIDED",
      before: { ticketId: targetTicketId, status: ticket.status },
      after: { ...input },
    }, client);

    return {
      success: false,
      error: "Tiket sudah diproses sebelumnya.",
      reason: "TICKET_ALREADY_DECIDED",
    };
  }

  // 3. Fetch booking
  const bookingRows = await client
    .select()
    .from(bookings)
    .where(eq(bookings.id, ticket.bookingId))
    .limit(1);

  if (bookingRows.length === 0) {
    await recordTutorMutationAudit({
      actorId: authContext.userId,
      actorRoles: authContext.roles,
      courseId: "unknown",
      entityType: "reschedule_ticket",
      entityId: targetTicketId,
      entityVersion: 1,
      action: "tutor.ticket.decide",
      outcome: "rejected",
      requestId,
      reason: "BOOKING_NOT_FOUND",
      before: { ticketId: targetTicketId },
      after: { ...input },
    }, client);

    return {
      success: false,
      error: "Sesi terkait tiket tidak ditemukan.",
      reason: "BOOKING_NOT_FOUND",
    };
  }

  const booking = bookingRows[0];

  // 3.5 Integrity: ticket must belong to the booking's study group
  if (ticket.groupId !== booking.groupId) {
    await recordTutorMutationAudit({
      actorId: authContext.userId,
      actorRoles: authContext.roles,
      courseId: booking.courseId,
      entityType: "reschedule_ticket",
      entityId: targetTicketId,
      entityVersion: 1,
      action: "tutor.ticket.decide",
      outcome: "rejected",
      requestId,
      reason: "TICKET_GROUP_MISMATCH",
      before: { ticketId: targetTicketId, ticketGroupId: ticket.groupId, bookingGroupId: booking.groupId },
      after: { ...input },
    }, client);

    return {
      success: false,
      error: "Data tiket tidak konsisten dengan kelompok sesi.",
      reason: "TICKET_GROUP_MISMATCH",
    };
  }

  // 3.6 Terminal bookings cannot be moved or cancelled via approval
  if (decision === "approved" && isTerminalBookingStatus(booking.status)) {
    await recordTutorMutationAudit({
      actorId: authContext.userId,
      actorRoles: authContext.roles,
      courseId: booking.courseId,
      entityType: "reschedule_ticket",
      entityId: targetTicketId,
      entityVersion: 1,
      action: "tutor.ticket.decide",
      outcome: "rejected",
      requestId,
      reason: "BOOKING_TERMINAL_STATE",
      before: { ticketId: targetTicketId, bookingId: ticket.bookingId, bookingStatus: booking.status },
      after: { ...input },
    }, client);

    return {
      success: false,
      error: "Sesi sudah selesai atau dibatalkan; tiket tidak dapat disetujui.",
      reason: "BOOKING_TERMINAL_STATE",
    };
  }

  // 4. Verify tutor authorization: actor MUST own the existing booking's CURRENT slot (no cross-tutor mutation)
  const currentSlotOwnership = await checkTutorSlotOwnership(
    booking.slotId,
    authContext.userId,
    client,
  );

  const isAuthorizedCurrentTutor =
    currentSlotOwnership.isOwner || authContext.isAdmin;

  if (!isAuthorizedCurrentTutor) {
    await recordTutorMutationAudit({
      actorId: authContext.userId,
      actorRoles: authContext.roles,
      courseId: booking.courseId,
      entityType: "reschedule_ticket",
      entityId: targetTicketId,
      entityVersion: 1,
      action: "tutor.ticket.decide",
      outcome: "rejected",
      requestId,
      reason: "FORBIDDEN_TICKET_OWNER_MISMATCH",
      before: { ticketId: targetTicketId, bookingId: ticket.bookingId, currentSlotId: booking.slotId },
      after: { ...input },
    }, client);

    return {
      success: false,
      error: "Anda tidak berwenang memutuskan tiket ini.",
      reason: "FORBIDDEN_TICKET_OWNER_MISMATCH",
    };
  }

  // 5. If approving, revalidate target slot, weekday/date, duration, occupancy, group/course (Scope 3)
  if (decision === "approved") {
    if (ticket.type === "reschedule") {
      if (!ticket.proposedSlotId) {
        await recordTutorMutationAudit({
          actorId: authContext.userId,
          actorRoles: authContext.roles,
          courseId: booking.courseId,
          entityType: "reschedule_ticket",
          entityId: targetTicketId,
          entityVersion: 1,
          action: "tutor.ticket.decide",
          outcome: "rejected",
          requestId,
          reason: "PROPOSED_SLOT_EMPTY",
          before: { ticketId: targetTicketId },
          after: { ...input },
        }, client);

        return {
          success: false,
          error: "Slot usulan tiket tidak valid.",
          reason: "PROPOSED_SLOT_EMPTY",
        };
      }

      // Check proposed slot ownership (Scope 1 & Scope 3)
      const proposedSlotOwnership = await checkTutorSlotOwnership(
        ticket.proposedSlotId,
        authContext.userId,
        client,
      );

      if ((!proposedSlotOwnership.isOwner && !authContext.isAdmin) || !proposedSlotOwnership.slot) {
        await recordTutorMutationAudit({
          actorId: authContext.userId,
          actorRoles: authContext.roles,
          courseId: booking.courseId,
          entityType: "reschedule_ticket",
          entityId: targetTicketId,
          entityVersion: 1,
          action: "tutor.ticket.decide",
          outcome: "rejected",
          requestId,
          reason: proposedSlotOwnership.reason ?? "PROPOSED_SLOT_NOT_OWNED_BY_TUTOR",
          before: { ticketId: targetTicketId, proposedSlotId: ticket.proposedSlotId },
          after: { ...input },
        }, client);

        return {
          success: false,
          error: "Slot usulan tidak ditemukan atau bukan milik pengajar.",
          reason: proposedSlotOwnership.reason ?? "PROPOSED_SLOT_NOT_OWNED_BY_TUTOR",
        };
      }

      proposedSlotData = proposedSlotOwnership.slot;

      if (proposedSlotData.sessionDate && ticket.proposedDate && ticket.proposedDate !== proposedSlotData.sessionDate) {
        await recordTutorMutationAudit({
          actorId: authContext.userId,
          actorRoles: authContext.roles,
          courseId: booking.courseId,
          entityType: "reschedule_ticket",
          entityId: targetTicketId,
          entityVersion: 1,
          action: "tutor.ticket.decide",
          outcome: "rejected",
          requestId,
          reason: "SLOT_DATE_MISMATCH",
          before: { slotSessionDate: proposedSlotData.sessionDate },
          after: { proposedDate: ticket.proposedDate },
        }, client);

        return {
          success: false,
          error: "Tanggal usulan harus sama dengan tanggal slot tujuan.",
          reason: "SLOT_DATE_MISMATCH",
        };
      }

      // Validate proposed slot duration (Scope 3 & 6: exact 90m)
      const durationCheck = validateSlotDuration(proposedSlotData.startTime, proposedSlotData.endTime);
      if (!durationCheck.isValid) {
        await recordTutorMutationAudit({
          actorId: authContext.userId,
          actorRoles: authContext.roles,
          courseId: booking.courseId,
          entityType: "reschedule_ticket",
          entityId: targetTicketId,
          entityVersion: 1,
          action: "tutor.ticket.decide",
          outcome: "rejected",
          requestId,
          reason: durationCheck.reason ?? "INVALID_DURATION_NOT_90_MINUTES",
          before: { ticketId: targetTicketId, proposedSlotId: ticket.proposedSlotId },
          after: { ...input },
        }, client);

        return {
          success: false,
          error: "Durasi slot usulan harus tepat 90 menit.",
          reason: durationCheck.reason,
        };
      }

      // Validate proposed date format, calendar validity, and weekday match (Scope 3)
      const proposedDateToValidate =
        proposedSlotData.sessionDate ?? ticket.proposedDate?.trim() ?? "";
      const weekdayDateCheck = validateSlotWeekdayDate(
        proposedDateToValidate,
        proposedSlotData.dayOfWeek,
      );

      if (!weekdayDateCheck.isValid) {
        await recordTutorMutationAudit({
          actorId: authContext.userId,
          actorRoles: authContext.roles,
          courseId: booking.courseId,
          entityType: "reschedule_ticket",
          entityId: targetTicketId,
          entityVersion: 1,
          action: "tutor.ticket.decide",
          outcome: "rejected",
          requestId,
          reason: weekdayDateCheck.reason ?? "DATE_WEEKDAY_MISMATCH",
          before: { ticketId: targetTicketId, proposedDate: proposedDateToValidate },
          after: { ...input },
        }, client);

        return {
          success: false,
          error: "Tanggal usulan tidak sesuai dengan hari slot atau tanggal tidak valid.",
          reason: weekdayDateCheck.reason,
        };
      }

      // Validate group & course consistency and active enrollment (Scope 3)
      const groupEligibility = await checkActiveGroupCourseEligibility(
        ticket.groupId,
        booking.courseId,
        client,
      );

      if (!groupEligibility.isEligible) {
        await recordTutorMutationAudit({
          actorId: authContext.userId,
          actorRoles: authContext.roles,
          courseId: booking.courseId,
          entityType: "reschedule_ticket",
          entityId: targetTicketId,
          entityVersion: 1,
          action: "tutor.ticket.decide",
          outcome: "rejected",
          requestId,
          reason: groupEligibility.reason ?? "GROUP_NOT_ELIGIBLE",
          before: { ticketId: targetTicketId, groupId: ticket.groupId, courseId: booking.courseId },
          after: { ...input },
        }, client);

        return {
          success: false,
          error: "Kelompok belajar tidak aktif atau belum terdaftar pada mata kuliah ini.",
          reason: groupEligibility.reason,
        };
      }

      // Validate tutor assignment to course (Scope 3)
      const tutorAccess = await resolveTutorCourseAccess(
        {
          penggunaId: authContext.userId,
          courseId: booking.courseId,
          allowAdmin: authContext.isAdmin,
        },
        client,
      );

      if (!tutorAccess.hasAccess) {
        await recordTutorMutationAudit({
          actorId: authContext.userId,
          actorRoles: authContext.roles,
          courseId: booking.courseId,
          entityType: "reschedule_ticket",
          entityId: targetTicketId,
          entityVersion: 1,
          action: "tutor.ticket.decide",
          outcome: "rejected",
          requestId,
          reason: "TUTOR_NOT_ASSIGNED_TO_COURSE",
          before: { ticketId: targetTicketId },
          after: { ...input },
        }, client);

        return {
          success: false,
          error: "Pengajar tidak memiliki penugasan aktif untuk mata kuliah ini.",
          reason: "TUTOR_NOT_ASSIGNED_TO_COURSE",
        };
      }

      // Validate proposed slot occupancy using DB uniqueness semantics (Scope 3 & 7)
      const occupiedBooking = await client
        .select({ id: bookings.id })
        .from(bookings)
        .where(eq(bookings.slotId, ticket.proposedSlotId))
        .limit(1);

      if (occupiedBooking.length > 0 && occupiedBooking[0].id !== ticket.bookingId) {
        await recordTutorMutationAudit({
          actorId: authContext.userId,
          actorRoles: authContext.roles,
          courseId: booking.courseId,
          entityType: "reschedule_ticket",
          entityId: targetTicketId,
          entityVersion: 1,
          action: "tutor.ticket.decide",
          outcome: "rejected",
          requestId,
          reason: "TARGET_SLOT_OCCUPIED",
          before: { ticketId: targetTicketId, proposedSlotId: ticket.proposedSlotId },
          after: { ...input },
        }, client);

        return {
          success: false,
          error: "Slot usulan sudah terisi oleh sesi lain.",
          reason: "TARGET_SLOT_OCCUPIED",
        };
      }
    }
  }

  // 6. Execute state change and mutation audit in one transaction (Scope 4)
  const decisionNow = options?.now ?? new Date();
  const now = new Date();
  const sessionLockedAtDecision = booking.sessionDate
    ? isTutorialWeekLocked(booking.sessionDate, decisionNow)
    : false;

  try {
    await client.transaction(async (tx) => {
      // Atomic guard: update ticket only if status is still pending; verify
      // affected rows so a concurrent decision cannot apply twice.
      const ticketClaim = await tx
        .update(bookingRescheduleTickets)
        .set({
          status: decision,
          decisionNotes: notes,
          decidedAt: now,
          decidedById: authContext.userId,
          updatedAt: now,
        })
        .where(
          and(
            eq(bookingRescheduleTickets.id, targetTicketId),
            eq(bookingRescheduleTickets.status, "pending"),
          ),
        );

      if ((ticketClaim.rowsAffected ?? 0) === 0) {
        throw new Error("TICKET_ALREADY_DECIDED");
      }

      if (decision === "approved") {
        if (ticket.type === "reschedule" && proposedSlotData) {
          const targetSessionDateIso =
            proposedSlotData.sessionDate ?? ticket.proposedDate?.trim() ?? "";
          if (targetSessionDateIso) {
            const { startIso, endIso } = getIsoWeekRange(targetSessionDateIso);
            const groupQuotaRows = await tx
              .select({ weeklyQuotaSessions: groups.weeklyQuotaSessions })
              .from(groups)
              .where(eq(groups.id, ticket.groupId))
              .limit(1);
            const weeklyQuota = groupQuotaRows[0]?.weeklyQuotaSessions || 2;

            const weekCountRows = await tx
              .select({ value: sql<number>`count(*)` })
              .from(bookings)
              .where(
                and(
                  eq(bookings.groupId, ticket.groupId),
                  ne(bookings.id, ticket.bookingId),
                  gte(bookings.sessionDate, startIso),
                  lte(bookings.sessionDate, endIso),
                  countsTowardGroupWeeklyQuota(),
                ),
              );
            const targetWeekBookingCount = Number(weekCountRows[0]?.value ?? 0);

            if (targetWeekBookingCount >= weeklyQuota) {
              throw new Error("WEEKLY_QUOTA_EXCEEDED");
            }
          }

          // Guarded move: reject if the booking turned completed/cancelled.
          const bookingMove = await tx
            .update(bookings)
            .set({
              slotId: ticket.proposedSlotId!,
              sessionDate: targetSessionDateIso,
              startTime: proposedSlotData.startTime,
              endTime: proposedSlotData.endTime,
              mode: proposedSlotData.mode,
              location: proposedSlotData.location ?? null,
              lastModifiedBy: authContext.userId,
              lastModifiedAt: now,
            })
            .where(
              and(
                eq(bookings.id, ticket.bookingId),
                terminalStatusGuard(),
              ),
            );

          if ((bookingMove.rowsAffected ?? 0) === 0) {
            throw new Error("BOOKING_TERMINAL_STATE");
          }
        } else if (ticket.type === "cancellation") {
          // Guarded cancel: reject if the booking already reached a terminal state.
          const cancelUpdate = await tx
            .update(bookings)
            .set({
              status: "cancelled",
              lastModifiedBy: authContext.userId,
              lastModifiedAt: now,
            })
            .where(
              and(
                eq(bookings.id, ticket.bookingId),
                terminalStatusGuard(),
              ),
            );

          if ((cancelUpdate.rowsAffected ?? 0) === 0) {
            throw new Error("BOOKING_TERMINAL_STATE");
          }
        }
      }

      // Audit log entry for compatibility. The booking row is never deleted,
      // so this reference stays queryable alongside every other history row.
      await tx.insert(bookingAuditLogs).values({
        id: randomUUID(),
        bookingId: ticket.bookingId,
        groupId: ticket.groupId,
        actorId: authContext.userId,
        action: decision === "approved" ? "TICKET_APPROVED" : "TICKET_REJECTED",
        summary: `Tutor ${authContext.name ?? "Pengajar"} ${
          decision === "approved" ? "menyetujui" : "menolak"
        } tiket ${ticket.type}.`,
        metadata: {
          ticketId: targetTicketId,
          decision,
          notes,
        },
        createdAt: now,
      });

      // Cancellation quota contract (traceable, no deletion): pre-lock
      // approval keeps the cancelled booking row, refunds one package
      // session, and durably marks the refund as a booking_audit_logs row
      // whose JSON metadata identifies ticket, booking, and request. Weekly
      // quota excludes exactly these marked rows. Post-lock approval keeps
      // the cancelled row counted without a marker (hangus).
      if (
        decision === "approved" &&
        ticket.type === "cancellation" &&
        !sessionLockedAtDecision
      ) {
        const refundClaim = await tx
          .update(groups)
          .set({
            usedQuotaSessions: sql`MAX(${groups.usedQuotaSessions} - 1, 0)`,
            updatedAt: now,
          })
          .where(
            and(
              eq(groups.id, ticket.groupId),
              gt(groups.usedQuotaSessions, 0),
            ),
          );

        if ((refundClaim.rowsAffected ?? 0) > 0) {
          await tx.insert(bookingAuditLogs).values({
            id: randomUUID(),
            bookingId: ticket.bookingId,
            groupId: ticket.groupId,
            actorId: authContext.userId,
            action: CANCELLED_QUOTA_REFUND_LOG_ACTION,
            summary: `Kuota paket dikembalikan satu sesi untuk pembatalan pra-kunci (${booking.sessionDate ?? "tanpa tanggal"}).`,
            metadata: {
              marker: "prelock_cancel_quota_refund",
              ticketId: targetTicketId,
              bookingId: ticket.bookingId,
              groupId: ticket.groupId,
              refundedSessions: 1,
              requestId,
            },
            createdAt: now,
          });
        }
      }

      await recordTutorMutationAudit({
        actorId: authContext.userId,
        actorRoles: authContext.roles,
        courseId: booking.courseId,
        entityType: "reschedule_ticket",
        entityId: targetTicketId,
        entityVersion: 1,
        action: "tutor.ticket.decide",
        outcome: "success",
        requestId,
        reason: `TICKET_${decision.toUpperCase()}`,
        before: { ticketId: targetTicketId, status: "pending" },
        after: { ticketId: targetTicketId, status: decision, decisionNotes: notes },
      }, tx);
    });
  } catch (err: any) {
    const decideFailureReason = err?.message ?? "DATABASE_TRANSACTION_FAILED";

    if (decideFailureReason === "WEEKLY_QUOTA_EXCEEDED") {
      await recordTutorFailureAudit({
        actorId: authContext.userId,
        actorRoles: authContext.roles,
        courseId: booking.courseId,
        entityType: "reschedule_ticket",
        entityId: targetTicketId,
        entityVersion: 1,
        action: "tutor.ticket.decide",
        outcome: "rejected",
        requestId,
        reason: "WEEKLY_QUOTA_EXCEEDED",
        before: { ticketId: targetTicketId, status: "pending" },
        after: { ...input },
      }, options?.executor);

      return {
        success: false,
        error: "Kuota sesi mingguan kelompok pada minggu tujuan telah tercapai.",
        reason: "WEEKLY_QUOTA_EXCEEDED",
      };
    }

    if (decideFailureReason === "TICKET_ALREADY_DECIDED") {
      await recordTutorFailureAudit({
        actorId: authContext.userId,
        actorRoles: authContext.roles,
        courseId: booking.courseId,
        entityType: "reschedule_ticket",
        entityId: targetTicketId,
        entityVersion: 1,
        action: "tutor.ticket.decide",
        outcome: "rejected",
        requestId,
        reason: "TICKET_ALREADY_DECIDED",
        before: { ticketId: targetTicketId, status: "pending" },
        after: { ...input },
      }, options?.executor);

      return {
        success: false,
        error: "Tiket sudah diproses sebelumnya.",
        reason: "TICKET_ALREADY_DECIDED",
      };
    }

    if (decideFailureReason === "BOOKING_TERMINAL_STATE") {
      await recordTutorFailureAudit({
        actorId: authContext.userId,
        actorRoles: authContext.roles,
        courseId: booking.courseId,
        entityType: "reschedule_ticket",
        entityId: targetTicketId,
        entityVersion: 1,
        action: "tutor.ticket.decide",
        outcome: "rejected",
        requestId,
        reason: "BOOKING_TERMINAL_STATE",
        before: { ticketId: targetTicketId, bookingId: ticket.bookingId, bookingStatus: booking.status },
        after: { ...input },
      }, options?.executor);

      return {
        success: false,
        error: "Status sesi berubah sebelum keputusan disimpan; tiket tetap tertunda.",
        reason: "BOOKING_TERMINAL_STATE",
      };
    }

    await recordTutorFailureAudit({
      actorId: authContext.userId,
      actorRoles: authContext.roles,
      courseId: booking.courseId,
      entityType: "reschedule_ticket",
      entityId: targetTicketId,
      entityVersion: 1,
      action: "tutor.ticket.decide",
      outcome: "failed",
      requestId,
      reason: decideFailureReason,
      before: { ticketId: targetTicketId, status: "pending" },
      after: { ...input },
    }, options?.executor);

    return {
      success: false,
      error: "Gagal memproses keputusan tiket.",
      reason: "DATABASE_ERROR",
    };
  }

  // 7. AFTER COMMIT: Notifications
  if (!options?.skipNotifications) {
    try {
      const memberRows = await client
        .select({ userId: groupMembers.userId })
        .from(groupMembers)
        .where(eq(groupMembers.groupId, ticket.groupId));

      const memberUserIds = memberRows.map((m: { userId: string }) => m.userId);
      if (memberUserIds.length > 0) {
        await sendToMany(memberUserIds, tutorTicketDecisionPayload({
          ticketType: ticket.type,
          decision,
          notes: notes || null,
        }));
      }
    } catch (notifErr) {
      console.error("[TUTOR_SCHEDULE] Ticket decision notification error:", notifErr);
    }
  }

  try {
    revalidatePath("/tutor/schedule");
  } catch {
    // Ignored
  }

  return { success: true };
}

export async function decideTutorRescheduleTicketAction(
  input: DecideTutorRescheduleTicketInput,
) {
  return executeDecideTutorRescheduleTicket(input);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Action 5: Reply to Ticket Discussion Thread (Tutor <-> Group)
 * ──────────────────────────────────────────────────────────────────────────── */

export interface ReplyTutorTicketMessageInput {
  ticketId: string;
  message: string;
}

export interface ReplyTutorTicketMessageOptions {
  actorId?: string;
  executor?: DbExecutor;
  skipNotifications?: boolean;
}

const MAX_TICKET_MESSAGE_LENGTH = 2000;

export async function executeReplyTutorTicketMessage(
  input: ReplyTutorTicketMessageInput,
  options?: ReplyTutorTicketMessageOptions,
) {
  const requestId = randomUUID();
  let authContext: TutorAuthContext;

  try {
    authContext = await getTutorAuthContext(options?.actorId, options?.executor);
  } catch (err: any) {
    await recordUnauthenticatedRejectAudit({
      action: "tutor.ticket.message",
      entityType: "reschedule_ticket",
      entityId: typeof input.ticketId === "string" ? input.ticketId.trim() || "unknown" : "unknown",
      courseId: "unknown",
      requestId,
      reason: err?.message || "UNAUTHORIZED",
      input: { ticketId: input.ticketId },
      executor: options?.executor,
    });

    return {
      success: false,
      error: err?.message || "UNAUTHORIZED",
      reason: "AUTH_FAILED",
    };
  }

  const client = (options?.executor ?? db) as typeof db;
  const targetTicketId = typeof input.ticketId === "string" ? input.ticketId.trim() : "";
  const messageText = typeof input.message === "string" ? input.message.trim() : "";

  if (!targetTicketId || messageText.length === 0 || messageText.length > MAX_TICKET_MESSAGE_LENGTH) {
    await recordTutorMutationAudit({
      actorId: authContext.userId,
      actorRoles: authContext.roles,
      courseId: "unknown",
      entityType: "reschedule_ticket",
      entityId: targetTicketId || "unknown",
      entityVersion: 1,
      action: "tutor.ticket.message",
      outcome: "rejected",
      requestId,
      reason: "INVALID_MESSAGE",
      before: null,
      after: { ticketId: targetTicketId, messageLength: messageText.length },
    }, client);

    return {
      success: false,
      error: "Pesan wajib diisi dan maksimal 2000 karakter.",
      reason: "INVALID_MESSAGE",
    };
  }

  // 1. Fetch ticket
  const ticketRows = await client
    .select()
    .from(bookingRescheduleTickets)
    .where(eq(bookingRescheduleTickets.id, targetTicketId))
    .limit(1);

  if (ticketRows.length === 0) {
    await recordTutorMutationAudit({
      actorId: authContext.userId,
      actorRoles: authContext.roles,
      courseId: "unknown",
      entityType: "reschedule_ticket",
      entityId: targetTicketId,
      entityVersion: 1,
      action: "tutor.ticket.message",
      outcome: "rejected",
      requestId,
      reason: "TICKET_NOT_FOUND",
      before: null,
      after: { ticketId: targetTicketId },
    }, client);

    return {
      success: false,
      error: "Tiket tidak ditemukan.",
      reason: "TICKET_NOT_FOUND",
    };
  }

  const ticket = ticketRows[0];

  // 2. Fetch booking and verify the acting tutor owns the booked slot
  const bookingRows = await client
    .select()
    .from(bookings)
    .where(eq(bookings.id, ticket.bookingId))
    .limit(1);

  if (bookingRows.length === 0) {
    await recordTutorMutationAudit({
      actorId: authContext.userId,
      actorRoles: authContext.roles,
      courseId: "unknown",
      entityType: "reschedule_ticket",
      entityId: targetTicketId,
      entityVersion: 1,
      action: "tutor.ticket.message",
      outcome: "rejected",
      requestId,
      reason: "BOOKING_NOT_FOUND",
      before: { ticketId: targetTicketId },
      after: { ticketId: targetTicketId },
    }, client);

    return {
      success: false,
      error: "Sesi terkait tiket tidak ditemukan.",
      reason: "BOOKING_NOT_FOUND",
    };
  }

  const booking = bookingRows[0];

  let isAssignedTutor = false;
  if (booking.slotId) {
    const slotRows = await client
      .select({ id: tutorSlots.id })
      .from(tutorSlots)
      .where(and(eq(tutorSlots.id, booking.slotId), eq(tutorSlots.tutorId, authContext.userId)))
      .limit(1);
    isAssignedTutor = slotRows.length > 0;
  }

  if (!isAssignedTutor && !authContext.isAdmin) {
    await recordTutorMutationAudit({
      actorId: authContext.userId,
      actorRoles: authContext.roles,
      courseId: booking.courseId,
      entityType: "reschedule_ticket",
      entityId: targetTicketId,
      entityVersion: 1,
      action: "tutor.ticket.message",
      outcome: "rejected",
      requestId,
      reason: "NOT_ASSIGNED_TUTOR",
      before: { ticketId: targetTicketId },
      after: { ticketId: targetTicketId },
    }, client);

    return {
      success: false,
      error: "Hanya tutor pengampu yang dapat membalas diskusi tiket ini.",
      reason: "NOT_ASSIGNED_TUTOR",
    };
  }

  // 3. Persist message and touch the ticket
  try {
    await db.transaction(async (tx) => {
      await tx.insert(bookingTicketMessages).values({
        id: `btm-${randomUUID()}`,
        ticketId: targetTicketId,
        senderId: authContext.userId,
        message: messageText,
        createdAt: new Date(),
      });

      await tx
        .update(bookingRescheduleTickets)
        .set({ updatedAt: new Date() })
        .where(eq(bookingRescheduleTickets.id, targetTicketId));

      await recordMutationAudit({
        actorId: authContext.userId,
        actorRoles: authContext.roles,
        courseId: booking.courseId,
        entityType: "reschedule_ticket",
        entityId: targetTicketId,
        entityVersion: 1,
        requestId,
        action: "tutor.ticket.message",
        outcome: "success",
        reason: "Tutor replied to ticket discussion",
        before: null,
        after: {
          ticketId: targetTicketId,
          messageIdLength: messageText.length,
        },
      }, tx);
    });
  } catch (err: any) {
    await recordTutorFailureAudit({
      actorId: authContext.userId,
      actorRoles: authContext.roles,
      courseId: booking.courseId,
      entityType: "reschedule_ticket",
      entityId: targetTicketId,
      entityVersion: 1,
      action: "tutor.ticket.message",
      outcome: "failed",
      requestId,
      reason: err?.message || "DATABASE_ERROR",
      before: { ticketId: targetTicketId },
      after: { ticketId: targetTicketId },
    }, options?.executor);

    return {
      success: false,
      error: "Gagal mengirim pesan diskusi.",
      reason: "DATABASE_ERROR",
    };
  }

  // 4. AFTER COMMIT: notify group members about the new tutor message
  if (!options?.skipNotifications) {
    try {
      const memberRows = await client
        .select({ userId: groupMembers.userId })
        .from(groupMembers)
        .where(eq(groupMembers.groupId, ticket.groupId));

      const memberUserIds = memberRows.map((m: { userId: string }) => m.userId);
      if (memberUserIds.length > 0) {
        await sendToMany(memberUserIds, tutorTicketMessagePayload(
          messageText.length > 120 ? `${messageText.slice(0, 117)}...` : messageText,
        ));
      }
    } catch (notifErr) {
      console.error("[TUTOR_SCHEDULE] Ticket message notification error:", notifErr);
    }
  }

  try {
    revalidatePath("/tutor/schedule");
  } catch {
    // Ignored
  }

  return { success: true };
}

export async function replyTutorTicketMessageAction(
  input: ReplyTutorTicketMessageInput,
) {
  return executeReplyTutorTicketMessage(input);
}
