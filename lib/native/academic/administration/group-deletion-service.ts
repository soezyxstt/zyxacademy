import "server-only";
import { revalidatePath } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, enrollmentTokenCourses, enrollmentTokens, groupCourses, groupMembers, groups } from "@/db/schema";
import { revisionOf } from "@/lib/admin-mcp/revision";
import { deleteEnrollmentTokenGroup } from "@/lib/groups/enrollment-token-lifecycle";
import { deleteStudyGroupRecord } from "@/lib/groups/study-group-records";
import type { GroupDeletion, GroupDeletionTarget, GroupDeletionView } from "@/packages/academic/group-deletion";
import { runAdminCommand } from "./admin-command-receipt";
import { assertNativeAdminTransaction, type NativeAdminViewer } from "./admin-transaction";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function deletionView(tx: Tx, target: GroupDeletionTarget, lock: boolean): Promise<GroupDeletionView | null> {
  const { kind, id } = target;
  const [token] = kind === "token" ? await tx.select({ groupId: enrollmentTokens.groupId }).from(enrollmentTokens)
    .where(eq(enrollmentTokens.id, id)).limit(1) : [];
  const groupId = kind === "token" ? token?.groupId : id;
  if (!groupId) return null;
  const groupQuery = tx.select().from(groups).where(eq(groups.id, groupId)).limit(1);
  const [group] = await (lock ? groupQuery.for("update") : groupQuery);
  if (!group) return null;

  const tokenQuery = tx.select({ id: enrollmentTokens.id, expires: enrollmentTokens.expiresAt, capacity: enrollmentTokens.capacity })
    .from(enrollmentTokens).where(eq(enrollmentTokens.groupId, groupId)).orderBy(asc(enrollmentTokens.id));
  const tokens = await (lock ? tokenQuery.for("update") : tokenQuery);
  if (kind === "token" && !tokens.some(token => token.id === id)) return null;
  const [members, assignments, linkedCourses, sessions] = await Promise.all([
    tx.select({ id: groupMembers.id, user: groupMembers.userId, role: groupMembers.role })
      .from(groupMembers).where(eq(groupMembers.groupId, groupId)).orderBy(asc(groupMembers.id)),
    tx.select({ id: groupCourses.id, course: groupCourses.courseId }).from(groupCourses)
      .where(eq(groupCourses.groupId, groupId)).orderBy(asc(groupCourses.id)),
    tx.select({ tokenId: enrollmentTokenCourses.tokenId, courseId: enrollmentTokenCourses.courseId }).from(enrollmentTokenCourses)
      .innerJoin(enrollmentTokens, eq(enrollmentTokenCourses.tokenId, enrollmentTokens.id)).where(eq(enrollmentTokens.groupId, groupId))
      .orderBy(asc(enrollmentTokenCourses.tokenId), asc(enrollmentTokenCourses.courseId)),
    tx.select({ id: bookings.id, status: bookings.status }).from(bookings)
      .where(eq(bookings.groupId, groupId)).orderBy(asc(bookings.id)),
  ]);
  return { kind, id, groupId, name: group.name, members: members.length, bookings: sessions.length, tokens: tokens.length,
    revision: revisionOf({ group, members, assignments, linkedCourses, sessions, tokens }) };
}

export function readGroupDeletion(target: GroupDeletionTarget, viewer: NativeAdminViewer) {
  return db.transaction(async tx => {
    await assertNativeAdminTransaction(tx, viewer);
    return deletionView(tx, target, false);
  }, { isolationLevel: "repeatable read" });
}

export async function writeGroupDeletion(command: GroupDeletion, requestId: string, viewer: NativeAdminViewer) {
  const saved = await runAdminCommand("native_group_deletion", command, requestId, viewer, async (tx) => {
    const current = await deletionView(tx, command, true);
    if (!current) throw new Error("NOT_FOUND");
    if (current.groupId !== command.groupId || current.revision !== command.expectedRevision) throw new Error("REVISION_CONFLICT");
    const deleted = command.kind === "token" ? await deleteEnrollmentTokenGroup(tx, command.id) : await deleteStudyGroupRecord(tx, current.groupId);
    if (deleted?.id !== current.groupId) throw new Error("NOT_FOUND");
    return command.id;
  });
  revalidatePath("/admin/groups");
  revalidatePath("/admin/tokens");
  revalidatePath("/dashboard/groups");
  return saved;
}
