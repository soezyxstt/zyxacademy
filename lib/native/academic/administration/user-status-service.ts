import "server-only";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { auditMutasi } from "@/db/schema";
import { assertAdminUserStatusChange, lockAdminUserStatus, lockAdminUserStatusActors, updateAdminUserStatus } from "@/lib/admin/user-status";
import { revisionOf } from "@/lib/admin-mcp/revision";
import { isAdminUserStatusRevision, type AdminUserStatusEdit, type AdminUserStatusRevision } from "@/packages/academic/admin-user-status";
import { assertNativeAdminTransaction, postgresCode, type NativeAdminViewer } from "./admin-transaction";

export type NativeUserStatusResult = { status: "saved" | "conflict"; id: string; userStatus: AdminUserStatusRevision };
const auditType = "native_user_status";

export async function saveNativeUserStatus(id: string, draft: AdminUserStatusEdit, requestId: string, viewer: NativeAdminViewer) {
  const actorId = viewer.user.id;
  if (draft.accountId !== actorId) throw new Error("FORBIDDEN");
  const receiptId = `native_user_status_${revisionOf({ actorId, sessionId: viewer.session.id, requestId })}`;
  const inputHash = revisionOf({ id, draft });

  function write(): Promise<NativeUserStatusResult> {
    return db.transaction(async (tx) => {
      // The actor stays active through commit, so suspending another account retains an admin.
      await lockAdminUserStatusActors(tx, actorId, id);
      await assertNativeAdminTransaction(tx, viewer);
      assertAdminUserStatusChange(actorId, id, draft.status);
      const target = await lockAdminUserStatus(tx, id);
      const [receipt] = await tx.select().from(auditMutasi).where(eq(auditMutasi.id, receiptId)).limit(1);
      if (receipt) {
        const result = receipt.afterSnapshot?.result;
        if (receipt.actorId !== actorId || receipt.entityType !== auditType || receipt.entityId !== id
          || receipt.action !== "update_status" || receipt.afterSnapshot?.inputHash !== inputHash
          || !isAdminUserStatusRevision(result)) throw new Error("REQUEST_CONFLICT");
        return { status: "saved", id, userStatus: result };
      }
      if (target.current.revision !== draft.expectedRevision) return { status: "conflict", id, userStatus: target.current };
      const result = await updateAdminUserStatus(tx, target, actorId, draft.status);
      await tx.insert(auditMutasi).values({
        id: receiptId, actorId, entityType: auditType, entityId: id, action: "update_status",
        correlationId: requestId, outcome: "success", beforeSnapshot: target.current,
        afterSnapshot: { inputHash, result },
      });
      return { status: "saved", id, userStatus: result };
    });
  }

  const result = await write().catch((error: unknown) => {
    const code = postgresCode(error);
    if (code !== "40001" && code !== "40P01") throw error;
    return write();
  });
  if (result.status === "saved") revalidatePath("/admin/users");
  return result;
}
