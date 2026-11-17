"use client";

import { useEffect } from "react";
import { useTranslations } from "@/lib/i18n/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useQueryAccount } from "@/hooks/use-query-account";
import { discussionCountsQuery } from "@/lib/query/discussions";
import { queryKeys } from "@/lib/query/keys";

export const DISCUSSION_COUNTS_CHANGED = "zyx:discussion-counts-changed";

export function DiscussionCountBadge({ courseId, enabled = true }: { courseId?: string; enabled?: boolean }) {
  const t = useTranslations("discussions");
  const userId = useQueryAccount();
  const client = useQueryClient();
  const { data, isError } = useQuery({ ...discussionCountsQuery(userId, courseId), enabled: enabled && Boolean(userId) });
  useEffect(() => {
    const refresh = () => { void client.invalidateQueries({ queryKey: queryKeys.discussions(userId) }); };
    window.addEventListener(DISCUSSION_COUNTS_CHANGED, refresh);
    return () => window.removeEventListener(DISCUSSION_COUNTS_CHANGED, refresh);
  }, [client, userId]);
  const count = (courseId ? data?.course?.unreadThreads : data?.total.unreadThreads) ?? 0;
  return !isError && count > 0 ? <span aria-label={t("unreadQuestions", { count })} className="rounded-md bg-primary px-1.5 py-0.5 text-body-xs font-semibold text-primary-foreground">{count}</span> : null;
}
