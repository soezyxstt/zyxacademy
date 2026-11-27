import { and, eq } from "drizzle-orm";
import type { db } from "@/db";
import { pengguna, session, user } from "@/db/schema";
import { revisionOf } from "@/lib/admin-mcp/revision";
import { assertAuthoringActor, lockAuthoringIdentityChange } from "@/lib/auth/authoring-actor";
import { createLegacyIdentity } from "@/lib/auth/legacy-identity";
import { recordOfflineChange } from "@/lib/offline/server-events";
import type { AdminUserStatus, AdminUserStatusRevision } from "@/packages/academic/admin-user-status";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function adminUserStatusRevision(id: string, status: AdminUserStatus, updatedAt: Date | null): AdminUserStatusRevision {
  return { status, revision: revisionOf({ id, status, updatedAt }) };
}

export async function lockAdminUserStatusActors(tx: Transaction, actorId: string, targetId: string) {
  // Use the same lock order as the MCP identity writes.
  for (const id of [...new Set([actorId, targetId])].sort()) {
    await tx.select({ id: user.id }).from(user).where(eq(user.id, id)).limit(1).for("update");
  }
}

export async function assertWebUserStatusActor(tx: Transaction, actorId: string, sessionId: string | undefined) {
  const [actor] = await tx.select({ legacyRole: user.role, canonicalId: pengguna.id })
    .from(user).leftJoin(pengguna, eq(pengguna.id, user.id)).where(eq(user.id, actorId)).limit(1);
  if (!actor) throw new Error("Forbidden, admin role required.");
  if (actor.canonicalId !== null || actor.legacyRole !== "admin") {
    await assertAuthoringActor(tx, actorId, { roles: ["admin"], error: "Forbidden, admin role required.", lock: true });
  }
  if (!sessionId) throw new Error("Unauthorized");
  const [live] = await tx.select({ expiresAt: session.expiresAt }).from(session)
    .where(and(eq(session.id, sessionId), eq(session.userId, actorId))).limit(1).for("share");
  if (!live || live.expiresAt.getTime() <= Date.now()) throw new Error("Unauthorized");
}

export async function lockAdminUserStatus(tx: Transaction, id: string) {
  if (!(await lockAuthoringIdentityChange(tx, id))) throw new Error("USER_NOT_FOUND");
  const [identity] = await tx.select({ status: pengguna.status, updatedAt: pengguna.updatedAt })
    .from(pengguna).where(eq(pengguna.id, id)).limit(1);
  return {
    id, updatedAt: identity?.updatedAt ?? null,
    current: adminUserStatusRevision(id, identity?.status === "suspended" ? "suspended" : "active", identity?.updatedAt ?? null),
  };
}

export function assertAdminUserStatusChange(actorId: string, targetId: string, status: AdminUserStatus) {
  if (actorId === targetId && status === "suspended") throw new Error("SELF_SUSPENSION");
}

/** Update a target locked by lockAdminUserStatus and invalidate its offline access. */
export async function updateAdminUserStatus(tx: Transaction, target: Awaited<ReturnType<typeof lockAdminUserStatus>>,
  actorId: string, status: AdminUserStatus): Promise<AdminUserStatusRevision> {
  assertAdminUserStatusChange(actorId, target.id, status);
  const updatedAt = new Date(Math.max(Date.now(), (target.updatedAt?.getTime() ?? 0) + 1));
  if (target.updatedAt) {
    await tx.update(pengguna).set({ status, updatedAt }).where(eq(pengguna.id, target.id));
  } else if (!(await createLegacyIdentity(tx, target.id, { status, updatedAt }))) throw new Error("USER_IDENTITY_UNAVAILABLE");
  await recordOfflineChange(tx, { kind: "access", userId: target.id, action: "invalidate" });
  return adminUserStatusRevision(target.id, status, updatedAt);
}
