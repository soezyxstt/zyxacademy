import { isCancelledError, queryOptions, type QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { isQueryAccountCurrent } from "@/lib/query/client";
import { requestJson } from "@/lib/query/http";
import { queryKeys } from "@/lib/query/keys";

export type DiscussionListScope = { sessionId: string; channelIds: string[]; revision: string };

const threadPageSchema = z.object({
  items: z.array(z.object({
    id: z.string(), channelId: z.string(), title: z.string(), status: z.enum(["open", "resolved"]),
    labels: z.array(z.string()), helpKind: z.enum(["academic", "bug", "feature", "operations"]).nullable(),
    createdAt: z.string(), lastActivityAt: z.string(), answerCount: z.number().int().nonnegative(),
    unreadCount: z.number().int().nonnegative(), canReply: z.boolean(), canResolve: z.boolean(),
  })),
  nextCursor: z.string().nullable(),
});

export async function readCachedDiscussionThreads(client: QueryClient, userId: string, scope: DiscussionListScope, locale: string, params: URLSearchParams) {
  if (!isQueryAccountCurrent(client, userId)) throw new Error("Discussion account changed");
  const queryKey = [...queryKeys.discussions.threadLists(userId), scope.sessionId, locale, scope.revision, params.toString()];
  const options = queryOptions({
    queryKey,
    queryFn: ({ signal }) => requestJson(`/api/discussions/workspace?${params}`, threadPageSchema, {
      signal, headers: { "x-student-id": userId, "x-discussion-session-id": scope.sessionId },
    }),
    staleTime: 30_000,
    gcTime: 2 * 60_000,
    retry: false,
  });
  const page = await client.fetchQuery(options).catch((error: unknown) => {
    // A write can cancel the first-page read while the workspace is mounting.
    if (!isCancelledError(error) || !isQueryAccountCurrent(client, userId)) throw error;
    return client.fetchQuery(options);
  });
  // The fresh API result may include a channel granted after the page's access check.
  // Serve that authorized response once, but never reuse it under the previous scope.
  const allowed = new Set(scope.channelIds);
  if (page.items.some((item) => !allowed.has(item.channelId))) client.removeQueries({ queryKey, exact: true });
  if (!isQueryAccountCurrent(client, userId)) throw new Error("Discussion account changed");
  return page;
}

export function invalidateDiscussionThreadLists(client: QueryClient, userId: string) {
  const filter = { queryKey: queryKeys.discussions.threadLists(userId) };
  void client.cancelQueries(filter);
  void client.invalidateQueries({ ...filter, refetchType: "none" });
}
