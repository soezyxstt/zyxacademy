"use server";

import { headers } from "next/headers";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import {
  user,
  courses,
  enrollments,
  groupMembers,
  tutorCourses,
  tutorSlots,
  bookings,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { eq, and, inArray, sql } from "drizzle-orm";
import { dualWriteTutorAssignment } from "@/lib/migrasi/repository-kompatibilitas";

// Helper to authenticate user
async function requireUser() {
  const h = await headers();
  const session = await auth.api.getSession({
    headers: h,
  });
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  return session.user;
}

// Fetch all scheduling data for the current user's role
export async function getScheduleData() {
  const currentUser = await requireUser();
  
  // Refetch user from DB to get the most accurate role
  const dbUser = await db.query.user.findFirst({
    where: eq(user.id, currentUser.id),
  });

  if (!dbUser) {
    throw new Error("User not found in database");
  }

  const userRole = dbUser.role || "student";
  const userId = dbUser.id;

  // 1. Find groups this user is in
  const myGroupMemberships = await db.query.groupMembers.findMany({
    where: eq(groupMembers.userId, userId),
    with: {
      group: true,
    },
  });

  const myGroupIds = myGroupMemberships.map((gm) => gm.groupId);

  if (userRole === "teacher") {
    // ─── TUTOR WORKFLOW ───
    // Fetch tutor's certified courses
    const certifiedCourses = await db
      .select({
        id: courses.id,
        title: courses.title,
        category: courses.category,
      })
      .from(tutorCourses)
      .innerJoin(courses, eq(tutorCourses.courseId, courses.id))
      .where(eq(tutorCourses.tutorId, userId));

    // Fetch tutor's availability slots
    const slots = await db.query.tutorSlots.findMany({
      where: eq(tutorSlots.tutorId, userId),
      with: {
        booking: {
          with: {
            student: true,
            course: true,
            group: true,
          },
        },
      },
    });

    // Fetch all courses in database (for certification checklist)
    const allCourses = await db.select().from(courses);

    // Fetch groups the tutor belongs to
    const myGroups = myGroupMemberships.map((gm) => gm.group).filter(Boolean);

    return {
      role: "teacher" as const,
      user: dbUser,
      certifiedCourses,
      slots,
      allCourses,
      myGroups,
    };
  } else {
    // ─── STUDENT WORKFLOW ───
    // Fetch student's active enrollments
    const now = new Date();
    let activeEnrollments;
    if (process.env.NODE_ENV === "development" && dbUser.role === "admin") {
      const all = await db.select().from(courses);
      activeEnrollments = all.map((c) => ({
        id: c.id,
        title: c.title,
        category: c.category,
      }));
    } else {
      activeEnrollments = await db
        .select({
          id: courses.id,
          title: courses.title,
          category: courses.category,
        })
        .from(enrollments)
        .innerJoin(courses, eq(enrollments.courseId, courses.id))
        .where(and(eq(enrollments.userId, userId), sql`${enrollments.expiresAt} > ${now}`));
    }

    const enrolledCourseIds = activeEnrollments.map((ae) => ae.id);

    if (myGroupIds.length === 0) {
      return {
        role: "student" as const,
        user: dbUser,
        enrollments: activeEnrollments,
        groups: [],
        relevantTutors: [],
        availableSlots: [],
        myBookings: [],
      };
    }

    // Find all group members in student's groups
    const allMembersInMyGroups = await db.query.groupMembers.findMany({
      where: inArray(groupMembers.groupId, myGroupIds),
      with: {
        user: true,
        group: true,
      },
    });

    // Extract tutors (role === 'teacher') from these groups
    const tutorsInMyGroupsMap = new Map<string, { user: any; groups: any[] }>();
    allMembersInMyGroups.forEach((m) => {
      if (m.user && m.user.role === "teacher") {
        const existing = tutorsInMyGroupsMap.get(m.user.id);
        if (existing) {
          existing.groups.push(m.group);
        } else {
          tutorsInMyGroupsMap.set(m.user.id, {
            user: m.user,
            groups: [m.group],
          });
        }
      }
    });

    const tutorsInMyGroups = Array.from(tutorsInMyGroupsMap.values());
    const tutorIdsInMyGroups = tutorsInMyGroups.map((t) => t.user.id);

    // If no tutors in group, return early
    if (tutorIdsInMyGroups.length === 0) {
      return {
        role: "student" as const,
        user: dbUser,
        enrollments: activeEnrollments,
        groups: myGroupMemberships.map((gm) => gm.group).filter(Boolean),
        relevantTutors: [],
        availableSlots: [],
        myBookings: [],
      };
    }

    // Fetch tutor courses certifications
    const tutorCertifications = await db.query.tutorCourses.findMany({
      where: inArray(tutorCourses.tutorId, tutorIdsInMyGroups),
    });

    // Map certifications by tutor
    const tutorSubjectsMap = new Map<string, string[]>();
    tutorCertifications.forEach((tc) => {
      const existing = tutorSubjectsMap.get(tc.tutorId) || [];
      existing.push(tc.courseId);
      tutorSubjectsMap.set(tc.tutorId, existing);
    });

    // Filter relevant tutors: must teach at least one course the student is enrolled in
    const relevantTutors = tutorsInMyGroups
      .map((t) => {
        const tutorSubjects = tutorSubjectsMap.get(t.user.id) || [];
        const sharedSubjects = tutorSubjects.filter((cid) => enrolledCourseIds.includes(cid));
        return {
          ...t,
          certifiedCourseIds: tutorSubjects,
          sharedCourseIds: sharedSubjects,
        };
      })
      .filter((t) => t.sharedCourseIds.length > 0);

    const relevantTutorIds = relevantTutors.map((t) => t.user.id);

    // If no relevant tutors, return early
    if (relevantTutorIds.length === 0) {
      return {
        role: "student" as const,
        user: dbUser,
        enrollments: activeEnrollments,
        groups: myGroupMemberships.map((gm) => gm.group).filter(Boolean),
        relevantTutors: [],
        availableSlots: [],
        myBookings: [],
      };
    }

    // Fetch slots for relevant tutors
    const tutorSlotsList = await db.query.tutorSlots.findMany({
      where: inArray(tutorSlots.tutorId, relevantTutorIds),
      with: {
        tutor: true,
        booking: {
          with: {
            student: true,
            course: true,
            group: true,
          },
        },
      },
    });

    // Get student's own bookings
    const myBookingsList = await db.query.bookings.findMany({
      where: eq(bookings.studentId, userId),
      with: {
        slot: {
          with: {
            tutor: true,
          },
        },
        course: true,
        group: true,
      },
    });

    return {
      role: "student" as const,
      user: dbUser,
      enrollments: activeEnrollments,
      groups: myGroupMemberships.map((gm) => gm.group).filter(Boolean),
      relevantTutors,
      availableSlots: tutorSlotsList,
      myBookings: myBookingsList,
    };
  }
}

// Add a slot of availability (Tutor only)
export async function addTutorSlot(dayOfWeek: string, startTime: string, endTime: string) {
  const currentUser = await requireUser();

  // Verify role
  const dbUser = await db.query.user.findFirst({
    where: eq(user.id, currentUser.id),
  });

  if (dbUser?.role !== "teacher") {
    return { success: false, error: "Hanya tutor yang dapat menambahkan jadwal kosong" };
  }

  // Basic validation
  if (!dayOfWeek || !startTime || !endTime) {
    return { success: false, error: "Harap isi semua kolom jadwal" };
  }

  // Check time formats (HH:MM)
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
    return { success: false, error: "Format waktu harus HH:MM (contoh: 09:00)" };
  }

  // Check if start time is before end time
  const [startHour, startMin] = startTime.split(":").map(Number);
  const [endHour, endMin] = endTime.split(":").map(Number);
  const startVal = startHour * 60 + startMin;
  const endVal = endHour * 60 + endMin;

  if (startVal >= endVal) {
    return { success: false, error: "Waktu mulai harus sebelum waktu selesai" };
  }

  try {
    await db.insert(tutorSlots).values({
      id: randomUUID(),
      tutorId: dbUser.id,
      dayOfWeek,
      startTime,
      endTime,
    });

    return { success: true };
  } catch (error: any) {
    console.error("Error adding slot:", error);
    return { success: false, error: "Gagal menyimpan jadwal" };
  }
}

// Delete a slot of availability (Tutor only)
export async function deleteTutorSlot(slotId: string) {
  const currentUser = await requireUser();

  const slot = await db.query.tutorSlots.findFirst({
    where: eq(tutorSlots.id, slotId),
  });

  if (!slot) {
    return { success: false, error: "Jadwal tidak ditemukan" };
  }

  if (slot.tutorId !== currentUser.id) {
    return { success: false, error: "Anda tidak memiliki akses untuk menghapus jadwal ini" };
  }

  try {
    await db.delete(tutorSlots).where(eq(tutorSlots.id, slotId));
    return { success: true };
  } catch (error: any) {
    console.error("Error deleting slot:", error);
    return { success: false, error: "Gagal menghapus jadwal" };
  }
}

// Book a slot (Student only, First-Come First-Served)
export async function bookTutorSlot(slotId: string, courseId: string, groupId: string) {
  const currentUser = await requireUser();

  // Verify role
  const dbUser = await db.query.user.findFirst({
    where: eq(user.id, currentUser.id),
  });

  if (dbUser?.role !== "student") {
    return { success: false, error: "Hanya murid yang dapat memesan jadwal bimbingan" };
  }

  try {
    return await db.transaction(async (tx) => {
      // 1. Check if slot exists and get tutor id
      const slot = await tx.query.tutorSlots.findFirst({
        where: eq(tutorSlots.id, slotId),
      });

      if (!slot) {
        return { success: false, error: "Slot jadwal tidak tersedia" };
      }

      // 2. Check if already booked (FCFS)
      const existingBooking = await tx.query.bookings.findFirst({
        where: eq(bookings.slotId, slotId),
      });

      if (existingBooking) {
        return { success: false, error: "Jadwal ini baru saja dipesan oleh murid lain (First-Come First-Served)" };
      }

      // 3. Verify student is in the group
      const isMember = await tx.query.groupMembers.findFirst({
        where: and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, dbUser.id)
        ),
      });

      if (!isMember) {
        return { success: false, error: "Anda bukan anggota dari grup bimbingan ini" };
      }

      // 4. Verify tutor is also in the group
      const isTutorInGroup = await tx.query.groupMembers.findFirst({
        where: and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, slot.tutorId)
        ),
      });

      if (!isTutorInGroup) {
        return { success: false, error: "Tutor tidak terdaftar di dalam grup bimbingan Anda" };
      }

      // 5. Verify student enrollment in course
      const now = new Date();
      const studentEnrollment = await tx.query.enrollments.findFirst({
        where: and(
          eq(enrollments.userId, dbUser.id),
          eq(enrollments.courseId, courseId),
          sql`${enrollments.expiresAt} > ${now}`
        ),
      });

      if (!studentEnrollment) {
        return { success: false, error: "Anda tidak terdaftar secara aktif pada mata kuliah ini" };
      }

      // 6. Verify tutor certification in course
      const tutorCert = await tx.query.tutorCourses.findFirst({
        where: and(
          eq(tutorCourses.tutorId, slot.tutorId),
          eq(tutorCourses.courseId, courseId)
        ),
      });

      if (!tutorCert) {
        return { success: false, error: "Tutor ini tidak bersertifikasi untuk mengajar mata kuliah ini" };
      }

      // 7. Perform booking
      await tx.insert(bookings).values({
        id: randomUUID(),
        slotId,
        studentId: dbUser.id,
        courseId,
        groupId,
        bookedAt: new Date(),
      });

      return { success: true };
    });
  } catch (error: any) {
    console.error("Error booking slot:", error);
    return { success: false, error: "Terjadi kesalahan sistem saat melakukan pemesanan" };
  }
}

// Cancel a booking
export async function cancelBooking(bookingId: string) {
  const currentUser = await requireUser();

  const booking = await db.query.bookings.findFirst({
    where: eq(bookings.id, bookingId),
    with: {
      slot: true,
    },
  });

  if (!booking) {
    return { success: false, error: "Pemesanan tidak ditemukan" };
  }

  // Allowed to cancel if current user is the student who booked it OR the tutor who owns the slot
  const isStudentOwner = booking.studentId === currentUser.id;
  const isTutorOwner = booking.slot?.tutorId === currentUser.id;

  if (!isStudentOwner && !isTutorOwner) {
    return { success: false, error: "Anda tidak memiliki akses untuk membatalkan bimbingan ini" };
  }

  try {
    await db.delete(bookings).where(eq(bookings.id, bookingId));
    return { success: true };
  } catch (error: any) {
    console.error("Error cancelling booking:", error);
    return { success: false, error: "Gagal membatalkan jadwal" };
  }
}

// Update tutor certified courses (Tutor only)
export async function updateTutorCourses(courseIds: string[]) {
  const currentUser = await requireUser();

  // Verify role
  const dbUser = await db.query.user.findFirst({
    where: eq(user.id, currentUser.id),
  });

  if (dbUser?.role !== "teacher") {
    return { success: false, error: "Hanya tutor yang dapat memperbarui sertifikasi mata kuliah" };
  }

  try {
    await db.transaction(async (tx) => {
      const previousAssignments = await tx
        .select({ id: tutorCourses.id, tutorId: tutorCourses.tutorId, courseId: tutorCourses.courseId })
        .from(tutorCourses)
        .where(eq(tutorCourses.tutorId, dbUser.id));

      // 1. Delete all existing certifications
      await tx.delete(tutorCourses).where(eq(tutorCourses.tutorId, dbUser.id));
      for (const previous of previousAssignments) {
        await dualWriteTutorAssignment(tx, {
          id: previous.id,
          tutorId: previous.tutorId,
          courseId: previous.courseId,
          status: "revoked",
        }, dbUser.id);
      }

      // 2. Insert new certifications
      if (courseIds.length > 0) {
        for (const cid of courseIds) {
          const assignmentId = randomUUID();
          await tx.insert(tutorCourses).values({
            id: assignmentId,
            tutorId: dbUser.id,
            courseId: cid,
          });
          await dualWriteTutorAssignment(tx, {
            id: assignmentId,
            tutorId: dbUser.id,
            courseId: cid,
            status: "active",
          }, dbUser.id);
        }
      }
    });

    return { success: true };
  } catch (error: any) {
    console.error("Error updating certified courses:", error);
    return { success: false, error: "Gagal memperbarui daftar matkul bimbingan" };
  }
}
