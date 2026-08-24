"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { and, eq, gt, gte, lt, lte, ne, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  bookingAuditLogs,
  bookingRescheduleTickets,
  bookings,
  groupMembers,
  groups,
  mataKuliah,
  pengguna,
  penggunaPeran,
  peran,
  tutorSlots,
  user,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import {
  type DbExecutor,
  requireTutorCourseAccess,
  resolveTutorCourseAccess,
} from "@/lib/auth/tutor-access";
import {
  recordMutationAudit,
  recordTutorMutationAudit,
} from "@/lib/audit/mutasi";
import {
  getIsoWeekRange,
  isSessionLocked,
} from "@/lib/schedule-lock";
import {
  CANCELLED_QUOTA_REFUND_LOG_ACTION,
  checkActiveGroupCourseEligibility,
  checkCanDeleteTutorSlot,
  checkTutorSlotOwnership,
  countsTowardGroupWeeklyQuota,
  getDeterministicGroupRepresentative,
  INDONESIAN_DAYS,
  type IndonesianDay,
  isTerminalBookingStatus,
  terminalStatusGuard,
  TERMINAL_BOOKING_STATUSES,
  validateSlotDuration,
  validateSlotWeekdayDate,
} from "@/lib/schedule/tutor-policy";
import { sendToMany } from "@/lib/notifications/send";
import type { NotificationPayload } from "@/lib/notifications/types";
import { createGoogleMeetSpace } from "@/lib/google-meet";
import {
  TutorAuditPersistenceError,
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

  // 1. Validate duration
  const durationCheck = validateSlotDuration(input.startTime, input.endTime);
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

  // 3. Validate specific date if provided
  if (input.sessionDate && input.sessionDate.trim().length > 0) {
    const weekdayDateCheck = validateSlotWeekdayDate(
      input.sessionDate.trim(),
      dayName,
    );
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
  }

  // 4. Validate offline location
  const mode = input.mode === "offline" ? "offline" : "online";
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
  const now = new Date();

  try {
    await client.transaction(async (tx) => {
      await tx.insert(tutorSlots).values({
        id: slotId,
        tutorId: authContext.userId,
        dayOfWeek: dayName,
        startTime: input.startTime.trim(),
        endTime: input.endTime.trim(),
        mode,
        location: mode === "offline" ? input.location?.trim() ?? null : null,
        sessionDate: input.sessionDate ? input.sessionDate.trim() : null,
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
          startTime: input.startTime.trim(),
          endTime: input.endTime.trim(),
          mode,
          location: mode === "offline" ? input.location?.trim() : null,
          sessionDate: input.sessionDate?.trim() ?? null,
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
        .select({ id: tutorSlots.id, tutorId: tutorSlots.tutorId })
        .from(tutorSlots)
        .where(eq(tutorSlots.id, targetSlotId))
        .limit(1);

      if (slotInTx.length === 0) {
        throw new Error("SLOT_NOT_FOUND");
      }

      if (slotInTx[0].tutorId !== authContext.userId && !authContext.isAdmin) {
        throw new Error("SLOT_NOT_OWNED_BY_TUTOR");
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
      deleteFailureReason === "SLOT_NOT_FOUND"
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
 * Action 3: Create Tutor Session (Active Group / Course)
 * ──────────────────────────────────────────────────────────────────────────── */

export interface CreateTutorSessionInput {
  slotId: string;
  groupId: string;
  courseId: string;
  sessionDate: string;
  topic?: string;
}

export interface CreateTutorSessionOptions {
  actorId?: string;
  executor?: DbExecutor;
  skipExternalMeet?: boolean;
  skipNotifications?: boolean;
}

export async function executeCreateTutorSession(
  input: CreateTutorSessionInput,
  options?: CreateTutorSessionOptions,
) {
  const requestId = randomUUID();
  let authContext: TutorAuthContext;

  try {
    authContext = await getTutorAuthContext(options?.actorId, options?.executor);
  } catch (err: any) {
    await recordUnauthenticatedRejectAudit({
      action: "tutor.session.create",
      entityType: "booking",
      entityId: "new_session",
      courseId: typeof input.courseId === "string" ? input.courseId.trim() || "unknown" : "unknown",
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
  const targetGroupId = typeof input.groupId === "string" ? input.groupId.trim() : "";
  const targetCourseId = typeof input.courseId === "string" ? input.courseId.trim() : "";
  const sessionDateIso = typeof input.sessionDate === "string" ? input.sessionDate.trim() : "";

  // 1. Verify tutor slot ownership
  const ownership = await checkTutorSlotOwnership(
    targetSlotId,
    authContext.userId,
    client,
  );

  if (!ownership.isOwner || !ownership.slot) {
    await recordTutorMutationAudit({
      actorId: authContext.userId,
      actorRoles: authContext.roles,
      courseId: targetCourseId || "unknown",
      entityType: "booking",
      entityId: "new_session",
      entityVersion: 1,
      action: "tutor.session.create",
      outcome: "rejected",
      requestId,
      reason: ownership.reason ?? "SLOT_NOT_OWNED_BY_TUTOR",
      before: null,
      after: { ...input },
    }, client);

    return {
      success: false,
      error: "Slot tidak ditemukan atau bukan milik tutor.",
      reason: ownership.reason,
    };
  }

  const slot = ownership.slot;

  // 2. Validate existing slot duration (exact 90 minutes)
  const slotDurationCheck = validateSlotDuration(slot.startTime, slot.endTime);
  if (!slotDurationCheck.isValid) {
    await recordTutorMutationAudit({
      actorId: authContext.userId,
      actorRoles: authContext.roles,
      courseId: targetCourseId || "unknown",
      entityType: "booking",
      entityId: "new_session",
      entityVersion: 1,
      action: "tutor.session.create",
      outcome: "rejected",
      requestId,
      reason: slotDurationCheck.reason ?? "INVALID_DURATION_NOT_90_MINUTES",
      before: null,
      after: { ...input, slotStartTime: slot.startTime, slotEndTime: slot.endTime },
    }, client);

    return {
      success: false,
      error: "Durasi slot ketersediaan harus tepat 90 menit.",
      reason: slotDurationCheck.reason,
    };
  }

  // 3. Verify slot is unbooked
  const existingBooking = await client
    .select({ id: bookings.id })
    .from(bookings)
    .where(eq(bookings.slotId, targetSlotId))
    .limit(1);

  if (existingBooking.length > 0) {
    await recordTutorMutationAudit({
      actorId: authContext.userId,
      actorRoles: authContext.roles,
      courseId: targetCourseId,
      entityType: "booking",
      entityId: "new_session",
      entityVersion: 1,
      action: "tutor.session.create",
      outcome: "rejected",
      requestId,
      reason: "SLOT_ALREADY_BOOKED",
      before: null,
      after: { ...input },
    }, client);

    return {
      success: false,
      error: "Slot ini sudah memiliki sesi terdaftar.",
      reason: "SLOT_ALREADY_BOOKED",
    };
  }

  // 4. Verify weekday and date match
  const weekdayCheck = validateSlotWeekdayDate(sessionDateIso, slot.dayOfWeek);
  if (!weekdayCheck.isValid) {
    await recordTutorMutationAudit({
      actorId: authContext.userId,
      actorRoles: authContext.roles,
      courseId: targetCourseId,
      entityType: "booking",
      entityId: "new_session",
      entityVersion: 1,
      action: "tutor.session.create",
      outcome: "rejected",
      requestId,
      reason: weekdayCheck.reason ?? "DATE_WEEKDAY_MISMATCH",
      before: null,
      after: { ...input },
    }, client);

    return {
      success: false,
      error: "Tanggal sesi tidak sesuai dengan hari slot atau tanggal tidak valid.",
      reason: weekdayCheck.reason,
    };
  }

  // 5. Require active canonical tutor assignment with compatibility fallback
  try {
    await requireTutorCourseAccess(
      authContext.userId,
      targetCourseId,
      { allowAdmin: authContext.isAdmin },
      client,
    );
  } catch (accessErr: any) {
    await recordTutorMutationAudit({
      actorId: authContext.userId,
      actorRoles: authContext.roles,
      courseId: targetCourseId,
      entityType: "booking",
      entityId: "new_session",
      entityVersion: 1,
      action: "tutor.session.create",
      outcome: "rejected",
      requestId,
      reason: "TUTOR_NOT_ASSIGNED_TO_COURSE",
      before: null,
      after: { ...input },
    }, client);

    return {
      success: false,
      error: "Tutor tidak memiliki penugasan aktif untuk mata kuliah ini.",
      reason: "TUTOR_NOT_ASSIGNED_TO_COURSE",
    };
  }

  // 6. Verify active group and course enrollment
  const groupEligibility = await checkActiveGroupCourseEligibility(
    targetGroupId,
    targetCourseId,
    client,
  );

  if (!groupEligibility.isEligible || !groupEligibility.representative) {
    await recordTutorMutationAudit({
      actorId: authContext.userId,
      actorRoles: authContext.roles,
      courseId: targetCourseId,
      entityType: "booking",
      entityId: "new_session",
      entityVersion: 1,
      action: "tutor.session.create",
      outcome: "rejected",
      requestId,
      reason: groupEligibility.reason ?? "GROUP_NOT_ELIGIBLE",
      before: null,
      after: { ...input },
    }, client);

    return {
      success: false,
      error: "Kelompok belajar tidak aktif, belum terdaftar pada mata kuliah, atau tidak memiliki anggota.",
      reason: groupEligibility.reason,
    };
  }

  // 7. Quota window for the target ISO week; enforcement happens inside the
  // transaction so concurrent requests serialize on the SQLite write lock.
  const { startIso, endIso } = getIsoWeekRange(sessionDateIso);

  const bookingId = randomUUID();
  const now = new Date();
  const representativeUserId = groupEligibility.representative.userId;
  const courseIdForBooking =
    groupEligibility.legacyCourseId ?? groupEligibility.courseId ?? targetCourseId;
  const resolvedCourseId = courseIdForBooking;

  // 8. Commit database mutation inside transaction
  try {
    await client.transaction(async (tx) => {
      // Atomic total-quota reservation: the guarded UPDATE claims the last free
      // package session. libsql transactions begin IMMEDIATE, so this statement
      // serializes concurrent creates before any quota read below.
      const quotaClaim = await tx
        .update(groups)
        .set({
          usedQuotaSessions: sql`${groups.usedQuotaSessions} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(groups.id, targetGroupId),
            lt(groups.usedQuotaSessions, groups.totalQuotaSessions),
          ),
        );

      if ((quotaClaim.rowsAffected ?? 0) === 0) {
        throw new Error("TOTAL_QUOTA_EXCEEDED");
      }

      // Weekly quota re-read under the write lock. Every kept booking row of
      // the group counts, including post-lock approved cancellations (hangus).
      // Only cancelled rows carrying the durable pre-lock refund marker in
      // booking_audit_logs free their weekly slot.
      const groupQuotaRows = await tx
        .select({ weeklyQuotaSessions: groups.weeklyQuotaSessions })
        .from(groups)
        .where(eq(groups.id, targetGroupId))
        .limit(1);
      const weeklyQuota = groupQuotaRows[0]?.weeklyQuotaSessions || 2;

      const weekCountRows = await tx
        .select({ value: sql<number>`count(*)` })
        .from(bookings)
        .where(
          and(
            eq(bookings.groupId, targetGroupId),
            gte(bookings.sessionDate, startIso),
            lte(bookings.sessionDate, endIso),
            countsTowardGroupWeeklyQuota(),
          ),
        );
      const weekBookingCount = Number(weekCountRows[0]?.value ?? 0);

      if (weekBookingCount >= weeklyQuota) {
        throw new Error("WEEKLY_QUOTA_EXCEEDED");
      }

      await tx.insert(bookings).values({
        id: bookingId,
        slotId: targetSlotId,
        studentId: representativeUserId,
        courseId: courseIdForBooking,
        groupId: targetGroupId,
        status: "scheduled",
        sessionDate: sessionDateIso,
        startTime: slot.startTime,
        endTime: slot.endTime,
        mode: slot.mode,
        location: slot.location ?? null,
        topic: input.topic?.trim() || null,
        lastModifiedBy: authContext.userId,
        lastModifiedAt: now,
        bookedAt: now,
      });

      // Audit log table entry for compatibility
      await tx.insert(bookingAuditLogs).values({
        id: randomUUID(),
        bookingId,
        groupId: targetGroupId,
        actorId: authContext.userId,
        action: "TUTOR_SESSION_CREATED",
        summary: `Tutor ${authContext.name ?? "Pengajar"} menjadwalkan sesi (${slot.dayOfWeek}, ${sessionDateIso} ${slot.startTime} - ${slot.endTime})`,
        metadata: {
          slotId: targetSlotId,
          courseId: resolvedCourseId,
          groupId: targetGroupId,
          representativeId: representativeUserId,
        },
        createdAt: now,
      });

      await recordTutorMutationAudit({
        actorId: authContext.userId,
        actorRoles: authContext.roles,
        courseId: resolvedCourseId,
        entityType: "booking",
        entityId: bookingId,
        entityVersion: 1,
        action: "tutor.session.create",
        outcome: "success",
        requestId,
        reason: "TUTOR_SESSION_CREATED",
        before: null,
        after: {
          bookingId,
          slotId: targetSlotId,
          groupId: targetGroupId,
          courseId: resolvedCourseId,
          sessionDate: sessionDateIso,
          startTime: slot.startTime,
          endTime: slot.endTime,
          mode: slot.mode,
          representativeUserId,
        },
      }, tx);
    });
  } catch (err: any) {
    const failureReason = err?.message ?? "DATABASE_TRANSACTION_FAILED";

    if (failureReason === "WEEKLY_QUOTA_EXCEEDED") {
      await recordTutorFailureAudit({
        actorId: authContext.userId,
        actorRoles: authContext.roles,
        courseId: resolvedCourseId,
        entityType: "booking",
        entityId: "new_session",
        entityVersion: 1,
        action: "tutor.session.create",
        outcome: "rejected",
        requestId,
        reason: "WEEKLY_QUOTA_EXCEEDED",
        before: null,
        after: { ...input },
      }, options?.executor);

      return {
        success: false,
        error: "Kuota sesi mingguan kelompok telah tercapai.",
        reason: "WEEKLY_QUOTA_EXCEEDED",
      };
    }

    if (failureReason === "TOTAL_QUOTA_EXCEEDED") {
      await recordTutorFailureAudit({
        actorId: authContext.userId,
        actorRoles: authContext.roles,
        courseId: resolvedCourseId,
        entityType: "booking",
        entityId: "new_session",
        entityVersion: 1,
        action: "tutor.session.create",
        outcome: "rejected",
        requestId,
        reason: "TOTAL_QUOTA_EXCEEDED",
        before: null,
        after: { ...input },
      }, options?.executor);

      return {
        success: false,
        error: "Kuota total sesi kelompok telah tercapai.",
        reason: "TOTAL_QUOTA_EXCEEDED",
      };
    }

    await recordTutorFailureAudit({
      actorId: authContext.userId,
      actorRoles: authContext.roles,
      courseId: resolvedCourseId,
      entityType: "booking",
      entityId: bookingId,
      entityVersion: 1,
      action: "tutor.session.create",
      outcome: "failed",
      requestId,
      reason: failureReason,
      before: null,
      after: { ...input },
    }, options?.executor);

    return {
      success: false,
      error: "Gagal menyimpan jadwal sesi.",
      reason: "DATABASE_ERROR",
    };
  }

  // 8. AFTER COMMIT: Notifications to all active group members
  let notificationSent = false;
  if (!options?.skipNotifications) {
    try {
      const memberRows = await client
        .select({ userId: groupMembers.userId })
        .from(groupMembers)
        .where(eq(groupMembers.groupId, targetGroupId));

      const memberUserIds = memberRows.map((m: { userId: string }) => m.userId);
      if (memberUserIds.length > 0) {
        const payload: NotificationPayload = {
          title: "Jadwal Tutorial Baru",
          body: `Sesi baru dijadwalkan pada ${slot.dayOfWeek}, ${sessionDateIso} pukul ${slot.startTime} - ${slot.endTime}.`,
          type: "tutor_reminder",
          link: "/dashboard/schedule",
          metadata: {
            bookingId,
            courseId: resolvedCourseId,
            sessionDate: sessionDateIso,
          },
        };
        await sendToMany(memberUserIds, payload);
        notificationSent = true;
      }
    } catch (notifErr) {
      // Non-fatal: do not roll back committed session
      console.error("[TUTOR_SCHEDULE] Failed to deliver notifications:", notifErr);
    }
  }

  // 9. AFTER COMMIT: Google Meet Space Creation
  let googleMeetCreated = false;
  let googleMeetError: string | null = null;

  if (slot.mode === "online" && !options?.skipExternalMeet) {
    try {
      const space = await createGoogleMeetSpace({
        accessType: "OPEN",
        entryPointAccess: "ALL",
      });

      if (space.meetingUri) {
        await client
          .update(bookings)
          .set({
            googleMeetUrl: space.meetingUri,
            googleMeetSpaceName: space.name,
            lastModifiedAt: new Date(),
          })
          .where(eq(bookings.id, bookingId));
        googleMeetCreated = true;
      }
    } catch (meetErr: any) {
      // Record failed external outcome without rolling back committed session
      googleMeetError = meetErr?.message ?? "GOOGLE_MEET_CREATION_FAILED";
      console.error("[TUTOR_SCHEDULE] External Google Meet creation failed:", meetErr);
    }
  }

  try {
    revalidatePath("/tutor/schedule");
  } catch {
    // Ignored in test runner
  }

  return {
    success: true,
    bookingId,
    googleMeetCreated,
    googleMeetError,
  };
}

export async function createTutorSessionAction(input: CreateTutorSessionInput) {
  return executeCreateTutorSession(input);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Action 4: Move Tutor Session (Direct or Ticket based on Lock Policy)
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
  const isCurrentLocked = booking.sessionDate
    ? isSessionLocked(booking.sessionDate)
    : false;
  const isTargetLocked = isSessionLocked(targetSessionDateIso);

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
        await sendToMany(memberUserIds, {
          title: "Jadwal Tutorial Diperbarui",
          body: `Sesi dipindahkan ke ${targetSlot.dayOfWeek}, ${targetSessionDateIso} pukul ${targetSlot.startTime} - ${targetSlot.endTime}.`,
          type: "tutor_reminder",
          link: "/dashboard/schedule",
        });
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
 * Action 5: Decide Reschedule Ticket (Tutor Decision)
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
      const proposedDateToValidate = ticket.proposedDate || booking.sessionDate || "";
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
  const now = new Date();
  const sessionLockedAtDecision = booking.sessionDate
    ? isSessionLocked(booking.sessionDate)
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
          const targetSessionDateIso = ticket.proposedDate || booking.sessionDate;
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
              sessionDate: ticket.proposedDate || booking.sessionDate,
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
        await sendToMany(memberUserIds, {
          title: `Tiket ${ticket.type === "reschedule" ? "Reschedule" : "Pembatalan"} ${
            decision === "approved" ? "Disetujui" : "Ditolak"
          }`,
          body: notes || `Pengajar telah memutuskan tiket ${ticket.type}.`,
          type: "tutor_reminder",
          link: "/dashboard/schedule",
        });
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
