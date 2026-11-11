import { and, asc, desc, eq, exists, gte, inArray, isNull, lte, ne, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookingRescheduleTickets, bookings, courses, groupCourses, groups, mataKuliah, pengguna, penugasanTutor, tutorCourses, tutorSlots, user } from "@/db/schema";
import { listTutorAccessibleCourses, type DbExecutor } from "@/lib/auth/tutor-access";
import type { AssignedActiveCourseItem } from "./tutor-read-model";

export async function getTutorDashboardReadModel(
  tutorId: string,
  today: string,
  week: { startIso: string; endIso: string },
  executor?: DbExecutor,
  readAccessibleCourses: typeof listTutorAccessibleCourses = listTutorAccessibleCourses,
) {
  const client = (executor ?? db) as typeof db;
  tutorId = tutorId.trim();
  if (!tutorId) throw new Error("TUTOR_ID_REQUIRED");
  const allowAdmin = false;
  // 1. Fetch tutor user details
  const userRows = await client
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    })
    .from(user)
    .where(eq(user.id, tutorId))
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
    .where(eq(pengguna.id, tutorId))
    .limit(1);

  const tutorStatus = penggunaRows[0]?.status ?? "active";
  if (penggunaRows.length > 0 && tutorStatus !== "active") {
    throw new Error("TUTOR_INACTIVE");
  }

  // 2. Fetch assigned active courses via centralized helper with canonical fallback semantics
  const accessibleCoursesList = await (executor ? listTutorAccessibleCourses : readAccessibleCourses)(
    tutorId,
    { allowAdmin },
    executor,
  );

  const assignedActiveCourses: AssignedActiveCourseItem[] = [];
  const assignedCourseIdentifiers = new Set<string>();

  if (accessibleCoursesList.length > 0) {
    const rawCourseIds = accessibleCoursesList.map((c) => c.courseId);

    // Query canonical mata_kuliah details
    const mkRows = await client
      .select({
        id: mataKuliah.id,
        code: mataKuliah.code,
        title: mataKuliah.title,
        status: mataKuliah.status,
        legacyCourseId: mataKuliah.legacyCourseId,
      })
      .from(mataKuliah)
      .where(inArray(mataKuliah.id, rawCourseIds));

    const mkMap = new Map<string, (typeof mkRows)[0]>();
    for (const mk of mkRows) {
      mkMap.set(mk.id, mk);
    }

    // Query legacy courses details for any missing canonical rows
    const missingLegacyIds = rawCourseIds.filter((id) => !mkMap.has(id));
    const legacyRows =
      missingLegacyIds.length > 0
        ? await client
            .select({
              id: courses.id,
              title: courses.title,
            })
            .from(courses)
            .where(inArray(courses.id, missingLegacyIds))
        : [];

    const legacyMap = new Map<string, (typeof legacyRows)[0]>();
    for (const leg of legacyRows) {
      legacyMap.set(leg.id, leg);
    }

    for (const item of accessibleCoursesList) {
      const mk = mkMap.get(item.courseId);
      if (mk) {
        if (mk.status === "active") {
          assignedActiveCourses.push({
            courseId: mk.id,
            code: mk.code,
            title: mk.title,
            legacyCourseId: mk.legacyCourseId ?? null,
            source: item.source,
            isCompatibilityFallback: item.isCompatibilityFallback,
          });
          assignedCourseIdentifiers.add(mk.id);
          if (mk.legacyCourseId) {
            assignedCourseIdentifiers.add(mk.legacyCourseId);
          }
        }
      } else {
        const leg = legacyMap.get(item.courseId);
        if (leg) {
          assignedActiveCourses.push({
            courseId: leg.id,
            code: leg.id,
            title: leg.title,
            legacyCourseId: leg.id,
            source: item.source,
            isCompatibilityFallback: true,
          });
          assignedCourseIdentifiers.add(leg.id);
        }
      }
    }
  }

  // 2b. Handle pure legacy tutor_courses when not already present and not blocked by any canonical row
  const allCanonicalRows = await client
    .select({
      mataKuliahId: penugasanTutor.mataKuliahId,
      legacyCourseId: mataKuliah.legacyCourseId,
    })
    .from(penugasanTutor)
    .leftJoin(mataKuliah, eq(penugasanTutor.mataKuliahId, mataKuliah.id))
    .where(eq(penugasanTutor.penggunaId, tutorId));

  const blockedCourseIds = new Set<string>();
  for (const r of allCanonicalRows) {
    if (r.mataKuliahId) blockedCourseIds.add(r.mataKuliahId);
    if (r.legacyCourseId) blockedCourseIds.add(r.legacyCourseId);
  }

  const legacyTutorCourses = await client
    .select({
      courseId: tutorCourses.courseId,
      title: courses.title,
    })
    .from(tutorCourses)
    .leftJoin(courses, eq(tutorCourses.courseId, courses.id))
    .where(eq(tutorCourses.tutorId, tutorId));

  for (const leg of legacyTutorCourses) {
    const cId = leg.courseId;
    if (
      !assignedCourseIdentifiers.has(cId) &&
      !blockedCourseIds.has(cId)
    ) {
      assignedActiveCourses.push({
        courseId: cId,
        code: cId,
        title: leg.title || cId,
        legacyCourseId: cId,
        source: "compatibility_fallback",
        isCompatibilityFallback: true,
      });
      assignedCourseIdentifiers.add(cId);
    }
  }

  const assignedIds = Array.from(assignedCourseIdentifiers);
  const groupMatches = assignedIds.length ? await client
    .select({ groupId: groups.id, courseId: groupCourses.courseId })
    .from(groupCourses)
    .innerJoin(groups, eq(groups.id, groupCourses.groupId))
    .where(and(eq(groups.status, "active"), inArray(groupCourses.courseId, assignedIds))) : [];
  const groupCoursesById = new Map<string, Set<string>>();
  for (const row of groupMatches) {
    const matched = groupCoursesById.get(row.groupId) ?? new Set<string>();
    matched.add(row.courseId);
    groupCoursesById.set(row.groupId, matched);
  }
  const eligibleGroups = Array.from(groupCoursesById, ([id, matched]) => ({ id, matchedCourseIds: Array.from(matched) }));

  const ownsBooking = exists(client.select({ one: sql`1` }).from(bookings)
    .innerJoin(tutorSlots, eq(bookings.slotId, tutorSlots.id))
    .where(and(eq(bookings.id, bookingRescheduleTickets.bookingId), eq(tutorSlots.tutorId, tutorId))));
  const ticketFilter = and(eq(bookingRescheduleTickets.status, "pending"), or(
    eq(bookingRescheduleTickets.tutorId, tutorId),
    and(isNull(bookingRescheduleTickets.tutorId), ownsBooking),
  ));
  const [weekRows, upcomingSessions, ticketCountRows, pendingTickets] = await Promise.all([
    client.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(bookings)
      .innerJoin(tutorSlots, eq(bookings.slotId, tutorSlots.id))
      .where(and(eq(tutorSlots.tutorId, tutorId), gte(bookings.sessionDate, week.startIso), lte(bookings.sessionDate, week.endIso), ne(bookings.status, "cancelled"))),
    client.select({ id: bookings.id, sessionDate: bookings.sessionDate, startTime: bookings.startTime,
      endTime: bookings.endTime, mode: bookings.mode, topic: bookings.topic,
      courseTitle: courses.title, groupName: groups.name })
      .from(bookings).innerJoin(tutorSlots, eq(bookings.slotId, tutorSlots.id))
      .leftJoin(courses, eq(bookings.courseId, courses.id)).leftJoin(groups, eq(bookings.groupId, groups.id))
      .where(and(eq(tutorSlots.tutorId, tutorId), gte(bookings.sessionDate, today), notInArray(bookings.status, ["cancelled", "completed"])))
      .orderBy(asc(bookings.sessionDate), sql`coalesce(nullif(${bookings.startTime}, ''), '00:00')`, desc(bookings.bookedAt)).limit(5),
    client.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(bookingRescheduleTickets).where(ticketFilter),
    client.select({ id: bookingRescheduleTickets.id, type: bookingRescheduleTickets.type, reason: bookingRescheduleTickets.reason })
      .from(bookingRescheduleTickets).where(ticketFilter).orderBy(desc(bookingRescheduleTickets.createdAt)).limit(5),
  ]);
  return { assignedActiveCourses, eligibleGroups, sessionsThisWeek: weekRows[0]?.count ?? 0,
    pendingTicketCount: ticketCountRows[0]?.count ?? 0, pendingTickets, upcomingSessions };
}
