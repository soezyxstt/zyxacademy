"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PublicArticleReadModel, PublicSectionReadModel } from "@/lib/articles/structured-read-model";
import { articleProgressQuery } from "@/lib/articles/progress-query";
import { articleProgressMutation } from "@/lib/articles/progress-mutation";
import {
  createArticleVisit,
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
  const claimedCompletions = useRef(new Set(Object.entries(initialProgress ?? {})
    .filter(([, progress]) => progress.completed || progress.maxReadPercent >= 90).map(([id]) => id)));
  const contentContainerRef = useRef<HTMLDivElement | null>(null);
  const visitRef = useRef<ReturnType<typeof createArticleVisit> | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    for (const [id, progress] of Object.entries(confirmedProgress)) {
      if (progress.completed || progress.maxReadPercent >= 90) claimedCompletions.current.add(id);
    }
  }, [confirmedProgress]);

  const { mutateAsync } = useMutation(articleProgressMutation(client, studentId ?? "", article.id, article.version, courseId));

  const save = useCallback(async (update: ArticleProgressUpdate) => {
    if (!canSave || !studentId || !isQueryAccountCurrent(client, studentId)) return;
    try {
      await mutateAsync(update);
    } catch {
      // Time is additive and an interrupted response may have committed. Do not
      // retry its elapsed delta. A later scroll can retry completion with 0 time.
      if (update.completed) claimedCompletions.current.delete(update.sectionId);
    } finally {
      if (update.completed && mountedRef.current) {
        setPendingCompletions((current) => {
          const next = new Set(current);
          next.delete(update.sectionId);
          return next;
        });
      }
    }
  }, [canSave, client, mutateAsync, studentId]);

  const completeSection = useCallback((sectionId: string) => {
    if (!canSave || !studentId || !isQueryAccountCurrent(client, studentId) || claimedCompletions.current.has(sectionId)) return;
    claimedCompletions.current.add(sectionId);
    setPendingCompletions((current) => new Set(current).add(sectionId));
    const visit = visitRef.current;
    const elapsed = visit?.sectionId === sectionId ? visit.takeTime() : 5;
    if (visit?.sectionId === sectionId) visit.observe(100);
    void save({ sectionId, percent: 100, timeSpentSeconds: elapsed, completed: true });
  }, [canSave, client, save, studentId]);

  useEffect(() => {
    if (!canSave || !activeSectionId) return;
    const visit = createArticleVisit(activeSectionId);
    visitRef.current = visit;
    const interval = window.setInterval(() => visit.tick(), 1000);
    const flush = () => {
      if (visit.elapsedSeconds <= 2) return;
      void save({ sectionId: visit.sectionId, percent: visit.maxReadPercent, timeSpentSeconds: visit.takeTime() });
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
        if (isReadThrough) completeSection(section.id);
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
    for (const section of article.sections) completeSection(section.id);
  }, [article.sections, canSave, completeSection]);

  return { sectionProgressMap, contentContainerRef, completeRemaining };
}
