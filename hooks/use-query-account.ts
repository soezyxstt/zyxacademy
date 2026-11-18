"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-client";
import { isQueryAccountCurrent, subscribeQueryAccount, syncQueryAccount } from "@/lib/query/client";

/** RSC props retain their actor until navigation. Hide them on an auth change. */
export function useQueryAccountCurrent(userId: string): boolean {
  const client = useQueryClient();
  const subscribe = useCallback((listener: () => void) => subscribeQueryAccount(client, listener), [client]);
  const snapshot = useCallback(() => isQueryAccountCurrent(client, userId), [client, userId]);
  return useSyncExternalStore(subscribe, snapshot, () => true);
}

export function useSyncQueryAccount(userId: string | undefined, isPending: boolean): void {
  const client = useQueryClient();
  useEffect(() => {
    if (!isPending) syncQueryAccount(client, userId ?? null);
  }, [client, userId, isPending]);
}

/** Use inside live features; public demos keep their separate local adapters. */
export function useQueryAccountId(): string | undefined {
  const { data, isPending } = useSession();
  const userId = data?.user.id;
  useSyncQueryAccount(userId, isPending);
  return userId;
}
