import { mutationOptions, type QueryClient } from "@tanstack/react-query";
import { isQueryAccountCurrent } from "@/lib/query/client";
import { queryKeys } from "@/lib/query/keys";
import { completeTodayItem, studentTodayQuery, type TodayData } from "./today-query";

export type TodayCompletion = { itemId: string; controller: AbortController };

const pendingCompletions = new WeakMap<QueryClient, Map<string, Set<AbortController>>>();

function beginCompletion(client: QueryClient, userId: string, controller: AbortController): void {
  const accounts = pendingCompletions.get(client) ?? new Map<string, Set<AbortController>>();
  const requests = accounts.get(userId) ?? new Set<AbortController>();
  requests.add(controller);
  accounts.set(userId, requests);
  pendingCompletions.set(client, accounts);
}

function finishCompletion(client: QueryClient, userId: string, controller: AbortController): number {
  const accounts = pendingCompletions.get(client);
  const requests = accounts?.get(userId);
  requests?.delete(controller);
  if (requests?.size) return requests.size;
  accounts?.delete(userId);
  if (accounts?.size === 0) pendingCompletions.delete(client);
  return 0;
}

function setDone(data: TodayData | undefined, itemId: string, done: boolean): TodayData | undefined {
  return data ? { ...data, items: data.items.map(item => item.id === itemId ? { ...item, done } : item) } : data;
}

/** A rollback touches only its own item, preserving other pending completions. */
export function todayCompletionMutation(
  client: QueryClient,
  userId: string,
) {
  const { queryKey } = studentTodayQuery(userId);
  return mutationOptions({
    mutationKey: queryKeys.student.completeToday(userId),
    retry: false,
    networkMode: "always",
    mutationFn: ({ itemId, controller }: TodayCompletion) => completeTodayItem(userId, itemId, controller.signal),
    onMutate: async ({ itemId, controller }: TodayCompletion) => {
      beginCompletion(client, userId, controller);
      await client.cancelQueries({ queryKey, exact: true });
      controller.signal.throwIfAborted();
      if (!isQueryAccountCurrent(client, userId)) throw new Error("Account changed");
      const previousDone = client.getQueryData(queryKey)?.items.find(item => item.id === itemId)?.done;
      client.setQueryData(queryKey, data => setDone(data, itemId, true));
      return { previousDone };
    },
    onError: (_error, { itemId, controller }, previous) => {
      if (controller.signal.aborted || !isQueryAccountCurrent(client, userId)) return;
      if (previous?.previousDone !== undefined) {
        client.setQueryData(queryKey, data => setDone(data, itemId, previous.previousDone!));
      }
    },
    onSettled: (_data, _error, { controller }) => {
      // Query still counts each mutation as pending while onSettled runs. Two
      // responses can settle together, so track completion before any await.
      const remaining = finishCompletion(client, userId, controller);
      if (!isQueryAccountCurrent(client, userId)) return;
      if (controller.signal.aborted || remaining === 0) {
        return client.invalidateQueries({ queryKey, exact: true, refetchType: controller.signal.aborted ? "none" : "active" });
      }
    },
  });
}
