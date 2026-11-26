import { eq, inArray } from "drizzle-orm";
import type { db } from "@/db";
import { pengguna, penggunaPeran, peran, user } from "@/db/schema";
import { revisionOf } from "@/lib/admin-mcp/revision";
import { lockAuthoringIdentityChange } from "@/lib/auth/authoring-actor";
import { mapLegacyRole, membershipIdFor, normalizePeranCodes, PERAN_SEEDS, type PeranCode } from "@/lib/auth/peran";
import { recordOfflineChange } from "@/lib/offline/server-events";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function adminUserRolesRevision(id: string, values: readonly PeranCode[]) {
  const roles = normalizePeranCodes(values);
  return { roles, revision: revisionOf({ id, roles }) };
}

export async function lockAdminUserRoles(tx: Transaction, id: string) {
  if (!(await lockAuthoringIdentityChange(tx, id))) throw new Error("USER_NOT_FOUND");
  const [account] = await tx.select({ legacyRole: user.role, identityId: pengguna.id }).from(user)
    .leftJoin(pengguna, eq(pengguna.id, user.id)).where(eq(user.id, id)).limit(1);
  const memberships = await tx.select({ code: peran.code }).from(penggunaPeran)
    .innerJoin(peran, eq(peran.id, penggunaPeran.peranId)).where(eq(penggunaPeran.penggunaId, id));
  const roles = normalizePeranCodes(memberships.map((row) => row.code));
  return adminUserRolesRevision(id, account.identityId !== null ? roles : [mapLegacyRole(account.legacyRole) ?? "murid"]);
}

/** The caller locks the identity before replacing its roles. */
export async function replaceAdminUserRoles(tx: Transaction, id: string, actorId: string, roles: PeranCode[]) {
  if (!roles.length) throw new Error("INVALID_ROLES");
  if (id === actorId && !roles.includes("admin")) throw new Error("SELF_ADMIN_CHANGE");
  await tx.insert(peran).values([...PERAN_SEEDS]).onConflictDoNothing();
  const seeds = await tx.select({ code: peran.code, id: peran.id }).from(peran).where(inArray(peran.code, roles));
  if (seeds.length !== roles.length) throw new Error("ROLE_NOT_AVAILABLE");
  await tx.insert(pengguna).values({ id, status: "active" }).onConflictDoNothing();
  await tx.delete(penggunaPeran).where(eq(penggunaPeran.penggunaId, id));
  await tx.insert(penggunaPeran).values(seeds.map((seed) => ({
    id: membershipIdFor(id, seed.code as PeranCode), penggunaId: id, peranId: seed.id,
    source: "admin_role_management", auditActorPenggunaId: actorId,
  })));
  const role = roles.includes("admin") ? "admin" : roles.includes("tutor") ? "teacher" : "student";
  await tx.update(user).set({ role, updatedAt: new Date() }).where(eq(user.id, id));
  await recordOfflineChange(tx, { kind: "access", userId: id, action: "invalidate" });
}
