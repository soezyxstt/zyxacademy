import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { hasAdminAuthorization, resolveCanonicalRoleAuthorization } from "./role-authorization";
export { hasAdminAuthorization, resolveRoleAuthorization } from "./role-authorization";

type UserWithRole = { id: string; role?: string | null };

/**
 * Asserts that the current session user has the admin role via canonical
 * `pengguna_peran`. The legacy `user.role` projection is only used for users
 * without a canonical identity or membership.
 */
export async function assertAdmin() {
  const h = await headers();
  const session = await auth.api.getSession({
    headers: h,
  });
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
  const h = await headers();
  const session = await auth.api.getSession({
    headers: h,
  });
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
