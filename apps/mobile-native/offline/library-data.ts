import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { offlineLibraryScopeKey, projectOfflineLibrary, type OfflineLibraryData } from "./library-model";
import { openExpoOfflineMetadataStore } from "./metadata-expo";
import type { OfflineReadingSummary } from "./reading-contract";
import type { NativeOfflineScope } from "./sync-contract";

type Subscribe = (listener: () => void) => () => void;

function createInvalidation(source: Subscribe) {
  let revision = 0;
  let listen: () => void = () => {};
  function refresh() {
    revision++;
    listen();
  }
  return {
    getRevision: () => revision,
    refresh,
    subscribe(listener: () => void) {
      listen = listener;
      const stop = source(refresh);
      return () => {
        stop();
        listen = () => {};
      };
    },
  };
}

const serverRevision = () => 0;
const blank: OfflineLibraryData = { metadata: null, saved: [] };

type Observation = ReturnType<typeof createInvalidation>;
export type OfflineLibraryStorage = { unavailableCount: number; count: number; bytes: number; pinnedCount: number; maxBytes: number };

type ReadResult = {
  observation: Observation;
  revision: number;
  data: (OfflineLibraryData & { storage: OfflineLibraryStorage }) | null;
};

export function useOfflineLibraryData({ scope, verifiedUntil, list, storage, subscribe }: {
  scope: NativeOfflineScope | null;
  verifiedUntil: number;
  list: () => Promise<OfflineReadingSummary[]>;
  storage: () => Promise<OfflineLibraryStorage>;
  subscribe: Subscribe;
}) {
  const now = Date.now();
  const scopeKey = offlineLibraryScopeKey(scope, verifiedUntil, now);
  // A new observation also separates two visits to the same scope when authorization was interrupted.
  const observation = useMemo(() => createInvalidation(subscribe), [scopeKey, subscribe]);
  const revision = useSyncExternalStore(observation.subscribe, observation.getRevision, serverRevision);
  const [result, setResult] = useState<ReadResult | null>(null);

  useEffect(() => {
    if (!scopeKey || !scope) return;
    let active = true;
    const finish = (data: ReadResult["data"]) => {
      if (active && revision === observation.getRevision()) setResult({ observation, revision, data });
    };
    void Promise.all([
      openExpoOfflineMetadataStore().then(repository => repository.read(scope)),
      list(),
      storage(),
    ]).then(([metadata, saved, storageUsage]) => finish({ metadata, saved, storage: storageUsage }), () => finish(null));
    return () => { active = false; };
  }, [list, observation, revision, scope, scopeKey, storage]);

  const current = scopeKey && result?.observation === observation && result.revision === revision ? result : null;
  const projection = useMemo(() => projectOfflineLibrary(current?.data ?? blank, Date.now(), verifiedUntil), [current, verifiedUntil]);
  const visible = projection.expires <= now ? projectOfflineLibrary(current?.data ?? blank, now, verifiedUntil) : projection;
  useEffect(() => {
    if (!scopeKey) return;
    const wait = Math.max(0, Math.min(2_147_483_647, projection.expires - Date.now()));
    const timeout = setTimeout(observation.refresh, wait);
    return () => clearTimeout(timeout);
  }, [observation, projection.expires, revision, scopeKey]);

  return {
    ...visible, observation, revision,
    unavailableCount: current?.data?.storage.unavailableCount ?? 0,
    storageUsage: current?.data?.storage,
    metadata: current?.data?.metadata ?? null,
    loaded: current !== null,
    failed: current?.data === null,
    retry: observation.refresh,
  };
}
