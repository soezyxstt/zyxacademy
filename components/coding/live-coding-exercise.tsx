"use client";
import { useEffect, useState } from "react";
import { CodingWorkspace } from "./coding-workspace";
import { codingProblemPublicSchema, type CodingProblemPublic } from "@/lib/coding/contracts";
import type { z } from "zod";
import type { liveCodingConfigSchema } from "@/lib/coding/live-server";
export function LiveCodingExercise({ courseId, sessionId, questionIndex, coding, closed }: { courseId: string; sessionId: string; questionIndex: number; coding: z.infer<typeof liveCodingConfigSchema>; closed: boolean }) {
  const [problem, setProblem] = useState<CodingProblemPublic | null>(null), [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    void fetch(`/api/coding/problems/${encodeURIComponent(coding.problemId)}?${new URLSearchParams({ courseId, version: String(coding.version) })}`, { signal: abort.signal }).then(async (response) => {
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Masalah coding belum tersedia.");
      setProblem(codingProblemPublicSchema.parse(body.problem));
    }).catch((error) => { if (!abort.signal.aborted) setError(error instanceof Error ? error.message : "Masalah coding belum tersedia."); });
    return () => abort.abort();
  }, [courseId, coding.problemId, coding.version]);
  if (error) return <p role="alert" className="text-body-sm text-destructive">{error}</p>;
  if (!problem) return <p role="status" className="text-body-sm text-muted-foreground">Memuat soal Python...</p>;
  return <CodingWorkspace courseId={courseId} draftKey={`live:${sessionId}:${questionIndex}`} problem={problem} surface={{ kind: "live_quiz", sessionId, questionIndex }} allowHelp={!closed && coding.assistance !== "disabled"} disabled={closed} />;
}
