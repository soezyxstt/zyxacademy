import "server-only";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { auditMutasi } from "@/db/schema";
import { revisionOf } from "@/lib/admin-mcp/revision";
import { adminUserRolesRevision, lockAdminUserRoles, replaceAdminUserRoles } from "@/lib/admin/user-roles";
import { lockAdminUserStatusActors } from "@/lib/admin/user-status";
import type { AdminUserRolesEdit } from "@/packages/academic/admin-user-roles";
import { assertNativeAdminTransaction, postgresCode, type NativeAdminViewer } from "./admin-transaction";

export async function saveNativeUserRoles(id: string, draft: AdminUserRolesEdit, requestId: string, viewer: NativeAdminViewer) {
  const actorId = viewer.user.id;
  if (actorId !== draft.accountId) throw new Error("FORBIDDEN");
  if (id === actorId && !draft.roles.includes("admin")) throw new Error("SELF_ADMIN_CHANGE");
  const receiptId = `native_user_roles_${revisionOf({ actorId, sessionId: viewer.session.id, requestId })}`;
  const requested = adminUserRolesRevision(id, draft.roles);
  const inputHash = revisionOf({ id, ...draft, roles: requested.roles });
  const save = () => db.transaction(async (tx) => {
    await lockAdminUserStatusActors(tx, actorId, id);
    await assertNativeAdminTransaction(tx, viewer);
    const current = await lockAdminUserRoles(tx, id);
    const [receipt] = await tx.select().from(auditMutasi).where(eq(auditMutasi.id, receiptId)).limit(1);
    if (receipt) {
      if (receipt.actorId !== actorId || receipt.entityId !== id || receipt.entityType !== "native_user_roles"
        || receipt.afterSnapshot?.inputHash !== inputHash) throw new Error("REQUEST_CONFLICT");
      return;
    }
    if (current.revision !== draft.expectedRevision) throw new Error("REVISION_CONFLICT");
    await replaceAdminUserRoles(tx, id, actorId, requested.roles);
    await tx.insert(auditMutasi).values({
      id: receiptId, actorId, entityId: id, entityType: "native_user_roles", action: "update_roles",
      correlationId: requestId, outcome: "success", beforeSnapshot: current, afterSnapshot: { inputHash, ...requested },
    });
  });
  await save().catch((error: unknown) => {
    const code = postgresCode(error);
    if (code !== "40001" && code !== "40P01") throw error;
    return save();
  });
  revalidatePath("/admin/users");
  revalidatePath("/admin/schedules");
  return { id, status: "saved" as const, userRoles: requested };
}
