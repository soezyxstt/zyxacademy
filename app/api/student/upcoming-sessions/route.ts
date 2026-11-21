/**
 * GET /api/student/upcoming-sessions
 *
 * Returns confirmed ("scheduled") upcoming tutor sessions for the authenticated
 * student (either booked directly or belonging to one of the student's groups)
 * so native clients can schedule or reconcile local session reminders.
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { and, eq, gte, inArray, or } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { bookings, courses, groupMembers, tutorSlots, user } from "@/db/schema";
import { getJakartaNow } from "@/lib/date-utils";

export async function GET() {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const todayIso = getJakartaNow().toISOString().slice(0, 10);

  try {
    const memberships = await db
      .select({ groupId: groupMembers.groupId })
      .from(groupMembers)
      .where(eq(groupMembers.userId, userId));

    const groupIds = memberships.map((m) => m.groupId);
    const ownerFilter =
      groupIds.length > 0
        ? or(eq(bookings.studentId, userId), inArray(bookings.groupId, groupIds))
        : eq(bookings.studentId, userId);

    const rows = await db
      .select({
        bookingId: bookings.id,
        status: bookings.status,
        sessionDate: bookings.sessionDate,
        startTime: bookings.startTime,
        topic: bookings.topic,
        courseTitle: courses.title,
        tutorName: user.name,
      })
      .from(bookings)
      .innerJoin(courses, eq(bookings.courseId, courses.id))
      .innerJoin(tutorSlots, eq(bookings.slotId, tutorSlots.id))
      .innerJoin(user, eq(tutorSlots.tutorId, user.id))
      .where(
        and(
          ownerFilter,
          eq(bookings.status, "scheduled"),
          gte(bookings.sessionDate, todayIso),
        ),
      );

    return NextResponse.json(
      { sessions: rows },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    console.error("[student/upcoming-sessions] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
