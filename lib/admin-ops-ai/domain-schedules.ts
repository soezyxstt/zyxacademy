import { db } from "@/db";
import {
  bookings,
  tutorSlots,
  academicSchedules,
  user,
  courses,
  groups,
} from "@/db/schema";
import { eq, and, desc, gte, lte, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { ensureGoogleMeetForBooking } from "@/lib/schedule-lock";

export interface ListSchedulesInput {
  startDate?: string;
  endDate?: string;
  courseId?: string;
  tutorId?: string;
  status?: string;
  limit?: number;
}

export async function executeListSchedules(input: ListSchedulesInput) {
  const conditions = [];
  if (input.courseId) conditions.push(eq(bookings.courseId, input.courseId.trim().toLowerCase()));
  if (input.status) conditions.push(eq(bookings.status, input.status as any));
  if (input.startDate) conditions.push(gte(bookings.sessionDate, input.startDate));
  if (input.endDate) conditions.push(lte(bookings.sessionDate, input.endDate));

  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);

  const rows = await db.query.bookings.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    with: {
      course: true,
      group: true,
      student: true,
      slot: {
        with: {
          tutor: true,
        },
      },
    },
    orderBy: [desc(bookings.sessionDate)],
    limit,
  });

  return {
    summary: `Ditemukan ${rows.length} jadwal sesi meet/tutorial.`,
    data: rows.map((b) => ({
      id: b.id,
      sessionDate: b.sessionDate,
      startTime: b.startTime,
      endTime: b.endTime,
      status: b.status,
      course: b.course?.title || b.courseId,
      tutor: b.slot?.tutor?.name || "Belum ditentukan",
      group: b.group?.name || null,
      student: b.student?.name || null,
      googleMeetUrl: b.googleMeetUrl,
      topic: b.topic,
    })),
  };
}

export interface CreateMeetSessionInput {
  tutorId: string;
  courseId: string;
  groupId?: string;
  studentId?: string;
  dateIso: string;
  timeSlot: string; // e.g. "09:00 - 10:30" or "10:00"
  topic?: string;
}

export async function executeCreateMeetSession(input: CreateMeetSessionInput, actorId?: string) {
  const cleanTutorId = input.tutorId.trim();
  const cleanCourseId = input.courseId.trim().toLowerCase();
  const dateIso = input.dateIso.trim();

  if (!cleanTutorId) throw new Error("ID Tutor wajib diisi.");
  if (!cleanCourseId) throw new Error("ID Mata Kuliah wajib diisi.");
  if (!dateIso) throw new Error("Tanggal sesi (YYYY-MM-DD) wajib diisi.");

  const tutorUser = await db.query.user.findFirst({ where: eq(user.id, cleanTutorId) });
  if (!tutorUser) throw new Error(`Tutor dengan ID '${cleanTutorId}' tidak ditemukan.`);

  const courseObj = await db.query.courses.findFirst({ where: eq(courses.id, cleanCourseId) });
  if (!courseObj) throw new Error(`Mata kuliah '${cleanCourseId}' tidak ditemukan.`);

  let targetGroupId = input.groupId?.trim();
  let targetStudentId = input.studentId?.trim();

  if (!targetGroupId && !targetStudentId) {
    const firstGroup = await db.query.groups.findFirst();
    if (firstGroup) targetGroupId = firstGroup.id;
    else {
      const firstStudent = await db.query.user.findFirst({ where: eq(user.role, "student") });
      if (firstStudent) targetStudentId = firstStudent.id;
    }
  }

  // Parse time
  const timeParts = input.timeSlot.split("-").map((s) => s.trim());
  const startTime = timeParts[0] || "10:00";
  const endTime = timeParts[1] || "11:30";

  // Days of week in Indonesian
  const dayIndex = new Date(dateIso).getDay();
  const dayNames = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const dayOfWeek = dayNames[dayIndex] || "Senin";

  // Create slot first
  const slotId = `slot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  await db.insert(tutorSlots).values({
    id: slotId,
    tutorId: cleanTutorId,
    dayOfWeek,
    startTime,
    endTime,
    sessionDate: dateIso,
    mode: "online",
  });

  // Create booking
  const bookingId = `book-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  await db.insert(bookings).values({
    id: bookingId,
    slotId,
    courseId: cleanCourseId,
    groupId: targetGroupId || "grp-default",
    studentId: targetStudentId || cleanTutorId,
    status: "scheduled",
    sessionDate: dateIso,
    startTime,
    endTime,
    mode: "online",
    topic: input.topic?.trim() || "Tutorial Zyx Ops AI",
    lastModifiedBy: actorId ?? cleanTutorId,
  });

  // Try auto-generate meet link
  let meetUrl: string | null = null;
  try {
    meetUrl = await ensureGoogleMeetForBooking(bookingId);
  } catch {
    // If Google Meet integration not configured in env, ignore
  }

  return {
    summary: `Sesi meet berhasil dijadwalkan untuk mata kuliah '${courseObj.title}' bersama tutor '${tutorUser.name}' pada ${dateIso} jam ${startTime} - ${endTime}.${meetUrl ? ` Google Meet link: ${meetUrl}` : ""}`,
    data: {
      bookingId,
      slotId,
      tutorName: tutorUser.name,
      courseTitle: courseObj.title,
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
  const bookingId = input.bookingId.trim();
  if (!bookingId) throw new Error("ID Booking wajib diisi.");

  const booking = await db.query.bookings.findFirst({
    where: eq(bookings.id, bookingId),
    with: { course: true, slot: { with: { tutor: true } } },
  });

  if (!booking) throw new Error(`Jadwal dengan ID '${bookingId}' tidak ditemukan.`);

  if (input.action === "cancel") {
    await db
      .update(bookings)
      .set({
        status: "cancelled",
        lastModifiedBy: actorId ?? "admin",
        lastModifiedAt: new Date(),
      })
      .where(eq(bookings.id, bookingId));

    return {
      summary: `Sesi meet '${booking.course?.title}' pada ${booking.sessionDate} berhasil dibatalkan.`,
      data: { bookingId, status: "cancelled", reason: input.reason },
    };
  }

  // Reschedule
  if (!input.newDateIso) throw new Error("Tanggal baru wajib diisi untuk reschedule.");
  const timeParts = (input.newTimeSlot || "").split("-").map((s) => s.trim());
  const newStartTime = timeParts[0] || booking.startTime || "10:00";
  const newEndTime = timeParts[1] || booking.endTime || "11:30";

  await db
    .update(bookings)
    .set({
      sessionDate: input.newDateIso,
      startTime: newStartTime,
      endTime: newEndTime,
      status: "rescheduled",
      lastModifiedBy: actorId ?? "admin",
      lastModifiedAt: new Date(),
    })
    .where(eq(bookings.id, bookingId));

  return {
    summary: `Sesi meet berhasil dipindahkan ke tanggal ${input.newDateIso} jam ${newStartTime} - ${newEndTime}.`,
    data: { bookingId, status: "rescheduled", date: input.newDateIso, time: `${newStartTime} - ${newEndTime}` },
  };
}

export interface ListTutorAvailabilityInput {
  tutorId?: string;
  weekOffset?: number;
}

export async function executeListTutorAvailability(input: ListTutorAvailabilityInput) {
  const conditions = [];
  if (input.tutorId) conditions.push(eq(tutorSlots.tutorId, input.tutorId.trim()));

  const slots = await db.query.tutorSlots.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    with: {
      tutor: true,
      booking: true,
    },
    limit: 50,
  });

  const availableSlots = slots.filter((s) => !s.booking || s.booking.status === "cancelled");

  return {
    summary: `Ditemukan ${availableSlots.length} slot waktu tutor yang kosong/tersedia.`,
    data: availableSlots.map((s) => ({
      slotId: s.id,
      tutorName: s.tutor.name,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      mode: s.mode,
      sessionDate: s.sessionDate,
    })),
  };
}
