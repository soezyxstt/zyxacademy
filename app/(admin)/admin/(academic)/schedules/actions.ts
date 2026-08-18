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
  academicSchedules,
} from "@/db/schema";
import { assertAdmin } from "@/lib/uploadthing-admin";
import { eq, and, desc, isNull } from "drizzle-orm";
import {
  getJakartaNow,
  getWeekScheduleDays,
  isSessionLocked,
  ensureGoogleMeetForBooking,
} from "@/lib/schedule-lock";

export async function getAdminScheduleData(weekOffset = 0) {
  await assertAdmin();

  const nowJakarta = getJakartaNow();
  const anchorDate = new Date(nowJakarta);
  anchorDate.setDate(anchorDate.getDate() + weekOffset * 7);

  const weekInfo = getWeekScheduleDays(anchorDate);
  const isWeekLocked = isSessionLocked(weekInfo.days[0].dateIso, nowJakarta);

  const [
    allTutors,
    allCourses,
    allGroups,
    allSlots,
    allBookings,
    allTickets,
    allAcademicSchedules,
    allAuditLogs,
  ] = await Promise.all([
    db.query.user.findMany({
      where: eq(user.role, "teacher"),
      with: {
        tutorCourses: {
          with: {
            course: true,
          },
        },
      },
    }),
    db.select().from(courses),
    db.query.groups.findMany({
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
    }),
    db.query.tutorSlots.findMany({
      with: {
        tutor: true,
        booking: {
          with: {
            group: true,
            course: true,
            student: true,
            lastModifier: true,
          },
        },
      },
    }),
    db.query.bookings.findMany({
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
        lastModifier: true,
        completedBy: true,
        auditLogs: {
          with: {
            actor: true,
          },
          orderBy: [desc(bookingAuditLogs.createdAt)],
        },
        rescheduleTickets: {
          with: {
            requestedBy: true,
            tutor: true,
            proposedSlot: true,
            messages: {
              with: {
                sender: true,
              },
            },
          },
          orderBy: [desc(bookingRescheduleTickets.createdAt)],
        },
      },
      orderBy: [desc(bookings.bookedAt)],
    }),
    db.query.bookingRescheduleTickets.findMany({
      with: {
        booking: {
          with: {
            course: true,
            group: true,
          },
        },
        requestedBy: true,
        tutor: true,
        proposedSlot: true,
        messages: {
          with: {
            sender: true,
          },
          orderBy: [desc(academicSchedules.createdAt)],
        },
      },
      orderBy: [desc(bookingRescheduleTickets.createdAt)],
    }),
    db.query.academicSchedules.findMany({
      with: {
        course: true,
        creator: true,
      },
      orderBy: [desc(academicSchedules.startDate)],
    }),
    db.query.bookingAuditLogs.findMany({
      with: {
        actor: true,
        booking: {
          with: {
            course: true,
            group: true,
          },
        },
      },
      orderBy: [desc(bookingAuditLogs.createdAt)],
      limit: 100,
    }),
  ]);

  return {
    weekInfo,
    isWeekLocked,
    tutors: allTutors,
    courses: allCourses,
    groups: allGroups,
    slots: allSlots,
    bookings: allBookings,
    tickets: allTickets,
    academicSchedules: allAcademicSchedules,
    auditLogs: allAuditLogs,
  };
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
