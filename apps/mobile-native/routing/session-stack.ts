import type { NativeSessionState } from "../auth/session-controller";
import type { NativeSessionTransport } from "../network/transport";

export function nativeSessionNavigationStatus(
  state: NativeSessionState,
  transport: NativeSessionTransport | null,
  current: { state: NativeSessionState; transport: NativeSessionTransport | null; revalidating: boolean },
  now = Date.now(),
): "ready" | "revalidating" | "blocked" {
  if (current.transport !== transport) return "blocked";
  if (state.status === "signed-in") {
    // A successful refresh may renew expiry while an assessment submission is in flight.
    const live = current.state;
    if (live.status !== "signed-in" || live.accountId !== state.accountId || live.sessionId !== state.sessionId ||
      live.expiresAt <= now || !transport?.isCurrent()) return "blocked";
    return current.revalidating ? "revalidating" : "ready";
  }
  return current.state === state && !current.revalidating && state.status === "unavailable" &&
    state.offlineIdentity && state.offlineIdentity.expiresAt > now ? "ready" : "blocked";
}

export function canNavigateNativeSession(...args: Parameters<typeof nativeSessionNavigationStatus>) {
  return nativeSessionNavigationStatus(...args) === "ready";
}

export function createDeferredSessionNavigation() {
  let pending: (() => void) | undefined;

  return {
    cancel() { pending = undefined; },
    run(
      action: () => void,
      status: () => ReturnType<typeof nativeSessionNavigationStatus>,
      getPendingRefresh?: () => Promise<void> | null,
    ) {
      const current = status();
      if (current === "ready") {
        pending = undefined;
        action();
        return;
      }
      if (current !== "revalidating") return;
      const refresh = getPendingRefresh?.();
      if (!refresh) return;

      const complete = () => {
        if (pending !== complete) return;
        pending = undefined;
        if (status() === "ready") action();
      };
      pending = complete;
      void refresh.then(complete, () => {
        if (pending === complete) pending = undefined;
      });
    },
  };
}

export function navigationSessionKey(state: NativeSessionState): string | null | undefined {
  const identity = state.status === "signed-in" ? state
    : state.status === "unavailable" ? state.offlineIdentity : undefined;
  if (identity) return JSON.stringify([identity.accountId, identity.sessionId]);
  if (state.status === "signed-out" || state.status === "logout-pending") return null;
  // A failed connection does not establish that a session has changed.
  return undefined;
}

const sharedRouteRoots = new Set([
  "about", "blog", "demo", "download", "forms-playground", "plans", "privacy", "terms",
  "testimonial", "unsubscribe", "f", "forms", "gallery", "meet", "shared-ui",
]);
const sharedRoutes = new Set([
  "index", "sign-in", "sign-up", "sign-out", "auth/native-finish",
  "mcp/authorize", "mcp/connections", "tautan",
]);

export function isSessionRoute(name: string) {
  return !sharedRoutes.has(name) && !sharedRouteRoots.has(name.split("/", 1)[0]);
}

export function resetSessionStack<State extends { index: number; routes: readonly { name: string }[] }>(state: State, logoutPending: boolean) {
  const active: State["routes"][number] | undefined = state.routes[state.index];
  const preserve = active && !isSessionRoute(active.name);
  if (preserve && state.routes.length === 1) return null;
  return {
    ...state,
    index: 0,
    history: undefined,
    routes: [preserve ? active : { name: logoutPending ? "sign-out" : "index" }],
  };
}
