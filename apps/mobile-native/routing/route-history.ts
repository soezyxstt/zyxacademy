import type { NativeAccountContext } from "../../../packages/native-session/context";
import { isFreshNativeRouteTimestamp, normalizeRestorableNativeRoute } from "../../../packages/native-session/route-persistence";
import { resolveNativeLoginReturn, resolveNativeProtectedDestination, type NativeRouteNode } from "../auth/login-intent";
import type { NativeSessionScope } from "../network/transport";

const maxRecordLength = 4096;
const sensitiveRoutes = new Set(["/admin/ops/keys", "/admin/tokens"]);
const safeQueryKeys = new Set([
  "q", "search", "tab", "view", "sort", "page", "pageSize", "category", "jurusan", "chapter", "course", "courseId",
  "section", "status", "scope", "period", "week", "date", "mode", "locale", "access", "pkaStage", "item",
  "thread", "message", "channel", "origin", "type", "difficulty", "attemptId", "submitted",
]);
const unsafeRouteValue = /[\u0000-\u001f\u007f\\]|\b(?:Bearer\s+|(?:[\w-]*token|secret|password|authorization|cookie|verifier)\s*=|https?:\/\/)|\beyJ[\w-]+\.[\w-]+\.[\w-]+/iu;

type RouteScope = NativeSessionScope;
type RecordedRoute = RouteScope & { path: string; updatedAt: number };
type Store = { read(): string | null; write(value: string): void; remove(): void };
type IsCurrent = () => boolean;
type RouteAccount = Pick<NativeAccountContext, "accountId" | "sessionId" | "roles">;

function sameScope(left: RouteScope, right: RouteScope) {
  return left.origin === right.origin && left.accountId === right.accountId && left.sessionId === right.sessionId;
}

function sameAccount(scope: RouteScope, account: RouteAccount) {
  return scope.accountId === account.accountId && scope.sessionId === account.sessionId;
}

function containsUnsafeValue(value: string) {
  if (unsafeRouteValue.test(value)) return true;
  try {
    return unsafeRouteValue.test(decodeURIComponent(value));
  } catch {
    return false;
  }
}

export function normalizeExpoRouteHistory(raw: string, account: RouteAccount, sitemap?: NativeRouteNode | null) {
  if (raw.includes("#")) return null;
  const path = normalizeRestorableNativeRoute(raw);
  const destination = path && resolveNativeProtectedDestination(path, account, sitemap);
  if (!destination || sensitiveRoutes.has(destination.pattern)) return null;
  const queryAt = destination.href.indexOf("?");
  const pathname = queryAt < 0 ? destination.href : destination.href.slice(0, queryAt);
  if (containsUnsafeValue(pathname)) return null;
  const query = new URLSearchParams(queryAt < 0 ? "" : destination.href.slice(queryAt + 1));
  for (const [key, value] of query) {
    if (!safeQueryKeys.has(key) || value.length > 256 || containsUnsafeValue(value)) return null;
  }
  return destination.href;
}

export function createExpoRouteHistory(store: Store, now = Date.now) {
  function readRecord(): RecordedRoute | null {
    try {
      const raw = store.read();
      if (!raw || raw.length > maxRecordLength) return null;
      const record: unknown = JSON.parse(raw);
      if (record && typeof record === "object" && "path" in record && typeof record.path === "string"
        && "origin" in record && typeof record.origin === "string" && "accountId" in record && typeof record.accountId === "string"
        && "sessionId" in record && typeof record.sessionId === "string" && "updatedAt" in record && typeof record.updatedAt === "number") {
        return { origin: record.origin, accountId: record.accountId, sessionId: record.sessionId,
          path: record.path, updatedAt: record.updatedAt };
      }
    } catch {
      // An unavailable or malformed local record does not prevent entry.
    }
    return null;
  }

  function clear(scope: RouteScope) {
    const record = readRecord();
    if (!record || !sameScope(record, scope)) return;
    try {
      store.remove();
    } catch {
      // The expired or revoked session cannot restore an old record.
    }
  }

  return {
    remember(scope: RouteScope, account: RouteAccount, href: string, isCurrent: IsCurrent) {
      if (!isCurrent() || !sameAccount(scope, account)) return;
      const path = normalizeExpoRouteHistory(href, account);
      if (!path || !isCurrent()) return;
      const { origin, accountId, sessionId } = scope;
      const record = JSON.stringify({ origin, accountId, sessionId, path, updatedAt: now() });
      if (record.length > maxRecordLength) return;
      try {
        store.write(record);
      } catch {
        // Route history is optional when local storage is unavailable.
      }
    },
    restore(scope: RouteScope, account: RouteAccount, sitemap: NativeRouteNode, isCurrent: IsCurrent) {
      if (!isCurrent() || !sameAccount(scope, account)) return null;
      const record = readRecord();
      if (!record || !sameScope(record, scope) || !isCurrent()) return null;
      const path = isFreshNativeRouteTimestamp(record.updatedAt, now()) && normalizeExpoRouteHistory(record.path, account, sitemap);
      if (!isCurrent()) return null;
      if (!path) clear(scope);
      return path || null;
    },
    clear,
  };
}

export function resolveExpoEntryRoute(
  explicit: string | undefined, account: NativeAccountContext, sitemap: NativeRouteNode,
  restore: () => string | null,
) {
  if (explicit) return resolveNativeLoginReturn(explicit, account, sitemap);
  const resumed = restore();
  return resumed ? { status: "ready", href: resumed } as const : resolveNativeLoginReturn(undefined, account, sitemap);
}
