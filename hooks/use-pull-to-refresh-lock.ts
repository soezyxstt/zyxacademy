"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  acquirePullToRefreshLock,
  isPullToRefreshLocked,
  subscribePullToRefreshLock,
} from "@/lib/pull-to-refresh-lock";

function getServerSnapshot(): boolean {
  return false;
}

export function useIsPullToRefreshLocked(): boolean {
  return useSyncExternalStore(
    subscribePullToRefreshLock,
    isPullToRefreshLocked,
    getServerSnapshot,
  );
}

export function usePullToRefreshLock(active: boolean, reason: string): void {
  useEffect(() => {
    if (!active) return;
    return acquirePullToRefreshLock(reason);
  }, [active, reason]);
}
