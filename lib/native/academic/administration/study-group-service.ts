import "server-only";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditMutasi, bookings, courses, enrollmentTokens, groupCourses, groups } from "@/db/schema";
import { listNativeCourseChoices, lockNativeCourseAssignments } from "./course-assignments";
import { revisionOf } from "@/lib/admin-mcp/revision";
import { assertNativeAdminTransaction, postgresCode, type NativeAdminViewer } from "./admin-transaction";
import { insertStudyGroupCourses, insertStudyGroupRecord, replaceStudyGroupCourses, updateStudyGroupRecord } from "@/lib/groups/study-group-records";
import { getSemesterEndDate } from "@/lib/utils";
import { validateStudyGroupFields, type StudyGroupEditorRead, type StudyGroupRecord, type StudyGroupWrite } from "@/packages/academic/study-group-edit";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
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
  return { group, view };
}

export async function readNativeStudyGroupEditor(id?: string): Promise<StudyGroupEditorRead | null> {
  if (!id) return { type: "create", courses: await listNativeCourseChoices() };
  return db.transaction(async tx => {
    const result = await readGroup(tx, id);
    if (!result) return null;
    const choices = await tx.select({ id: courses.id, title: courses.title }).from(courses).orderBy(asc(courses.title), asc(courses.id));
    return { type: "edit" as const, record: result.view, choices };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}


export async function saveNativeStudyGroup(command: StudyGroupWrite, requestId: string, viewer: NativeAdminViewer) {
  const actorId = viewer.user.id;
  const receiptId = `native_group_${revisionOf({ actorId, sessionId: viewer.session.id, requestId })}`;
  const inputHash = revisionOf(command);
  async function write() {
    return db.transaction(async (tx) => {
      await assertNativeAdminTransaction(tx, viewer);
      const current = command.type === "edit" ? await readGroup(tx, command.id, true) : undefined;
      const [receipt] = await tx.select().from(auditMutasi).where(eq(auditMutasi.id, receiptId)).limit(1);
      if (receipt) {
        if (receipt.actorId !== actorId || receipt.entityType !== receiptType || receipt.afterSnapshot?.inputHash !== inputHash
          || (command.type === "edit" && receipt.entityId !== command.id)) {
          throw new Error("REQUEST_CONFLICT");
        }
        const savedGroup = command.type === "edit" ? current : await readGroup(tx, receipt.entityId, true);
        if (!savedGroup) throw new Error("GROUP_NOT_FOUND");
        return { status: "saved" as const, id: receipt.entityId };
      }

      let id: string;
      if (command.type === "edit") {
        if (!current) throw new Error("GROUP_NOT_FOUND");
        if (current.view.revision !== command.fields.expectedRevision) return { status: "conflict" as const, record: current.view };
        const { totalQuotaSessions, weeklyQuotaSessions, courseIds, ...fields } = command.fields;
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
        if (courseIds !== undefined) {
          const rows = courseIds.length ? await tx.select({ id: courses.id }).from(courses).where(inArray(courses.id, courseIds))
            .orderBy(asc(courses.id)).for("key share") : [];
          if (rows.length !== courseIds.length) throw new Error("INVALID_COURSE");
          const previousIds = new Set(current.view.courses.map(course => course.id));
          if (courseIds.length !== previousIds.size || courseIds.some(courseId => !previousIds.has(courseId))) {
            await replaceStudyGroupCourses(tx, id, courseIds, new Date());
          }
        }
      } else {
        if (validateStudyGroupFields(command.fields)) throw new Error("INVALID_GROUP");
        const courseIds = await lockNativeCourseAssignments(tx, command.fields.courseIds);
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
