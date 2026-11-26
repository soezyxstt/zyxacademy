"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { subscribeAccountTransition } from "@/lib/auth/account-transition-state";
import { useSession } from "@/lib/auth-client";
import { useAppLocale } from "@/lib/i18n/client";
import { syncQueryAccount } from "@/lib/query/client";
import { setOfflineAccount, getOfflineScope } from "@/lib/offline/cache-scope";
import { attachOfflineQueryPersistence } from "@/lib/offline/metadata-cache";
import { createOfflineSyncController, registerOfflineSyncController } from "@/lib/offline/sync-client";
import { OFFLINE_RESOURCE_CHANGED_EVENT, OFFLINE_RESOURCE_CHANGE_CHANNEL, OFFLINE_SYNC_REQUEST_EVENT } from "@/lib/offline/library-contract";
import { ZYX_LIFECYCLE_REFRESH_EVENT } from "@/lib/native/lifecycle-refresh";

/** Visible notifications never carry cache invalidation or control this runtime. */
export function OfflineSyncRuntime() {
  const session = useSession();
  const { locale } = useAppLocale();
  const client = useQueryClient();
  const userId = session.data?.user.id;
  const sessionId = session.data?.session.id;
  const user = session.data?.user;
  const role = user && "role" in user && typeof user.role === "string" ? user.role : undefined;
  useEffect(() => {
    // Pending or failed session probes are not a confirmed logout.
    if (session.isPending || session.error) return;
    syncQueryAccount(client, userId ?? null);
    if (!userId || role === "admin") return;
    setOfflineAccount(userId, locale);
    const scope = getOfflineScope(userId);
    if (!scope) return;
    const persistence = attachOfflineQueryPersistence(client, scope);
    const ready = persistence.catch(() => {});
    const changes = typeof BroadcastChannel === "undefined" ? undefined : new BroadcastChannel(OFFLINE_RESOURCE_CHANGE_CHANNEL);
    const controller = createOfflineSyncController({
      scope, queryClient: client, ready,
      onChange: change => changes?.postMessage({ scopeKey: scope.scopeKey, change }),
    });
    const unregister = registerOfflineSyncController(scope, controller);
    let disposed = false;
    let hydrated = false;
    let stopPersistence: (() => void) | undefined;
    let stream: EventSource | undefined;
    let streamTimer: ReturnType<typeof setTimeout> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let checkInterval: number | undefined;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let streamFailures = 0;
    let streamScope = "";
    const active = () => !disposed && navigator.onLine !== false && document.visibilityState === "visible";
    const sync = () => {
      if (!active() || !hydrated || debounce !== undefined) return;
      debounce = setTimeout(() => {
        debounce = undefined;
        if (!active()) return;
        void controller.sync().catch(() => {}).then(refreshSchedules).catch(() => {});
      }, 300);
    };
    const refreshSchedules = async () => {
      if (disposed) return;
      const snapshot = await controller.snapshot();
      if (disposed) return;
      const interval = snapshot.policy.activeCheckIntervalMs;
      if (timer === undefined || checkInterval !== interval) {
        clearTimeout(timer);
        checkInterval = interval;
        // Hints and reconnects do not postpone the next fallback check.
        timer = setTimeout(() => { timer = undefined; sync(); }, interval + Math.floor(Math.random() * 3000));
      }
      await refreshStream(snapshot);
    };
    const refreshStream = async (snapshot: Awaited<ReturnType<typeof controller.snapshot>>) => {
      if (!active() || typeof EventSource === "undefined") return;
      if (snapshot.syncError === "access") {
        stream?.close(); stream = undefined;
        clearTimeout(streamTimer); streamTimer = undefined;
        return;
      }
      const courseIds = (await controller.courseIds()).sort();
      if (!active()) return;
      const nextScope = JSON.stringify(courseIds);
      if (stream && nextScope !== streamScope) { stream.close(); stream = undefined; }
      if (stream || streamTimer !== undefined) return;
      const params = new URLSearchParams({ cursor: snapshot.syncCursor, locale });
      for (const id of courseIds) params.append("courseId", id);
      const connection = new EventSource(`/api/offline/stream?${params}`, { withCredentials: true });
      stream = connection;
      streamScope = nextScope;
      connection.addEventListener("hint", sync);
      connection.onopen = () => { if (stream === connection) streamFailures = 0; };
      connection.onerror = () => {
        if (stream !== connection) return;
        connection.close(); stream = undefined; streamFailures += 1;
        streamTimer = setTimeout(() => {
          streamTimer = undefined;
          void controller.snapshot().then(refreshStream).catch(() => {});
        }, 2000 * 2 ** Math.min(streamFailures, 4));
      };
    };
    const visibility = () => {
      if (active()) { streamFailures = 0; sync(); }
      else { stream?.close(); stream = undefined; clearTimeout(streamTimer); streamTimer = undefined; }
    };
    if (changes) changes.onmessage = ({ data }) => {
      if (disposed || data?.scopeKey !== scope.scopeKey) return;
      window.dispatchEvent(new CustomEvent(OFFLINE_RESOURCE_CHANGED_EVENT, { detail: data }));
      sync();
    };
    void persistence.then(stop => {
      if (disposed) stop();
      else stopPersistence = stop;
    }).catch(() => {}).finally(() => { hydrated = true; sync(); });
    window.addEventListener("online", visibility);
    window.addEventListener("offline", visibility);
    window.addEventListener(ZYX_LIFECYCLE_REFRESH_EVENT, sync);
    window.addEventListener(OFFLINE_SYNC_REQUEST_EVENT, sync);
    document.addEventListener("visibilitychange", visibility);
    const stopTransition = subscribeAccountTransition(pending => { if (!pending) sync(); });
    return () => {
      disposed = true; changes?.close(); stopTransition(); controller.dispose(); unregister(); stopPersistence?.(); stream?.close();
      clearTimeout(timer); clearTimeout(streamTimer); clearTimeout(debounce);
      window.removeEventListener("online", visibility); window.removeEventListener("offline", visibility);
      window.removeEventListener(ZYX_LIFECYCLE_REFRESH_EVENT, sync); window.removeEventListener(OFFLINE_SYNC_REQUEST_EVENT, sync);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [client, userId, sessionId, role, session.isPending, session.error, locale]);
  return null;
}
