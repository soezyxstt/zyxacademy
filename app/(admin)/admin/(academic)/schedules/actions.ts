"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import {
  user,
  courses,
  bookings,
  bookingAuditLogs,
  bookingRescheduleTickets,
  bookingTicketMessages,
  academicSchedules,
  groups,
  tutorCourses,
  tutorSlots,
  penggunaPeran,
  peran,
} from "@/db/schema";
import { assertAdmin } from "@/lib/auth/admin-guards";
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  lt,
  or,
  sql,
} from "drizzle-orm";
import {
  getJakartaNow,
  getWeekScheduleDays,
  ensureGoogleMeetForBooking,
} from "@/lib/schedule-lock";
import {
  addTutorialDays,
  getTutorialWeekRange,
  isTutorialWeekLocked,
} from "@/lib/schedule/week-policy";
import {
  checkActiveGroupCourseEligibility,
  checkCanonicalTutorAssignment,
  countsTowardGroupWeeklyQuota,
  doTutorSlotsOverlap,
  getIndonesianDayFromDate,
  validateSlotDuration,
  validateSlotWeekdayDate,
} from "@/lib/schedule/tutor-policy";
import { recordMutationAudit } from "@/lib/audit/mutasi";
import { type DbExecutor } from "@/lib/auth/tutor-access";
const generateRequestId = randomUUID;
import { dualWriteTutorAssignment, revokeCanonicalTutorCourseAssignments } from "@/lib/migrasi/repository-kompatibilitas";
import { buildAdminCoverage } from "@/lib/schedule/admin-coverage";
import {
  normalizeAdminOverrideReason,
  normalizeAdminWeekOffset,
} from "@/lib/schedule/admin-operations";

function normalizeWeekOffset(value: unknown): number {
  return normalizeAdminWeekOffset(value);
}

function requireReason(reason: unknown): string | null {
  return normalizeAdminOverrideReason(reason);
}

function revalidateAdminSchedulePaths(paths: string[]) {
  try {
    for (const path of paths) revalidatePath(path);
  } catch {
    // Server actions have an incremental cache context. Pure action tests do not.
  }
}

function isoRangeStart(dateIso: string): Date {
  return new Date(`${dateIso}T00:00:00.000+07:00`);
}

export async function getAdminScheduleData(rawWeekOffset = 0) {
  await assertAdmin();

  const weekOffset = normalizeWeekOffset(rawWeekOffset);
  const anchorDate = new Date(getJakartaNow());
  anchorDate.setDate(anchorDate.getDate() + weekOffset * 7);

  const weekInfo = getWeekScheduleDays(anchorDate);
  const weekRange = getTutorialWeekRange(weekInfo.days[0].dateIso);
  const rangeStart = isoRangeStart(weekRange.startIso);
  const rangeEnd = new Date(isoRangeStart(addTutorialDays(weekRange.endIso, 1)).getTime() - 1);
  const isWeekLocked = isTutorialWeekLocked(weekRange.startIso, new Date());

  const [allTutors, allCourses, allGroups, allSlots, allBookings, allAcademicSchedules, legacyRows] =
    await Promise.all([
      (async () => {
        const tutorPenggunaRows = await db
          .select({ penggunaId: penggunaPeran.penggunaId })
          .from(penggunaPeran)
          .innerJoin(peran, eq(penggunaPeran.peranId, peran.id))
          .where(eq(peran.code, "tutor"));

        const tutorIds = new Set(tutorPenggunaRows.map((r) => r.penggunaId));
        const legacyTeacherRows = await db
          .select({ id: user.id })
          .from(user)
          .where(eq(user.role, "teacher"));
        for (const r of legacyTeacherRows) tutorIds.add(r.id);

        if (tutorIds.size === 0) return [];

        return db.query.user.findMany({
          where: inArray(user.id, Array.from(tutorIds)),
          with: {
            tutorCourses: {
              with: { course: true },
            },
          },
        });
      })(),
      db.select().from(courses),
      db.query.groups.findMany({
        with: {
          courses: { with: { course: true } },
          members: { with: { user: true } },
        },
      }),
      db.query.tutorSlots.findMany({
        where: and(
          isNotNull(tutorSlots.sessionDate),
          gte(tutorSlots.sessionDate, weekRange.startIso),
          lte(tutorSlots.sessionDate, weekRange.endIso),
        ),
        with: {
          tutor: true,
          booking: {
            with: {
              group: true,
              course: true,
              student: true,
              lastModifier: true,
              resources: true,
            },
          },
        },
      }),
      db.query.bookings.findMany({
        where: and(
          isNotNull(bookings.sessionDate),
          gte(bookings.sessionDate, weekRange.startIso),
          lte(bookings.sessionDate, weekRange.endIso),
        ),
        with: {
          slot: { with: { tutor: true } },
          course: true,
          group: { with: { members: { with: { user: true } } } },
          student: true,
          lastModifier: true,
          completedBy: true,
          resources: true,
          auditLogs: {
            with: { actor: true },
            orderBy: [desc(bookingAuditLogs.createdAt)],
          },
          rescheduleTickets: {
            with: {
              requestedBy: true,
              tutor: true,
              proposedSlot: true,
              messages: { with: { sender: true } },
            },
            orderBy: [desc(bookingRescheduleTickets.createdAt)],
          },
        },
        orderBy: [desc(bookings.bookedAt)],
      }),
      db.query.academicSchedules.findMany({
        where: and(
          eq(academicSchedules.status, "published"),
          lte(academicSchedules.startDate, rangeEnd),
          or(isNull(academicSchedules.endDate), gte(academicSchedules.endDate, rangeStart)),
        ),
        with: { course: true, creator: true },
        orderBy: [desc(academicSchedules.startDate)],
      }),
      db
        .select({ count: sql<number>`count(*)` })
        .from(tutorSlots)
        .leftJoin(bookings, eq(bookings.slotId, tutorSlots.id))
        .where(and(isNull(tutorSlots.sessionDate), isNull(bookings.id))),
    ]);

  const bookingIds = allBookings.map((booking) => booking.id);
  const ticketScope = [];
  if (bookingIds.length > 0) {
    ticketScope.push(inArray(bookingRescheduleTickets.bookingId, bookingIds));
  }
  ticketScope.push(
    and(
      isNotNull(bookingRescheduleTickets.proposedDate),
      gte(bookingRescheduleTickets.proposedDate, weekRange.startIso),
      lte(bookingRescheduleTickets.proposedDate, weekRange.endIso),
    ),
  );

  const [allTickets, allAuditLogs] = await Promise.all([
    db.query.bookingRescheduleTickets.findMany({
      where: or(...ticketScope),
      with: {
        booking: { with: { course: true, group: true } },
        requestedBy: true,
        tutor: true,
        proposedSlot: true,
        messages: {
          with: { sender: true },
          orderBy: [desc(bookingTicketMessages.createdAt)],
        },
      },
      orderBy: [desc(bookingRescheduleTickets.createdAt)],
    }),
    bookingIds.length > 0
      ? db.query.bookingAuditLogs.findMany({
          where: inArray(bookingAuditLogs.bookingId, bookingIds),
          with: {
            actor: true,
            booking: { with: { course: true, group: true } },
          },
          orderBy: [desc(bookingAuditLogs.createdAt)],
          limit: 100,
        })
      : Promise.resolve([]),
  ]);

  return {
    weekOffset,
    weekInfo,
    weekRange: { startIso: weekRange.startIso, endIso: weekRange.endIso },
    isWeekLocked,
    tutors: allTutors,
    courses: allCourses,
    groups: allGroups,
    slots: allSlots,
    bookings: allBookings,
    tickets: allTickets,
    academicSchedules: allAcademicSchedules,
    auditLogs: allAuditLogs,
    coverage: buildAdminCoverage(allTutors, allSlots),
    legacyNullDateSlotCount: Number(legacyRows[0]?.count ?? 0),
  };
}

export interface AdminScheduleMutationOptions {
  actorId?: string;
  executor?: DbExecutor;
  now?: Date;
}

interface AdminActorContext {
  actorId: string;
  actorName: string | null;
  actorRoles: string[];
  client: typeof db;
}

async function getAdminActorContext(
  options?: AdminScheduleMutationOptions,
): Promise<AdminActorContext> {
  const client = (options?.executor ?? db) as typeof db;
  let actorId = options?.actorId?.trim() || "";

  if (!actorId || !options?.executor) {
    const authResult = await assertAdmin();
    actorId = authResult.user.id;
  }

  const actorRows = await client
    .select({ id: user.id, name: user.name, role: user.role })
    .from(user)
    .where(eq(user.id, actorId))
    .limit(1);
  if (actorRows.length === 0) throw new Error("USER_NOT_FOUND");

  const roleRows = await client
    .select({ code: peran.code })
    .from(penggunaPeran)
    .innerJoin(peran, eq(penggunaPeran.peranId, peran.id))
    .where(eq(penggunaPeran.penggunaId, actorId));
  const roles = new Set(roleRows.map((row) => row.code));
  if (actorRows[0].role === "admin") roles.add("admin");
  if (!roles.has("admin")) throw new Error("FORBIDDEN_ADMIN_REQUIRED");

  return {
    actorId,
    actorName: actorRows[0].name ?? null,
    actorRoles: Array.from(roles),
    client,
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /unique|constraint failed/i.test(message);
}

type AdminAvailabilityInput = {
  tutorId: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  mode: "online" | "offline";
  location?: string | null;
  reason: string;
};

export async function executeAdminCreateTutorAvailability(
  input: AdminAvailabilityInput,
  options?: AdminScheduleMutationOptions,
) {
  const actor = await getAdminActorContext(options);
  const requestId = generateRequestId();
  const tutorId = typeof input.tutorId === "string" ? input.tutorId.trim() : "";
  const sessionDate = typeof input.sessionDate === "string" ? input.sessionDate.trim() : "";
  const startTime = typeof input.startTime === "string" ? input.startTime.trim() : "";
  const endTime = typeof input.endTime === "string" ? input.endTime.trim() : "";
  const mode = input.mode;
  const location = typeof input.location === "string" ? input.location.trim() : "";
  const reason = requireReason(input.reason);

  if (!reason) {
    return { success: false, error: "Alasan override wajib diisi.", reason: "REASON_REQUIRED" };
  }
  if (!tutorId || !sessionDate) {
    return { success: false, error: "Tutor dan tanggal sesi wajib diisi.", reason: "TUTOR_AND_DATE_REQUIRED" };
  }
  if (mode !== "online" && mode !== "offline") {
    return { success: false, error: "Mode sesi wajib dipilih.", reason: "MODE_REQUIRED" };
  }

  const duration = validateSlotDuration(startTime, endTime);
  if (!duration.isValid) {
    return {
      success: false,
      error: "Durasi slot harus tepat 90 menit.",
      reason: duration.reason ?? "INVALID_DURATION_NOT_90_MINUTES",
    };
  }
  if (mode === "offline" && !location) {
    return {
      success: false,
      error: "Lokasi wajib diisi untuk slot offline.",
      reason: "LOCATION_REQUIRED_FOR_OFFLINE",
    };
  }

  let dayOfWeek: ReturnType<typeof getIndonesianDayFromDate>;
  try {
    dayOfWeek = getIndonesianDayFromDate(sessionDate);
  } catch {
    return { success: false, error: "Tanggal sesi tidak valid.", reason: "INVALID_SESSION_DATE" };
  }
  const weekdayCheck = validateSlotWeekdayDate(sessionDate, dayOfWeek);
  if (!weekdayCheck.isValid) {
    return {
      success: false,
      error: "Tanggal sesi tidak valid.",
      reason: weekdayCheck.reason ?? "INVALID_SESSION_DATE",
    };
  }

  const existingTutor = await actor.client
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, tutorId))
    .limit(1);
  if (existingTutor.length === 0) {
    return { success: false, error: "Tutor tidak ditemukan.", reason: "TUTOR_NOT_FOUND" };
  }

  const tutorRoleRows = await actor.client
    .select({ code: peran.code })
    .from(penggunaPeran)
    .innerJoin(peran, eq(penggunaPeran.peranId, peran.id))
    .where(eq(penggunaPeran.penggunaId, tutorId));
  const isTutor = tutorRoleRows.some((row) => row.code === "tutor") ||
    (await actor.client.select({ role: user.role }).from(user).where(eq(user.id, tutorId)).limit(1))[0]?.role === "teacher";
  if (!isTutor) {
    return { success: false, error: "Pengguna yang dipilih bukan tutor.", reason: "NOT_A_TUTOR" };
  }

  const now = options?.now ?? new Date();
  try {
    const slotId = await actor.client.transaction(async (tx) => {
      const existingSlots = await tx
        .select({ id: tutorSlots.id, startTime: tutorSlots.startTime, endTime: tutorSlots.endTime })
        .from(tutorSlots)
        .where(and(eq(tutorSlots.tutorId, tutorId), eq(tutorSlots.sessionDate, sessionDate)));

      if (existingSlots.some((slot) => doTutorSlotsOverlap(startTime, endTime, slot.startTime, slot.endTime))) {
        throw new Error("TUTOR_SLOT_OVERLAP");
      }

      const newSlotId = generateRequestId();
      await tx.insert(tutorSlots).values({
        id: newSlotId,
        tutorId,
        dayOfWeek,
        startTime,
        endTime,
        mode,
        location: mode === "offline" ? location : null,
        sessionDate,
        createdAt: now,
      });

      await recordMutationAudit({
        actorId: actor.actorId,
        actorRoles: actor.actorRoles,
        courseId: "global",
        entityType: "tutor_slot",
        entityId: newSlotId,
        entityVersion: 1,
        action: "admin.tutor_slot.create_override",
        outcome: "success",
        requestId,
        reason,
        before: null,
        after: {
          id: newSlotId,
          tutorId,
          sessionDate,
          dayOfWeek,
          startTime,
          endTime,
          mode,
          location: mode === "offline" ? location : null,
        },
      }, tx);

      return newSlotId;
    });

    revalidateAdminSchedulePaths(["/admin/schedules", "/tutor/schedule"]);
    return { success: true, slotId };
  } catch (error) {
    if (error instanceof Error && error.message === "TUTOR_SLOT_OVERLAP") {
      return { success: false, error: "Slot tutor bertumpang tindih.", reason: "TUTOR_SLOT_OVERLAP" };
    }
    if (isUniqueConstraintError(error)) {
      return { success: false, error: "Slot tutor sudah ada.", reason: "DUPLICATE_TUTOR_SLOT" };
    }
    console.error("Admin tutor availability override error:", error);
    return { success: false, error: "Gagal membuat availability tutor.", reason: "DATABASE_ERROR" };
  }
}

export type AdminAssignTutorialSessionInput = {
  slotId: string;
  groupId: string;
  courseId: string;
  reason: string;
  topic?: string | null;
};

export async function executeAdminAssignTutorialSession(
  input: AdminAssignTutorialSessionInput,
  options?: AdminScheduleMutationOptions,
) {
  const actor = await getAdminActorContext(options);
  const requestId = generateRequestId();
  const slotId = typeof input.slotId === "string" ? input.slotId.trim() : "";
  const groupId = typeof input.groupId === "string" ? input.groupId.trim() : "";
  const courseId = typeof input.courseId === "string" ? input.courseId.trim() : "";
  const reason = requireReason(input.reason);
  if (!reason) return { success: false, error: "Alasan override wajib diisi.", reason: "REASON_REQUIRED" };
  if (!slotId || !groupId || !courseId) {
    return { success: false, error: "Slot, kelompok, dan mata kuliah wajib diisi.", reason: "ASSIGNMENT_FIELDS_REQUIRED" };
  }

  const now = options?.now ?? new Date();
  try {
    const result = await actor.client.transaction(async (tx) => {
      const slot = await tx.query.tutorSlots.findFirst({ where: eq(tutorSlots.id, slotId) });
      if (!slot) throw new Error("SLOT_NOT_FOUND");
      if (!slot.sessionDate) throw new Error("LEGACY_SLOT_NO_DATE");

      const duration = validateSlotDuration(slot.startTime, slot.endTime);
      if (!duration.isValid) throw new Error("INVALID_DURATION_NOT_90_MINUTES");
      const weekdayCheck = validateSlotWeekdayDate(slot.sessionDate, slot.dayOfWeek);
      if (!weekdayCheck.isValid) throw new Error("INVALID_SESSION_DATE");

      const existingBooking = await tx
        .select({ id: bookings.id })
        .from(bookings)
        .where(eq(bookings.slotId, slotId))
        .limit(1);
      if (existingBooking.length > 0) throw new Error("SLOT_ALREADY_BOOKED");

      const assignment = await checkCanonicalTutorAssignment(
        slot.tutorId,
        courseId,
        { allowAdmin: true },
        tx,
      );
      if (!assignment.isAssigned) throw new Error("TUTOR_NOT_ASSIGNED_TO_COURSE");

      const eligibility = await checkActiveGroupCourseEligibility(groupId, courseId, tx);
      if (!eligibility.isEligible || !eligibility.representative) {
        throw new Error(eligibility.reason ?? "GROUP_NOT_ELIGIBLE");
      }

      const weeklyCount = await tx
        .select({ value: sql<number>`count(*)` })
        .from(bookings)
        .where(
          and(
            eq(bookings.groupId, groupId),
            gte(bookings.sessionDate, getTutorialWeekRange(slot.sessionDate).startIso),
            lte(bookings.sessionDate, getTutorialWeekRange(slot.sessionDate).endIso),
            countsTowardGroupWeeklyQuota(),
          ),
        );
      if (Number(weeklyCount[0]?.value ?? 0) >= eligibility.weeklyQuotaSessions) {
        throw new Error("WEEKLY_QUOTA_EXCEEDED");
      }

      const quotaClaim = await tx
        .update(groups)
        .set({ usedQuotaSessions: sql`${groups.usedQuotaSessions} + 1`, updatedAt: now })
        .where(and(
          eq(groups.id, groupId),
          lt(groups.usedQuotaSessions, groups.totalQuotaSessions),
        ));
      if ((quotaClaim.rowsAffected ?? 0) === 0) throw new Error("TOTAL_QUOTA_EXCEEDED");

      const bookingId = generateRequestId();
      const resolvedCourseId = eligibility.legacyCourseId ?? eligibility.courseId ?? courseId;
      await tx.insert(bookings).values({
        id: bookingId,
        slotId,
        studentId: eligibility.representative.userId,
        courseId: resolvedCourseId,
        groupId,
        status: "scheduled",
        sessionDate: slot.sessionDate,
        startTime: slot.startTime,
        endTime: slot.endTime,
        mode: slot.mode,
        location: slot.location ?? null,
        topic: typeof input.topic === "string" ? input.topic.trim() || null : null,
        lastModifiedBy: actor.actorId,
        lastModifiedAt: now,
        bookedAt: now,
      });

      const after = {
        bookingId,
        slotId,
        groupId,
        courseId: resolvedCourseId,
        sessionDate: slot.sessionDate,
        startTime: slot.startTime,
        endTime: slot.endTime,
      };
      await tx.insert(bookingAuditLogs).values({
        id: generateRequestId(),
        bookingId,
        groupId,
        actorId: actor.actorId,
        action: "ADMIN_TUTORIAL_SESSION_ASSIGNED",
        summary: `Admin ${actor.actorName ?? "Admin"} menetapkan sesi tutorial secara override`,
        metadata: { reason, before: null, after },
        createdAt: now,
      });
      await recordMutationAudit({
        actorId: actor.actorId,
        actorRoles: actor.actorRoles,
        courseId: resolvedCourseId,
        entityType: "booking",
        entityId: bookingId,
        entityVersion: 1,
        action: "admin.tutorial_session.assign_override",
        outcome: "success",
        requestId,
        reason,
        before: null,
        after,
      }, tx);
      return { bookingId };
    });

    revalidateAdminSchedulePaths(["/admin/schedules", "/tutor/schedule", "/dashboard/schedule"]);
    return { success: true, ...result };
  } catch (error) {
    const code = error instanceof Error ? error.message : "DATABASE_ERROR";
    const messages: Record<string, string> = {
      SLOT_NOT_FOUND: "Slot tidak ditemukan.",
      LEGACY_SLOT_NO_DATE: "Slot legacy tanpa tanggal tidak dapat digunakan.",
      INVALID_DURATION_NOT_90_MINUTES: "Durasi slot harus tepat 90 menit.",
      INVALID_SESSION_DATE: "Tanggal slot tidak valid.",
      SLOT_ALREADY_BOOKED: "Slot sudah terisi.",
      TUTOR_NOT_ASSIGNED_TO_COURSE: "Tutor belum ditugaskan pada mata kuliah ini.",
      GROUP_NOT_ELIGIBLE: "Kelompok tidak aktif atau tidak terdaftar pada mata kuliah ini.",
      WEEKLY_QUOTA_EXCEEDED: "Kuota sesi mingguan kelompok sudah tercapai.",
      TOTAL_QUOTA_EXCEEDED: "Kuota total sesi kelompok sudah tercapai.",
    };
    if (messages[code]) return { success: false, error: messages[code], reason: code };
    if (isUniqueConstraintError(error)) return { success: false, error: "Slot baru saja diambil.", reason: "SLOT_ALREADY_BOOKED" };
    console.error("Admin tutorial assignment override error:", error);
    return { success: false, error: "Gagal menetapkan sesi tutorial.", reason: "DATABASE_ERROR" };
  }
}

export type AdminMoveTutorialSessionInput = {
  bookingId: string;
  targetSlotId: string;
  reason: string;
};

export async function executeAdminMoveTutorialSession(
  input: AdminMoveTutorialSessionInput,
  options?: AdminScheduleMutationOptions,
) {
  const actor = await getAdminActorContext(options);
  const requestId = generateRequestId();
  const bookingId = typeof input.bookingId === "string" ? input.bookingId.trim() : "";
  const targetSlotId = typeof input.targetSlotId === "string" ? input.targetSlotId.trim() : "";
  const reason = requireReason(input.reason);
  if (!reason) return { success: false, error: "Alasan override wajib diisi.", reason: "REASON_REQUIRED" };
  if (!bookingId || !targetSlotId) return { success: false, error: "Sesi dan slot tujuan wajib diisi.", reason: "MOVE_FIELDS_REQUIRED" };

  const now = options?.now ?? new Date();
  try {
    await actor.client.transaction(async (tx) => {
      const booking = await tx.query.bookings.findFirst({
        where: eq(bookings.id, bookingId),
        with: { slot: true },
      });
      if (!booking || !booking.slot) throw new Error("BOOKING_NOT_FOUND");
      if (booking.status === "completed" || booking.status === "cancelled") throw new Error("BOOKING_TERMINAL_STATE");

      const target = await tx.query.tutorSlots.findFirst({ where: eq(tutorSlots.id, targetSlotId) });
      if (!target) throw new Error("TARGET_SLOT_NOT_FOUND");
      if (!target.sessionDate) throw new Error("LEGACY_SLOT_NO_DATE");
      if (targetSlotId === booking.slotId) throw new Error("TARGET_SLOT_SAME");
      const targetBooking = await tx.select({ id: bookings.id }).from(bookings).where(eq(bookings.slotId, targetSlotId)).limit(1);
      if (targetBooking.length > 0) throw new Error("TARGET_SLOT_BOOKED");
      if (!validateSlotDuration(target.startTime, target.endTime).isValid) throw new Error("INVALID_DURATION_NOT_90_MINUTES");
      if (!validateSlotWeekdayDate(target.sessionDate, target.dayOfWeek).isValid) throw new Error("INVALID_SESSION_DATE");
      const assignment = await checkCanonicalTutorAssignment(target.tutorId, booking.courseId, { allowAdmin: true }, tx);
      if (!assignment.isAssigned) throw new Error("TUTOR_NOT_ASSIGNED_TO_COURSE");

      const before = {
        slotId: booking.slotId,
        sessionDate: booking.sessionDate,
        startTime: booking.startTime,
        endTime: booking.endTime,
      };
      const after = {
        slotId: targetSlotId,
        sessionDate: target.sessionDate,
        startTime: target.startTime,
        endTime: target.endTime,
      };
      await tx.update(bookings).set({
        slotId: targetSlotId,
        sessionDate: target.sessionDate,
        startTime: target.startTime,
        endTime: target.endTime,
        mode: target.mode,
        location: target.location ?? null,
        lastModifiedBy: actor.actorId,
        lastModifiedAt: now,
      }).where(eq(bookings.id, bookingId));
      await tx.insert(bookingAuditLogs).values({
        id: generateRequestId(),
        bookingId,
        groupId: booking.groupId,
        actorId: actor.actorId,
        action: "ADMIN_TUTORIAL_SESSION_MOVED",
        summary: `Admin ${actor.actorName ?? "Admin"} memindahkan sesi secara override`,
        metadata: { reason, before, after },
        createdAt: now,
      });
      await recordMutationAudit({
        actorId: actor.actorId,
        actorRoles: actor.actorRoles,
        courseId: booking.courseId,
        entityType: "booking",
        entityId: bookingId,
        entityVersion: 1,
        action: "admin.tutorial_session.move_override",
        outcome: "success",
        requestId,
        reason,
        before,
        after,
      }, tx);
    });
    revalidateAdminSchedulePaths(["/admin/schedules", "/tutor/schedule", "/dashboard/schedule"]);
    return { success: true };
  } catch (error) {
    const code = error instanceof Error ? error.message : "DATABASE_ERROR";
    const messages: Record<string, string> = {
      BOOKING_NOT_FOUND: "Sesi tidak ditemukan.",
      BOOKING_TERMINAL_STATE: "Sesi yang sudah selesai atau dibatalkan tidak dapat dipindahkan.",
      TARGET_SLOT_NOT_FOUND: "Slot tujuan tidak ditemukan.",
      LEGACY_SLOT_NO_DATE: "Slot legacy tanpa tanggal tidak dapat digunakan.",
      TARGET_SLOT_SAME: "Slot tujuan harus berbeda.",
      TARGET_SLOT_BOOKED: "Slot tujuan sudah terisi.",
      INVALID_DURATION_NOT_90_MINUTES: "Durasi slot tujuan harus tepat 90 menit.",
      INVALID_SESSION_DATE: "Tanggal slot tujuan tidak valid.",
      TUTOR_NOT_ASSIGNED_TO_COURSE: "Tutor tujuan belum ditugaskan pada mata kuliah sesi.",
    };
    if (messages[code]) return { success: false, error: messages[code], reason: code };
    if (isUniqueConstraintError(error)) return { success: false, error: "Slot tujuan baru saja diambil.", reason: "TARGET_SLOT_BOOKED" };
    console.error("Admin tutorial move override error:", error);
    return { success: false, error: "Gagal memindahkan sesi tutorial.", reason: "DATABASE_ERROR" };
  }
}

export async function executeAdminCancelTutorialSession(
  input: { bookingId: string; reason: string },
  options?: AdminScheduleMutationOptions,
) {
  const actor = await getAdminActorContext(options);
  const requestId = generateRequestId();
  const bookingId = typeof input.bookingId === "string" ? input.bookingId.trim() : "";
  const reason = requireReason(input.reason);
  if (!reason) return { success: false, error: "Alasan override wajib diisi.", reason: "REASON_REQUIRED" };
  if (!bookingId) return { success: false, error: "Sesi wajib dipilih.", reason: "BOOKING_ID_REQUIRED" };

  const now = options?.now ?? new Date();
  try {
    await actor.client.transaction(async (tx) => {
      const booking = await tx.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });
      if (!booking) throw new Error("BOOKING_NOT_FOUND");
      if (booking.status === "completed" || booking.status === "cancelled") throw new Error("BOOKING_TERMINAL_STATE");
      const before = { status: booking.status, sessionDate: booking.sessionDate, slotId: booking.slotId };
      const after = { status: "cancelled", sessionDate: booking.sessionDate, slotId: booking.slotId };
      await tx.update(bookings).set({
        status: "cancelled",
        lastModifiedBy: actor.actorId,
        lastModifiedAt: now,
      }).where(eq(bookings.id, bookingId));
      await tx.insert(bookingAuditLogs).values({
        id: generateRequestId(),
        bookingId,
        groupId: booking.groupId,
        actorId: actor.actorId,
        action: "ADMIN_TUTORIAL_SESSION_CANCELLED",
        summary: `Admin ${actor.actorName ?? "Admin"} membatalkan sesi secara override`,
        metadata: { reason, before, after },
        createdAt: now,
      });
      await recordMutationAudit({
        actorId: actor.actorId,
        actorRoles: actor.actorRoles,
        courseId: booking.courseId,
        entityType: "booking",
        entityId: bookingId,
        entityVersion: 1,
        action: "admin.tutorial_session.cancel_override",
        outcome: "success",
        requestId,
        reason,
        before,
        after,
      }, tx);
    });
    revalidateAdminSchedulePaths(["/admin/schedules", "/tutor/schedule", "/dashboard/schedule"]);
    return { success: true };
  } catch (error) {
    const code = error instanceof Error ? error.message : "DATABASE_ERROR";
    if (code === "BOOKING_NOT_FOUND") return { success: false, error: "Sesi tidak ditemukan.", reason: code };
    if (code === "BOOKING_TERMINAL_STATE") return { success: false, error: "Sesi sudah selesai atau dibatalkan.", reason: code };
    console.error("Admin tutorial cancel override error:", error);
    return { success: false, error: "Gagal membatalkan sesi tutorial.", reason: "DATABASE_ERROR" };
  }
}

export async function adminCreateTutorAvailability(input: AdminAvailabilityInput) {
  return executeAdminCreateTutorAvailability(input);
}

export async function adminAssignTutorialSession(input: AdminAssignTutorialSessionInput) {
  return executeAdminAssignTutorialSession(input);
}

export async function adminMoveTutorialSession(input: AdminMoveTutorialSessionInput) {
  return executeAdminMoveTutorialSession(input);
}

export async function adminCancelTutorialSession(input: { bookingId: string; reason: string }) {
  return executeAdminCancelTutorialSession(input);
}

export async function updateTutorCourses(targetTutorId: string, courseIds: string[]) {
  const { user: adminUser } = await assertAdmin();
  const normalizedTutorId = typeof targetTutorId === "string" ? targetTutorId.trim() : "";
  const uniqueCourseIds = [...new Set(
    (Array.isArray(courseIds) ? courseIds : [])
      .filter((courseId): courseId is string => typeof courseId === "string")
      .map((courseId) => courseId.trim())
      .filter(Boolean),
  )];

  if (!normalizedTutorId) return { success: false, error: "Tutor wajib dipilih." };

  try {
    await db.transaction(async (tx) => {
      await revokeCanonicalTutorCourseAssignments(tx, normalizedTutorId, adminUser.id);
      await tx.delete(tutorCourses).where(eq(tutorCourses.tutorId, normalizedTutorId));
      if (uniqueCourseIds.length === 0) return;

      const assignments = uniqueCourseIds.map((courseId) => ({
        id: generateRequestId(),
        tutorId: normalizedTutorId,
        courseId,
      }));
      await tx.insert(tutorCourses).values(assignments);
      for (const assignment of assignments) {
        await dualWriteTutorAssignment(
          tx,
          { ...assignment, status: "active" },
          adminUser.id,
        );
      }
    });

    revalidatePath("/admin/schedules");
    revalidatePath("/tutor/schedule");
    return { success: true };
  } catch (error) {
    console.error("Update tutor courses error:", error);
    return { success: false, error: "Gagal memperbarui mata kuliah tutorial." };
  }
}

// ── CRUD ACADEMIC SCHEDULES (Ujian Resmi ITB, Tryout, Kuis) ───────────────────

export async function createAcademicSchedule(data: {
  type: "official_exam" | "tryout" | "quiz" | "general";
  title: string;
  courseId?: string | null;
  description?: string | null;
  startDate: Date;
  endDate?: Date | null;
  location?: string | null;
  status?: "published" | "draft" | "archived";
}) {
  const authResult = await assertAdmin();
  const adminUser = authResult.user;

  try {
    const id = randomUUID();
    const now = new Date();

    await db.insert(academicSchedules).values({
      id,
      type: data.type,
      title: data.title.trim(),
      courseId: data.courseId || null,
      description: data.description?.trim() || null,
      startDate: data.startDate,
      endDate: data.endDate || null,
      location: data.location?.trim() || null,
      createdById: adminUser.id,
      status: data.status || "published",
      createdAt: now,
      updatedAt: now,
    });

    revalidatePath("/admin/schedules");
    revalidatePath("/dashboard/schedule");
    return { success: true, id };
  } catch (err: any) {
    console.error("Create academic schedule error:", err);
    return { success: false, error: "Gagal membuat jadwal akademik" };
  }
}

export async function updateAcademicSchedule(
  id: string,
  data: {
    type?: "official_exam" | "tryout" | "quiz" | "general";
    title?: string;
    courseId?: string | null;
    description?: string | null;
    startDate?: Date;
    endDate?: Date | null;
    location?: string | null;
    status?: "published" | "draft" | "archived";
  }
) {
  await assertAdmin();

  try {
    await db
      .update(academicSchedules)
      .set({
        ...(data.type ? { type: data.type } : {}),
        ...(data.title ? { title: data.title.trim() } : {}),
        ...(data.courseId !== undefined ? { courseId: data.courseId || null } : {}),
        ...(data.description !== undefined ? { description: data.description?.trim() || null } : {}),
        ...(data.startDate ? { startDate: data.startDate } : {}),
        ...(data.endDate !== undefined ? { endDate: data.endDate || null } : {}),
        ...(data.location !== undefined ? { location: data.location?.trim() || null } : {}),
        ...(data.status ? { status: data.status } : {}),
        updatedAt: new Date(),
      })
      .where(eq(academicSchedules.id, id));

    revalidatePath("/admin/schedules");
    revalidatePath("/dashboard/schedule");
    return { success: true };
  } catch (err: any) {
    console.error("Update academic schedule error:", err);
    return { success: false, error: "Gagal memperbarui jadwal akademik" };
  }
}

export async function deleteAcademicSchedule(id: string) {
  await assertAdmin();

  try {
    await db.delete(academicSchedules).where(eq(academicSchedules.id, id));
    revalidatePath("/admin/schedules");
    revalidatePath("/dashboard/schedule");
    return { success: true };
  } catch (err: any) {
    console.error("Delete academic schedule error:", err);
    return { success: false, error: "Gagal menghapus jadwal akademik" };
  }
}

// ── BATCH GOOGLE MEET AUTOMATION TRIGGER ──────────────────────────────────────

export async function adminBatchGenerateMeet() {
  await assertAdmin();

  try {
    const onlineBookings = await db.query.bookings.findMany({
      where: and(
        eq(bookings.mode, "online"),
        isNull(bookings.googleMeetUrl),
        eq(bookings.status, "scheduled")
      ),
    });

    let generatedCount = 0;
    for (const b of onlineBookings) {
      const url = await ensureGoogleMeetForBooking(b.id);
      if (url) generatedCount++;
    }

    revalidatePath("/admin/schedules");
    revalidatePath("/dashboard/schedule");
    return { success: true, count: generatedCount };
  } catch (err: any) {
    console.error("Batch generate Meet error:", err);
    return { success: false, error: "Gagal melakukan otomasi Google Meet" };
  }
}
