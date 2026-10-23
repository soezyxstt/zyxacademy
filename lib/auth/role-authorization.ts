import { eq } from "drizzle-orm";
import { db } from "@/db";
import { pengguna, penggunaPeran } from "@/db/schema";
import { hasAnyPeranFromCodes, hasPeranFromCodes, getPeranCodes } from "@/lib/auth/authorization";

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

export async function resolveCanonicalRoleAuthorization(
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
