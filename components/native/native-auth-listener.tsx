"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { syncQueryAccount } from "@/lib/query/client";
import { subscribeNativeCameraRestore } from "@/lib/native/camera-recovery";
import { subscribeNativeDeepLinks } from "@/lib/native/deep-links";
import { attachNativeLifecycleRefresh } from "@/lib/native/lifecycle-refresh";

export function NativeAuthListener() {
  const router = useRouter();
  const queryClient = useQueryClient();

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

    // 3. Smart data refresh on network reconnect and app resume.
    register(
      attachNativeLifecycleRefresh({
        queryClient,
        setOnline: (connected) => {
          onlineManager.setOnline(connected);
        },
        refreshSession: async () => {
          const result = await authClient.getSession();
          if (result && !result.error) {
            const nextUserId = result.data?.user?.id ?? null;
            syncQueryAccount(queryClient, nextUserId);
          }
        },
      }),
    );

    return () => {
      disposed = true;
      for (const unsub of cleanups) {
        unsub();
      }
    };
  }, [queryClient, router]);

  return null;
}
