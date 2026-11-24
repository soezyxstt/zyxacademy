"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { syncQueryAccount } from "@/lib/query/client";
import { subscribeNativeCameraRestore } from "@/lib/native/camera-recovery";
import { subscribeNativeDeepLinks } from "@/lib/native/deep-links";
import { attachNativeLifecycleRefresh } from "@/lib/native/lifecycle-refresh";
import {
  clearNativeLastRoute,
  isRestorableNativeRoute,
  persistNativeLastRoute,
} from "@/lib/native/route-persistence";
import { isNativeApp } from "@/lib/native/runtime";

export function NativeAuthListener() {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const userIdRef = useRef<string | null>(null);
  const sessionSyncInFlightRef = useRef(false);

  const persistCurrentRoute = useCallback(() => {
    if (typeof window === "undefined" || !isNativeApp()) return;
    const userId = userIdRef.current;
    if (!userId) return;
    const currentPath = `${window.location.pathname}${window.location.search}`;
    persistNativeLastRoute(userId, currentPath);
  }, []);

  const syncActiveUser = useCallback(async () => {
    if (sessionSyncInFlightRef.current) return;
    sessionSyncInFlightRef.current = true;
    try {
      const result = await authClient.getSession();
      if (result && !result.error) {
        const nextUserId = result.data?.user?.id ?? null;
        userIdRef.current = nextUserId;
        syncQueryAccount(queryClient, nextUserId);
        if (nextUserId) {
          persistCurrentRoute();
        } else {
          clearNativeLastRoute();
        }
      }
    } finally {
      sessionSyncInFlightRef.current = false;
    }
  }, [persistCurrentRoute, queryClient]);

  useEffect(() => {
    if (!isNativeApp()) return;
    if (userIdRef.current) {
      persistCurrentRoute();
      return;
    }
    if (isRestorableNativeRoute(pathname)) {
      void syncActiveUser().catch(() => {
        // Transient network errors must not clear existing native route state.
      });
    }
  }, [pathname, persistCurrentRoute, syncActiveUser]);

  useEffect(() => {
    let disposed = false;
    const cleanups: Array<() => void> = [];

    const register = (promise: Promise<() => void>) => {
      void promise.then((unsub) => {
        if (disposed) {
          unsub();
          return;
        }
        cleanups.push(unsub);
      });
    };

    if (isNativeApp()) {
      void syncActiveUser().catch(() => {
        // Transient network errors must not clear existing native route state.
      });

      const onPageHide = () => persistCurrentRoute();
      const onPopState = () => persistCurrentRoute();
      window.addEventListener("pagehide", onPageHide);
      window.addEventListener("popstate", onPopState);
      cleanups.push(() => {
        window.removeEventListener("pagehide", onPageHide);
        window.removeEventListener("popstate", onPopState);
      });
    }

    // 1. Direct deep links (App Links, Universal Links, custom schemes, cold-start launch URL, OAuth handoff).
    register(
      subscribeNativeDeepLinks({
        onAuthFinish: (finishPath) => {
          window.location.replace(finishPath);
        },
        onAppRoute: (appPath) => {
          if (appPath.includes("calendarSync=")) {
            window.location.replace(appPath);
            return;
          }
          router.push(appPath);
        },
      }),
    );

    // 2. Android OS process-kill camera result recovery.
    register(
      subscribeNativeCameraRestore((targetPath) => {
        router.push(targetPath);
      }),
    );

    // 3. Smart data refresh on network reconnect and app resume, plus route persistence on background.
    register(
      attachNativeLifecycleRefresh({
        queryClient,
        setOnline: (connected) => {
          onlineManager.setOnline(connected);
        },
        onBackground: persistCurrentRoute,
        refreshSession: syncActiveUser,
      }),
    );

    return () => {
      disposed = true;
      for (const unsub of cleanups) {
        unsub();
      }
    };
  }, [persistCurrentRoute, queryClient, router, syncActiveUser]);

  return null;
}
