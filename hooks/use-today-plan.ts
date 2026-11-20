"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { studentTodayQuery } from "@/lib/student/today-query";
import { todayCompletionMutation } from "@/lib/student/today-mutation";

export function useTodayPlan(userId: string) {
  const client = useQueryClient();
  const query = useQuery(studentTodayQuery(userId));
  const pending = useRef(new Map<string, AbortController>());
  const options = todayCompletionMutation(client, userId);
  const mutation = useMutation({
    ...options,
    onSettled: (data, error, variables, context, mutationContext) => {
      if (pending.current.get(variables.itemId) === variables.controller) pending.current.delete(variables.itemId);
      return options.onSettled?.(data, error, variables, context, mutationContext);
    },
  });

  useEffect(() => {
    const requests = pending.current;
    return () => {
      for (const controller of requests.values()) controller.abort();
      requests.clear();
    };
  }, [userId]);

  function complete(itemId: string) {
    if (pending.current.has(itemId)) return;
    const controller = new AbortController();
    pending.current.set(itemId, controller);
    mutation.mutate({ itemId, controller });
  }

  return { data: query.data ?? null, loading: query.isLoading, complete };
}
