import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { hasAnyPeran, hasPeran } from "@/lib/auth/authorization";

type UserWithRole = { id: string; role?: string | null };

/**
 * Asserts that the current session user has the admin role via canonical
 * `pengguna_peran` or legacy `user.role` projection.
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

  const isAdmin = (await hasPeran(user.id, "admin")) || user.role === "admin";
  if (!isAdmin) {
    throw new Error("Forbidden, admin role required.");
  }

  return { session, user };
}

/**
 * Asserts that the current session user has either tutor or admin role via canonical
 * `pengguna_peran` or legacy `user.role` projection.
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

  const isAuthorized =
    (await hasAnyPeran(user.id, ["admin", "tutor"], { allowAdmin: true })) ||
    user.role === "admin" ||
    user.role === "teacher";
  if (!isAuthorized) {
    throw new Error("Forbidden, teacher or admin role required.");
  }

  return { session, user };
}
