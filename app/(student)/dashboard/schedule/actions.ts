"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import {
  user,
  groups,
  groupMembers,
  tutorSlots,
  bookings,
  bookingResources,
  bookingAuditLogs,
  bookingRescheduleTickets,
  bookingTicketMessages,
  academicSchedules,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { getPeranCodes } from "@/lib/auth/authorization";
import { eq, ne, and, desc, inArray, sql, gte, lte, lt, gt, isNotNull, isNull, or } from "drizzle-orm";
import { daysFrom } from "@/lib/date-utils";
import {
  getJakartaNow,
  getWeekScheduleDays,
  ensureGoogleMeetForBooking,
  fetchLinkPreview,
  getIsoWeekRange,
} from "@/lib/schedule-lock";
import {
  CANCELLED_QUOTA_REFUND_LOG_ACTION,
  checkActiveGroupCourseEligibility,
  checkCanonicalTutorAssignment,
  countsTowardGroupWeeklyQuota,
  isTerminalBookingStatus,
  terminalStatusGuard,
  validateSlotDuration,
  validateSlotWeekdayDate,
} from "@/lib/schedule/tutor-policy";
import { executeDecideTutorRescheduleTicket } from "@/app/(tutor)/tutor/schedule/actions";
import { recordMutationAudit } from "@/lib/audit/mutasi";
import { type DbExecutor } from "@/lib/auth/tutor-access";
import { listStudentEnrollments } from "@/lib/student/course-catalog";
import {
  canStudentBook,
  getTutorialWeekPhase,
  isTutorialWeekLocked,
} from "@/lib/schedule/week-policy";
import {
  addBookingResource,
  deleteBookingResource,
  getBookingResources,
  type AddBookingResourceInput,
} from "@/lib/schedule/session-resources";

function isBookingSlotUniqueViolation(error: unknown): boolean {
  const message = [
    error instanceof Error ? error.message : String(error),
    (error as { code?: string })?.code ?? "",
  ].join(" ");
  return /unique|constraint failed/i.test(message) && /slot|booking/i.test(message);
}

async function requireUser() {
  const h = await headers();
  const session = await auth.api.getSession({
    headers: h,
  });

  if (!session?.user?.id) {
    throw new Error("UNAUTHORIZED");
  }

  return session.user;
}

// ── GET SCHEDULE DATA ─────────────────────────────────────────────────────────

export async function getScheduleData(weekOffset = 0) {
  const currentUser = await requireUser();

  const dbUser = await db.query.user.findFirst({
    where: eq(user.id, currentUser.id),
  });

  if (!dbUser) {
    throw new Error("USER_NOT_FOUND");
  }

  const peranCodes = await getPeranCodes(dbUser.id);
  const isAdmin = dbUser.role === "admin" || peranCodes.includes("admin");
  const isTutor = dbUser.role === "teacher" || peranCodes.includes("tutor");
  if (isAdmin || isTutor) {
    throw new Error("FORBIDDEN_STUDENT_SCHEDULE");
  }

  // Calculate week range
  const nowJakarta = getJakartaNow();
  const anchorDate = daysFrom(weekOffset * 7, nowJakarta);

  const weekInfo = getWeekScheduleDays(anchorDate);
  const isWeekLocked = isTutorialWeekLocked(weekInfo.days[0].dateIso);
  const { startIso: viewWeekStart, endIso: viewWeekEnd } = getIsoWeekRange(
    weekInfo.days[0].dateIso,
  );

  // Fetch Academic Schedules (Exams, Tryouts, Quizzes) for the calendar
  const allAcademicSchedules = await db.query.academicSchedules.findMany({
    where: and(
      eq(academicSchedules.status, "published"),
      lte(academicSchedules.startDate, new Date(`${viewWeekEnd}T23:59:59.999+07:00`)),
      or(
        isNull(academicSchedules.endDate),
        gte(academicSchedules.endDate, new Date(`${viewWeekStart}T00:00:00.000+07:00`)),
      ),
    ),
    with: {
      course: true,
      creator: true,
    },
    orderBy: [desc(academicSchedules.startDate)],
  });

  // ── STUDENT ROLE DATA ───────────────────────────────────────────────────────
  // 1. Get student study groups
  const myMemberships = await db.query.groupMembers.findMany({
    where: eq(groupMembers.userId, dbUser.id),
    with: {
      group: {
        with: {
          courses: {
            with: {
              course: true,
            },
          },
          members: {
            with: {
              user: true,
            },
          },
        },
      },
    },
  });

  const myGroups = myMemberships.map((m) => m.group).filter(Boolean);
  const myGroupIds = myGroups.map((g) => g.id);

  // 1b. Weekly usage per group for the viewed week (derived quota display)
  const weeklyCounts = myGroupIds.length
    ? await db
        .select({
          groupId: bookings.groupId,
          count: sql<number>`count(*)`,
        })
        .from(bookings)
        .where(
          and(
            inArray(bookings.groupId, myGroupIds),
            gte(bookings.sessionDate, viewWeekStart),
            lte(bookings.sessionDate, viewWeekEnd),
            countsTowardGroupWeeklyQuota(),
          )
        )
        .groupBy(bookings.groupId)
    : [];

  const groupsWithWeeklyUsage = myGroups.map((g) => ({
    ...g,
    weeklyUsedSessions: Number(
      weeklyCounts.find((c) => c.groupId === g.id)?.count ?? 0
    ),
  }));

  // 2. Get student active enrollments
  const activeEnrollments = (await listStudentEnrollments(dbUser.id)).map((enrollment) => ({
    id: enrollment.id,
    enrolledAt: enrollment.enrolledAt,
    expiresAt: enrollment.expiresAt,
    course: {
      id: enrollment.id,
      title: enrollment.title,
      category: enrollment.category,
      description: enrollment.description,
    },
  }));

  // 3. Find all available tutor slots with tutors & their certified courses
  const allTutorSlots = await db.query.tutorSlots.findMany({
    where: and(
      isNotNull(tutorSlots.sessionDate),
      gte(tutorSlots.sessionDate, viewWeekStart),
      lte(tutorSlots.sessionDate, viewWeekEnd),
    ),
    with: {
      tutor: {
        with: {
          tutorCourses: {
            with: {
              course: true,
            },
          },
        },
      },
      booking: {
        with: {
          group: true,
          course: true,
          student: true,
          resources: true,
          lastModifier: true,
          auditLogs: {
            with: {
              actor: true,
            },
            orderBy: [desc(bookingAuditLogs.createdAt)],
          },
          rescheduleTickets: {
            with: {
              requestedBy: true,
              proposedSlot: true,
              messages: {
                with: {
                  sender: true,
                },
              },
            },
          },
        },
      },
    },
  });

  // 4. Get bookings made by the student's groups
  const groupBookings = myGroupIds.length
    ? await db.query.bookings.findMany({
        where: and(
          inArray(bookings.groupId, myGroupIds),
          gte(bookings.sessionDate, viewWeekStart),
          lte(bookings.sessionDate, viewWeekEnd),
        ),
        with: {
          slot: {
            with: {
              tutor: true,
            },
          },
          course: true,
          group: {
            with: {
              members: {
                with: {
                  user: true,
                },
              },
            },
          },
          student: true,
          resources: true,
          lastModifier: true,
          auditLogs: {
            with: {
              actor: true,
            },
            orderBy: [desc(bookingAuditLogs.createdAt)],
          },
          rescheduleTickets: {
            with: {
              requestedBy: true,
              proposedSlot: true,
              messages: {
                with: {
                  sender: true,
                },
                orderBy: [desc(bookingTicketMessages.createdAt)],
              },
            },
            orderBy: [desc(bookingRescheduleTickets.createdAt)],
          },
        },
        orderBy: [desc(bookings.bookedAt)],
      })
    : [];

  // A student only needs booking occupancy to hide claimed slots. Keep the
  // booking details in the group-scoped read above so another group's topic,
  // notes, resources, audit entries, and ticket thread are never exposed as
  // part of the availability payload.
  const availableSlots = allTutorSlots.map(({ booking, ...slot }) => ({
    ...slot,
    booking: booking ? { id: booking.id } : null,
  }));

  return {
    role: "student" as const,
    user: {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      image: dbUser.image,
      role: dbUser.role,
    },
    weekInfo,
    isWeekLocked,
    weekRange: { startIso: viewWeekStart, endIso: viewWeekEnd },
    groups: groupsWithWeeklyUsage,
    enrollments: activeEnrollments,
    availableSlots,
    groupBookings,
    academicSchedules: allAcademicSchedules,
  };
}

// ── COLLABORATIVE BOOKING (Any group member can execute) ──────────────────────

export interface CollaborativeBookSlotOptions {
  actorId?: string;
  executor?: DbExecutor;
  now?: Date;
  topic?: string;
  preSessionNotes?: string;
}

export interface CollaborativeBookSlotResult {
  success: boolean;
  bookingId?: string;
  error?: string;
  reason?: string;
}

export async function collaborativeBookSlot(
  slotId: string,
  courseId: string,
  groupId: string,
  targetDateIso: string,
  options?: CollaborativeBookSlotOptions
): Promise<CollaborativeBookSlotResult> {
  let currentUser: { id: string; name?: string | null };
  const client = (options?.executor ?? db) as typeof db;

  if (options?.executor && options?.actorId?.trim()) {
    const dbUser = await client.query.user.findFirst({
      where: eq(user.id, options.actorId.trim()),
    });
    if (!dbUser) {
      return { success: false, error: "Pengguna tidak ditemukan" };
    }
    currentUser = dbUser;
  } else {
    currentUser = await requireUser();
  }

  try {
    return await client.transaction(async (tx) => {
      // 1. Verify student membership in group inside transaction (TOCTOU guard)
      const membership = await tx.query.groupMembers.findFirst({
        where: and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, currentUser.id)
        ),
      });

      if (!membership) {
        return { success: false, error: "Anda bukan anggota dari kelompok belajar ini" };
      }

      // 2. Verify slot exists inside transaction (TOCTOU guard)
      const slot = await tx.query.tutorSlots.findFirst({
        where: eq(tutorSlots.id, slotId),
        with: {
          tutor: true,
        },
      });

      if (!slot) {
        return { success: false, error: "Slot jadwal tutor tidak ditemukan" };
      }

      // The slot is the only canonical source of the session date. A null-date
      // legacy row is never a new student booking target.
      const sessionDateIso = slot.sessionDate?.trim() || "";
      if (!sessionDateIso) {
        return {
          success: false,
          error: "Slot lama tanpa tanggal tidak dapat dipesan.",
          reason: "LEGACY_SLOT_NO_DATE",
        };
      }

      if (typeof targetDateIso !== "string" || targetDateIso.trim() !== sessionDateIso) {
        return {
          success: false,
          error: "Tanggal permintaan tidak cocok dengan tanggal slot.",
          reason: "SLOT_DATE_MISMATCH",
        };
      }

      // 3. Validate exact 90-minute duration
      const durationCheck = validateSlotDuration(slot.startTime, slot.endTime);
      if (!durationCheck.isValid) {
        return {
          success: false,
          error: "Durasi slot harus tepat 90 menit (HH:MM).",
        };
      }

      // 4. Validate weekday and date consistency
      const weekdayCheck = validateSlotWeekdayDate(sessionDateIso, slot.dayOfWeek);
      if (!weekdayCheck.isValid) {
        return {
          success: false,
          error: "Tanggal sesi tidak sesuai dengan hari slot atau tanggal tidak valid.",
        };
      }

      // 5. Enforce the canonical lifecycle inside the same transaction as the
      // booking decision. The client date is not used as the source here.
      const bookingNow = options?.now ?? new Date();
      const bookingPhase = getTutorialWeekPhase(sessionDateIso, bookingNow);
      if (!canStudentBook(sessionDateIso, bookingNow)) {
        return {
          success: false,
          error:
            bookingPhase === "locked"
              ? "Jadwal untuk minggu ini sudah terkunci (Sabtu 23:59 WIB). Silakan pilih minggu berikutnya."
              : "Pemesanan untuk minggu ini belum dibuka.",
          reason:
            bookingPhase === "locked"
              ? "BOOKING_LOCKED"
              : "BOOKING_WINDOW_NOT_OPEN",
        };
      }

      // 6. Verify canonical tutor course assignment inside transaction (TOCTOU guard)
      const tutorAssignment = await checkCanonicalTutorAssignment(
        slot.tutorId,
        courseId,
        { allowAdmin: true },
        tx
      );

      if (!tutorAssignment.isAssigned) {
        return {
          success: false,
          error: "Tutor ini tidak bersertifikasi untuk mata kuliah ini",
        };
      }

      // 7. Verify active group and course enrollment inside transaction (TOCTOU guard)
      const groupEligibility = await checkActiveGroupCourseEligibility(
        groupId,
        courseId,
        tx
      );

      if (!groupEligibility.isEligible) {
        return {
          success: false,
          error:
            groupEligibility.reason ??
            "Kelompok belajar tidak aktif atau belum terdaftar pada mata kuliah ini",
        };
      }

      // 8. Verify target week weekly quota under write lock
      const { startIso, endIso } = getIsoWeekRange(sessionDateIso);
      const groupQuotaRows = await tx
        .select({ weeklyQuotaSessions: groups.weeklyQuotaSessions })
        .from(groups)
        .where(eq(groups.id, groupId))
        .limit(1);
      const weeklyQuota = groupQuotaRows[0]?.weeklyQuotaSessions || 2;

      const weekCountRows = await tx
        .select({ value: sql<number>`count(*)` })
        .from(bookings)
        .where(
          and(
            eq(bookings.groupId, groupId),
            gte(bookings.sessionDate, startIso),
            lte(bookings.sessionDate, endIso),
            countsTowardGroupWeeklyQuota()
          )
        );
      const weekBookingCount = Number(weekCountRows[0]?.value ?? 0);

      if (weekBookingCount >= weeklyQuota) {
        throw new Error("WEEKLY_QUOTA_EXCEEDED");
      }

      // 9. Verify FCFS immediately before the insert. The UNIQUE(slotId)
      // constraint remains the final race guard for concurrent transactions.
      const existingBooking = await tx.query.bookings.findFirst({
        where: eq(bookings.slotId, slotId),
      });

      if (existingBooking) {
        return {
          success: false,
          error: "Slot ini baru saja diambil oleh kelompok lain (First-Come First-Served)",
          reason: "SLOT_TAKEN",
        };
      }

      const bookingId = randomUUID();
      const now = new Date();
      const resolvedCourseId =
        groupEligibility.legacyCourseId ?? groupEligibility.courseId ?? courseId;
      const bookingTopic = typeof options?.topic === "string"
        ? options.topic.trim().slice(0, 500) || null
        : null;
      const bookingNotes = typeof options?.preSessionNotes === "string"
        ? options.preSessionNotes.trim().slice(0, 5000) || null
        : null;

      // 10. Atomic package quota reservation under transaction (guarded update)
      const quotaClaim = await tx
        .update(groups)
        .set({
          usedQuotaSessions: sql`${groups.usedQuotaSessions} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(groups.id, groupId),
            lt(groups.usedQuotaSessions, groups.totalQuotaSessions)
          )
        );

      if ((quotaClaim.rowsAffected ?? 0) === 0) {
        return {
          success: false,
          error: "Kuota total sesi kelompok telah tercapai.",
        };
      }

      // 11. Insert booking record
      await tx.insert(bookings).values({
        id: bookingId,
        slotId,
        studentId: currentUser.id,
        courseId: resolvedCourseId,
        groupId,
        status: "scheduled",
        sessionDate: sessionDateIso,
        startTime: slot.startTime,
        endTime: slot.endTime,
        mode: slot.mode,
        location: slot.location ?? null,
        topic: bookingTopic,
        preSessionNotes: bookingNotes,
        lastModifiedBy: currentUser.id,
        lastModifiedAt: now,
        bookedAt: now,
      });

      // 12. Insert Audit Log
      const auditSummary = `${currentUser.name || "Murid"} memilih jadwal tutorial (${slot.dayOfWeek}, ${sessionDateIso} ${slot.startTime} - ${slot.endTime})`;

      await tx.insert(bookingAuditLogs).values({
        id: randomUUID(),
        bookingId,
        groupId,
        actorId: currentUser.id,
        action: "BOOK_CREATED",
        summary: auditSummary,
        metadata: {
          slotId,
          courseId: resolvedCourseId,
          sessionDate: sessionDateIso,
          startTime: slot.startTime,
          endTime: slot.endTime,
          mode: slot.mode,
          location: slot.location,
        },
        createdAt: now,
      });

      await recordMutationAudit(
        {
          actorId: currentUser.id,
          actorRoles: ["student"],
          courseId: resolvedCourseId,
          entityType: "booking",
          entityId: bookingId,
          entityVersion: 1,
          action: "student.session.book",
          outcome: "success",
          requestId: randomUUID(),
          reason: "STUDENT_SESSION_BOOKED",
          before: null,
          after: {
            id: bookingId,
            slotId,
            groupId,
            courseId: resolvedCourseId,
            sessionDate: sessionDateIso,
          },
        },
        tx
      );

      // 13. Generate Google Meet if Online
      if (slot.mode === "online") {
        setTimeout(async () => {
          try {
            await ensureGoogleMeetForBooking(bookingId);
          } catch (e) {
            console.error("Async Google Meet generation error:", e);
          }
        }, 100);
      }

      try {
        revalidatePath("/dashboard/schedule");
        revalidatePath("/dashboard/groups");
      } catch {
        // Ignored in non-request test runners
      }
      return { success: true, bookingId };
    });
  } catch (err: any) {
    if (err?.message === "WEEKLY_QUOTA_EXCEEDED") {
      return {
        success: false,
        error: "Kuota sesi minggu ini sudah habis. Beralihlah ke pekan berikutnya.",
      };
    }
    if (isBookingSlotUniqueViolation(err)) {
      return {
        success: false,
        error: "Slot ini baru saja diambil oleh kelompok lain.",
        reason: "SLOT_TAKEN",
      };
    }
    console.error("Collaborative booking error:", err);
    return { success: false, error: "Gagal memesan slot tutorial" };
  }
}

// ── COLLABORATIVE MOVE SLOT (Before Weekly Lock) ──────────────────────────────

export interface CollaborativeMoveSlotOptions {
  actorId?: string;
  executor?: DbExecutor;
  now?: Date;
}

export async function collaborativeMoveSlot(
  bookingId: string,
  newSlotId: string,
  newTargetDateIso: string,
  options?: CollaborativeMoveSlotOptions
): Promise<{ success: boolean; error?: string; reason?: string }> {
  let currentUser: { id: string; name?: string | null };
  const client = (options?.executor ?? db) as typeof db;

  if (options?.executor && options?.actorId?.trim()) {
    const dbUser = await client.query.user.findFirst({
      where: eq(user.id, options.actorId.trim()),
    });
    if (!dbUser) {
      return { success: false, error: "Pengguna tidak ditemukan" };
    }
    currentUser = dbUser;
  } else {
    currentUser = await requireUser();
  }

  try {
    return await client.transaction(async (tx) => {
      const moveNow = options?.now ?? new Date();
      const booking = await tx.query.bookings.findFirst({
        where: eq(bookings.id, bookingId),
        with: {
          group: true,
          course: true,
          slot: {
            with: {
              tutor: true,
            },
          },
        },
      });

      if (!booking) {
        return { success: false, error: "Jadwal tutorial tidak ditemukan" };
      }

      // 1. Verify membership
      const membership = await tx.query.groupMembers.findFirst({
        where: and(
          eq(groupMembers.groupId, booking.groupId),
          eq(groupMembers.userId, currentUser.id)
        ),
      });

      if (!membership) {
        return { success: false, error: "Anda tidak berwenang mengubah jadwal kelompok ini" };
      }

      // 2. Reject terminal states
      if (isTerminalBookingStatus(booking.status)) {
        return {
          success: false,
          error: "Sesi yang sudah selesai atau dibatalkan tidak dapat dipindahkan.",
        };
      }

      // 3. Verify lock status
      if (booking.sessionDate && isTutorialWeekLocked(booking.sessionDate, moveNow)) {
        return {
          success: false,
          error:
            "Jadwal ini sudah terkunci (Sabtu 23:59 WIB). Silakan ajukan permohonan Reschedule untuk ditinjau tutor.",
        };
      }

      // 4. Verify new slot
      const newSlot = await tx.query.tutorSlots.findFirst({
        where: eq(tutorSlots.id, newSlotId),
        with: {
          tutor: true,
        },
      });

      if (!newSlot) {
        return { success: false, error: "Slot baru tidak ditemukan" };
      }

      if (!newSlot.sessionDate) {
        return {
          success: false,
          error: "Slot tujuan lama tanpa tanggal tidak dapat digunakan.",
          reason: "LEGACY_SLOT_NO_DATE",
        };
      }

      if (newTargetDateIso.trim() !== newSlot.sessionDate) {
        return {
          success: false,
          error: "Tanggal tujuan harus sama dengan tanggal slot baru.",
          reason: "SLOT_DATE_MISMATCH",
        };
      }

      if (isTutorialWeekLocked(newSlot.sessionDate, moveNow)) {
        return {
          success: false,
          error: "Slot tujuan sudah terkunci. Pilih slot pada minggu yang belum terkunci.",
          reason: "BOOKING_LOCKED",
        };
      }

      // 5. Validate new slot duration (exact 90m)
      const durationCheck = validateSlotDuration(newSlot.startTime, newSlot.endTime);
      if (!durationCheck.isValid) {
        return {
          success: false,
          error: "Durasi slot baru harus tepat 90 menit.",
        };
      }

      // 6. Validate weekday date match
      const weekdayCheck = validateSlotWeekdayDate(newTargetDateIso, newSlot.dayOfWeek);
      if (!weekdayCheck.isValid) {
        return {
          success: false,
          error: "Tanggal tujuan tidak sesuai dengan hari slot baru atau tanggal tidak valid.",
        };
      }

      // 7. Verify FCFS for new slot
      const existing = await tx.query.bookings.findFirst({
        where: eq(bookings.slotId, newSlotId),
      });

      if (existing && existing.id !== bookingId) {
        return { success: false, error: "Slot baru sudah diambil oleh kelompok lain" };
      }

      // 7.5 Verify target week weekly quota under write lock (excluding moving booking)
      const { startIso, endIso } = getIsoWeekRange(newTargetDateIso);
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
            ne(bookings.id, bookingId),
            gte(bookings.sessionDate, startIso),
            lte(bookings.sessionDate, endIso),
            countsTowardGroupWeeklyQuota()
          )
        );
      const targetWeekBookingCount = Number(weekCountRows[0]?.value ?? 0);

      if (targetWeekBookingCount >= weeklyQuota) {
        throw new Error("WEEKLY_QUOTA_EXCEEDED");
      }

      const now = new Date();

      // 8. Guarded update on booking
      const updateRes = await tx
        .update(bookings)
        .set({
          slotId: newSlotId,
          sessionDate: newTargetDateIso,
          startTime: newSlot.startTime,
          endTime: newSlot.endTime,
          mode: newSlot.mode,
          location: newSlot.location,
          lastModifiedBy: currentUser.id,
          lastModifiedAt: now,
        })
        .where(
          and(
            eq(bookings.id, bookingId),
            terminalStatusGuard()
          )
        );

      if ((updateRes.rowsAffected ?? 0) === 0) {
        return {
          success: false,
          error: "Status sesi berubah sebelum pemindahan; tidak ada perubahan yang disimpan.",
        };
      }

      // 9. Record Audit Log
      const auditSummary = `${currentUser.name || "Murid"} memindahkan jadwal ${booking.course?.title || "Mata Kuliah"} dari ${
        booking.sessionDate || ""
      } (${booking.startTime} - ${booking.endTime}) ke ${newSlot.dayOfWeek}, ${newTargetDateIso} (${
        newSlot.startTime
      } - ${newSlot.endTime})`;

      await tx.insert(bookingAuditLogs).values({
        id: randomUUID(),
        bookingId,
        groupId: booking.groupId,
        actorId: currentUser.id,
        action: "SLOT_MOVED",
        summary: auditSummary,
        metadata: {
          oldSlotId: booking.slotId,
          newSlotId,
          newDate: newTargetDateIso,
        },
        createdAt: now,
      });

      await recordMutationAudit(
        {
          actorId: currentUser.id,
          actorRoles: ["student"],
          courseId: booking.courseId,
          entityType: "booking",
          entityId: bookingId,
          entityVersion: 1,
          action: "student.session.move",
          outcome: "success",
          requestId: randomUUID(),
          reason: "STUDENT_SESSION_MOVED",
          before: {
            slotId: booking.slotId,
            sessionDate: booking.sessionDate,
          },
          after: {
            slotId: newSlotId,
            sessionDate: newTargetDateIso,
            startTime: newSlot.startTime,
            endTime: newSlot.endTime,
          },
        },
        tx
      );

      // 10. Ensure Google Meet for new slot if online
      if (newSlot.mode === "online") {
        setTimeout(async () => {
          try {
            await ensureGoogleMeetForBooking(bookingId);
          } catch (e) {
            console.error("Async Google Meet update error:", e);
          }
        }, 100);
      }

      try {
        revalidatePath("/dashboard/schedule");
      } catch {
        // Ignored in non-request test runners
      }
      return { success: true };
    });
  } catch (err: any) {
    if (err?.message === "WEEKLY_QUOTA_EXCEEDED") {
      return {
        success: false,
        error: "Kuota sesi mingguan kelompok telah tercapai.",
        reason: "WEEKLY_QUOTA_EXCEEDED",
      };
    }
    console.error("Collaborative move slot error:", err);
    return { success: false, error: err?.message || "Gagal memindahkan jadwal" };
  }
}

// ── COLLABORATIVE CANCEL (Before Weekly Lock) ─────────────────────────────────

export async function collaborativeCancelSlot(bookingId: string) {
  const currentUser = await requireUser();

  try {
    return await db.transaction(async (tx) => {
      const booking = await tx.query.bookings.findFirst({
        where: eq(bookings.id, bookingId),
        with: {
          group: true,
          course: true,
        },
      });

      if (!booking) {
        return { success: false, error: "Jadwal tutorial tidak ditemukan" };
      }

      const membership = await tx.query.groupMembers.findFirst({
        where: and(
          eq(groupMembers.groupId, booking.groupId),
          eq(groupMembers.userId, currentUser.id)
        ),
      });

      if (!membership) {
        return { success: false, error: "Anda tidak berwenang membatalkan jadwal ini" };
      }

      if (isTerminalBookingStatus(booking.status)) {
        return {
          success: false,
          error: "Sesi sudah dalam status selesai atau dibatalkan.",
        };
      }

      if (booking.sessionDate && isTutorialWeekLocked(booking.sessionDate, new Date())) {
        return {
          success: false,
          error:
            "Jadwal ini sudah terkunci. Pembatalan pasca-lock wajib diajukan melalui tiket pembatalan.",
        };
      }

      const now = new Date();
      const requestId = randomUUID();

      // Guarded cancel: preserve history by marking status 'cancelled'
      const cancelRes = await tx
        .update(bookings)
        .set({
          status: "cancelled",
          lastModifiedBy: currentUser.id,
          lastModifiedAt: now,
        })
        .where(
          and(
            eq(bookings.id, bookingId),
            terminalStatusGuard()
          )
        );

      if ((cancelRes.rowsAffected ?? 0) === 0) {
        return { success: false, error: "Status sesi sudah berubah." };
      }

      // Pre-lock cancellation refunds 1 package session
      const refundClaim = await tx
        .update(groups)
        .set({
          usedQuotaSessions: sql`MAX(${groups.usedQuotaSessions} - 1, 0)`,
          updatedAt: now,
        })
        .where(
          and(
            eq(groups.id, booking.groupId),
            gt(groups.usedQuotaSessions, 0)
          )
        );

      if ((refundClaim.rowsAffected ?? 0) > 0) {
        await tx.insert(bookingAuditLogs).values({
          id: randomUUID(),
          bookingId,
          groupId: booking.groupId,
          actorId: currentUser.id,
          action: CANCELLED_QUOTA_REFUND_LOG_ACTION,
          summary: `Kuota paket dikembalikan satu sesi untuk pembatalan pra-kunci (${booking.sessionDate ?? "tanpa tanggal"}).`,
          metadata: {
            marker: "prelock_cancel_quota_refund",
            bookingId,
            groupId: booking.groupId,
            refundedSessions: 1,
            requestId,
          },
          createdAt: now,
        });
      }

      await tx.insert(bookingAuditLogs).values({
        id: randomUUID(),
        bookingId,
        groupId: booking.groupId,
        actorId: currentUser.id,
        action: "BOOKING_CANCELLED",
        summary: `Pembatalan pra-kunci sesi tutorial oleh ${currentUser.name || "Murid"}.`,
        metadata: {
          sessionDate: booking.sessionDate,
        },
        createdAt: now,
      });

      await recordMutationAudit(
        {
          actorId: currentUser.id,
          actorRoles: ["student"],
          courseId: booking.courseId,
          entityType: "booking",
          entityId: bookingId,
          entityVersion: 1,
          action: "student.session.cancel",
          outcome: "success",
          requestId,
          reason: "STUDENT_SESSION_CANCELLED_PRELOCK",
          before: {
            status: booking.status,
            sessionDate: booking.sessionDate,
          },
          after: {
            status: "cancelled",
          },
        },
        tx
      );

      revalidatePath("/dashboard/schedule");
      revalidatePath("/dashboard/groups");
      return { success: true };
    });
  } catch (err: any) {
    console.error("Collaborative cancel slot error:", err);
    return { success: false, error: err?.message || "Gagal membatalkan jadwal" };
  }
}

/** Updates only the student-owned pre-session context. Resource mutations use
 * the phase-aware normalized resource actions below so one member cannot
 * accidentally replace another member's files. */
export async function updatePreSessionContextAction(
  bookingId: string,
  topic: string,
  preSessionNotes?: string,
) {
  const currentUser = await requireUser();
  const targetBookingId = typeof bookingId === "string" ? bookingId.trim() : "";
  if (!targetBookingId) {
    return { success: false, error: "Jadwal tutorial tidak ditemukan." };
  }

  try {
    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.id, targetBookingId),
    });
    if (!booking) {
      return { success: false, error: "Jadwal tutorial tidak ditemukan." };
    }

    const membership = await db.query.groupMembers.findFirst({
      where: and(
        eq(groupMembers.groupId, booking.groupId),
        eq(groupMembers.userId, currentUser.id),
      ),
    });
    if (!membership) {
      return { success: false, error: "Anda bukan anggota kelompok sesi ini." };
    }
    if (isTerminalBookingStatus(booking.status)) {
      return { success: false, error: "Sesi yang sudah selesai atau dibatalkan tidak dapat diubah." };
    }

    const now = new Date();
    const nextTopic = typeof topic === "string" ? topic.trim().slice(0, 500) : "";
    const nextNotes = typeof preSessionNotes === "string"
      ? preSessionNotes.trim().slice(0, 5000)
      : "";

    await db.transaction(async (tx) => {
      await tx
        .update(bookings)
        .set({
          topic: nextTopic || null,
          preSessionNotes: nextNotes || null,
          lastModifiedBy: currentUser.id,
          lastModifiedAt: now,
        })
        .where(eq(bookings.id, targetBookingId));

      await tx.insert(bookingAuditLogs).values({
        id: randomUUID(),
        bookingId: targetBookingId,
        groupId: booking.groupId,
        actorId: currentUser.id,
        action: "TOPIC_UPDATED",
        summary: `${currentUser.name || "Murid"} memperbarui konteks sebelum sesi.`,
        metadata: {
          topicLength: nextTopic.length,
          notesLength: nextNotes.length,
        },
        createdAt: now,
      });
    });

    revalidatePath("/dashboard/schedule");
    revalidatePath("/tutor/schedule");
    return { success: true };
  } catch (error) {
    console.error("Update pre-session context error:", error);
    return { success: false, error: "Konteks sebelum sesi gagal disimpan." };
  }
}

/** Shared normalized-resource actions used by the session detail drawer. */
export async function addSessionResourceAction(input: AddBookingResourceInput) {
  const result = await addBookingResource(input);
  if (result.success) {
    revalidatePath("/dashboard/schedule");
    revalidatePath("/tutor/schedule");
  }
  return result;
}

export async function deleteSessionResourceAction(resourceId: string) {
  const result = await deleteBookingResource(resourceId);
  if (result.success) {
    revalidatePath("/dashboard/schedule");
    revalidatePath("/tutor/schedule");
  }
  return result;
}

export async function getSessionResourcesAction(bookingId: string) {
  return getBookingResources(bookingId);
}

// ── PRE-SESSION WORKFLOW (Topic & Question Materials) ─────────────────────────

export async function updatePreSessionData(
  bookingId: string,
  topic: string,
  preSessionNotes?: string,
  attachments?: Array<{
    id: string;
    name: string;
    url: string;
    size?: number;
    type?: string;
  }>
) {
  const currentUser = await requireUser();

  try {
    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.id, bookingId),
    });

    if (!booking) {
      return { success: false, error: "Jadwal tutorial tidak ditemukan" };
    }

    const membership = await db.query.groupMembers.findFirst({
      where: and(
        eq(groupMembers.groupId, booking.groupId),
        eq(groupMembers.userId, currentUser.id)
      ),
    });

    if (!membership) {
      return { success: false, error: "Anda bukan anggota kelompok belajar ini" };
    }

    const now = new Date();

    // Map existing attachments with new ones
    const formattedAttachments = (attachments || []).map((att) => ({
      id: att.id || randomUUID(),
      name: att.name,
      url: att.url,
      size: att.size,
      type: att.type,
      uploadedBy: currentUser.id,
      uploadedByName: currentUser.name || "Murid",
      uploadedAt: now.toISOString(),
    }));

    await db
      .update(bookings)
      .set({
        topic: topic.trim(),
        preSessionNotes: preSessionNotes?.trim() || null,
        preSessionAttachments: formattedAttachments,
        lastModifiedBy: currentUser.id,
        lastModifiedAt: now,
      })
      .where(eq(bookings.id, bookingId));

    await db
      .delete(bookingResources)
      .where(and(
        eq(bookingResources.bookingId, bookingId),
        eq(bookingResources.phase, "pre"),
        eq(bookingResources.kind, "file"),
      ));
    if (formattedAttachments.length > 0) {
      await db.insert(bookingResources).values(
        formattedAttachments.map((attachment) => ({
          id: randomUUID(),
          bookingId,
          phase: "pre" as const,
          kind: "file" as const,
          label: attachment.name.trim(),
          url: attachment.url.trim(),
          fileName: attachment.name.trim(),
          mimeType: attachment.type?.trim() || null,
          sizeBytes: attachment.size ?? null,
          metadata: {
            uploadedByName: attachment.uploadedByName,
            legacyAttachmentId: attachment.id,
          },
          createdById: currentUser.id,
          createdAt: now,
          updatedAt: now,
        })),
      );
    }

    // Audit log
    const auditSummary = `${currentUser.name} memperbarui topik bahasan dan mengunggah berkas soal latihan (${formattedAttachments.length} berkas)`;

    await db.insert(bookingAuditLogs).values({
      id: randomUUID(),
      bookingId,
      groupId: booking.groupId,
      actorId: currentUser.id,
      action: "TOPIC_UPDATED",
      summary: auditSummary,
      metadata: {
        topic,
        attachmentsCount: formattedAttachments.length,
      },
      createdAt: now,
    });

    revalidatePath("/dashboard/schedule");
    return { success: true };
  } catch (err: any) {
    console.error("Update pre-session data error:", err);
    return { success: false, error: err?.message || "Gagal menyimpan persiapan sesi" };
  }
}

// ── RESCHEDULE & CANCELLATION TICKETS (Post-Lock) ──────────────────────────────

export async function submitRescheduleTicket(
  bookingId: string,
  type: "reschedule" | "cancellation",
  reason: string,
  proposedSlotId?: string,
  proposedDate?: string
) {
  const currentUser = await requireUser();

  try {
    return await db.transaction(async (tx) => {
      const booking = await tx.query.bookings.findFirst({
        where: eq(bookings.id, bookingId),
        with: {
          slot: true,
        },
      });

      if (!booking) {
        return { success: false, error: "Jadwal tutorial tidak ditemukan" };
      }

      const membership = await tx.query.groupMembers.findFirst({
        where: and(
          eq(groupMembers.groupId, booking.groupId),
          eq(groupMembers.userId, currentUser.id)
        ),
      });

      if (!membership) {
        return { success: false, error: "Anda bukan anggota kelompok belajar ini" };
      }

      if (isTerminalBookingStatus(booking.status)) {
        return {
          success: false,
          error: "Sesi sudah dalam status selesai atau dibatalkan; tiket tidak dapat diajukan.",
        };
      }

      // Check for duplicate pending tickets on this booking
      const existingPending = await tx
        .select({ id: bookingRescheduleTickets.id })
        .from(bookingRescheduleTickets)
        .where(
          and(
            eq(bookingRescheduleTickets.bookingId, bookingId),
            eq(bookingRescheduleTickets.status, "pending")
          )
        )
        .limit(1);

      if (existingPending.length > 0) {
        return {
          success: false,
          error: "Masih terdapat permohonan tiket yang sedang menunggu keputusan untuk sesi ini.",
          reason: "DUPLICATE_PENDING_TICKET",
        };
      }

      const ticketId = randomUUID();
      const now = new Date();
      const requestId = randomUUID();

      await tx.insert(bookingRescheduleTickets).values({
        id: ticketId,
        bookingId,
        groupId: booking.groupId,
        requestedById: currentUser.id,
        tutorId: booking.slot.tutorId,
        type,
        status: "pending",
        reason: reason.trim(),
        proposedSlotId: proposedSlotId || null,
        proposedDate: proposedDate || null,
        createdAt: now,
        updatedAt: now,
      });

      // Initial message in discussion thread
      await tx.insert(bookingTicketMessages).values({
        id: randomUUID(),
        ticketId,
        senderId: currentUser.id,
        message: `[Permohonan ${type === "reschedule" ? "Reschedule" : "Pembatalan"}]\nAlasan: ${reason}`,
        createdAt: now,
      });

      // Audit log
      const auditSummary = `${currentUser.name || "Murid"} mengajukan tiket ${
        type === "reschedule" ? "Reschedule" : "Pembatalan"
      } untuk sesi ini`;

      await tx.insert(bookingAuditLogs).values({
        id: randomUUID(),
        bookingId,
        groupId: booking.groupId,
        actorId: currentUser.id,
        action: type === "reschedule" ? "RESCHEDULE_REQUESTED" : "BOOKING_CANCELLED",
        summary: auditSummary,
        metadata: {
          ticketId,
          type,
          reason,
          proposedSlotId,
          proposedDate,
        },
        createdAt: now,
      });

      await recordMutationAudit(
        {
          actorId: currentUser.id,
          actorRoles: ["student"],
          courseId: booking.courseId,
          entityType: "reschedule_ticket",
          entityId: ticketId,
          entityVersion: 1,
          action: "student.ticket.create",
          outcome: "success",
          requestId,
          reason: "STUDENT_TICKET_SUBMITTED",
          before: { bookingId, status: booking.status },
          after: { ticketId, type, reason, proposedSlotId, proposedDate },
        },
        tx
      );

      revalidatePath("/dashboard/schedule");
      return { success: true, ticketId };
    });
  } catch (err: any) {
    console.error("Submit reschedule ticket error:", err);
    return { success: false, error: err?.message || "Gagal mengajukan tiket" };
  }
}

export async function sendTicketMessage(ticketId: string, message: string) {
  const currentUser = await requireUser();

  try {
    const ticket = await db.query.bookingRescheduleTickets.findFirst({
      where: eq(bookingRescheduleTickets.id, ticketId),
    });

    if (!ticket) {
      return { success: false, error: "Tiket tidak ditemukan" };
    }

    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.id, ticket.bookingId),
      columns: { groupId: true },
      with: { slot: { columns: { tutorId: true } } },
    });

    if (!booking) {
      return { success: false, error: "Jadwal tutorial tidak ditemukan" };
    }

    const membership = await db.query.groupMembers.findFirst({
      where: and(
        eq(groupMembers.groupId, booking.groupId),
        eq(groupMembers.userId, currentUser.id)
      ),
    });

    if (!membership && booking.slot?.tutorId !== currentUser.id) {
      return {
        success: false,
        error: "Hanya anggota kelompok atau tutor pengampu yang dapat mengirim pesan",
      };
    }

    const now = new Date();
    await db.insert(bookingTicketMessages).values({
      id: randomUUID(),
      ticketId,
      senderId: currentUser.id,
      message: message.trim(),
      createdAt: now,
    });

    await db
      .update(bookingRescheduleTickets)
      .set({ updatedAt: now })
      .where(eq(bookingRescheduleTickets.id, ticketId));

    revalidatePath("/dashboard/schedule");
    return { success: true };
  } catch (err: any) {
    console.error("Send ticket message error:", err);
    return { success: false, error: err?.message || "Gagal mengirim pesan" };
  }
}

// ── TUTOR COMPATIBILITY ACTIONS ──────────────────────────────────────────────

export async function tutorDecideTicket(
  ticketId: string,
  decision: "approved" | "rejected",
  decisionNotes?: string
) {
  await requireUser();
  const res = await executeDecideTutorRescheduleTicket({
    ticketId,
    decision,
    decisionNotes,
  });
  if (res.success) {
    revalidatePath("/dashboard/schedule");
  }
  return res;
}

export async function tutorCompleteSession(
  bookingId: string,
  postSessionNotes: string,
  postSessionAttachments?: Array<{
    id: string;
    name: string;
    url: string;
    size?: number;
    type?: string;
  }>,
  linkUrl?: string
) {
  const currentUser = await requireUser();

  try {
    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.id, bookingId),
      with: {
        slot: true,
      },
    });

    if (!booking) {
      return { success: false, error: "Jadwal tutorial tidak ditemukan" };
    }

    if (booking.slot.tutorId !== currentUser.id) {
      return { success: false, error: "Hanya tutor pengampu yang dapat menandai sesi selesai" };
    }

    const now = new Date();

    // Fetch link preview if link URL provided
    let linkTitle: string | null = null;
    let linkDesc: string | null = null;
    let linkImg: string | null = null;

    if (linkUrl && linkUrl.trim()) {
      const preview = await fetchLinkPreview(linkUrl.trim());
      linkTitle = preview.title;
      linkDesc = preview.description;
      linkImg = preview.image;
    }

    const formattedAtts = (postSessionAttachments || []).map((att) => ({
      id: att.id || randomUUID(),
      name: att.name,
      url: att.url,
      size: att.size,
      type: att.type,
      uploadedBy: currentUser.id,
      uploadedByName: currentUser.name || "Tutor",
      uploadedAt: now.toISOString(),
    }));

    await db
      .update(bookings)
      .set({
        status: "completed",
        postSessionNotes: postSessionNotes.trim(),
        postSessionAttachments: formattedAtts,
        postSessionLinkUrl: linkUrl?.trim() || null,
        postSessionLinkTitle: linkTitle,
        postSessionLinkDescription: linkDesc,
        postSessionLinkImage: linkImg,
        completedAt: now,
        completedById: currentUser.id,
        lastModifiedBy: currentUser.id,
        lastModifiedAt: now,
      })
      .where(eq(bookings.id, bookingId));

    await db
      .delete(bookingResources)
      .where(and(eq(bookingResources.bookingId, bookingId), eq(bookingResources.phase, "post")));
    const normalizedPostResources = [
      ...formattedAtts.map((attachment) => ({
        id: randomUUID(),
        bookingId,
        phase: "post" as const,
        kind: "file" as const,
        label: attachment.name.trim(),
        url: attachment.url.trim(),
        fileName: attachment.name.trim(),
        mimeType: attachment.type?.trim() || null,
        sizeBytes: attachment.size ?? null,
        metadata: {
          uploadedByName: attachment.uploadedByName,
          legacyAttachmentId: attachment.id,
        },
        createdById: currentUser.id,
        createdAt: now,
        updatedAt: now,
      })),
      ...(linkUrl?.trim()
        ? [{
            id: randomUUID(),
            bookingId,
            phase: "post" as const,
            kind: "link" as const,
            label: linkTitle || "Link sesi",
            url: linkUrl.trim(),
            fileName: null,
            mimeType: null,
            sizeBytes: null,
            metadata: {
              description: linkDesc,
              image: linkImg,
            },
            createdById: currentUser.id,
            createdAt: now,
            updatedAt: now,
          }]
        : []),
    ];
    if (normalizedPostResources.length > 0) {
      await db.insert(bookingResources).values(normalizedPostResources);
    }

    await db.insert(bookingAuditLogs).values({
      id: randomUUID(),
      bookingId,
      groupId: booking.groupId,
      actorId: currentUser.id,
      action: "SESSION_COMPLETED",
      summary: `Tutor ${currentUser.name} menandai sesi telah selesai dan mengunggah catatan pembahasan`,
      metadata: {
        notesLength: postSessionNotes.length,
        attachmentsCount: formattedAtts.length,
        hasLink: Boolean(linkUrl),
      },
      createdAt: now,
    });

    revalidatePath("/dashboard/schedule");
    return { success: true };
  } catch (err: any) {
    console.error("Tutor complete session error:", err);
    return { success: false, error: err?.message || "Gagal menyelesaikan sesi" };
  }
}

/**
 * Completes a session without replacing normalized post-session resources.
 * The drawer adds each file, link, or recording through the resource API and
 * then calls this action for the tutor's summary and lifecycle transition.
 */
export async function completeTutorSessionAction(
  bookingId: string,
  postSessionNotes: string,
) {
  const currentUser = await requireUser();
  const targetBookingId = typeof bookingId === "string" ? bookingId.trim() : "";
  if (!targetBookingId) {
    return { success: false, error: "Jadwal tutorial tidak ditemukan." };
  }

  try {
    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.id, targetBookingId),
      with: { slot: true },
    });
    if (!booking) {
      return { success: false, error: "Jadwal tutorial tidak ditemukan." };
    }
    if (booking.slot.tutorId !== currentUser.id) {
      return { success: false, error: "Hanya tutor pengampu yang dapat menyelesaikan sesi." };
    }
    if (booking.status === "cancelled") {
      return { success: false, error: "Sesi yang dibatalkan tidak dapat diselesaikan." };
    }

    const notes = typeof postSessionNotes === "string"
      ? postSessionNotes.trim().slice(0, 10000)
      : "";
    if (!notes) {
      return { success: false, error: "Ringkasan sesi wajib diisi." };
    }

    const now = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(bookings)
        .set({
          status: "completed",
          postSessionNotes: notes,
          completedAt: booking.completedAt ?? now,
          completedById: currentUser.id,
          lastModifiedBy: currentUser.id,
          lastModifiedAt: now,
        })
        .where(eq(bookings.id, targetBookingId));

      await tx.insert(bookingAuditLogs).values({
        id: randomUUID(),
        bookingId: targetBookingId,
        groupId: booking.groupId,
        actorId: currentUser.id,
        action: "SESSION_COMPLETED",
        summary: `Tutor ${currentUser.name || "Pengajar"} menyimpan ringkasan sesi.`,
        metadata: { notesLength: notes.length },
        createdAt: now,
      });
    });

    revalidatePath("/dashboard/schedule");
    revalidatePath("/tutor/schedule");
    return { success: true };
  } catch (error) {
    console.error("Complete tutor session error:", error);
    return { success: false, error: "Ringkasan sesi gagal disimpan." };
  }
}
