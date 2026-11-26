import type { NativeSessionState } from "../auth/session-controller";

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
