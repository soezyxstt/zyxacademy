import { mutationOptions, type QueryClient } from "@tanstack/react-query";
import { emitActivityUpdated } from "@/lib/activity-signal";
import { isQueryAccountCurrent } from "@/lib/query/client";
import { ApiError } from "@/lib/query/http";
import { invalidateLearningQueries } from "@/lib/query/invalidation";
import { queryKeys } from "@/lib/query/keys";
import { mergeArticleSectionProgress, type ArticleProgress, type ArticleProgressUpdate } from "./progress-contract";
import { updateArticleProgress } from "./progress-query";

type ProgressBatch = { pending: number; completedSectionId: string | null };
const pendingProgress = new WeakMap<QueryClient, Map<string, ProgressBatch>>();

function beginProgress(client: QueryClient, scope: string): void {
  const batches = pendingProgress.get(client) ?? new Map<string, ProgressBatch>();
  const batch = batches.get(scope) ?? { pending: 0, completedSectionId: null };
  batch.pending += 1;
  batches.set(scope, batch);
  pendingProgress.set(client, batches);
}

function finishProgress(client: QueryClient, scope: string): string | null {
  const batches = pendingProgress.get(client);
  const batch = batches?.get(scope);
  if (!batches || !batch) return null;
  batch.pending -= 1;
  if (batch.pending > 0) return null;
  batches.delete(scope);
  if (batches.size === 0) pendingProgress.delete(client);
  return batch.completedSectionId;
}

/** Keep acknowledged progress ahead of stale reads and coalesce summary refreshes. */
export function articleProgressMutation(client: QueryClient, userId: string, articleId: string, articleVersion: number, courseId?: string) {
  const queryKey = queryKeys.articles.progress(userId, articleId, articleVersion);
  const scope = JSON.stringify(queryKey);
  const hasCurrentProgress = () => Boolean(userId) && isQueryAccountCurrent(client, userId) && Boolean(client.getQueryState(queryKey));

  return mutationOptions({
    mutationKey: [...queryKey, "update"],
    mutationFn: (update: ArticleProgressUpdate) => {
      if (!userId || !isQueryAccountCurrent(client, userId)) throw new ApiError(409, "Account changed");
      return updateArticleProgress(userId, articleId, articleVersion, update);
    },
    retry: false,
    networkMode: "always",
    onMutate: async () => {
      // Register before yielding so every settlement, including failed setup,
      // releases its pending write before another callback checks the batch.
      beginProgress(client, scope);
      await client.cancelQueries({ queryKey, exact: true }, { revert: false });
    },
    onSuccess: async (result) => {
      if (!hasCurrentProgress()) return;
      // A remount or reconnect may start a read while the PUT is pending. Stop
      // it before merging, without restoring a snapshot older than another receipt.
      await client.cancelQueries({ queryKey, exact: true }, { revert: false });
      // Logout or removal during cancellation must not recreate the old cache.
      if (!hasCurrentProgress()) return;
      client.setQueryData<ArticleProgress>(queryKey, (current) => current ? {
        ...current,
        sectionProgress: {
          ...current.sectionProgress,
          [result.sectionId]: mergeArticleSectionProgress(current.sectionProgress[result.sectionId], result),
        },
      } : current);
      const batch = pendingProgress.get(client)?.get(scope);
      if (batch && result.completed) batch.completedSectionId = result.sectionId;
    },
    onSettled: () => {
      // Query keeps mutations pending until their callbacks return. Two callbacks
      // can see the same isMutating count, so remove this write synchronously.
      const sectionId = finishProgress(client, scope);
      if (!sectionId || !hasCurrentProgress()) return;
      void invalidateLearningQueries(client, userId, { courseId, articleId });
      emitActivityUpdated({ type: "article", courseId, materialId: articleId, sectionId, queryCacheUpdated: true });
    },
  });
}
