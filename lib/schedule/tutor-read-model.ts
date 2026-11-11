import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  academicSchedules,
  bookingAuditLogs,
  bookingRescheduleTickets,
  bookingTicketMessages,
  bookingResources,
  bookings,
  courses,
  groupCourses,
  groupMembers,
  groups,
  mataKuliah,
  pengguna,
  penugasanTutor,
  tutorCourses,
  tutorSlots,
  user,
} from "@/db/schema";
import {
  type DbExecutor,
  listTutorAccessibleCourses,
  type TutorAccessSource,
} from "@/lib/auth/tutor-access";
import { normalizeDate } from "@/lib/date-utils";
import type { SessionResource } from "@/lib/schedule/session-resources";
import {
  getDeterministicGroupRepresentative,
  type GroupRepresentativeResult,
} from "./tutor-policy";

export type TutorReadModelCompatibilitySource =
  | "canonical"
  | "legacy_fallback"
  | "mixed";

export interface AssignedActiveCourseItem {
  courseId: string;
  code: string;
  title: string;
  legacyCourseId: string | null;
  source: TutorAccessSource;
  isCompatibilityFallback: boolean;
}

export interface EligibleGroupItem {
  id: string;
  name: string;
  packageType: string;
  packageName: string;
  status: string;
  weeklyQuotaSessions: number;
  totalQuotaSessions: number;
  usedQuotaSessions: number;
  matchedCourseIds: string[];
  representative: GroupRepresentativeResult | null;
  membersCount: number;
}

export interface OwnedSlotItem {
  id: string;
  tutorId: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  mode: "online" | "offline";
  location: string | null;
  sessionDate: string | null;
  createdAt: Date;
  booking: {
    id: string;
    studentId: string;
    courseId: string;
    groupId: string;
    status: string;
    sessionDate: string | null;
    startTime: string | null;
    endTime: string | null;
    mode: string;
    topic: string | null;
    resources: SessionResource[];
    preSessionResources: SessionResource[];
    postSessionResources: SessionResource[];
  } | null;
}

export interface OwnedAuditLogItem {
  id: string;
  action: string;
  summary: string;
  actor: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
  createdAt: Date;
}

export interface OwnedBookingItem {
  id: string;
  slotId: string;
  studentId: string;
  courseId: string;
  groupId: string;
  status: string;
  sessionDate: string | null;
  startTime: string | null;
  endTime: string | null;
  mode: string;
  location: string | null;
  googleMeetUrl: string | null;
  topic: string | null;
  preSessionNotes: string | null;
  postSessionNotes: string | null;
  postSessionLinkUrl: string | null;
  postSessionLinkTitle: string | null;
  completedAt: Date | null;
  bookedAt: Date;
  group?: {
    id: string;
    name: string;
  } | null;
  course?: {
    id: string;
    title: string;
  } | null;
  student?: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
  resources: SessionResource[];
  preSessionResources: SessionResource[];
  postSessionResources: SessionResource[];
  auditLogs: OwnedAuditLogItem[];
  rescheduleTickets: OwnedTicketItem[];
}

export interface OwnedTicketMessageItem {
  id: string;
  senderId: string;
  senderName: string | null;
  message: string;
  createdAt: Date;
}

export interface OwnedTicketItem {
  id: string;
  bookingId: string;
  groupId: string;
  requestedById: string;
  tutorId: string | null;
  type: "reschedule" | "cancellation";
  status: "pending" | "approved" | "rejected";
  reason: string;
  proposedSlotId: string | null;
  proposedDate: string | null;
  decisionNotes: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  messages: OwnedTicketMessageItem[];
}

export interface OwnedAcademicScheduleItem {
  id: string;
  title: string;
  type: "official_exam" | "tryout" | "quiz" | "general";
  courseId: string | null;
  description: string | null;
  startDate: Date;
  endDate: Date | null;
  location: string | null;
  status: string;
}

export interface TutorScheduleReadModel {
  tutor: {
    id: string;
    name: string | null;
    email: string | null;
    status: string;
  };
  assignedActiveCourses: AssignedActiveCourseItem[];
  eligibleGroups: EligibleGroupItem[];
  ownedSlots: OwnedSlotItem[];
  ownedBookings: OwnedBookingItem[];
  ownedTickets: OwnedTicketItem[];
  ownedSchedules: OwnedAcademicScheduleItem[];
  compatibilitySource: TutorReadModelCompatibilitySource;
}

export interface GetTutorScheduleReadModelInput {
  tutorId: string;
  allowAdmin?: boolean;
  fromDate?: string;
  toDate?: string;
}

type LegacyBookingAttachment = {
  id?: string;
  name?: string;
  url?: string;
  size?: number;
  type?: string;
  uploadedBy?: string;
  uploadedByName?: string;
  uploadedAt?: string;
};

function validIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function legacyAttachments(value: unknown): LegacyBookingAttachment[] {
  return Array.isArray(value)
    ? value.filter((attachment): attachment is LegacyBookingAttachment =>
        Boolean(attachment && typeof attachment === "object"),
      )
    : [];
}

function legacyResourceDate(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = normalizeDate(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function mergeBookingResources(
  booking: typeof bookings.$inferSelect,
  normalized: SessionResource[],
): SessionResource[] {
  const fallbackDate = normalizeDate(booking.bookedAt);
  const legacy: SessionResource[] = [];
  const addLegacyAttachments = (
    phase: "pre" | "post",
    attachments: unknown,
  ) => {
    for (const attachment of legacyAttachments(attachments)) {
      if (!attachment.url || !attachment.name) continue;
      const createdAt = legacyResourceDate(attachment.uploadedAt, fallbackDate);
      legacy.push({
        id: `legacy-${booking.id}-${phase}-${attachment.id || attachment.url}`,
        bookingId: booking.id,
        phase,
        kind: "file",
        label: attachment.name,
        url: attachment.url,
        fileName: attachment.name,
        mimeType: attachment.type ?? null,
        sizeBytes: attachment.size ?? null,
        metadata: {
          legacy: true,
          uploadedBy: attachment.uploadedBy ?? null,
          uploadedByName: attachment.uploadedByName ?? null,
        },
        createdById: attachment.uploadedBy || "legacy",
        createdAt,
        updatedAt: createdAt,
      });
    }
  };

  addLegacyAttachments("pre", booking.preSessionAttachments);
  addLegacyAttachments("post", booking.postSessionAttachments);

  if (booking.postSessionLinkUrl) {
    legacy.push({
      id: `legacy-${booking.id}-post-link`,
      bookingId: booking.id,
      phase: "post",
      kind: "link",
      label: booking.postSessionLinkTitle || "Link sesi",
      url: booking.postSessionLinkUrl,
      fileName: null,
      mimeType: null,
      sizeBytes: null,
      metadata: {
        legacy: true,
        description: booking.postSessionLinkDescription ?? null,
        image: booking.postSessionLinkImage ?? null,
      },
      createdById: "legacy",
      createdAt: fallbackDate,
      updatedAt: fallbackDate,
    });
  }

  const result = [...normalized];
  const seen = new Set(normalized.map((resource) => `${resource.phase}|${resource.kind}|${resource.url}`));
  for (const resource of legacy) {
    const key = `${resource.phase}|${resource.kind}|${resource.url}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(resource);
    }
  }
  return result;
}

function splitBookingResources(resources: SessionResource[]) {
  return {
    resources,
    preSessionResources: resources.filter((resource) => resource.phase === "pre"),
    postSessionResources: resources.filter((resource) => resource.phase === "post"),
  };
}

function storedResource(row: typeof bookingResources.$inferSelect): SessionResource {
  return {
    id: row.id,
    bookingId: row.bookingId,
    phase: row.phase,
    kind: row.kind,
    label: row.label,
    url: row.url,
    fileName: row.fileName ?? null,
    mimeType: row.mimeType ?? null,
    sizeBytes: row.sizeBytes ?? null,
    metadata: row.metadata ?? null,
    createdById: row.createdById,
    createdAt: normalizeDate(row.createdAt),
    updatedAt: normalizeDate(row.updatedAt),
  };
}

/**
 * Loads the complete native tutor schedule read-model for a tutor.
 * Ensures isolation: only returns assigned active courses, eligible active groups,
 * and records owned by / relevant to the tutor.
 */
export async function getTutorScheduleReadModel(
  input: string | GetTutorScheduleReadModelInput,
  executor?: DbExecutor,
  readAccessibleCourses: typeof listTutorAccessibleCourses = listTutorAccessibleCourses,
): Promise<TutorScheduleReadModel> {
  const client = (executor ?? db) as typeof db;
  const tutorId =
    typeof input === "string" ? input.trim() : input.tutorId.trim();
  const allowAdmin = typeof input === "object" && input.allowAdmin === true;
  const fromDate = typeof input === "object" ? input.fromDate?.trim() : undefined;
  const toDate = typeof input === "object" ? input.toDate?.trim() : undefined;

  if ((fromDate && !validIsoDate(fromDate)) || (toDate && !validIsoDate(toDate))) {
    throw new Error("INVALID_SCHEDULE_RANGE");
  }
  if (fromDate && toDate && fromDate > toDate) {
    throw new Error("INVALID_SCHEDULE_RANGE");
  }

  if (!tutorId) {
    throw new Error("TUTOR_ID_REQUIRED");
  }

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

  // Determine overall compatibility source
  let compatibilitySource: TutorReadModelCompatibilitySource = "canonical";
  if (assignedActiveCourses.length > 0) {
    const hasCanonical = assignedActiveCourses.some(
      (c) => c.source === "canonical_assignment",
    );
    const hasFallback = assignedActiveCourses.some(
      (c) => c.source === "compatibility_fallback",
    );
    if (hasCanonical && hasFallback) {
      compatibilitySource = "mixed";
    } else if (hasFallback && !hasCanonical) {
      compatibilitySource = "legacy_fallback";
    } else {
      compatibilitySource = "canonical";
    }
  }

  // 3. Fetch eligible active groups
  const eligibleGroups: EligibleGroupItem[] = [];
  const assignedCourseIdArray = Array.from(assignedCourseIdentifiers);

  if (assignedCourseIdArray.length > 0) {
    const matchingGroupCourses = await client
      .select({
        groupId: groupCourses.groupId,
        courseId: groupCourses.courseId,
      })
      .from(groupCourses)
      .where(inArray(groupCourses.courseId, assignedCourseIdArray));

    const groupToMatchedCourses = new Map<string, Set<string>>();
    for (const gc of matchingGroupCourses) {
      if (!groupToMatchedCourses.has(gc.groupId)) {
        groupToMatchedCourses.set(gc.groupId, new Set());
      }
      groupToMatchedCourses.get(gc.groupId)!.add(gc.courseId);
    }

    const eligibleGroupIds = Array.from(groupToMatchedCourses.keys());
    if (eligibleGroupIds.length > 0) {
      const activeGroupRows = await client
        .select({
          id: groups.id,
          name: groups.name,
          packageType: groups.packageType,
          packageName: groups.packageName,
          status: groups.status,
          weeklyQuotaSessions: groups.weeklyQuotaSessions,
          totalQuotaSessions: groups.totalQuotaSessions,
          usedQuotaSessions: groups.usedQuotaSessions,
        })
        .from(groups)
        .where(
          and(
            inArray(groups.id, eligibleGroupIds),
            eq(groups.status, "active"),
          ),
        );

      const activeGroupIds = activeGroupRows.map((g) => g.id);
      if (activeGroupIds.length > 0) {
        const memberRows = await client
          .select({
            id: groupMembers.id,
            groupId: groupMembers.groupId,
            userId: groupMembers.userId,
            role: groupMembers.role,
            joinedAt: groupMembers.joinedAt,
            name: user.name,
            email: user.email,
            image: user.image,
          })
          .from(groupMembers)
          .leftJoin(user, eq(groupMembers.userId, user.id))
          .where(inArray(groupMembers.groupId, activeGroupIds));

        const groupMembersMap = new Map<string, typeof memberRows>();
        for (const m of memberRows) {
          if (!groupMembersMap.has(m.groupId)) {
            groupMembersMap.set(m.groupId, []);
          }
          groupMembersMap.get(m.groupId)!.push(m);
        }

        for (const grp of activeGroupRows) {
          const members = groupMembersMap.get(grp.id) ?? [];
          const representative = getDeterministicGroupRepresentative(
            members.map((m) => ({
              id: m.id,
              userId: m.userId,
              role: m.role,
              joinedAt: m.joinedAt,
              user: {
                id: m.userId,
                name: m.name,
                email: m.email,
                image: m.image,
              },
            })),
          );

          const matchedCourses = Array.from(
            groupToMatchedCourses.get(grp.id) ?? [],
          );

          eligibleGroups.push({
            id: grp.id,
            name: grp.name,
            packageType: grp.packageType,
            packageName: grp.packageName,
            status: grp.status,
            weeklyQuotaSessions: grp.weeklyQuotaSessions,
            totalQuotaSessions: grp.totalQuotaSessions,
            usedQuotaSessions: grp.usedQuotaSessions,
            matchedCourseIds: matchedCourses,
            representative,
            membersCount: members.length,
          });
        }

        // Sort groups alphabetically by name
        eligibleGroups.sort((a, b) => a.name.localeCompare(b.name));
      }
    }
  }

  // 4. Fetch owned slots and attached bookings
  const slotConditions = [eq(tutorSlots.tutorId, tutorId)];
  if (fromDate || toDate) {
    slotConditions.push(isNotNull(tutorSlots.sessionDate));
    if (fromDate) slotConditions.push(gte(tutorSlots.sessionDate, fromDate));
    if (toDate) slotConditions.push(lte(tutorSlots.sessionDate, toDate));
  }
  const rawSlots = await client
    .select({
      id: tutorSlots.id,
      tutorId: tutorSlots.tutorId,
      dayOfWeek: tutorSlots.dayOfWeek,
      startTime: tutorSlots.startTime,
      endTime: tutorSlots.endTime,
      mode: tutorSlots.mode,
      location: tutorSlots.location,
      sessionDate: tutorSlots.sessionDate,
      createdAt: tutorSlots.createdAt,
    })
    .from(tutorSlots)
    .where(and(...slotConditions));

  const slotIds = rawSlots.map((s) => s.id);
  const activeBookingsBySlot = new Map<string, typeof bookings.$inferSelect>();
  const bookingsById = new Map<string, typeof bookings.$inferSelect>();
  const resourcesByBookingId = new Map<string, SessionResource[]>();

  if (slotIds.length > 0) {
    const slotBookingRows = await client
      .select()
      .from(bookings)
      .where(inArray(bookings.slotId, slotIds));

    for (const b of slotBookingRows) {
      bookingsById.set(b.id, b);
      if (b.status !== "cancelled") activeBookingsBySlot.set(b.slotId, b);
    }

    // The resource table is additive. Keep the legacy read model usable while
    // an environment is between application deploy and schema migration.
    try {
      const normalizedRows = await client
        .select()
        .from(bookingResources)
        .where(inArray(bookingResources.bookingId, slotBookingRows.map((b) => b.id)))
        .orderBy(asc(bookingResources.createdAt), asc(bookingResources.id));
      for (const row of normalizedRows) {
        const list = resourcesByBookingId.get(row.bookingId) ?? [];
        list.push(storedResource(row));
        resourcesByBookingId.set(row.bookingId, list);
      }
    } catch (error) {
      console.warn("Normalized booking resources are unavailable; using legacy fields.", error);
    }
  }

  const ownedSlots: OwnedSlotItem[] = rawSlots.map((s) => {
    const b = activeBookingsBySlot.get(s.id);
    const resources = b
      ? mergeBookingResources(b, resourcesByBookingId.get(b.id) ?? [])
      : [];
    const resourceSummary = splitBookingResources(resources);
    return {
      id: s.id,
      tutorId: s.tutorId,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      mode: s.mode as "online" | "offline",
      location: s.location ?? null,
      sessionDate: s.sessionDate ?? null,
      createdAt: normalizeDate(s.createdAt),
      booking: b
        ? {
            id: b.id,
            studentId: b.studentId,
            courseId: b.courseId,
            groupId: b.groupId,
            status: b.status,
            sessionDate: b.sessionDate ?? null,
            startTime: b.startTime ?? null,
            endTime: b.endTime ?? null,
            mode: b.mode,
            topic: b.topic ?? null,
            ...resourceSummary,
          }
        : null,
    };
  });

  // 5. Fetch owned bookings
  const ownedBookings: OwnedBookingItem[] = [];
  const ownedBookingIds: string[] = [];

  if (slotIds.length > 0) {
    const bookingRows = await client
      .select({
        id: bookings.id,
        slotId: bookings.slotId,
        studentId: bookings.studentId,
        courseId: bookings.courseId,
        groupId: bookings.groupId,
        status: bookings.status,
        sessionDate: bookings.sessionDate,
        startTime: bookings.startTime,
        endTime: bookings.endTime,
        mode: bookings.mode,
        location: bookings.location,
        googleMeetUrl: bookings.googleMeetUrl,
        topic: bookings.topic,
        preSessionNotes: bookings.preSessionNotes,
        postSessionNotes: bookings.postSessionNotes,
        postSessionLinkUrl: bookings.postSessionLinkUrl,
        postSessionLinkTitle: bookings.postSessionLinkTitle,
        completedAt: bookings.completedAt,
        bookedAt: bookings.bookedAt,
        groupName: groups.name,
        courseTitle: courses.title,
        studentName: user.name,
        studentEmail: user.email,
      })
      .from(bookings)
      .leftJoin(groups, eq(bookings.groupId, groups.id))
      .leftJoin(courses, eq(bookings.courseId, courses.id))
      .leftJoin(user, eq(bookings.studentId, user.id))
      .where(inArray(bookings.slotId, slotIds))
      .orderBy(desc(bookings.bookedAt));

    for (const b of bookingRows) {
      ownedBookingIds.push(b.id);
      const bookingSnapshot = bookingsById.get(b.id);
      const resources = bookingSnapshot
        ? mergeBookingResources(bookingSnapshot, resourcesByBookingId.get(b.id) ?? [])
        : resourcesByBookingId.get(b.id) ?? [];
      ownedBookings.push({
        id: b.id,
        slotId: b.slotId,
        studentId: b.studentId,
        courseId: b.courseId,
        groupId: b.groupId,
        status: b.status,
        sessionDate: b.sessionDate ?? null,
        startTime: b.startTime ?? null,
        endTime: b.endTime ?? null,
        mode: b.mode,
        location: b.location ?? null,
        googleMeetUrl: b.googleMeetUrl ?? null,
        topic: b.topic ?? null,
        preSessionNotes: b.preSessionNotes ?? null,
        postSessionNotes: b.postSessionNotes ?? null,
        postSessionLinkUrl: b.postSessionLinkUrl ?? null,
        postSessionLinkTitle: b.postSessionLinkTitle ?? null,
        completedAt: b.completedAt ? normalizeDate(b.completedAt) : null,
        bookedAt: normalizeDate(b.bookedAt),
        group: b.groupId ? { id: b.groupId, name: b.groupName ?? "" } : null,
        course: b.courseId ? { id: b.courseId, title: b.courseTitle ?? "" } : null,
        student: b.studentId
          ? {
              id: b.studentId,
              name: b.studentName ?? null,
              email: b.studentEmail ?? null,
            }
          : null,
        auditLogs: [],
        rescheduleTickets: [],
        ...splitBookingResources(resources),
      });
    }
  }

  const rawAuditLogs = ownedBookingIds.length
    ? await (async () => {
        try {
          return await client
            .select({
              id: bookingAuditLogs.id,
              bookingId: bookingAuditLogs.bookingId,
              action: bookingAuditLogs.action,
              summary: bookingAuditLogs.summary,
              actorId: bookingAuditLogs.actorId,
              actorName: user.name,
              actorEmail: user.email,
              createdAt: bookingAuditLogs.createdAt,
            })
            .from(bookingAuditLogs)
            .leftJoin(user, eq(bookingAuditLogs.actorId, user.id))
            .where(inArray(bookingAuditLogs.bookingId, ownedBookingIds))
            .orderBy(asc(bookingAuditLogs.createdAt), asc(bookingAuditLogs.id));
        } catch {
          console.warn("Booking audit logs are unavailable; continuing without activity entries.");
          return [];
        }
      })()
    : [];

  const auditLogsByBookingId = new Map<string, OwnedAuditLogItem[]>();
  for (const log of rawAuditLogs) {
    const list = auditLogsByBookingId.get(log.bookingId) ?? [];
    list.push({
      id: log.id,
      action: log.action,
      summary: log.summary,
      actor: log.actorId
        ? {
            id: log.actorId,
            name: log.actorName ?? null,
            email: log.actorEmail ?? null,
          }
        : null,
      createdAt: normalizeDate(log.createdAt),
    });
    auditLogsByBookingId.set(log.bookingId, list);
  }
  for (const booking of ownedBookings) {
    booking.auditLogs = auditLogsByBookingId.get(booking.id) ?? [];
  }

  // 6. Fetch owned tickets
  const ticketConditions = fromDate || toDate
    ? [
        and(
          eq(bookingRescheduleTickets.tutorId, tutorId),
          ownedBookingIds.length > 0
            ? or(
                inArray(bookingRescheduleTickets.bookingId, ownedBookingIds),
                and(
                  isNotNull(bookingRescheduleTickets.proposedDate),
                  ...(fromDate ? [gte(bookingRescheduleTickets.proposedDate, fromDate)] : []),
                  ...(toDate ? [lte(bookingRescheduleTickets.proposedDate, toDate)] : []),
                ),
              )
            : and(
                isNotNull(bookingRescheduleTickets.proposedDate),
                ...(fromDate ? [gte(bookingRescheduleTickets.proposedDate, fromDate)] : []),
                ...(toDate ? [lte(bookingRescheduleTickets.proposedDate, toDate)] : []),
              ),
        )!,
      ]
    : [eq(bookingRescheduleTickets.tutorId, tutorId)];
  if (!fromDate && !toDate && ownedBookingIds.length > 0) {
    ticketConditions.push(
      and(
        isNull(bookingRescheduleTickets.tutorId),
        inArray(bookingRescheduleTickets.bookingId, ownedBookingIds),
      )!,
    );
  } else if ((fromDate || toDate) && ownedBookingIds.length > 0) {
    ticketConditions.push(
      and(
        isNull(bookingRescheduleTickets.tutorId),
        inArray(bookingRescheduleTickets.bookingId, ownedBookingIds),
      )!,
    );
  }

  const rawTickets = await client
    .select({
      id: bookingRescheduleTickets.id,
      bookingId: bookingRescheduleTickets.bookingId,
      groupId: bookingRescheduleTickets.groupId,
      requestedById: bookingRescheduleTickets.requestedById,
      tutorId: bookingRescheduleTickets.tutorId,
      type: bookingRescheduleTickets.type,
      status: bookingRescheduleTickets.status,
      reason: bookingRescheduleTickets.reason,
      proposedSlotId: bookingRescheduleTickets.proposedSlotId,
      proposedDate: bookingRescheduleTickets.proposedDate,
      decisionNotes: bookingRescheduleTickets.decisionNotes,
      decidedAt: bookingRescheduleTickets.decidedAt,
      createdAt: bookingRescheduleTickets.createdAt,
    })
    .from(bookingRescheduleTickets)
    .where(or(...ticketConditions))
    .orderBy(desc(bookingRescheduleTickets.createdAt));

  // Discussion thread per ticket (student <-> tutor negotiation history).
  const rawTicketIds = rawTickets.map((t) => t.id);
  const rawTicketMessages =
    rawTicketIds.length > 0
      ? await client
          .select({
            id: bookingTicketMessages.id,
            ticketId: bookingTicketMessages.ticketId,
            senderId: bookingTicketMessages.senderId,
            message: bookingTicketMessages.message,
            createdAt: bookingTicketMessages.createdAt,
            senderName: user.name,
          })
          .from(bookingTicketMessages)
          .leftJoin(user, eq(user.id, bookingTicketMessages.senderId))
          .where(inArray(bookingTicketMessages.ticketId, rawTicketIds))
          .orderBy(bookingTicketMessages.createdAt)
      : [];

  const messagesByTicketId = new Map<string, OwnedTicketMessageItem[]>();
  for (const m of rawTicketMessages) {
    const list = messagesByTicketId.get(m.ticketId) ?? [];
    list.push({
      id: m.id,
      senderId: m.senderId,
      senderName: m.senderName ?? null,
      message: m.message,
      createdAt: normalizeDate(m.createdAt),
    });
    messagesByTicketId.set(m.ticketId, list);
  }

  const seenTicketIds = new Set<string>();
  const ownedTickets: OwnedTicketItem[] = [];

  for (const t of rawTickets) {
    if (!seenTicketIds.has(t.id)) {
      seenTicketIds.add(t.id);
      ownedTickets.push({
        id: t.id,
        bookingId: t.bookingId,
        groupId: t.groupId,
        requestedById: t.requestedById,
        tutorId: t.tutorId ?? null,
        type: t.type,
        status: t.status,
        reason: t.reason,
        proposedSlotId: t.proposedSlotId ?? null,
        proposedDate: t.proposedDate ?? null,
        decisionNotes: t.decisionNotes ?? null,
        decidedAt: t.decidedAt ? normalizeDate(t.decidedAt) : null,
        createdAt: normalizeDate(t.createdAt),
        messages: messagesByTicketId.get(t.id) ?? [],
      });
    }
  }

  const ticketsByBookingId = new Map<string, OwnedTicketItem[]>();
  for (const ticket of ownedTickets) {
    const list = ticketsByBookingId.get(ticket.bookingId) ?? [];
    list.push(ticket);
    ticketsByBookingId.set(ticket.bookingId, list);
  }
  for (const booking of ownedBookings) {
    booking.rescheduleTickets = ticketsByBookingId.get(booking.id) ?? [];
  }

  // 7. Fetch published academic schedules relevant to tutor
  const scheduleConditions = [eq(academicSchedules.createdById, tutorId)];
  if (assignedCourseIdArray.length > 0) {
    scheduleConditions.push(
      inArray(academicSchedules.courseId, assignedCourseIdArray),
    );
  }

  const scheduleRangeConditions = [];
  if (fromDate || toDate) {
    const rangeStart = fromDate ? new Date(`${fromDate}T00:00:00.000+07:00`) : undefined;
    const rangeEnd = toDate ? new Date(`${toDate}T23:59:59.999+07:00`) : undefined;
    if (rangeEnd) scheduleRangeConditions.push(lte(academicSchedules.startDate, rangeEnd));
    if (rangeStart) {
      // A schedule without an end is a single event at its start.
      scheduleRangeConditions.push(
        gte(sql`coalesce(${academicSchedules.endDate}, ${academicSchedules.startDate})`, rangeStart),
      );
    }
  }

  const rawSchedules = await client
    .select({
      id: academicSchedules.id,
      title: academicSchedules.title,
      type: academicSchedules.type,
      courseId: academicSchedules.courseId,
      description: academicSchedules.description,
      startDate: academicSchedules.startDate,
      endDate: academicSchedules.endDate,
      location: academicSchedules.location,
      status: academicSchedules.status,
    })
    .from(academicSchedules)
    .where(
      and(
        eq(academicSchedules.status, "published"),
        or(...scheduleConditions),
        ...scheduleRangeConditions,
      ),
    )
    .orderBy(desc(academicSchedules.startDate));

  const ownedSchedules: OwnedAcademicScheduleItem[] = rawSchedules.map((s) => ({
    id: s.id,
    title: s.title,
    type: s.type,
    courseId: s.courseId ?? null,
    description: s.description ?? null,
    startDate: normalizeDate(s.startDate),
    endDate: s.endDate ? normalizeDate(s.endDate) : null,
    location: s.location ?? null,
    status: s.status,
  }));

  return {
    tutor: {
      id: tutorId,
      name: userRows[0].name ?? null,
      email: userRows[0].email ?? null,
      status: tutorStatus,
    },
    assignedActiveCourses,
    eligibleGroups,
    ownedSlots,
    ownedBookings,
    ownedTickets,
    ownedSchedules,
    compatibilitySource,
  };
}
