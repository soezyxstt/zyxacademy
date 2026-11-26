import { addNetworkStateListener, getNetworkStateAsync, type NetworkState } from "expo-network";
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { AppState, Platform } from "react-native";

import { useNativeSession } from "../auth/session-provider";
import { useNativeAccountContext } from "../auth/use-account-context";
import type { NativeSessionTransport } from "../network/transport";
import { openExpoOfflineMetadataStore } from "./metadata-expo";
import { createOfflineMetadataLifecycle, inactiveCourseMetadata, visibleCourseMetadata } from "./lifecycle";
import { createNativeOfflineSyncController } from "./sync-client";
import { NATIVE_OFFLINE_COURSE_LIMIT, type NativeOfflineLocale } from "./sync-contract";
import { openExpoOfflineReadingStore } from "./reading-expo";
import { purgeOfflineReadingSession, unblockOfflineReadingSession, waitForOfflineReadingPurge } from "./reading-session-storage";

const supported = Platform.OS === "ios" || Platform.OS === "android";
const inactiveSnapshot = () => inactiveCourseMetadata;
const inactiveSubscribe = () => () => {};
const inactiveRetry = () => Promise.resolve();

function createDriver(session: NativeSessionTransport, locale: NativeOfflineLocale, {
  onRevoked, onAuthorized,
}: { onRevoked: () => void; onAuthorized: () => void }) {
  const scope = { ...session.scope, locale };
  let syncController: ReturnType<typeof createNativeOfflineSyncController> | undefined;
  let generation = 0;
  return createOfflineMetadataLifecycle({
    read: async () => (await openExpoOfflineMetadataStore()).read(scope),
    async sync(courseIds, publishAccess) {
      const current = generation;
      await waitForOfflineReadingPurge(scope);
      const repository = await openExpoOfflineMetadataStore();
      if (current !== generation) return;
      session.assertCurrent();
      syncController ??= createNativeOfflineSyncController({ session, locale, repository, readings: openExpoOfflineReadingStore });
      const unsubscribe = syncController.subscribeAccess(snapshot => {
        if (current !== generation || !session.isCurrent()) return;
        onAuthorized();
        publishAccess(snapshot);
      });
      try {
        await syncController.sync(courseIds);
      } finally {
        unsubscribe();
        if (current === generation && session.isCurrent()) {
          await openExpoOfflineReadingStore().then(readings => readings.reconcile(scope, () => {
            session.assertCurrent();
            if (current !== generation) throw new Error("Offline authority changed.");
          })).catch(() => {});
        }
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
  const { context, denied } = useNativeAccountContext();
  const roleDenied = denied || Boolean(context && !context.roles.includes("murid"));
  const student = Boolean(context?.roles.includes("murid"));
  const [drivers, setDrivers] = useState<SessionDrivers | null>(null);
  const [foreground, setForeground] = useState(() => !AppState.currentState || AppState.currentState === "active");
  const [online, setOnline] = useState(true);

  useLayoutEffect(() => {
    if (!supported) return;
    return subscribeBeforeLocalLogout(purgeOfflineReadingSession);
  }, [subscribeBeforeLocalLogout]);

  useLayoutEffect(() => {
    if (!supported || !transport || !roleDenied) return;
    if (drivers?.transport === transport) {
      drivers.id.markRevoked();
      drivers.en.markRevoked();
    }
    void purgeOfflineReadingSession(transport.scope).catch(() => {});
  }, [drivers, roleDenied, transport]);

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
    if (!supported || !transport || !student) {
      setDrivers(null);
      return;
    }
    let active = true;
    // The library can register its manifest sync only after a new Student check opens its scope.
    void waitForOfflineReadingPurge(transport.scope)?.then(() => {
      if (active && transport.isCurrent()) unblockOfflineReadingSession(transport.scope);
    }).catch(() => {});
    let purge: Promise<void> | undefined;
    let scopeRevoked = false;
    const onRevoked = () => {
      if (purge) return;
      next.id.markRevoked();
      next.en.markRevoked();
      purge = purgeOfflineReadingSession(transport.scope).catch(() => {}).finally(() => { purge = undefined; });
      if (!scopeRevoked) {
        scopeRevoked = true;
        void refresh();
      }
    };
    const onAuthorized = () => {
      scopeRevoked = false;
      unblockOfflineReadingSession(transport.scope);
    };
    const recovery = { onRevoked, onAuthorized };
    const next = { transport, id: createDriver(transport, "id", recovery), en: createDriver(transport, "en", recovery) };
    setDrivers(next);
    return () => {
      active = false;
      next.id.dispose();
      next.en.dispose();
    };
  }, [transport, refresh, student]);

  const currentDrivers = student && drivers?.transport === transport ? drivers : null;
  const verifiedUntil = state.status === "signed-in" && !revalidating ? state.expiresAt : 0;
  useEffect(() => {
    const environment = { foreground, online, verified: verifiedUntil > Date.now(), expiresAt: verifiedUntil };
    currentDrivers?.id.setEnvironment(environment);
    currentDrivers?.en.setEnvironment(environment);
  }, [currentDrivers, foreground, online, verifiedUntil]);

  return <OfflineMetadataContext.Provider value={{ drivers: currentDrivers, verifiedUntil }}>{children}</OfflineMetadataContext.Provider>;
}

// null opens the library and discovers enrollments from the authorized sync response.
export function useOfflineCourseMetadata(courseIds: readonly string[] | null, locale: NativeOfflineLocale) {
  const context = useContext(OfflineMetadataContext);
  const all = courseIds === null;
  const selectedKey = JSON.stringify([...new Set((courseIds ?? []).filter(id => id.trim() && id.length <= 256))].sort().slice(0, NATIVE_OFFLINE_COURSE_LIMIT));
  const selection = useMemo(() => JSON.parse(selectedKey) as string[], [selectedKey]);
  const driver = all || selection.length ? context?.drivers?.[locale] ?? null : null;
  const metadata = useSyncExternalStore(driver?.subscribe ?? inactiveSubscribe, driver?.getSnapshot ?? inactiveSnapshot, inactiveSnapshot);

  useEffect(() => driver?.register(all ? null : selection), [driver, all, selection]);

  if (!context) throw new Error("OfflineMetadataProvider is required for course metadata.");
  const now = Date.now();
  if (!driver || !context.drivers?.transport.isCurrent() || context.verifiedUntil <= now) {
    return { ...inactiveCourseMetadata, retry: inactiveRetry };
  }
  return { status: metadata.status, snapshot: visibleCourseMetadata(metadata.snapshot, now, all ? undefined : new Set(selection)), retry: driver.retry };
}
