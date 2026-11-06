import { eq } from "drizzle-orm";
import { db } from "@/db";
import { pengguna, penggunaPeran } from "@/db/schema";
import {
  hasAnyPeranFromCodes,
  hasPeranFromCodes,
  getPeranCodes,
} from "@/lib/auth/authorization";

type UserWithRole = { id: string; role?: string | null };

type RoleAuthorizationInput = {
  canonicalIdentityExists: boolean;
  canonicalMembershipExists: boolean;
  canonicalRoleAllowed: boolean;
  legacyRole?: string | null;
  legacyRoles: readonly string[];
};

/**
 * Resolves the compatibility boundary for role checks.
 *
 * Once the canonical identity or a canonical membership exists, its result is
 * authoritative, including a negative result. The Better Auth role projection
 * is only a fallback for users that have not entered the canonical domain yet.
 */
export function resolveRoleAuthorization({
  canonicalIdentityExists,
  canonicalMembershipExists,
  canonicalRoleAllowed,
  legacyRole,
  legacyRoles,
}: RoleAuthorizationInput): boolean {
  if (canonicalIdentityExists || canonicalMembershipExists) return canonicalRoleAllowed;
  return typeof legacyRole === "string" && legacyRoles.includes(legacyRole);
}

async function getCanonicalRoleSource(userId: string): Promise<{
  identityExists: boolean;
  membershipExists: boolean;
}> {
  const [identityRows, membershipRows] = await Promise.all([
    db
      .select({ id: pengguna.id })
      .from(pengguna)
      .where(eq(pengguna.id, userId))
      .limit(1),
    db
      .select({ id: penggunaPeran.id })
      .from(penggunaPeran)
      .where(eq(penggunaPeran.penggunaId, userId))
      .limit(1),
  ]);

  return {
    identityExists: identityRows.length > 0,
    membershipExists: membershipRows.length > 0,
  };
}

async function resolveCanonicalRoleAuthorization(
  userId: string,
  legacyRole: string | null | undefined,
  legacyRoles: readonly string[],
  required: "admin" | "tutorOrAdmin",
): Promise<boolean> {
  const canonicalSource = await getCanonicalRoleSource(userId);
  const canonicalRecordExists = canonicalSource.identityExists || canonicalSource.membershipExists;
  const canonicalRoleCodes = canonicalRecordExists ? await getPeranCodes(userId) : [];
  const canonicalRoleAllowed = required === "admin"
    ? hasPeranFromCodes(canonicalRoleCodes, "admin")
    : hasAnyPeranFromCodes(canonicalRoleCodes, ["admin", "tutor"], { allowAdmin: true });

  return resolveRoleAuthorization({
    canonicalIdentityExists: canonicalSource.identityExists,
    canonicalMembershipExists: canonicalSource.membershipExists,
    canonicalRoleAllowed,
    legacyRole,
    legacyRoles,
  });
}

/**
 * Resolves admin access for an explicit actor using canonical membership first.
 * Legacy role fallback is retained only for identities not yet provisioned in
 * the canonical authorization tables.
 */
export async function hasAdminAuthorization(
  userId: string,
  legacyRole?: string | null,
): Promise<boolean> {
  return resolveCanonicalRoleAuthorization(userId, legacyRole, ["admin"], "admin");
}

/**
 * Asserts that the current session user has the admin role via canonical
 * `pengguna_peran`. The legacy `user.role` projection is only used for users
 * without a canonical identity or membership.
 */
// Explicit-actor checks are also used by MCP without an RSC session context.
// Load the server-only session helper only when a session guard is invoked.
export async function assertAdmin() {
  const { getAuthSession } = await import("@/lib/auth-session");
  const session = await getAuthSession();
  const user = session?.user as UserWithRole | undefined;

  if (!user?.id) {
    throw new Error("Unauthorized");
  }

  const isAdmin = await hasAdminAuthorization(user.id, user.role);
  if (!isAdmin) {
    throw new Error("Forbidden, admin role required.");
  }

  return { session, user };
}

/**
 * Asserts that the current session user has either tutor or admin role via
 * canonical `pengguna_peran`. The legacy `user.role` projection is only used
 * for users without a canonical identity or membership.
 */
export async function assertTutorOrAdmin() {
  const { getAuthSession } = await import("@/lib/auth-session");
  const session = await getAuthSession();
  const user = session?.user as UserWithRole | undefined;

  if (!user?.id) {
    throw new Error("Unauthorized");
  }

  const isAuthorized = await resolveCanonicalRoleAuthorization(
    user.id,
    user.role,
    ["admin", "teacher"],
    "tutorOrAdmin",
  );
  if (!isAuthorized) {
    throw new Error("Forbidden, teacher or admin role required.");
  }

  return { session, user };
}
