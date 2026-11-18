"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PublicArticleReadModel, PublicSectionReadModel } from "@/lib/articles/structured-read-model";
import { articleProgressQuery } from "@/lib/articles/progress-query";
import { articleProgressMutation } from "@/lib/articles/progress-mutation";
import {
  createArticleCompletions,
  createArticleVisit,
  type ArticleCompletionIntent,
  type ArticleProgressUpdate,
} from "@/lib/articles/progress-contract";
import { isQueryAccountCurrent } from "@/lib/query/client";
import { useQueryAccountCurrent } from "@/hooks/use-query-account";

type Props = {
  article: PublicArticleReadModel;
  studentId?: string;
  courseId?: string;
  activeSection: PublicSectionReadModel | null;
  enabled: boolean;
};

export function useArticleReadingProgress({ article, studentId, courseId, activeSection, enabled }: Props) {
  const client = useQueryClient();
  const currentAccount = useQueryAccountCurrent(studentId ?? "");
  const canSave = enabled && Boolean(studentId) && currentAccount;
  const activeSectionId = activeSection?.id;
  const options = articleProgressQuery(studentId ?? "", article.id, article.version);
  const query = useQuery({
    ...options,
    enabled: canSave,
    initialData: canSave ? {
      articleId: article.id,
      articleVersion: article.version,
      sectionProgress: article.progress?.sectionProgress ?? {},
    } : undefined,
  });
  const initialProgress = article.progress?.sectionProgress;
  const confirmedProgress = useMemo(
    () => canSave ? query.data?.sectionProgress ?? initialProgress ?? {} : initialProgress ?? {},
    [canSave, query.data?.sectionProgress, initialProgress],
  );
  const [pendingCompletions, setPendingCompletions] = useState<ReadonlySet<string>>(new Set());
  const completionsRef = useRef(createArticleCompletions(initialProgress ?? {}));
  const contentContainerRef = useRef<HTMLDivElement | null>(null);
  const visitRef = useRef<ReturnType<typeof createArticleVisit> | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    completionsRef.current.confirm(confirmedProgress);
  }, [confirmedProgress]);

  const { mutateAsync } = useMutation(articleProgressMutation(client, studentId ?? "", article.id, article.version, courseId));

  const save = useCallback(async (update: ArticleProgressUpdate) => {
    if (!canSave || !studentId || !isQueryAccountCurrent(client, studentId)) return;
    let accepted = false;
    try {
      await mutateAsync(update);
      accepted = true;
    } catch {
      // Time is additive and an interrupted response may have committed. Do not
      // replay its elapsed delta or retry completion without an explicit action.
    } finally {
      if (update.completed) {
        completionsRef.current.settle(update.sectionId, accepted);
        if (mountedRef.current) {
          setPendingCompletions((current) => {
            const next = new Set(current);
            next.delete(update.sectionId);
            return next;
          });
        }
      }
    }
  }, [canSave, client, mutateAsync, studentId]);

  const completeSection = useCallback((sectionId: string, intent: ArticleCompletionIntent) => {
    if (!canSave || !studentId || !isQueryAccountCurrent(client, studentId)) return;
    const update = completionsRef.current.request(sectionId, intent, visitRef.current);
    if (!update) return;
    setPendingCompletions((current) => new Set(current).add(sectionId));
    void save(update);
  }, [canSave, client, save, studentId]);

  useEffect(() => {
    if (!canSave || !activeSectionId) return;
    const visit = createArticleVisit(activeSectionId);
    visitRef.current = visit;
    const interval = window.setInterval(() => visit.tick(), 1000);
    const flush = () => {
      const update = completionsRef.current.flush(visit);
      if (update) void save(update);
    };
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
      if (visitRef.current === visit) visitRef.current = null;
    };
  }, [activeSectionId, canSave, save]);

  useEffect(() => {
    if (!canSave) return;
    const handleScroll = () => {
      if (!contentContainerRef.current) return;
      const windowHeight = window.innerHeight;
      for (const section of article.sections) {
        const element = document.getElementById(`section-${section.slug}`);
        if (!element) continue;
        const rect = element.getBoundingClientRect();
        if (rect.height <= 0) continue;
        const percent = Math.min(100, Math.max(0, Math.round(((windowHeight - rect.top) / rect.height) * 100)));
        if (visitRef.current?.sectionId === section.id) visitRef.current.observe(percent);
        const isReadThrough = percent >= 85 || (rect.bottom <= windowHeight * 0.85 && rect.top < windowHeight * 0.4);
        if (isReadThrough) completeSection(section.id, "scroll");
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [activeSectionId, article.sections, canSave, completeSection]);

  const sectionProgressMap = useMemo(() => {
    if (!pendingCompletions.size) return confirmedProgress;
    const progress = { ...confirmedProgress };
    for (const id of pendingCompletions) {
      progress[id] = { ...progress[id], maxReadPercent: 100, completed: true, timeSpentSeconds: progress[id]?.timeSpentSeconds ?? 0 };
    }
    return progress;
  }, [confirmedProgress, pendingCompletions]);

  const completeRemaining = useCallback(() => {
    if (!canSave) return;
    for (const section of article.sections) completeSection(section.id, "explicit");
  }, [article.sections, canSave, completeSection]);

  return { sectionProgressMap, contentContainerRef, completeRemaining };
}
