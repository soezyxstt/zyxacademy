import type { NativeSessionScope } from "../network/transport";
import { openExpoOfflineMetadataStore } from "./metadata-expo";
import { notifyOfflineReadingChanges } from "./reading-events";
import { openExpoOfflineReadingStore } from "./reading-expo";

type Purge = { work?: Promise<void>; complete: boolean };
const purges = new Map<string, Purge>();
const key = (scope: NativeSessionScope) => JSON.stringify([scope.origin, scope.accountId, scope.sessionId]);

export function offlineReadingSessionBlocked(scope: NativeSessionScope) {
  return purges.has(key(scope));
}

export function waitForOfflineReadingPurge(scope: NativeSessionScope) {
  if (offlineReadingSessionBlocked(scope)) return purgeOfflineReadingSession(scope);
}

export function unblockOfflineReadingSession(scope: NativeSessionScope) {
  const scopeKey = key(scope);
  if (purges.get(scopeKey)?.complete) {
    purges.delete(scopeKey);
    notifyOfflineReadingChanges();
  }
}

export function purgeOfflineReadingSession(scope: NativeSessionScope): Promise<void> {
  const scopeKey = key(scope);
  const purge = purges.get(scopeKey) ?? { complete: false };
  if (purge.work) return purge.work;
  if (purge.complete) return Promise.resolve();
  purges.set(scopeKey, purge);
  notifyOfflineReadingChanges();
  purge.work = (async () => {
    try {
      await (await openExpoOfflineMetadataStore()).clearSession(scope);
    } finally {
      await (await openExpoOfflineReadingStore()).clearSession(scope);
    }
    purge.complete = true;
  })().finally(() => { purge.work = undefined; });
  return purge.work;
}
