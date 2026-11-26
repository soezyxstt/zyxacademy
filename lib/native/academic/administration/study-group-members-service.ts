import "server-only";
import { revalidatePath } from "next/cache";
import { and, asc, eq, ilike, notExists, or } from "drizzle-orm";
import { db } from "@/db";
import { auditMutasi, enrollmentTokens, groupCourses, groupMembers, groups, pengguna, user } from "@/db/schema";
import { revisionOf } from "@/lib/admin-mcp/revision";
import { addStudyGroupMember, lockStudyGroupMembership, removeStudyGroupMember } from "@/lib/groups/study-group-members";
import { getSemesterEndDate } from "@/lib/utils";
import type { StudyGroupMemberEdit, StudyGroupMemberRecovery, StudyGroupMembersRead } from "@/packages/academic/study-group-members";
import { assertNativeAdminTransaction, postgresCode, type NativeAdminViewer } from "./admin-transaction";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const receiptType = "native_group_membership";
const pageSize = 30;
const person = { id: user.id, name: user.name, email: user.email };

function requestIdentity(id: string, draft: StudyGroupMemberEdit, requestId: string, viewer: NativeAdminViewer) {
  const receiptId = `native_group_member_${revisionOf({ actorId: viewer.user.id, sessionId: viewer.session.id, requestId })}`;
  const inputHash = revisionOf({ id, draft });
  return { receiptId, inputHash };
}

function matchesReceipt(receipt: typeof auditMutasi.$inferSelect, id: string, draft: StudyGroupMemberEdit, inputHash: string) {
  return receipt.actorId === draft.accountId && receipt.entityType === receiptType && receipt.entityId === id
    && receipt.action === draft.action && receipt.afterSnapshot?.inputHash === inputHash;
}

async function readMembershipContext(tx: Transaction, group: typeof groups.$inferSelect) {
  const id = group.id;
  const [token] = await tx.select({ id: enrollmentTokens.id }).from(enrollmentTokens).where(eq(enrollmentTokens.groupId, id)).limit(1);
  if (token) return null;
  const [courses, members] = await Promise.all([
    tx.select({ id: groupCourses.id, courseId: groupCourses.courseId }).from(groupCourses)
      .where(eq(groupCourses.groupId, id)).orderBy(asc(groupCourses.id)),
    tx.select({ id: groupMembers.id, userId: groupMembers.userId, role: groupMembers.role }).from(groupMembers)
      .where(eq(groupMembers.groupId, id)).orderBy(asc(groupMembers.id)),
  ]);
  const now = new Date();
  const endDate = group.endDate ?? getSemesterEndDate(now);
  const canAdd = group.status === "active" && endDate > now;
  return { canAdd, members, revision: revisionOf({ id, name: group.name, status: group.status, endDate, courses, members }) };
}

async function readRecoveryTarget(tx: Transaction, id: string, context: NonNullable<Awaited<ReturnType<typeof readMembershipContext>>>,
  recovery: { request: StudyGroupMemberRecovery; viewer: NativeAdminViewer }) {
  const { requestId, ...requested } = recovery.request;
  const draft = { ...requested, accountId: recovery.viewer.user.id };
  const { receiptId, inputHash } = requestIdentity(id, draft, requestId, recovery.viewer);
  const [receipt] = await tx.select().from(auditMutasi).where(eq(auditMutasi.id, receiptId)).limit(1);
  if (receipt && !matchesReceipt(receipt, id, draft, inputHash)) return undefined;
  const alreadyMember = context.members.some((member) => member.userId === draft.userId);
  if (!receipt && (context.revision !== draft.expectedRevision || (draft.action === "remove" ? !alreadyMember : !context.canAdd || alreadyMember))) return undefined;
  const [target] = await tx.select(person).from(user).leftJoin(pengguna, eq(user.id, pengguna.id))
    .where(and(eq(user.id, draft.userId), !receipt && draft.action === "add" ? eq(pengguna.status, "active") : undefined)).limit(1);
  return target;
}

export async function readNativeStudyGroupMembers(id: string, page: number, search: string,
  recovery?: { request: StudyGroupMemberRecovery; viewer: NativeAdminViewer }): Promise<StudyGroupMembersRead | null> {
  return db.transaction(async (tx) => {
    const [group] = await tx.select().from(groups).where(eq(groups.id, id)).limit(1);
    if (!group) return null;
    const context = await readMembershipContext(tx, group);
    if (!context) return null;
    const query = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
    const members = await tx.select({ ...person, membershipId: groupMembers.id, role: groupMembers.role }).from(groupMembers)
      .innerJoin(user, eq(user.id, groupMembers.userId)).where(eq(groupMembers.groupId, id))
      .orderBy(asc(groupMembers.joinedAt), asc(groupMembers.id)).limit(pageSize + 1).offset((page - 1) * pageSize);
    const candidates = context.canAdd && search.length >= 2 ? await tx.select(person).from(user)
      .innerJoin(pengguna, eq(pengguna.id, user.id)).where(and(
        eq(pengguna.status, "active"), or(ilike(user.name, query), ilike(user.email, query)),
        notExists(tx.select({ id: groupMembers.id }).from(groupMembers).where(and(eq(groupMembers.groupId, id), eq(groupMembers.userId, user.id)))),
      )).orderBy(asc(user.name), asc(user.id)).limit(10) : [];
    const recoveryTarget = recovery ? await readRecoveryTarget(tx, id, context, recovery) : undefined;
    return { id, name: group.name, revision: context.revision, canAdd: context.canAdd, members: members.slice(0, pageSize),
      candidates, nextPage: members.length > pageSize, recoveryTarget };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

export async function writeNativeStudyGroupMember(id: string, draft: StudyGroupMemberEdit, requestId: string, viewer: NativeAdminViewer) {
  const actorId = viewer.user.id;
  if (actorId !== draft.accountId) throw new Error("FORBIDDEN");
  const { receiptId, inputHash } = requestIdentity(id, draft, requestId, viewer);
  function write() {
    return db.transaction(async (tx) => {
      await assertNativeAdminTransaction(tx, viewer);
      const group = await lockStudyGroupMembership(tx, id);
      const current = group && await readMembershipContext(tx, group);
      if (!group || !current) throw new Error("GROUP_NOT_FOUND");
      const result = { status: "saved" as const, id, userId: draft.userId, action: draft.action };
      const [receipt] = await tx.select().from(auditMutasi).where(eq(auditMutasi.id, receiptId)).limit(1);
      if (receipt) {
        if (!matchesReceipt(receipt, id, draft, inputHash)) throw new Error("REQUEST_CONFLICT");
        return result;
      }
      if (current.revision !== draft.expectedRevision) return { status: "conflict" as const, id, userId: draft.userId, action: draft.action };
      if (draft.action === "add") {
        if (!current.canAdd) throw new Error("GROUP_NOT_ACTIVE");
        const [target] = await tx.select({ status: pengguna.status }).from(pengguna)
          .where(eq(pengguna.id, draft.userId)).limit(1).for("share");
        if (target?.status !== "active") throw new Error("ACTIVE_USER_REQUIRED");
        await addStudyGroupMember(tx, group, draft.userId);
      } else if (!(await removeStudyGroupMember(tx, id, draft.userId)).length) throw new Error("MEMBER_NOT_FOUND");
      await tx.insert(auditMutasi).values({
        id: receiptId, actorId, entityType: receiptType, entityId: id, action: draft.action,
        correlationId: requestId, outcome: "success", beforeSnapshot: { revision: draft.expectedRevision },
        afterSnapshot: { inputHash, userId: draft.userId },
      });
      return result;
    });
  }
  const result = await write().catch((error: unknown) => {
    const code = postgresCode(error);
    if (code !== "23505" && code !== "40001" && code !== "40P01") throw error;
    return write();
  });
  if (result.status === "saved") {
    revalidatePath("/admin/groups");
    revalidatePath("/dashboard/groups");
  }
  return result;
}

export type StudyGroupMemberWriteResult = Awaited<ReturnType<typeof writeNativeStudyGroupMember>>;
