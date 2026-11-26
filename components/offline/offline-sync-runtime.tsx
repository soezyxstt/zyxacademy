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
import { OFFLINE_SYNC_REQUEST_EVENT } from "@/lib/offline/library-contract";
import { ZYX_LIFECYCLE_REFRESH_EVENT } from "@/lib/native/lifecycle-refresh";

/** Visible notifications never carry cache invalidation or control this runtime. */
export function OfflineSyncRuntime() {
  const session = useSession();
  const { locale } = useAppLocale();
  const client = useQueryClient();
  const userId = session.data?.user.id;
  const role = session.data?.user.role;
  useEffect(() => {
    // Pending or failed session probes are not a confirmed logout.
    if (session.isPending || session.error) return;
    syncQueryAccount(client, userId ?? null);
    if (!userId || role === "admin") return;
    setOfflineAccount(userId, locale);
    const scope = getOfflineScope(userId);
    if (!scope) return;
    const controller = createOfflineSyncController({ scope, queryClient: client });
    const unregister = registerOfflineSyncController(scope, controller);
    let disposed = false;
    let stopPersistence: (() => void) | undefined;
    let stream: EventSource | undefined;
    let streamTimer: ReturnType<typeof setTimeout> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let streamFailures = 0;
    let streamScope = "";
    const active = () => !disposed && navigator.onLine !== false && document.visibilityState === "visible";
    const sync = () => {
      if (!active()) return;
      clearTimeout(debounce);
      debounce = setTimeout(() => { void controller.sync().catch(() => {}).then(schedule); }, 300);
    };
    const schedule = async () => {
      if (disposed) return;
      const snapshot = await controller.snapshot();
      clearTimeout(timer);
      // Lightweight cursor checks remain the recovery path when SSE is blocked.
      timer = setTimeout(sync, snapshot.policy.activeCheckIntervalMs + Math.floor(Math.random() * 3000));
      const courseIds = [...new Set([...snapshot.courses.map(course => course.id), ...Object.keys(snapshot.manifests)])].sort();
      const nextScope = JSON.stringify(courseIds);
      if (stream && nextScope !== streamScope) { stream.close(); stream = undefined; }
      if (active() && !stream && !streamTimer && streamFailures < 3) { streamScope = nextScope; connectStream(snapshot.syncCursor, courseIds); }
    };
    const connectStream = (cursor: string, courseIds: string[]) => {
      if (!active() || typeof EventSource === "undefined") return;
      const params = new URLSearchParams({ cursor, locale });
      for (const id of courseIds.slice(0, 100)) params.append("courseId", id);
      stream = new EventSource(`/api/offline/stream?${params}`, { withCredentials: true });
      stream.addEventListener("hint", sync);
      stream.onopen = () => { streamFailures = 0; };
      stream.onerror = () => {
        stream?.close(); stream = undefined; streamFailures += 1;
        clearTimeout(streamTimer);
        streamTimer = setTimeout(() => { streamTimer = undefined; void schedule(); }, Math.min(60_000, 2000 * 2 ** streamFailures));
      };
    };
    const visibility = () => {
      if (active()) { streamFailures = 0; sync(); }
      else { stream?.close(); stream = undefined; clearTimeout(streamTimer); streamTimer = undefined; }
    };
    void attachOfflineQueryPersistence(client, scope).then(stop => { if (disposed) stop(); else stopPersistence = stop; });
    window.addEventListener("online", visibility);
    window.addEventListener("offline", visibility);
    window.addEventListener(ZYX_LIFECYCLE_REFRESH_EVENT, sync);
    window.addEventListener(OFFLINE_SYNC_REQUEST_EVENT, sync);
    document.addEventListener("visibilitychange", visibility);
    const stopTransition = subscribeAccountTransition(pending => { if (!pending) sync(); });
    sync();
    return () => {
      disposed = true; stopTransition(); controller.dispose(); unregister(); stopPersistence?.(); stream?.close();
      clearTimeout(timer); clearTimeout(streamTimer); clearTimeout(debounce);
      window.removeEventListener("online", visibility); window.removeEventListener("offline", visibility);
      window.removeEventListener(ZYX_LIFECYCLE_REFRESH_EVENT, sync); window.removeEventListener(OFFLINE_SYNC_REQUEST_EVENT, sync);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [client, userId, role, session.isPending, session.error, locale]);
  return null;
}
