import { db } from "@/db";
import { bookings, tutorSlots } from "@/db/schema";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { ensureGoogleMeetForBooking } from "@/lib/schedule-lock";
import {
  executeAdminAssignTutorialSession,
  executeAdminCancelTutorialSession,
  executeAdminCreateTutorAvailability,
  executeAdminMoveTutorialSession,
  type AdminScheduleMutationOptions,
} from "@/app/(admin)/admin/(academic)/schedules/actions";

export interface ListSchedulesInput {
  startDate?: string;
  endDate?: string;
  courseId?: string;
  tutorId?: string;
  status?: string;
  limit?: number;
}

function adminMutationOptions(actorId?: string): AdminScheduleMutationOptions | undefined {
  const normalized = actorId?.trim();
  return normalized ? { actorId: normalized, executor: db } : undefined;
}

function parseTimeSlot(value: string | undefined, fallbackStart = "10:00", fallbackEnd = "11:30") {
  const timeParts = (value || "").split("-").map((part) => part.trim()).filter(Boolean);
  return {
    startTime: timeParts[0] || fallbackStart,
    endTime: timeParts[1] || fallbackEnd,
  };
}

export async function executeListSchedules(input: ListSchedulesInput) {
  const conditions = [];
  if (input.courseId) conditions.push(eq(bookings.courseId, input.courseId.trim()));
  if (input.status) conditions.push(eq(bookings.status, input.status as any));
  if (input.startDate) conditions.push(gte(bookings.sessionDate, input.startDate.trim()));
  if (input.endDate) conditions.push(lte(bookings.sessionDate, input.endDate.trim()));
  if (input.tutorId) {
    const slotRows = await db
      .select({ id: tutorSlots.id })
      .from(tutorSlots)
      .where(eq(tutorSlots.tutorId, input.tutorId.trim()));
    if (slotRows.length === 0) {
      return { summary: "Tidak ada jadwal untuk tutor tersebut.", data: [] };
    }
  }

  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
  const rows = await db.query.bookings.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    with: {
      course: true,
      group: true,
      student: true,
      slot: { with: { tutor: true } },
    },
    orderBy: [desc(bookings.sessionDate)],
    limit,
  });

  const filteredRows = input.tutorId
    ? rows.filter((booking) => booking.slot?.tutorId === input.tutorId?.trim())
    : rows;

  return {
    summary: `Ditemukan ${filteredRows.length} jadwal sesi meet/tutorial.`,
    data: filteredRows.map((booking) => ({
      id: booking.id,
      sessionDate: booking.sessionDate,
      startTime: booking.startTime,
      endTime: booking.endTime,
      status: booking.status,
      course: booking.course?.title || booking.courseId,
      tutor: booking.slot?.tutor?.name || "Belum ditentukan",
      group: booking.group?.name || null,
      student: booking.student?.name || null,
      googleMeetUrl: booking.googleMeetUrl,
      topic: booking.topic,
    })),
  };
}

export interface CreateMeetSessionInput {
  tutorId: string;
  courseId: string;
  groupId?: string;
  studentId?: string;
  dateIso: string;
  timeSlot: string;
  topic?: string;
}

/**
 * Ops AI is an adapter only. It must not insert tutor_slots/bookings directly;
 * the guarded admin scheduling actions own validation, quota and audit writes.
 */
export async function executeCreateMeetSession(input: CreateMeetSessionInput, actorId?: string) {
  const tutorId = input.tutorId?.trim();
  const courseId = input.courseId?.trim();
  const groupId = input.groupId?.trim();
  const dateIso = input.dateIso?.trim();
  const reason = "Ops AI: buat sesi tutorial";

  if (!tutorId) throw new Error("ID Tutor wajib diisi.");
  if (!courseId) throw new Error("ID Mata Kuliah wajib diisi.");
  if (!groupId) {
    throw new Error("ID Kelompok wajib diisi. Ops AI tidak boleh memilih kelompok atau murid secara otomatis.");
  }
  if (!dateIso) throw new Error("Tanggal sesi (YYYY-MM-DD) wajib diisi.");

  const { startTime, endTime } = parseTimeSlot(input.timeSlot);
  const options = adminMutationOptions(actorId);
  const availability = await executeAdminCreateTutorAvailability(
    { tutorId, sessionDate: dateIso, startTime, endTime, mode: "online", reason },
    options,
  );
  if (!availability.success || !availability.slotId) {
    throw new Error(availability.error || "Gagal membuat slot tutor melalui domain scheduling.");
  }

  const booking = await executeAdminAssignTutorialSession(
    {
      slotId: availability.slotId,
      groupId,
      courseId,
      topic: input.topic?.trim() || null,
      reason,
    },
    options,
  );
  if (!booking.success || !booking.bookingId) {
    throw new Error(booking.error || "Gagal menetapkan sesi tutorial melalui domain scheduling.");
  }

  const meetUrl = await ensureGoogleMeetForBooking(booking.bookingId).catch(() => null);
  return {
    summary: `Sesi tutorial berhasil dibuat pada ${dateIso} jam ${startTime} - ${endTime}.${meetUrl ? ` Google Meet: ${meetUrl}` : ""}`,
    data: {
      bookingId: booking.bookingId,
      slotId: availability.slotId,
      dateIso,
      time: `${startTime} - ${endTime}`,
      googleMeetUrl: meetUrl,
    },
  };
}

export interface RescheduleOrCancelMeetInput {
  bookingId: string;
  action: "reschedule" | "cancel";
  newDateIso?: string;
  newTimeSlot?: string;
  reason?: string;
}

export async function executeRescheduleOrCancelMeet(input: RescheduleOrCancelMeetInput, actorId?: string) {
  const bookingId = input.bookingId?.trim();
  if (!bookingId) throw new Error("ID Booking wajib diisi.");

  const current = await db.query.bookings.findFirst({
    where: eq(bookings.id, bookingId),
    with: { course: true, slot: { with: { tutor: true } } },
  });
  if (!current || !current.slot) throw new Error(`Jadwal dengan ID '${bookingId}' tidak ditemukan.`);

  const reason = input.reason?.trim() || "Ops AI: perubahan jadwal";
  const options = adminMutationOptions(actorId);

  if (input.action === "cancel") {
    const cancelled = await executeAdminCancelTutorialSession({ bookingId, reason }, options);
    if (!cancelled.success) throw new Error(cancelled.error || "Gagal membatalkan sesi.");
    return {
      summary: `Sesi '${current.course?.title || current.courseId}' pada ${current.sessionDate} berhasil dibatalkan.`,
      data: { bookingId, status: "cancelled", reason },
    };
  }

  const newDateIso = input.newDateIso?.trim();
  if (!newDateIso) throw new Error("Tanggal baru wajib diisi untuk reschedule.");
  const { startTime, endTime } = parseTimeSlot(
    input.newTimeSlot,
    current.startTime || current.slot.startTime,
    current.endTime || current.slot.endTime,
  );

  const exactSlots = await db.query.tutorSlots.findMany({
    where: and(
      eq(tutorSlots.tutorId, current.slot.tutorId),
      eq(tutorSlots.sessionDate, newDateIso),
      eq(tutorSlots.startTime, startTime),
      eq(tutorSlots.endTime, endTime),
    ),
    with: { booking: true },
    limit: 5,
  });
  let targetSlotId = exactSlots.find((slot) => !slot.booking)?.id || null;

  if (!targetSlotId) {
    const availability = await executeAdminCreateTutorAvailability(
      {
        tutorId: current.slot.tutorId,
        sessionDate: newDateIso,
        startTime,
        endTime,
        mode: current.slot.mode,
        location: current.slot.location,
        reason,
      },
      options,
    );
    if (!availability.success || !availability.slotId) {
      throw new Error(availability.error || "Gagal menyiapkan slot tujuan.");
    }
    targetSlotId = availability.slotId;
  }

  const moved = await executeAdminMoveTutorialSession({ bookingId, targetSlotId, reason }, options);
  if (!moved.success) throw new Error(moved.error || "Gagal memindahkan sesi.");

  return {
    summary: `Sesi berhasil dipindahkan ke ${newDateIso} jam ${startTime} - ${endTime}.`,
    data: { bookingId, status: "scheduled", date: newDateIso, time: `${startTime} - ${endTime}`, targetSlotId },
  };
}

export interface ListTutorAvailabilityInput {
  tutorId?: string;
  weekOffset?: number;
}

export async function executeListTutorAvailability(input: ListTutorAvailabilityInput) {
  const slots = await db.query.tutorSlots.findMany({
    where: input.tutorId ? eq(tutorSlots.tutorId, input.tutorId.trim()) : undefined,
    with: { tutor: true, booking: true },
    limit: 50,
  });
  const availableSlots = slots.filter((slot) => !slot.booking);

  return {
    summary: `Ditemukan ${availableSlots.length} slot waktu tutor yang tersedia.`,
    data: availableSlots.map((slot) => ({
      slotId: slot.id,
      tutorName: slot.tutor.name,
      dayOfWeek: slot.dayOfWeek,
      startTime: slot.startTime,
      endTime: slot.endTime,
      mode: slot.mode,
      sessionDate: slot.sessionDate,
    })),
  };
}
