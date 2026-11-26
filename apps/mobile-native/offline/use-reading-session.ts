import { useNetworkState } from "expo-network";
import { useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";

import { NATIVE_STAGING_ORIGIN } from "../auth/session-api";
import { useNativeSession } from "../auth/session-provider";
import { useNativeAccountContext } from "../auth/use-account-context";
import { deviceIsOffline, readingAccess } from "./reading-access";
import type { NativeOfflineLocale } from "./sync-contract";

export function useOfflineReadingSession(locale: NativeOfflineLocale) {
  const { state, transport, revalidating } = useNativeSession();
  const { context, denied } = useNativeAccountContext();
  const offline = deviceIsOffline(useNetworkState());
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", next => {
      setForeground(next === "active");
      setClock(Date.now());
    });
    setForeground(AppState.currentState === "active");
    return () => subscription.remove();
  }, []);

  const identity = state.status === "signed-in" ? state
    : state.status === "unavailable" && offline ? state.offlineIdentity : null;
  const accountId = identity?.accountId;
  const sessionId = identity?.sessionId;
  const expiresAt = identity?.expiresAt;
  useEffect(() => {
    if (!expiresAt || expiresAt <= Date.now()) return;
    const timeout = setTimeout(() => setClock(Date.now()), Math.min(2_147_483_647, expiresAt - Date.now()));
    return () => clearTimeout(timeout);
  }, [clock, expiresAt]);

  const liveStudent = Boolean(context && context.roles.includes("murid") && transport?.isCurrent());
  const roleDenied = denied || Boolean(context && !context.roles.includes("murid"));
  const expired = !expiresAt || expiresAt <= Math.max(clock, Date.now());
  const access = useMemo(() => readingAccess({
    identity: accountId && sessionId && expiresAt && !expired
      ? { origin: NATIVE_STAGING_ORIGIN, accountId, sessionId, expiresAt } : null,
    locale, foreground, offline, liveStudent, denied: roleDenied, revalidating, now: Date.now(),
  }), [accountId, sessionId, expiresAt, expired, locale, foreground, offline, liveStudent, roleDenied, revalidating]);
  return useMemo(() => ({
    ...access, offline, transport: access.scope && !offline && liveStudent ? transport : null,
  }), [access, offline, liveStudent, transport]);
}
