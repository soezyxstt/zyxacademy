import { useCallback, useLayoutEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Platform } from "react-native";

import { useNativeSession } from "../auth/session-provider";
import { createOfflineReadingController } from "./reading-client";
import type { OfflineReadingDownload, OfflineReadingPackage, OfflineReadingSummary } from "./reading-contract";
import { subscribeOfflineReadingChanges } from "./reading-events";
import { openExpoOfflineReadingStore, verifyExpoOfflineReadingAsset } from "./reading-expo";
import { offlineReadingSessionBlocked, purgeOfflineReadingSession } from "./reading-session-storage";
import type { NativeOfflineLocale } from "./sync-contract";
import { useOfflineReadingSession } from "./use-reading-session";

const supported = Platform.OS === "android" || Platform.OS === "ios";
const notBlocked = () => false;
const noRead = async (): Promise<OfflineReadingPackage | null> => null;
const noList = async (): Promise<OfflineReadingSummary[]> => [];
const noForget = async () => false;
const noDownload = async (): Promise<OfflineReadingDownload> => ({ status: "unavailable" });

export function useOfflineReadingPackages(locale: NativeOfflineLocale) {
  const { refresh } = useNativeSession();
  const access = useOfflineReadingSession(locale);
  const { scope, verifiedUntil, transport } = access;
  const readBlocked = useCallback(() => !!scope && offlineReadingSessionBlocked(scope), [scope]);
  const blocked = useSyncExternalStore(subscribeOfflineReadingChanges, readBlocked, notBlocked);
  const [instance, setInstance] = useState<{
    access: typeof access;
    controller: ReturnType<typeof createOfflineReadingController>;
  } | null>(null);

  useLayoutEffect(() => {
    if (!supported || !scope || blocked) {
      setInstance(null);
      return;
    }
    const controller = createOfflineReadingController({
      scope, verifiedUntil, session: transport,
      repository: openExpoOfflineReadingStore,
      checkAsset: verifyExpoOfflineReadingAsset,
      async onRevoked() {
        await purgeOfflineReadingSession(scope).finally(() => refresh());
      },
    });
    setInstance({ access, controller });
    return () => controller.dispose();
  }, [access, blocked, scope, refresh, transport, verifiedUntil]);

  const current = !blocked && instance?.access === access ? instance.controller : null;
  return useMemo(() => ({
    available: !!current,
    canDownload: !!current && !!transport,
    offline: access.offline,
    list: current?.list ?? noList,
    read: current?.read ?? noRead,
    forget: current?.forget ?? noForget,
    download: current?.download ?? noDownload,
    subscribe: subscribeOfflineReadingChanges,
  }), [access.offline, current, transport]);
}
