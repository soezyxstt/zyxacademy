import "server-only";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditMutasi, bookings, courses, enrollmentTokens, groupCourses, groups, mataKuliah, session } from "@/db/schema";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";
import { revisionOf } from "@/lib/admin-mcp/revision";
import { assertAuthoringActor } from "@/lib/auth/authoring-actor";
import { insertStudyGroupCourses, insertStudyGroupRecord, updateStudyGroupRecord } from "@/lib/groups/study-group-records";
import { getSemesterEndDate } from "@/lib/utils";
import { validateStudyGroupFields, type StudyGroupEditorRead, type StudyGroupRecord, type StudyGroupWrite } from "@/packages/academic/study-group-edit";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Viewer = { user: { id: string }; session: { id: string } };
const receiptType = "native_study_group";

async function readGroup(tx: Transaction, id: string, lock = false) {
  const query = tx.select().from(groups).where(eq(groups.id, id)).limit(1);
  const [group] = await (lock ? query.for("update") : query);
  if (!group) return null;
  const [token, assignments, [bookingCount]] = await Promise.all([
    tx.select({ id: enrollmentTokens.id }).from(enrollmentTokens).where(eq(enrollmentTokens.groupId, id)).limit(1),
    tx.select({ id: groupCourses.courseId, title: courses.title }).from(groupCourses)
      .innerJoin(courses, eq(groupCourses.courseId, courses.id)).where(eq(groupCourses.groupId, id))
      .orderBy(asc(groupCourses.courseId), asc(groupCourses.id)),
    tx.select({ count: sql<number>`count(*)` }).from(bookings).where(eq(bookings.groupId, id)),
  ]);
  const usedQuotaSessions = Math.max(group.usedQuotaSessions, Number(bookingCount?.count ?? 0));
  const view: StudyGroupRecord = {
    id, courses: assignments, usedQuotaSessions, revision: revisionOf({ group, courses: assignments.map(({ id }) => id), usedQuotaSessions, token }),
    fields: {
      name: group.name,
      packageType: group.packageType,
      totalQuotaSessions: group.totalQuotaSessions,
      weeklyQuotaSessions: group.weeklyQuotaSessions,
      academicYear: group.academicYear,
      semester: group.semester,
      startDate: group.startDate?.toISOString() ?? null,
      endDate: group.endDate?.toISOString() ?? null,
      status: group.status,
      notes: group.notes ?? "",
    },
  };
  return { group, view, tokenLinked: token.length > 0 };
}

export async function readNativeStudyGroupEditor(id?: string): Promise<StudyGroupEditorRead | null> {
  if (!id) {
    const available = await db.select({ id: mataKuliah.id, title: mataKuliah.title }).from(mataKuliah)
      .innerJoin(courses, eq(mataKuliah.legacyCourseId, courses.id)).where(eq(mataKuliah.status, "active"))
      .orderBy(asc(mataKuliah.title), asc(mataKuliah.id));
    return { type: "create", courses: available };
  }
  const result = await db.transaction((tx) => readGroup(tx, id), { isolationLevel: "repeatable read", accessMode: "read only" });
  return result && !result.tokenLinked ? { type: "edit", record: result.view } : null;
}

async function lockCourseAssignments(tx: Transaction, requested: string[]) {
  const identities = await Promise.all(requested.map((id) => resolveCourseIdentity(id, tx)));
  const expected = new Map<string, string>();
  for (const identity of identities) {
    if (!identity?.canonicalId || !identity.legacyId || identity.status !== "active" || expected.has(identity.canonicalId)) {
      throw new Error("INVALID_COURSE");
    }
    expected.set(identity.canonicalId, identity.legacyId);
  }
  if (!expected.size) return [];
  const canonical = await tx.select({ id: mataKuliah.id, legacyId: courses.id }).from(mataKuliah)
    .innerJoin(courses, eq(mataKuliah.legacyCourseId, courses.id))
    .where(and(inArray(mataKuliah.id, [...expected.keys()]), eq(mataKuliah.status, "active")))
    .orderBy(asc(mataKuliah.id)).for("share", { of: [mataKuliah, courses] });
  if (canonical.length !== expected.size || canonical.some((course) => expected.get(course.id) !== course.legacyId)) throw new Error("INVALID_COURSE");
  return canonical.map((course) => course.legacyId);
}

async function assertAuthority(tx: Transaction, viewer: Viewer) {
  await assertAuthoringActor(tx, viewer.user.id, { roles: ["admin"], error: "FORBIDDEN", lock: true });
  const [active] = await tx.select({ expiresAt: session.expiresAt }).from(session)
    .where(and(eq(session.id, viewer.session.id), eq(session.userId, viewer.user.id))).limit(1).for("share");
  if (!active || active.expiresAt.getTime() <= Date.now()) throw new Error("UNAUTHENTICATED");
}

function postgresCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  if ("code" in error && typeof error.code === "string") return error.code;
  return "cause" in error && error.cause !== error ? postgresCode(error.cause) : undefined;
}

export async function saveNativeStudyGroup(command: StudyGroupWrite, requestId: string, viewer: Viewer) {
  const actorId = viewer.user.id;
  const receiptId = `native_group_${revisionOf({ actorId, sessionId: viewer.session.id, requestId })}`;
  const inputHash = revisionOf(command);
  async function write() {
    return db.transaction(async (tx) => {
      await assertAuthority(tx, viewer);
      const current = command.type === "edit" ? await readGroup(tx, command.id, true) : undefined;
      const [receipt] = await tx.select().from(auditMutasi).where(eq(auditMutasi.id, receiptId)).limit(1);
      if (receipt) {
        if (receipt.actorId !== actorId || receipt.entityType !== receiptType || receipt.afterSnapshot?.inputHash !== inputHash
          || (command.type === "edit" && receipt.entityId !== command.id)) {
          throw new Error("REQUEST_CONFLICT");
        }
        const savedGroup = command.type === "edit" ? current : await readGroup(tx, receipt.entityId, true);
        if (!savedGroup || savedGroup.tokenLinked) throw new Error("GROUP_NOT_FOUND");
        return { status: "saved" as const, id: receipt.entityId };
      }

      let id: string;
      if (command.type === "edit") {
        if (!current || current.tokenLinked) throw new Error("GROUP_NOT_FOUND");
        if (current.view.revision !== command.fields.expectedRevision) return { status: "conflict" as const, record: current.view };
        const { totalQuotaSessions, weeklyQuotaSessions, ...fields } = command.fields;
        const isUnchangedZero = current.group.totalQuotaSessions === 0 && current.group.weeklyQuotaSessions === 0;
        if (validateStudyGroupFields(command.fields, isUnchangedZero) || totalQuotaSessions < current.view.usedQuotaSessions) {
          throw new Error("INVALID_QUOTA");
        }
        id = current.group.id;
        await updateStudyGroupRecord(tx, current.group, {
          ...fields,
          ...(totalQuotaSessions !== current.group.totalQuotaSessions ? { totalQuotaSessions } : {}),
          ...(weeklyQuotaSessions !== current.group.weeklyQuotaSessions ? { weeklyQuotaSessions } : {}),
          ...(command.fields.packageType === current.group.packageType ? { packageName: current.group.packageName } : {}),
        });
      } else {
        if (validateStudyGroupFields(command.fields)) throw new Error("INVALID_GROUP");
        const courseIds = await lockCourseAssignments(tx, command.fields.courseIds);
        const date = new Date();
        const semesterEnd = getSemesterEndDate(date);
        const effectiveStart = command.fields.startDate ? Date.parse(command.fields.startDate) : date.getTime();
        const effectiveEnd = command.fields.endDate ? Date.parse(command.fields.endDate) : semesterEnd.getTime();
        if (effectiveEnd < effectiveStart) throw new Error("INVALID_DATES");
        id = randomUUID();
        await insertStudyGroupRecord(tx, id, command.fields, date, semesterEnd);
        await insertStudyGroupCourses(tx, id, courseIds, date);
      }
      await tx.insert(auditMutasi).values({
        id: receiptId, actorId, entityType: receiptType, entityId: id, action: command.type,
        correlationId: requestId, outcome: "success",
        beforeSnapshot: command.type === "edit" ? { revision: command.fields.expectedRevision } : null,
        afterSnapshot: { inputHash },
      });
      return { status: "saved" as const, id };
    });
  }
  const result = await write().catch((error: unknown) => {
    const code = postgresCode(error);
    if (code !== "23505" && code !== "40001" && code !== "40P01") throw error;
    return write();
  });
  if (result.status === "saved") {
    revalidatePath("/admin/groups");
    revalidatePath("/admin/tokens");
    revalidatePath("/dashboard/groups");
  }
  return result;
}

export type StudyGroupWriteResult = Awaited<ReturnType<typeof saveNativeStudyGroup>>;
