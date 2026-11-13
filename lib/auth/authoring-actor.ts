import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { pengguna, penggunaPeran, peran, user } from "@/db/schema";

type Connection = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
type AuthoringRole = "admin" | "tutor";

/**
 * Authoring records require a canonical identity, so legacy-only fallback is
 * not sufficient here. With lock=true the caller must supply a transaction;
 * user, identity, role and membership locks are held through its commit.
 */
export async function assertAuthoringActor(
  connection: Connection,
  actorId: string,
  options: { roles: readonly AuthoringRole[]; error: string; lock?: boolean; requireLegacyAdmin?: boolean },
): Promise<AuthoringRole> {
  const userQuery = connection.select({ role: user.role }).from(user).where(eq(user.id, actorId)).limit(1);
  const [actor] = await (options.lock ? userQuery.for("share") : userQuery);
  const identityQuery = connection.select({ status: pengguna.status }).from(pengguna).where(eq(pengguna.id, actorId)).limit(1);
  const [identity] = await (options.lock ? identityQuery.for("share") : identityQuery);
  if (!actor || !identity || identity.status !== "active") throw new Error(options.error);

  const membershipQuery = connection.select({ code: peran.code }).from(penggunaPeran)
    .innerJoin(peran, eq(peran.id, penggunaPeran.peranId))
    .where(and(eq(penggunaPeran.penggunaId, actorId), inArray(peran.code, [...options.roles])));
  const memberships = await (options.lock ? membershipQuery.for("share") : membershipQuery);
  if (memberships.some((row) => row.code === "admin") && (!options.requireLegacyAdmin || actor.role === "admin")) return "admin";
  if (memberships.some((row) => row.code === "tutor")) return "tutor";
  throw new Error(options.error);
}

export async function hasAuthoringActor(actorId: string, roles: readonly AuthoringRole[]): Promise<boolean> {
  const denial = "AUTHORING_ACTOR_FORBIDDEN";
  try {
    await assertAuthoringActor(db, actorId, { roles, error: denial });
    return true;
  } catch (error) {
    if (error instanceof Error && error.message === denial) return false;
    throw error;
  }
}

/**
 * Assignment writers take the tutor's user-row lock before changing either
 * projection. Authoring reviews hold FOR SHARE on that same row until commit,
 * including when canonical assignments are absent and access uses the fallback.
 */
export async function lockTutorAssignmentChanges(connection: Pick<Connection, "select">, tutorId: string): Promise<void> {
  const [subject] = await connection.select({ id: user.id }).from(user).where(eq(user.id, tutorId)).limit(1).for("update");
  if (!subject) throw new Error("TUTOR_ASSIGNMENT_SUBJECT_NOT_FOUND");
}

/** Role writers use the same user, identity, membership order as authoring. */
export async function lockAuthoringIdentityChange(connection: Pick<Connection, "select">, userId: string): Promise<boolean> {
  const [subject] = await connection.select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(1).for("update");
  if (!subject) return false;
  // Do not block foreign-key key-share locks on this non-key status row.
  await connection.select({ id: pengguna.id }).from(pengguna).where(eq(pengguna.id, userId)).limit(1).for("no key update");
  return true;
}
