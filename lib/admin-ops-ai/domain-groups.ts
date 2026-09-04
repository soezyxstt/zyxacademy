import { db } from "@/db";
import {
  groups,
  groupCourses,
  groupMembers,
  enrollmentTokens,
  enrollmentTokenCourses,
  courses,
  user,
} from "@/db/schema";
import { eq, desc, inArray, and, like } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getSemesterEndDate } from "@/lib/utils";
import { PACKAGE_PRESETS, type PackageType } from "@/lib/group-constants";

export interface ListStudyGroupsInput {
  courseId?: string;
  search?: string;
  hasTutor?: boolean;
}

export async function executeListStudyGroups(input: ListStudyGroupsInput) {
  const groupRows = await db.query.groups.findMany({
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
      bookings: {
        with: {
          slot: {
            with: {
              tutor: true,
            },
          },
        },
      },
    },
    orderBy: [desc(groups.createdAt)],
    limit: 50,
  });

  let formatted = groupRows.map((g) => {
    const directCourses = g.courses.map((gc) => ({
      id: gc.course.id,
      title: gc.course.title,
    }));

    const memberList = g.members.map((m) => ({
      id: m.userId,
      name: m.user.name,
      email: m.user.email,
    }));

    const assignedTutors = Array.from(
      new Set(g.bookings.map((b) => b.slot?.tutor?.name).filter(Boolean))
    );

    return {
      id: g.id,
      name: g.name,
      packageName: g.packageName,
      memberCount: memberList.length,
      members: memberList,
      courses: directCourses,
      assignedTutors,
      status: g.status,
      createdAt: g.createdAt,
    };
  });

  if (input.courseId) {
    const cId = input.courseId.trim().toLowerCase();
    formatted = formatted.filter((g) => g.courses.some((c) => c.id.toLowerCase() === cId));
  }
  if (input.search) {
    const q = input.search.toLowerCase();
    formatted = formatted.filter((g) => g.name.toLowerCase().includes(q));
  }
  if (input.hasTutor !== undefined) {
    formatted = formatted.filter((g) => input.hasTutor ? g.assignedTutors.length > 0 : g.assignedTutors.length === 0);
  }

  return {
    summary: `Ditemukan ${formatted.length} kelompok belajar.`,
    data: formatted,
  };
}

export interface CreateStudyGroupInput {
  name: string;
  courseIds: string[];
  capacity?: number;
  packageType?: PackageType;
}

export async function executeCreateStudyGroup(input: CreateStudyGroupInput, actorId?: string) {
  const name = input.name.trim();
  if (!name) throw new Error("Nama kelompok belajar wajib diisi.");
  if (!input.courseIds || input.courseIds.length === 0) {
    throw new Error("Pilih setidaknya satu mata kuliah untuk kelompok belajar.");
  }

  const packageType = input.packageType || "reguler_15";
  const preset = PACKAGE_PRESETS[packageType] || PACKAGE_PRESETS.reguler_15;
  const groupId = `grp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date();
  const endDate = getSemesterEndDate(now);

  await db.transaction(async (tx) => {
    await tx.insert(groups).values({
      id: groupId,
      name,
      packageType,
      packageName: preset.name,
      totalQuotaSessions: preset.quota,
      weeklyQuotaSessions: preset.weeklySessions,
      usedQuotaSessions: 0,
      academicYear: "2026/2027",
      semester: "Ganjil",
      startDate: now,
      endDate,
      status: "active",
      notes: `Dibuat via Zyx Ops AI oleh ${actorId ?? "admin"}`,
    });

    for (const cId of input.courseIds) {
      await tx.insert(groupCourses).values({
        id: randomUUID(),
        groupId,
        courseId: cId.trim().toLowerCase(),
      });
    }
  });

  return {
    summary: `Kelompok belajar '${name}' (ID: ${groupId}) berhasil dibuat dengan paket '${preset.name}' untuk ${input.courseIds.length} mata kuliah.`,
    data: { id: groupId, name, packageType, courses: input.courseIds },
  };
}

export interface AssignTutorToGroupInput {
  groupId: string;
  tutorId: string;
}

export async function executeAssignTutorToGroup(input: AssignTutorToGroupInput, actorId?: string) {
  const groupId = input.groupId.trim();
  const tutorId = input.tutorId.trim();
  if (!groupId) throw new Error("ID Kelompok wajib diisi.");
  if (!tutorId) throw new Error("ID Tutor wajib diisi.");

  const targetGroup = await db.query.groups.findFirst({ where: eq(groups.id, groupId) });
  if (!targetGroup) throw new Error(`Kelompok belajar '${groupId}' tidak ditemukan.`);

  const tutor = await db.query.user.findFirst({ where: eq(user.id, tutorId) });
  if (!tutor) throw new Error(`Tutor dengan ID '${tutorId}' tidak ditemukan.`);

  // Update group notes or assign via audit
  await db
    .update(groups)
    .set({
      notes: `${targetGroup.notes ? `${targetGroup.notes}; ` : ""}Tutor pendamping: ${tutor.name} (${tutor.id})`,
      updatedAt: new Date(),
    })
    .where(eq(groups.id, groupId));

  return {
    summary: `Tutor '${tutor.name}' berhasil ditugaskan ke kelompok belajar '${targetGroup.name}'.`,
    data: { groupId, groupName: targetGroup.name, tutorId, tutorName: tutor.name },
  };
}

export interface CreateEnrollmentTokenInput {
  courseIds: string[];
  capacity: number;
  packageType?: PackageType;
}

export async function executeCreateEnrollmentToken(input: CreateEnrollmentTokenInput, actorId?: string) {
  const rawCourses = input.courseIds.map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (rawCourses.length === 0) throw new Error("Pilih setidaknya satu mata kuliah.");

  const capacity = Math.max(1, Math.min(5, input.capacity || 5));
  const packageType = input.packageType || "reguler_15";
  const preset = PACKAGE_PRESETS[packageType] || PACKAGE_PRESETS.reguler_15;

  const now = new Date();
  const expiresAt = getSemesterEndDate(now);
  const unique8 = randomUUID().split("-")[0].toUpperCase();
  const tokenString = `Zyx-${unique8}-${capacity}-${rawCourses.length}`;

  const tokenId = randomUUID();
  const groupId = randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(groups).values({
      id: groupId,
      name: `Kelompok Token ${tokenString}`,
      packageType,
      packageName: preset.name,
      totalQuotaSessions: preset.quota,
      weeklyQuotaSessions: preset.weeklySessions,
      usedQuotaSessions: 0,
      startDate: now,
      endDate: expiresAt,
      status: "active",
      notes: `Token aktivasi: ${tokenString}`,
    });

    for (const cId of rawCourses) {
      await tx.insert(groupCourses).values({
        id: randomUUID(),
        groupId,
        courseId: cId,
      });
    }

    await tx.insert(enrollmentTokens).values({
      id: tokenId,
      token: tokenString,
      capacity,
      groupId,
      createdAt: now,
      expiresAt,
    });

    for (const cId of rawCourses) {
      await tx.insert(enrollmentTokenCourses).values({
        tokenId,
        courseId: cId,
      });
    }
  });

  return {
    summary: `Token aktivasi '${tokenString}' berhasil dibuat untuk ${rawCourses.length} mata kuliah dengan kuota ${capacity} orang.`,
    data: {
      tokenId,
      token: tokenString,
      capacity,
      courses: rawCourses,
      expiresAt: expiresAt.toISOString(),
    },
  };
}

export interface ListEnrollmentTokensInput {
  courseId?: string;
  status?: "active" | "exhausted" | "expired";
}

export async function executeListEnrollmentTokens(input: ListEnrollmentTokensInput) {
  const tokens = await db.query.enrollmentTokens.findMany({
    with: {
      tokenCourses: {
        with: {
          course: true,
        },
      },
      group: {
        with: {
          members: {
            with: {
              user: true,
            },
          },
        },
      },
    },
    orderBy: [desc(enrollmentTokens.createdAt)],
    limit: 50,
  });

  const now = new Date();
  let list = tokens.map((t) => {
    const memberCount = t.group?.members?.length ?? 0;
    const isExpired = t.expiresAt ? new Date(t.expiresAt) < now : false;
    const isExhausted = memberCount >= t.capacity;
    const tokenStatus = isExpired ? "expired" : isExhausted ? "exhausted" : "active";

    return {
      id: t.id,
      token: t.token,
      capacity: t.capacity,
      usedCount: memberCount,
      remainingCount: Math.max(0, t.capacity - memberCount),
      status: tokenStatus,
      courses: t.tokenCourses.map((tc) => tc.course?.title || tc.courseId),
      expiresAt: t.expiresAt,
      createdAt: t.createdAt,
    };
  });

  if (input.status) {
    list = list.filter((t) => t.status === input.status);
  }

  return {
    summary: `Ditemukan ${list.length} token aktivasi.`,
    data: list,
  };
}
