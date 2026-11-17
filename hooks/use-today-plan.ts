"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { completeTodayItem, studentTodayQuery, type TodayData } from "@/lib/student/today-query";
import { removeOtherAccounts } from "@/lib/query/client";

export function useTodayPlan(userId: string) {
  const client = useQueryClient();
  useEffect(() => { removeOtherAccounts(client, userId); }, [client, userId]);
  const options = studentTodayQuery(userId);
  const query = useQuery(options);
  const queryClient = useQueryClient();
  const { mutateAsync: saveItem } = useMutation({
    mutationKey: [...options.queryKey, "complete"],
    mutationFn: ({ itemId, signal }: { itemId: string; signal: AbortSignal }) => completeTodayItem(userId, itemId, signal),
    retry: false, networkMode: "always", gcTime: 0,
  });
  const pending = useRef(new Map<string, AbortController>());
  useEffect(() => {
    const requests = pending.current;
    return () => {
      for (const controller of requests.values()) controller.abort();
      requests.clear();
    };
  }, [userId]);
  const complete = async (itemId: string) => {
    if (pending.current.has(itemId)) return;
    const controller = new AbortController();
    pending.current.set(itemId, controller);
    await queryClient.cancelQueries({ queryKey: options.queryKey, exact: true });
    if (controller.signal.aborted) return;
    const previousDone = queryClient.getQueryData<TodayData>(options.queryKey)?.items.find((item) => item.id === itemId)?.done;
    queryClient.setQueryData<TodayData>(options.queryKey, (data) =>
      data ? { ...data, items: data.items.map((item) => item.id === itemId ? { ...item, done: true } : item) } : data
    );
    try {
      await saveItem({ itemId, signal: controller.signal });
    } catch {
      if (previousDone !== undefined) {
        queryClient.setQueryData<TodayData>(options.queryKey, (data) =>
          data ? { ...data, items: data.items.map((item) => item.id === itemId ? { ...item, done: previousDone } : item) } : data,
        );
      }
    } finally {
      pending.current.delete(itemId);
      if (controller.signal.aborted) {
        void queryClient.invalidateQueries({ queryKey: options.queryKey, exact: true, refetchType: "none" });
      } else if (pending.current.size === 0) {
        void queryClient.invalidateQueries({ queryKey: options.queryKey, exact: true });
      }
    }
  };
  return { data: query.data, loading: query.isLoading, complete };
}
