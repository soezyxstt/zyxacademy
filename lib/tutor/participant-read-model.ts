import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  courses,
  enrollments,
  groupCourses,
  groupMembers,
  groups,
  mataKuliah,
  pengguna,
  user,
} from "@/db/schema";
import {
  type DbExecutor,
  requireTutorCourseAccess,
  type TutorAccessSource,
} from "@/lib/auth/tutor-access";
import { normalizeDate } from "@/lib/date-utils";
import {
  getDeterministicGroupRepresentative,
  type GroupRepresentativeResult,
} from "@/lib/schedule/tutor-policy";

export interface CourseParticipantGroupMembership {
  id: string;
  name: string;
  packageType: string;
  role: "leader" | "member";
  joinedAt: Date | null;
}

export interface CourseParticipantItem {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  enrollmentType: "direct" | "group" | "both";
  enrolledAt: Date | null;
  expiresAt: Date | null;
  groups: CourseParticipantGroupMembership[];
}

export interface CourseGroupMemberItem {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: "leader" | "member";
  joinedAt: Date | null;
}

export interface CourseGroupItem {
  id: string;
  name: string;
  packageType: string;
  packageName: string;
  status: string;
  totalQuotaSessions: number;
  usedQuotaSessions: number;
  weeklyQuotaSessions: number;
  academicYear: string;
  semester: string;
  membersCount: number;
  representative: GroupRepresentativeResult | null;
  members: CourseGroupMemberItem[];
}

export interface TutorCourseParticipantsPayload {
  course: {
    id: string;
    code: string;
    title: string;
    legacyCourseId: string | null;
    accessSource: TutorAccessSource | null;
    isCompatibilityFallback: boolean;
  };
  summary: {
    totalParticipants: number;
    directEnrollmentsCount: number;
    groupParticipantsCount: number;
    activeGroupsCount: number;
  };
  participants: CourseParticipantItem[];
  groups: CourseGroupItem[];
}

export interface GetTutorCourseParticipantsOptions {
  allowAdmin?: boolean;
}

export async function getTutorCourseParticipants(
  penggunaId: string,
  courseId: string,
  options?: GetTutorCourseParticipantsOptions,
  executor?: DbExecutor,
  readCourseAccess: typeof requireTutorCourseAccess = requireTutorCourseAccess,
): Promise<TutorCourseParticipantsPayload> {
  const client = (executor ?? db) as typeof db;

  // 1. Enforce tutor course access boundary
  const access = await (executor ? requireTutorCourseAccess : readCourseAccess)(
    penggunaId,
    courseId,
    { allowAdmin: options?.allowAdmin },
    executor,
  );

  const courseIdsToCheck: string[] = [
    access.courseId,
    access.legacyCourseId,
    courseId,
  ].filter((id): id is string => typeof id === "string" && id.trim().length > 0);

  // 2. Fetch course details
  let courseTitle = "Mata Kuliah";
  let courseCode = "";

  const mkRows = await client
    .select({
      id: mataKuliah.id,
      code: mataKuliah.code,
      title: mataKuliah.title,
    })
    .from(mataKuliah)
    .where(inArray(mataKuliah.id, courseIdsToCheck))
    .limit(1);

  if (mkRows.length > 0) {
    courseTitle = mkRows[0].title;
    courseCode = mkRows[0].code;
  } else {
    const legacyCourseRows = await client
      .select({
        id: courses.id,
        title: courses.title,
      })
      .from(courses)
      .where(inArray(courses.id, courseIdsToCheck))
      .limit(1);

    if (legacyCourseRows.length > 0) {
      courseTitle = legacyCourseRows[0].title;
      courseCode = legacyCourseRows[0].id;
    }
  }

  // 3. Query active direct enrollments
  // Must join with pengguna to ensure active user status, and check expiration
  const now = new Date();
  const directEnrollmentRows = await client
    .select({
      id: enrollments.id,
      userId: enrollments.userId,
      enrolledAt: enrollments.enrolledAt,
      expiresAt: enrollments.expiresAt,
      userName: user.name,
      userEmail: user.email,
      userImage: user.image,
      penggunaStatus: pengguna.status,
    })
    .from(enrollments)
    .innerJoin(pengguna, eq(enrollments.userId, pengguna.id))
    .innerJoin(user, eq(enrollments.userId, user.id))
    .where(
      and(
        inArray(enrollments.courseId, courseIdsToCheck),
        eq(pengguna.status, "active"),
      ),
    );

  const activeDirectEnrollments = directEnrollmentRows.filter((row) => {
    if (row.penggunaStatus !== "active") return false;
    if (row.expiresAt) {
      const exp = normalizeDate(row.expiresAt);
      if (exp.getTime() < now.getTime()) {
        return false;
      }
    }
    return true;
  });

  // Deduplicate active direct enrollments by userId
  const activeDirectByUser = new Map<string, (typeof activeDirectEnrollments)[0]>();
  for (const row of activeDirectEnrollments) {
    const existing = activeDirectByUser.get(row.userId);
    if (!existing) {
      activeDirectByUser.set(row.userId, row);
    } else {
      const existingExp = existing.expiresAt ? normalizeDate(existing.expiresAt).getTime() : Infinity;
      const rowExp = row.expiresAt ? normalizeDate(row.expiresAt).getTime() : Infinity;
      if (rowExp > existingExp) {
        activeDirectByUser.set(row.userId, row);
      }
    }
  }

  // 4. Query active groups linked to this course through groupCourses
  const groupCourseRows = await client
    .select({
      groupId: groupCourses.groupId,
      courseId: groupCourses.courseId,
    })
    .from(groupCourses)
    .where(inArray(groupCourses.courseId, courseIdsToCheck));

  const eligibleGroupIds = Array.from(
    new Set(groupCourseRows.map((gc) => gc.groupId).filter(Boolean)),
  );

  let activeGroupRows: Array<{
    id: string;
    name: string;
    packageType: "reguler_15" | "intensif_30" | "super_intensif_45" | "custom";
    packageName: string;
    status: "active" | "completed" | "inactive" | "archived";
    totalQuotaSessions: number;
    usedQuotaSessions: number;
    weeklyQuotaSessions: number;
    academicYear: string;
    semester: string;
  }> = [];

  if (eligibleGroupIds.length > 0) {
    activeGroupRows = await client
      .select({
        id: groups.id,
        name: groups.name,
        packageType: groups.packageType,
        packageName: groups.packageName,
        status: groups.status,
        totalQuotaSessions: groups.totalQuotaSessions,
        usedQuotaSessions: groups.usedQuotaSessions,
        weeklyQuotaSessions: groups.weeklyQuotaSessions,
        academicYear: groups.academicYear,
        semester: groups.semester,
      })
      .from(groups)
      .where(
        and(
          inArray(groups.id, eligibleGroupIds),
          eq(groups.status, "active"),
        ),
      );
  }

  const activeGroupIds = activeGroupRows.map((g) => g.id);

  // 5. Query group members for active groups
  let activeGroupMemberRows: Array<{
    id: string;
    groupId: string;
    userId: string;
    role: "leader" | "member";
    joinedAt: Date | null;
    userName: string;
    userEmail: string;
    userImage: string | null;
    penggunaStatus: string;
  }> = [];

  if (activeGroupIds.length > 0) {
    activeGroupMemberRows = await client
      .select({
        id: groupMembers.id,
        groupId: groupMembers.groupId,
        userId: groupMembers.userId,
        role: groupMembers.role,
        joinedAt: groupMembers.joinedAt,
        userName: user.name,
        userEmail: user.email,
        userImage: user.image,
        penggunaStatus: pengguna.status,
      })
      .from(groupMembers)
      .innerJoin(pengguna, eq(groupMembers.userId, pengguna.id))
      .innerJoin(user, eq(groupMembers.userId, user.id))
      .where(
        and(
          inArray(groupMembers.groupId, activeGroupIds),
          eq(pengguna.status, "active"),
        ),
      );
  }

  // Deduplicate group members by (groupId, userId)
  // If duplicate exists, prefer "leader" role and earliest joinedAt
  const deduplicatedGroupMemberMap = new Map<
    string,
    (typeof activeGroupMemberRows)[0]
  >();

  for (const m of activeGroupMemberRows) {
    const key = `${m.groupId}:${m.userId}`;
    const existing = deduplicatedGroupMemberMap.get(key);
    if (!existing) {
      deduplicatedGroupMemberMap.set(key, m);
    } else {
      const preferLeader = m.role === "leader" && existing.role !== "leader";
      const existingJoined = existing.joinedAt ? normalizeDate(existing.joinedAt).getTime() : Infinity;
      const mJoined = m.joinedAt ? normalizeDate(m.joinedAt).getTime() : Infinity;
      const preferEarlierJoined = mJoined < existingJoined;

      if (preferLeader || (existing.role === m.role && preferEarlierJoined)) {
        deduplicatedGroupMemberMap.set(key, m);
      }
    }
  }

  const deduplicatedGroupMemberRows = Array.from(deduplicatedGroupMemberMap.values());

  // 6. Build Group map and representative calculation
  const groupMembersByGroupId = new Map<
    string,
    Array<{
      id: string;
      userId: string;
      role: "leader" | "member";
      joinedAt: Date | null;
      name: string;
      email: string;
      image: string | null;
    }>
  >();

  for (const m of deduplicatedGroupMemberRows) {
    const list = groupMembersByGroupId.get(m.groupId) ?? [];
    list.push({
      id: m.id,
      userId: m.userId,
      role: m.role,
      joinedAt: m.joinedAt ? normalizeDate(m.joinedAt) : null,
      name: m.userName,
      email: m.userEmail,
      image: m.userImage,
    });
    groupMembersByGroupId.set(m.groupId, list);
  }

  const groupsList: CourseGroupItem[] = [];

  for (const g of activeGroupRows) {
    const members = groupMembersByGroupId.get(g.id) ?? [];
    const representative = getDeterministicGroupRepresentative(
      members.map((m) => ({
        id: m.id,
        userId: m.userId,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
    );

    // Sort members: leader first, then by name
    const sortedMembers: CourseGroupMemberItem[] = members
      .map((m) => ({
        userId: m.userId,
        name: m.name,
        email: m.email,
        image: m.image,
        role: m.role,
        joinedAt: m.joinedAt,
      }))
      .sort((a, b) => {
        if (a.role !== b.role) {
          return a.role === "leader" ? -1 : 1;
        }
        return a.name.localeCompare(b.name, "id");
      });

    groupsList.push({
      id: g.id,
      name: g.name,
      packageType: g.packageType,
      packageName: g.packageName,
      status: g.status,
      totalQuotaSessions: g.totalQuotaSessions,
      usedQuotaSessions: g.usedQuotaSessions,
      weeklyQuotaSessions: g.weeklyQuotaSessions,
      academicYear: g.academicYear,
      semester: g.semester,
      membersCount: sortedMembers.length,
      representative,
      members: sortedMembers,
    });
  }

  // Sort groups alphabetically by name
  groupsList.sort((a, b) => a.name.localeCompare(b.name, "id") || a.id.localeCompare(b.id));

  // 7. Assemble deduplicated participant list
  const participantMap = new Map<
    string,
    {
      userId: string;
      name: string;
      email: string;
      image: string | null;
      isDirect: boolean;
      enrolledAt: Date | null;
      expiresAt: Date | null;
      groups: CourseParticipantGroupMembership[];
    }
  >();

  // Add direct enrollments (deduplicated by userId)
  for (const row of activeDirectByUser.values()) {
    participantMap.set(row.userId, {
      userId: row.userId,
      name: row.userName,
      email: row.userEmail,
      image: row.userImage,
      isDirect: true,
      enrolledAt: row.enrolledAt ? normalizeDate(row.enrolledAt) : null,
      expiresAt: row.expiresAt ? normalizeDate(row.expiresAt) : null,
      groups: [],
    });
  }

  // Add group memberships (deduplicated by (groupId, userId))
  const activeGroupMetaById = new Map<string, { id: string; name: string; packageType: string }>();
  for (const g of activeGroupRows) {
    activeGroupMetaById.set(g.id, {
      id: g.id,
      name: g.name,
      packageType: g.packageType,
    });
  }

  for (const m of deduplicatedGroupMemberRows) {
    const grp = activeGroupMetaById.get(m.groupId);
    if (!grp) continue;

    const groupMembership: CourseParticipantGroupMembership = {
      id: grp.id,
      name: grp.name,
      packageType: grp.packageType,
      role: m.role,
      joinedAt: m.joinedAt ? normalizeDate(m.joinedAt) : null,
    };

    const existing = participantMap.get(m.userId);
    if (existing) {
      existing.groups.push(groupMembership);
    } else {
      participantMap.set(m.userId, {
        userId: m.userId,
        name: m.userName,
        email: m.userEmail,
        image: m.userImage,
        isDirect: false,
        enrolledAt: m.joinedAt ? normalizeDate(m.joinedAt) : null,
        expiresAt: null,
        groups: [groupMembership],
      });
    }
  }

  // Map to final items with deterministic sort
  const participantsList: CourseParticipantItem[] = Array.from(
    participantMap.values(),
  ).map((p) => {
    let enrollmentType: "direct" | "group" | "both" = "direct";
    if (p.isDirect && p.groups.length > 0) {
      enrollmentType = "both";
    } else if (p.isDirect) {
      enrollmentType = "direct";
    } else {
      enrollmentType = "group";
    }

    return {
      userId: p.userId,
      name: p.name,
      email: p.email,
      image: p.image,
      enrollmentType,
      enrolledAt: p.enrolledAt,
      expiresAt: p.expiresAt,
      groups: p.groups.sort((a, b) => a.name.localeCompare(b.name, "id")),
    };
  });

  // Sort participants by name ascending, tie-break with userId
  participantsList.sort(
    (a, b) =>
      a.name.localeCompare(b.name, "id") || a.userId.localeCompare(b.userId),
  );

  const directCount = activeDirectByUser.size;
  const groupUniqueUserIds = new Set(deduplicatedGroupMemberRows.map((m) => m.userId));

  return {
    course: {
      id: access.courseId ?? courseId,
      code: courseCode,
      title: courseTitle,
      legacyCourseId: access.legacyCourseId,
      accessSource: access.source,
      isCompatibilityFallback: access.isCompatibilityFallback,
    },
    summary: {
      totalParticipants: participantsList.length,
      directEnrollmentsCount: directCount,
      groupParticipantsCount: groupUniqueUserIds.size,
      activeGroupsCount: groupsList.length,
    },
    participants: participantsList,
    groups: groupsList,
  };
}
