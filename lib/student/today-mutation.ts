import { mutationOptions, type QueryClient } from "@tanstack/react-query";
import { isQueryAccountCurrent } from "@/lib/query/client";
import { queryKeys } from "@/lib/query/keys";
import { completeTodayItem, studentTodayQuery, type TodayData } from "./today-query";

export type TodayCompletion = { itemId: string; controller: AbortController };

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
      if (!isQueryAccountCurrent(client, userId)) return;
      if (controller.signal.aborted || client.isMutating({ mutationKey: queryKeys.student.completeToday(userId), exact: true }) === 1) {
        return client.invalidateQueries({ queryKey, exact: true, refetchType: controller.signal.aborted ? "none" : "active" });
      }
    },
  });
}
