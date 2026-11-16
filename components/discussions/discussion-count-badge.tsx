"use client";

import { useEffect } from "react";
import { useTranslations } from "@/lib/i18n/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-client";

type Count = { unreadThreads: number; activeThreads: number };
export const DISCUSSION_COUNTS_CHANGED = "zyx:discussion-counts-changed";

export function DiscussionCountBadge({ courseId, enabled = true }: { courseId?: string; enabled?: boolean }) {
  const t = useTranslations("discussions");
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const client = useQueryClient();
  const queryKey = ["discussion-counts", userId, courseId ?? "all"];
  const { data } = useQuery({
    queryKey,
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/discussions/counts${courseId ? `?courseId=${encodeURIComponent(courseId)}` : ""}`, { signal, cache: "no-store" });
      if (!response.ok) throw new Error("Diskusi belum tersedia.");
      return (await response.json()) as { total: Count; course: Count | null };
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
  });
  useEffect(() => {
    const refresh = () => { void client.invalidateQueries({ queryKey: ["discussion-counts", userId] }); };
    window.addEventListener(DISCUSSION_COUNTS_CHANGED, refresh);
    return () => window.removeEventListener(DISCUSSION_COUNTS_CHANGED, refresh);
  }, [client, userId]);
  const count = (courseId ? data?.course?.unreadThreads : data?.total.unreadThreads) ?? 0;
  return count > 0 ? <span aria-label={t("unreadQuestions", { count })} className="rounded-md bg-primary px-1.5 py-0.5 text-body-xs font-semibold text-primary-foreground">{count}</span> : null;
}
