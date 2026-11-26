import type { NativeAccountContext } from "../../../../packages/native-session/context";
import { resolveNativeLoginReturn, type NativeRouteNode } from "../../auth/login-intent";
import type { NativeSessionTransport } from "../../network/transport";

export type InboxSurfaceRole = "student" | "tutor" | "admin";

export function hasVerifiedInboxAccess(
  role: InboxSurfaceRole,
  account: NativeAccountContext,
  session: Pick<NativeSessionTransport, "scope" | "isCurrent">,
) {
  return session.scope.accountId === account.accountId && session.scope.sessionId === account.sessionId &&
    account.roles.includes(role === "student" ? "murid" : role) && session.isCurrent();
}

export function inboxDestination(href: string | null, account: NativeAccountContext, sitemap: NativeRouteNode | null) {
  // The web /discussions entry selects the account's canonical discussion role.
  const alias = "/discussions";
  const canonical = href?.split(/[?#]/, 1)[0] === alias
    ? account.dashboard + alias + href.slice(alias.length)
    : href;
  const entry = resolveNativeLoginReturn(canonical ?? undefined, account, sitemap);
  return entry.status === "ready" ? entry.href : entry.dashboard;
}
