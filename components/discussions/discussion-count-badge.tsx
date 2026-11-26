"use client";

import { useEffect } from "react";
import { useTranslations } from "@/lib/i18n/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useQueryAccountId } from "@/hooks/use-query-account";
import { discussionCountsQuery } from "@/lib/discussions/counts-query";
import { queryKeys } from "@/lib/query/keys";

export const DISCUSSION_COUNTS_CHANGED = "zyx:discussion-counts-changed";

export function DiscussionCountBadge({ courseId, enabled = true }: { courseId?: string; enabled?: boolean }) {
  const t = useTranslations("discussions");
  const userId = useQueryAccountId();
  const client = useQueryClient();
  const { data } = useQuery({
    ...discussionCountsQuery(userId ?? "", courseId),
    enabled: enabled && !!userId,
  });
  useEffect(() => {
    if (!enabled || !userId) return;
    const refresh = () => { void client.invalidateQueries({ queryKey: queryKeys.discussions.countsAll(userId) }); };
    window.addEventListener(DISCUSSION_COUNTS_CHANGED, refresh);
    return () => window.removeEventListener(DISCUSSION_COUNTS_CHANGED, refresh);
  }, [client, userId, enabled]);
  const count = (courseId ? data?.course?.unreadThreads : data?.total.unreadThreads) ?? 0;
  return count > 0 ? <span aria-label={t("unreadQuestions", { count })} className="rounded-md bg-primary px-1.5 py-0.5 text-body-xs font-semibold text-primary-foreground">{count}</span> : null;
}
