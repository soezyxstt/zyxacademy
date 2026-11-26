import "server-only";
import { revalidatePath } from "next/cache";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditMutasi, courses, enrollmentTokenCourses, enrollmentTokens, groupMembers, groups } from "@/db/schema";
import { revisionOf } from "@/lib/admin-mcp/revision";
import { expireEnrollmentToken, issueEnrollmentTokenWithGroup } from "@/lib/groups/enrollment-token-lifecycle";
import { validateEnrollmentTokenIssue, type EnrollmentTokenDetails, type EnrollmentTokenEditor, type EnrollmentTokenWrite } from "@/packages/academic/enrollment-token-admin";
import { assertNativeAdminTransaction, postgresCode, type NativeAdminViewer } from "./admin-transaction";
import { listNativeCourseChoices, lockNativeCourseAssignments } from "./course-assignments";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const tokenColumns = { id: enrollmentTokens.id, groupId: enrollmentTokens.groupId, expiresAt: enrollmentTokens.expiresAt, capacity: enrollmentTokens.capacity };

async function readToken(tx: Transaction, id: string, lock = false) {
  const [target] = await tx.select({ groupId: enrollmentTokens.groupId }).from(enrollmentTokens)
    .where(eq(enrollmentTokens.id, id)).limit(1);
  if (!target) return null;

  // Redemption takes the group lock before the token lock.
  const group = tx.select({ endDate: groups.endDate }).from(groups).where(eq(groups.id, target.groupId)).limit(1);
  const [owner] = await (lock ? group.for("no key update") : group);
  if (!owner) return null;
  const lookup = tx.select(tokenColumns).from(enrollmentTokens)
    .where(and(eq(enrollmentTokens.id, id), eq(enrollmentTokens.groupId, target.groupId))).limit(1);
  const [token] = await (lock ? lookup.for("update") : lookup);
  if (!token) return null;
  const [assigned, [membership]] = await Promise.all([
    tx.select({ id: courses.id, title: courses.title }).from(enrollmentTokenCourses)
      .innerJoin(courses, eq(enrollmentTokenCourses.courseId, courses.id))
      .where(eq(enrollmentTokenCourses.tokenId, id)).orderBy(asc(courses.id)),
    tx.select({ count: sql<number>`count(*)` }).from(groupMembers).where(eq(groupMembers.groupId, token.groupId)),
  ]);
  const expiry = Math.min(token.expiresAt.getTime(), owner.endDate?.getTime() ?? Infinity);
  const used = Number(membership?.count ?? 0);
  const details: EnrollmentTokenDetails = {
    id, capacity: token.capacity, used, courses: assigned,
    status: expiry <= Date.now() ? "expired" : "active",
    expiresAt: new Date(expiry).toISOString(),
    revision: revisionOf({ token, groupEndDate: owner.endDate, used, courseIds: assigned.map(({ id }) => id) }),
  };
  return { token, details };
}

export async function readNativeEnrollmentToken(id?: string): Promise<EnrollmentTokenEditor | null> {
  if (!id) return { type: "issue", courses: await listNativeCourseChoices() };
  const current = await db.transaction((tx) => readToken(tx, id), { isolationLevel: "repeatable read", accessMode: "read only" });
  return current ? { type: "token", token: current.details } : null;
}

export async function writeNativeEnrollmentToken(command: EnrollmentTokenWrite, requestId: string, viewer: NativeAdminViewer) {
  const actorId = viewer.user.id;
  const entityType = "native_enrollment_token";
  const receiptId = `native_token_${revisionOf({ actorId, sessionId: viewer.session.id, requestId })}`;
  const inputHash = revisionOf(command);
  async function write() {
    return db.transaction(async (tx) => {
      await assertNativeAdminTransaction(tx, viewer);
      const current = command.type === "revoke" ? await readToken(tx, command.id, true) : null;
      const [receipt] = await tx.select().from(auditMutasi).where(eq(auditMutasi.id, receiptId)).limit(1);
      if (receipt) {
        if (receipt.actorId !== actorId || receipt.entityType !== entityType || receipt.afterSnapshot?.inputHash !== inputHash
          || (command.type === "revoke" && receipt.entityId !== command.id)) throw new Error("REQUEST_CONFLICT");
        const target = command.type === "revoke" ? current : await readToken(tx, receipt.entityId, true);
        if (!target || target.token.groupId !== receipt.afterSnapshot?.groupId) throw new Error("TOKEN_NOT_FOUND");
        if (command.type === "issue" && target.details.status !== "active") throw new Error("TOKEN_NOT_FOUND");
        if (command.type === "revoke" && target.token.expiresAt.getTime() > Date.now()) return { status: "conflict" as const, token: target.details };
        return { status: "saved" as const, id: receipt.entityId };
      }

      let id: string;
      let groupId: string;
      if (command.type === "revoke") {
        if (!current) throw new Error("TOKEN_NOT_FOUND");
        if (current.details.revision !== command.fields.expectedRevision) return { status: "conflict" as const, token: current.details };
        id = current.token.id;
        groupId = current.token.groupId;
        if (current.token.expiresAt.getTime() > Date.now()) await expireEnrollmentToken(tx, id);
      } else {
        if (validateEnrollmentTokenIssue(command.fields)) throw new Error("INVALID_TOKEN");
        const courseIds = await lockNativeCourseAssignments(tx, command.fields.courseIds);
        const issued = await issueEnrollmentTokenWithGroup(tx, { ...command.fields, courseIds, packageType: "custom" });
        id = issued.id;
        groupId = issued.groupId;
      }

      await tx.insert(auditMutasi).values({
        id: receiptId, actorId, entityType, entityId: id, action: command.type, correlationId: requestId,
        outcome: "success", beforeSnapshot: command.type === "revoke" ? { revision: command.fields.expectedRevision } : null,
        afterSnapshot: { inputHash, groupId },
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
    revalidatePath("/admin/tokens");
    revalidatePath("/admin/groups");
    revalidatePath("/dashboard/groups");
  }
  return result;
}

export type EnrollmentTokenWriteResult = Awaited<ReturnType<typeof writeNativeEnrollmentToken>>;
