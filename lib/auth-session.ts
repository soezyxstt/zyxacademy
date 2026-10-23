import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export type AuthSession = Awaited<ReturnType<typeof auth.api.getSession>>;
export type AuthUser = NonNullable<AuthSession>["user"];

/**
 * Request-scoped deduplicated session read helper.
 *
 * In React Server Components (RSC) render context, multiple layout, page,
 * and component boundaries in the same request share this cached promise,
 * invoking Better Auth getSession at most once per render pass.
 *
 * NOTE: React.cache memoization is scoped strictly to the RSC cache context
 * and is not guaranteed across separate Server Action or Route Handler invocations.
 * Request isolation is strictly maintained by React.cache; no persistent
 * or cross-request state is shared.
 */
export const getAuthSession = cache(async (): Promise<AuthSession> => {
  const reqHeaders = await headers();
  return auth.api.getSession({ headers: reqHeaders });
});

/**
 * Request-scoped deduplicated session user read helper.
 *
 * Scoped to the RSC cache context; shares the cached getAuthSession promise.
 */
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  const session = await getAuthSession();
  return session?.user ?? null;
});

/**
 * Requires an authenticated user, throwing an Unauthorized error if absent.
 */
export async function requireAuthUser(): Promise<AuthUser> {
  const user = await getAuthUser();
  if (!user?.id) {
    throw new Error("Unauthorized");
  }
  return user;
}
