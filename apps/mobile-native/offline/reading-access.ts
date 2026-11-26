import type { SessionIdentity } from "../auth/session-api";
import type { NativeSessionScope } from "../network/transport";
import type { NativeOfflineLocale, NativeOfflineScope } from "./sync-contract";

type ReadingIdentity = SessionIdentity & Pick<NativeSessionScope, "origin">;

export function readingAccess({
  identity, locale, foreground, offline, liveStudent, denied, revalidating, now,
}: {
  identity: ReadingIdentity | null;
  locale: NativeOfflineLocale;
  foreground: boolean;
  offline: boolean;
  liveStudent: boolean;
  denied: boolean;
  revalidating: boolean;
  now: number;
}): { scope: NativeOfflineScope | null; verifiedUntil: number } {
  if (!foreground || !identity || denied || revalidating || identity.expiresAt <= now || !(offline || liveStudent)) {
    return { scope: null, verifiedUntil: 0 };
  }
  const { origin, accountId, sessionId, expiresAt } = identity;
  return { scope: { origin, accountId, sessionId, locale }, verifiedUntil: expiresAt };
}

export function deviceIsOffline(network: { type?: string; isConnected?: boolean; isInternetReachable?: boolean }) {
  return Boolean(network.type && network.type !== "UNKNOWN"
    && (network.isConnected === false || network.isInternetReachable === false));
}
