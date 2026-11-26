import { addNetworkStateListener, getNetworkStateAsync, type NetworkState } from "expo-network";
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { AppState, Platform } from "react-native";

import { useNativeSession } from "../auth/session-provider";
import type { NativeSessionTransport } from "../network/transport";
import { openExpoOfflineMetadataStore } from "./metadata-expo";
import { createOfflineMetadataLifecycle, inactiveCourseMetadata, visibleCourseMetadata } from "./lifecycle";
import { createNativeOfflineSyncController } from "./sync-client";
import { NATIVE_OFFLINE_COURSE_LIMIT, type NativeOfflineLocale } from "./sync-contract";

const supported = Platform.OS === "ios" || Platform.OS === "android";
const inactiveSnapshot = () => inactiveCourseMetadata;
const inactiveSubscribe = () => () => {};
const inactiveRetry = () => Promise.resolve();

function createDriver(session: NativeSessionTransport, locale: NativeOfflineLocale, {
  onRevoked, onAuthorized, waitForPurge,
}: { onRevoked: () => void; onAuthorized: () => void; waitForPurge: () => Promise<void> | undefined }) {
  const scope = { ...session.scope, locale };
  let syncController: ReturnType<typeof createNativeOfflineSyncController> | undefined;
  let generation = 0;
  return createOfflineMetadataLifecycle({
    read: async () => (await openExpoOfflineMetadataStore()).read(scope),
    async sync(courseIds, publishAccess) {
      const current = generation;
      await waitForPurge();
      const repository = await openExpoOfflineMetadataStore();
      if (current !== generation) return;
      session.assertCurrent();
      syncController ??= createNativeOfflineSyncController({ session, locale, repository });
      const unsubscribe = syncController.subscribeAccess(snapshot => {
        if (current !== generation || !session.isCurrent()) return;
        onAuthorized();
        publishAccess(snapshot);
      });
      try {
        await syncController.sync(courseIds);
      } finally {
        unsubscribe();
      }
    },
    cancelSync() {
      generation++;
      syncController?.dispose();
      syncController = undefined;
    },
    onRevoked,
  });
}

type SessionDrivers = { transport: NativeSessionTransport; id: ReturnType<typeof createDriver>; en: ReturnType<typeof createDriver> };
const OfflineMetadataContext = createContext<{ drivers: SessionDrivers | null; verifiedUntil: number } | null>(null);

function isOnline(state: NetworkState) {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

export function OfflineMetadataProvider({ children }: { children: ReactNode }) {
  const { state, transport, revalidating, refresh, subscribeBeforeLocalLogout } = useNativeSession();
  const [drivers, setDrivers] = useState<SessionDrivers | null>(null);
  const [foreground, setForeground] = useState(() => !AppState.currentState || AppState.currentState === "active");
  const [online, setOnline] = useState(true);

  useLayoutEffect(() => {
    if (!supported) return;
    return subscribeBeforeLocalLogout(async scope => (await openExpoOfflineMetadataStore()).clearSession(scope));
  }, [subscribeBeforeLocalLogout]);

  useEffect(() => {
    if (!supported) return;
    let active = true;
    let networkChanged = false;
    let lastOnline: boolean | undefined;
    const updateNetwork = (network: NetworkState) => {
      const next = isOnline(network);
      if (lastOnline === false && next) void refresh();
      lastOnline = next;
      setOnline(next);
    };
    const network = addNetworkStateListener(state => {
      networkChanged = true;
      updateNetwork(state);
    });
    void getNetworkStateAsync().then(state => {
      if (active && !networkChanged) updateNetwork(state);
    }).catch(() => {});
    const app = AppState.addEventListener("change", value => setForeground(value === "active"));
    return () => {
      active = false;
      network.remove();
      app.remove();
    };
  }, [refresh]);

  useEffect(() => {
    if (!supported || !transport) {
      setDrivers(null);
      return;
    }
    let purge: Promise<void> | undefined;
    let scopeRevoked = false;
    const onRevoked = () => {
      if (purge) return;
      next.id.markRevoked();
      next.en.markRevoked();
      purge = openExpoOfflineMetadataStore().then(repository => repository.clearSession(transport.scope))
        .catch(() => {}).finally(() => { purge = undefined; });
      if (!scopeRevoked) {
        scopeRevoked = true;
        void refresh();
      }
    };
    const waitForPurge = () => purge;
    const onAuthorized = () => { scopeRevoked = false; };
    const recovery = { onRevoked, onAuthorized, waitForPurge };
    const next = { transport, id: createDriver(transport, "id", recovery), en: createDriver(transport, "en", recovery) };
    setDrivers(next);
    return () => {
      next.id.dispose();
      next.en.dispose();
    };
  }, [transport, refresh]);

  const currentDrivers = drivers?.transport === transport ? drivers : null;
  const verifiedUntil = state.status === "signed-in" && !revalidating ? state.expiresAt : 0;
  useEffect(() => {
    const environment = { foreground, online, verified: verifiedUntil > Date.now(), expiresAt: verifiedUntil };
    currentDrivers?.id.setEnvironment(environment);
    currentDrivers?.en.setEnvironment(environment);
  }, [currentDrivers, foreground, online, verifiedUntil]);

  return <OfflineMetadataContext.Provider value={{ drivers: currentDrivers, verifiedUntil }}>{children}</OfflineMetadataContext.Provider>;
}

export function useOfflineCourseMetadata(courseIds: readonly string[], locale: NativeOfflineLocale) {
  const context = useContext(OfflineMetadataContext);
  const selectedKey = JSON.stringify([...new Set(courseIds.filter(id => id.trim() && id.length <= 256))].sort().slice(0, NATIVE_OFFLINE_COURSE_LIMIT));
  const selection = useMemo(() => JSON.parse(selectedKey) as string[], [selectedKey]);
  const driver = selection.length ? context?.drivers?.[locale] ?? null : null;
  const metadata = useSyncExternalStore(driver?.subscribe ?? inactiveSubscribe, driver?.getSnapshot ?? inactiveSnapshot, inactiveSnapshot);

  useEffect(() => driver?.register(selection), [driver, selection]);

  if (!context) throw new Error("OfflineMetadataProvider is required for course metadata.");
  const now = Date.now();
  if (!driver || !context.drivers?.transport.isCurrent() || context.verifiedUntil <= now) {
    return { ...inactiveCourseMetadata, retry: inactiveRetry };
  }
  return { status: metadata.status, snapshot: visibleCourseMetadata(metadata.snapshot, now, new Set(selection)), retry: driver.retry };
}
