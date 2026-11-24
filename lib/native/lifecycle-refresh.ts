/**
 * lib/native/lifecycle-refresh.ts
 *
 * Smart data refresh coordinator for network reconnects and app resume.
 * Integrates Capacitor Network + App lifecycle signals alongside browser
 * online/offline and visibilitychange events with debouncing, throttling,
 * and strict preservation of active drafts, form inputs, and in-flight
 * or uncertain mutations.
 */

import {
  getCapacitor,
  type CapacitorPluginListenerHandle,
} from "./runtime";

export const ZYX_LIFECYCLE_REFRESH_EVENT = "zyx:lifecycle-refresh";

export type LifecycleRefreshReason =
  | "network_reconnect"
  | "app_resume"
  | "visibility_resume";

const REASON_PRIORITY: Record<LifecycleRefreshReason, number> = {
  visibility_resume: 1,
  app_resume: 2,
  network_reconnect: 3,
};

export interface LifecycleQueryClientLike {
  refetchQueries: (filters: {
    type: "active";
    stale: true;
    predicate?: (query: { queryKey: readonly unknown[] }) => boolean;
  }) => Promise<void>;
  isMutating: (filters?: { mutationKey?: readonly unknown[] }) => number;
}

export interface LifecycleRefreshDeps {
  queryClient: LifecycleQueryClientLike;
  refreshSession?: () => Promise<void>;
  notifyInbox?: (reason: LifecycleRefreshReason) => void;
  setOnline?: (connected: boolean) => void;
  onBackground?: () => void;
  now?: () => number;
  scheduleTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (id: ReturnType<typeof setTimeout>) => void;
}

export interface LifecycleRefreshOptions {
  /** Debounce window to coalesce simultaneous resume/visibility/network events. */
  debounceMs?: number;
  /** Minimum interval between resume-triggered refreshes. */
  resumeCooldownMs?: number;
  /** Minimum interval between network-reconnect refreshes. */
  reconnectCooldownMs?: number;
  /** Minimum time backgrounded before native appStateChange triggers a refresh. */
  minResumeAwayMs?: number;
  /** Minimum time hidden before document visibilitychange triggers a refresh. */
  minVisibilityAwayMs?: number;
  /** Minimum age before re-checking the auth session on resume. */
  sessionStaleMs?: number;
  /** Initial online state (defaults to true). */
  initialOnline?: boolean;
}

export interface LifecycleRefreshController {
  handleNetworkStatusChange: (connected: boolean) => void;
  handleAppStateChange: (isActive: boolean) => void;
  handleVisibilityChange: (visible: boolean) => void;
  triggerRefresh: (reason: LifecycleRefreshReason) => void;
  isOnline: () => boolean;
  dispose: () => void;
}

/**
 * Determines whether an active stale query is safe to refetch without
 * interfering with any in-flight mutation for the same domain.
 */
export function isQuerySafeToBackgroundRefresh(
  queryClient: Pick<LifecycleQueryClientLike, "isMutating">,
  queryKey: readonly unknown[],
): boolean {
  // Never refetch if there is a mutation currently running on the exact same
  // account/domain prefix (for example ["zyx", "account", userId, "quizzes"]
  // or ["zyx", "account", userId, "student"]).
  if (queryKey.length >= 4 && queryKey[0] === "zyx" && queryKey[1] === "account") {
    const domainPrefix = queryKey.slice(0, 4);
    if (queryClient.isMutating({ mutationKey: domainPrefix }) > 0) {
      return false;
    }
  }
  return true;
}

export function createLifecycleRefreshController(
  deps: LifecycleRefreshDeps,
  options: LifecycleRefreshOptions = {},
): LifecycleRefreshController {
  const debounceMs = options.debounceMs ?? 350;
  const resumeCooldownMs = options.resumeCooldownMs ?? 10_000;
  const reconnectCooldownMs = options.reconnectCooldownMs ?? 2_000;
  const minResumeAwayMs = options.minResumeAwayMs ?? 5_000;
  const minVisibilityAwayMs = options.minVisibilityAwayMs ?? 15_000;
  const sessionStaleMs = options.sessionStaleMs ?? 60_000;

  const now = deps.now ?? (() => Date.now());
  const scheduleTimer = deps.scheduleTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((id) => clearTimeout(id));

  let online = options.initialOnline ?? true;
  let disposed = false;
  let inFlight = false;
  let lastRefreshAt = 0;
  let lastSessionRefreshAt = 0;
  let backgroundedAt: number | null = null;
  let hiddenAt: number | null = null;

  let pendingReason: LifecycleRefreshReason | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const executeRefresh = async (reason: LifecycleRefreshReason) => {
    if (disposed || !online || inFlight) return;
    const current = now();
    const cooldown = reason === "network_reconnect" ? reconnectCooldownMs : resumeCooldownMs;
    if (lastRefreshAt > 0 && current - lastRefreshAt < cooldown) {
      return;
    }

    inFlight = true;
    lastRefreshAt = current;

    try {
      const shouldRefreshSession =
        Boolean(deps.refreshSession) &&
        (reason === "network_reconnect" ||
          lastSessionRefreshAt === 0 ||
          current - lastSessionRefreshAt >= sessionStaleMs);

      if (shouldRefreshSession && deps.refreshSession) {
        lastSessionRefreshAt = current;
        await deps.refreshSession().catch(() => {
          // Transient network errors must never clear the active session or drafts.
        });
      }

      if (disposed || !online) return;

      await deps.queryClient
        .refetchQueries({
          type: "active",
          stale: true,
          predicate: (query) =>
            isQuerySafeToBackgroundRefresh(deps.queryClient, query.queryKey),
        })
        .catch(() => {
          // Ignore individual query failures; stale queries retain their data.
        });

      if (disposed || !online) return;

      try {
        deps.notifyInbox?.(reason);
      } catch {
        // Ignore subscriber errors.
      }
    } finally {
      inFlight = false;
    }
  };

  const triggerRefresh = (reason: LifecycleRefreshReason) => {
    if (disposed || !online) return;

    if (!pendingReason || REASON_PRIORITY[reason] > REASON_PRIORITY[pendingReason]) {
      pendingReason = reason;
    }

    if (debounceTimer !== null) {
      clearTimer(debounceTimer);
    }

    debounceTimer = scheduleTimer(() => {
      debounceTimer = null;
      const reasonToRun = pendingReason;
      pendingReason = null;
      if (reasonToRun) {
        void executeRefresh(reasonToRun);
      }
    }, debounceMs);
  };

  const handleNetworkStatusChange = (connected: boolean) => {
    if (disposed) return;
    const wasOnline = online;
    online = connected;
    deps.setOnline?.(connected);
    if (!wasOnline && connected) {
      triggerRefresh("network_reconnect");
    }
  };

  const handleAppStateChange = (isActive: boolean) => {
    if (disposed) return;
    const current = now();
    if (!isActive) {
      backgroundedAt = current;
      try {
        deps.onBackground?.();
      } catch {
        // Ignore background hook errors.
      }
      return;
    }
    if (backgroundedAt !== null && current - backgroundedAt >= minResumeAwayMs) {
      backgroundedAt = null;
      triggerRefresh("app_resume");
    } else {
      backgroundedAt = null;
    }
  };

  const handleVisibilityChange = (visible: boolean) => {
    if (disposed) return;
    const current = now();
    if (!visible) {
      hiddenAt = current;
      try {
        deps.onBackground?.();
      } catch {
        // Ignore background hook errors.
      }
      return;
    }
    if (hiddenAt !== null && current - hiddenAt >= minVisibilityAwayMs) {
      hiddenAt = null;
      triggerRefresh("visibility_resume");
    } else {
      hiddenAt = null;
    }
  };

  return {
    handleNetworkStatusChange,
    handleAppStateChange,
    handleVisibilityChange,
    triggerRefresh,
    isOnline: () => online,
    dispose() {
      disposed = true;
      pendingReason = null;
      if (debounceTimer !== null) {
        clearTimer(debounceTimer);
        debounceTimer = null;
      }
    },
  };
}

export async function attachNativeLifecycleRefresh(
  deps: Omit<LifecycleRefreshDeps, "notifyInbox"> & {
    notifyInbox?: (reason: LifecycleRefreshReason) => void;
  },
  options?: LifecycleRefreshOptions,
): Promise<() => void> {
  if (typeof window === "undefined") return () => {};

  const initialOnline =
    options?.initialOnline ?? (typeof navigator !== "undefined" ? navigator.onLine !== false : true);

  const controller = createLifecycleRefreshController(
    {
      ...deps,
      notifyInbox:
        deps.notifyInbox ??
        ((reason) => {
          try {
            window.dispatchEvent(
              new CustomEvent<{ reason: LifecycleRefreshReason }>(ZYX_LIFECYCLE_REFRESH_EVENT, {
                detail: { reason },
              }),
            );
          } catch {
            // Ignore environments without CustomEvent.
          }
        }),
    },
    { ...options, initialOnline },
  );

  deps.setOnline?.(initialOnline);

  const onWindowOnline = () => controller.handleNetworkStatusChange(true);
  const onWindowOffline = () => controller.handleNetworkStatusChange(false);
  const onVisibilityChange = () =>
    controller.handleVisibilityChange(document.visibilityState === "visible");

  window.addEventListener("online", onWindowOnline);
  window.addEventListener("offline", onWindowOffline);
  document.addEventListener("visibilitychange", onVisibilityChange);

  const handles: CapacitorPluginListenerHandle[] = [];
  let disposed = false;

  const cap = getCapacitor();
  const networkPlugin = cap?.Plugins?.Network;
  const appPlugin = cap?.Plugins?.App;

  if (networkPlugin) {
    try {
      const status = await networkPlugin.getStatus();
      if (!disposed && typeof status?.connected === "boolean") {
        controller.handleNetworkStatusChange(status.connected);
      }
    } catch {
      // Ignore native status probe failures.
    }

    try {
      const handle = await networkPlugin.addListener("networkStatusChange", (status) => {
        if (typeof status?.connected === "boolean") {
          controller.handleNetworkStatusChange(status.connected);
        }
      });
      if (disposed) {
        void handle.remove().catch(() => {});
      } else {
        handles.push(handle);
      }
    } catch {
      // Ignore listener registration errors.
    }
  }

  if (appPlugin?.addListener) {
    try {
      const handle = await appPlugin.addListener("appStateChange", (state) => {
        if (typeof state?.isActive === "boolean") {
          controller.handleAppStateChange(state.isActive);
        }
      });
      if (disposed) {
        void handle.remove().catch(() => {});
      } else {
        handles.push(handle);
      }
    } catch {
      // Ignore listener registration errors.
    }
  }

  return () => {
    disposed = true;
    controller.dispose();
    window.removeEventListener("online", onWindowOnline);
    window.removeEventListener("offline", onWindowOffline);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    for (const handle of handles) {
      void handle.remove().catch(() => {});
    }
    handles.length = 0;
  };
}
