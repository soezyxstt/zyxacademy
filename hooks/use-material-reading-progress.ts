"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/toast";
import { useStudentExperience } from "@/components/student-experience-provider";
import { useTranslations } from "@/lib/i18n/client";
import { emitActivityUpdated } from "@/lib/activity-signal";
import { saveMaterialReadingProgress } from "@/lib/materials/client-api";
import { setMaterialStatus } from "@/lib/materials/status-api";
import { createMaterialProgressTracker, materialReadingPosition, type MaterialProgressInput } from "@/lib/materials/client-contracts";
import { queryKeys } from "@/lib/query/keys";
import { isQueryAccountCurrent } from "@/lib/query/client";
import { invalidateLearningQueries } from "@/lib/query/invalidation";
import { ApiError } from "@/lib/query/http";
import { useQueryAccountCurrent } from "@/hooks/use-query-account";
import type { CourseMaterial } from "@/lib/student-course-fixtures";

type Props = {
  material: CourseMaterial;
  studentId?: string;
  learnerMode: boolean;
  sectionCount: number;
  sectionIndex: number;
  sectionTitle?: string;
  page: number;
};

export function useMaterialReadingProgress({ material, studentId, learnerMode, sectionCount, sectionIndex, sectionTitle, page }: Props) {
  const client = useQueryClient();
  const t = useTranslations("learning");
  const experience = useStudentExperience();
  const demo = experience.mode === "demo";
  const currentAccount = useQueryAccountCurrent(studentId ?? "");
  const enabled = learnerMode && !demo && Boolean(studentId) && currentAccount;
  const [done, setDone] = useState(material.completed);
  const mountedRef = useRef(false);
  const startedRef = useRef(false);
  const completingRef = useRef(false);
  const trackerRef = useRef(createMaterialProgressTracker());
  const assertAccount = useCallback(() => {
    if (!studentId || !isQueryAccountCurrent(client, studentId)) throw new ApiError(409, "Account changed");
    return studentId;
  }, [client, studentId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const status = useMutation({
    mutationKey: [...queryKeys.materials.progress(studentId ?? "", material.id), "status"],
    scope: { id: JSON.stringify(queryKeys.materials.progress(studentId ?? "", material.id)) },
    mutationFn: (value: "in_progress" | "completed") => setMaterialStatus(assertAccount(), material.id, value),
    retry: false,
    networkMode: "always",
    onSuccess: (_, value) => {
      if (!studentId || !isQueryAccountCurrent(client, studentId) || value !== "completed") return;
      if (mountedRef.current) setDone(true);
      void invalidateLearningQueries(client, studentId, { courseId: material.courseId });
      emitActivityUpdated({ type: "material", courseId: material.courseId, materialId: material.id, queryCacheUpdated: true });
    },
  });
  const { mutate: updateStatus } = status;
  useEffect(() => {
    if (!enabled || startedRef.current) return;
    startedRef.current = true;
    updateStatus("in_progress");
  }, [enabled, updateStatus]);

  const progress = useMutation({
    mutationKey: [...queryKeys.materials.progress(studentId ?? "", material.id), "reading"],
    scope: { id: JSON.stringify(queryKeys.materials.progress(studentId ?? "", material.id)) },
    mutationFn: (input: MaterialProgressInput) => saveMaterialReadingProgress(assertAccount(), input),
    retry: false,
    networkMode: "always",
    onError: () => { trackerRef.current.invalidatePosition(); },
    onSuccess: (result) => {
      if (!studentId || !isQueryAccountCurrent(client, studentId) || result.completionPercent < 90) return;
      if (mountedRef.current) setDone(true);
      void invalidateLearningQueries(client, studentId, { courseId: material.courseId });
      emitActivityUpdated({ type: "material", courseId: material.courseId, materialId: material.id, queryCacheUpdated: true });
    },
  });
  const position = useMemo(() => materialReadingPosition({ kind: material.kind, done, sectionCount, sectionIndex, sectionTitle, page }), [material.kind, done, sectionCount, sectionIndex, sectionTitle, page]);
  const { mutate: updateProgress } = progress;
  useEffect(() => {
    // The progress table belongs only to legacy website materials. Canonical
    // Article/Diktat and PDFs use their existing authorized status action.
    if (!enabled || material.source !== "website_material") return;
    const tracker = trackerRef.current;
    const save = (force: boolean) => {
      if (!studentId || !isQueryAccountCurrent(client, studentId)) return;
      const input = tracker.take(material.id, position, force);
      if (input) updateProgress(input);
    };
    const timer = window.setInterval(() => tracker.tick(), 1000);
    const periodic = window.setInterval(() => save(false), 20_000);
    const flush = () => save(true);
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(periodic);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, [client, enabled, material.id, material.source, position, studentId, updateProgress]);

  const markDone = async () => {
    if (!learnerMode || done || completingRef.current) return;
    if (demo) {
      if (!experience.ready) return;
      experience.record?.("article", material.id);
      setDone(true);
      toast.success(t("reader.markedComplete"));
      return;
    }
    if (!enabled) return;
    completingRef.current = true;
    try {
      await status.mutateAsync("completed");
      if (mountedRef.current && studentId && isQueryAccountCurrent(client, studentId)) toast.success(t("reader.markedComplete"));
    } catch {
      if (mountedRef.current && studentId && isQueryAccountCurrent(client, studentId)) toast.error(t("reader.saveProgressFailed"));
    } finally {
      completingRef.current = false;
    }
  };

  return { done, markDone, markingDone: status.isPending && status.variables === "completed" };
}
