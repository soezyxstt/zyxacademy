"use client";

import type { CodingProblemPublic } from "@/lib/coding/contracts";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Radio, Users, AlertTriangle, Play, ChevronRight, CheckCircle2, StopCircle } from "lucide-react";
import { useLiveQuizSocket } from "@/components/live/use-live-quiz-socket";
import { MathText } from "@/components/course/math-text";
import { QuestionSourceCitation } from "@/components/course/question-source-citation";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/lib/i18n/client";

interface Template {
  id: string;
  title: string;
  category: string;
  status: string;
  selectionRules?: Record<string, unknown>;
}

interface SessionData {
  sessionId: string;
  code: string;
  wsUrl: string | null;
  hostToken: string | null;
  questionCount: number;
}

type Phase = "setup" | "session";

export interface TutorLiveConsoleProps {
  courseId: string;
  courseTitle?: string;
}

export function TutorLiveConsole({ courseId, courseTitle }: TutorLiveConsoleProps) {
  const t = useTranslations("tutor.live");
  const [codingProblems, setCodingProblems] = useState<CodingProblemPublic[]>([]);
  const [codingChoice, setCodingChoice] = useState("none");
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/coding/problems?${new URLSearchParams({ courseId })}`, { signal: controller.signal }).then(async (response) => { if (response.ok) setCodingProblems((await response.json()).problems); }).catch(() => {});
    return () => controller.abort();
  }, [courseId]);
  const [phase, setPhase] = useState<Phase>("setup");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [session, setSession] = useState<SessionData | null>(null);
  const [controlling, setControlling] = useState(false);

  const wsUrl =
    session && session.wsUrl && session.hostToken
      ? `${session.wsUrl}?token=${session.hostToken}`
      : null;

  const { state } = useLiveQuizSocket(phase === "session" ? wsUrl : null);

  const loadInitialData = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setLoadError(null);
      try {
        const [templatesRes, sessionsRes] = await Promise.all([
          fetch(`/api/quiz/templates?courseId=${courseId}`, { signal }),
          fetch(`/api/live/sessions?courseId=${courseId}`, { signal }),
        ]);

        if (!templatesRes.ok) {
          throw new Error(t("templateLoadFailed"));
        }
        if (!sessionsRes.ok) {
          throw new Error(t("sessionLoadFailed"));
        }

        const [templatesData, sessionsData] = await Promise.all([
          templatesRes.json(),
          sessionsRes.json(),
        ]);

        if (Array.isArray(templatesData)) {
          const valid = templatesData.filter((t: Template) => {
            if (t.status !== "published") return false;
            if (t.category === "simulation") return false;
            const rules = t.selectionRules;
            if (rules && typeof rules === "object" && (rules as Record<string, unknown>).assessmentType === "tryout") {
              return false;
            }
            return true;
          });
          setTemplates(valid);
        }

        // Recover active lobby or in-progress session if present
        if (Array.isArray(sessionsData) && sessionsData.length > 0) {
          const active = sessionsData.find(
            (s: { id: string; state: string; code: string; wsUrl?: string | null; hostToken?: string | null; questionCount?: number }) =>
              s.state !== "ended" && s.hostToken,
          );

          if (active) {
            setSession({
              sessionId: active.id,
              code: active.code,
              wsUrl: active.wsUrl ?? null,
              hostToken: active.hostToken ?? null,
              questionCount: active.questionCount ?? 0,
            });
            setPhase("session");
          }
        }
      } catch {
        if (signal?.aborted) return;
        setLoadError(t("loadFailed"));
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [courseId, t],
  );

  useEffect(() => {
    const ac = new AbortController();
    loadInitialData(ac.signal);
    return () => ac.abort();
  }, [loadInitialData]);

  const createSession = useCallback(async () => {
    if (!selectedTemplateId && codingChoice === "none") {
      toast.error(t("selectTemplateFirst"));
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/live/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, ...(codingChoice === "none" ? { templateId: selectedTemplateId } : {}), ...(codingChoice !== "none" ? { codingQuestions: [{ problemId: JSON.parse(codingChoice)[0], version: JSON.parse(codingChoice)[1], maxAttempts: null, assistance: "hints", scoring: "best", durationSeconds: 300 }] } : {}) }),
      });
      if (!res.ok) {
        throw new Error(t("createFailed"));
      }
      const data: SessionData = await res.json();
      setSession(data);
      setPhase("session");
      toast.success(t("sessionCreated"));
    } catch {
      toast.error(t("createFailed"));
    } finally {
      setCreating(false);
    }
  }, [courseId, selectedTemplateId, codingChoice, t]);

  const control = useCallback(
    async (action: "start" | "next" | "reveal" | "end") => {
      if (!session) return;
      setControlling(true);
      try {
        const res = await fetch(`/api/live/${session.sessionId}/control`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        if (!res.ok) {
          throw new Error(t("controlFailed"));
        }
      } catch {
        toast.error(t("controlFailed"));
      } finally {
        setControlling(false);
      }
    },
    [session, t],
  );

  if (!process.env.NEXT_PUBLIC_REALTIME_URL) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <AlertTriangle className="mx-auto size-8 text-status-warning" />
        <p className="mt-3 text-body-sm text-muted-foreground">
          {t("notConfigured")}
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
        <p className="mt-2 text-body-sm">{t("loading")}</p>
      </div>
    );
  }

  if (loadError && phase === "setup") {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-status-error/30 bg-card p-8 text-center">
        <AlertTriangle className="mx-auto size-8 text-status-error" />
        <p className="mt-2 text-body-sm font-medium text-foreground">{loadError}</p>
        <Button
          variant="outline"
          onClick={() => loadInitialData()}
          className="mt-4 rounded-lg text-body-sm"
        >
          {t("retry")}
        </Button>
      </div>
    );
  }

  // ── Setup Phase ─────────────────────────────────────────────────────────────
  if (phase === "setup") {
    return (
      <div className="mx-auto max-w-xl space-y-4 rounded-xl border border-border bg-card p-4">
        <div className="border-b border-border pb-4">
          <div className="flex items-center gap-2">
            <Radio className="size-5 text-brand-primary" />
            <h2 className="font-heading text-body-base font-bold text-foreground">
              {t("setupTitle")}
            </h2>
          </div>
          <p className="mt-1 text-body-sm text-muted-foreground">
            {courseTitle ? t("chooseTemplateForCourse", { course: courseTitle }) : t("choosePublishedTemplate")}
          </p>
        </div>

        {templates.length === 0 && codingProblems.length === 0 ? (
          <div className="rounded-lg bg-muted/40 p-4 text-body-sm text-muted-foreground">
            {t("publishQuizFirst")}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-body-sm font-medium text-foreground">{t("template")}</label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger className="rounded-lg text-body-sm">
                  <SelectValue placeholder={t("selectTemplate")} />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id} className="text-body-sm">
                      {t.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {codingProblems.length ? <div className="space-y-1.5">
              <label className="text-body-sm font-semibold">Soal Python</label>
              <Select value={codingChoice} onValueChange={setCodingChoice}>
                <SelectTrigger className="text-body-sm"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">Gunakan soal templat</SelectItem>{codingProblems.map((problem) => <SelectItem key={`${problem.problemId}@${problem.version}`} value={JSON.stringify([problem.problemId, problem.version])}>{problem.title}, versi {problem.version}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-body-xs text-muted-foreground">Python: 5 menit, percobaan berulang, petunjuk Zyra, skor terbaik.</p>
            </div> : null}
            <Button
              onClick={createSession}
              disabled={!selectedTemplateId && codingChoice === "none"}
              isLoading={creating}
              className="w-full rounded-lg text-body-sm font-medium"
            >
              <Play className="mr-2 size-4" />
              {t("startLiveSession")}
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ── Active Session Phase ────────────────────────────────────────────────────
  const {
    sessionState,
    participantCount,
    currentQuestion,
    answerCounts,
    totalAnswered,
    totalParticipants,
    top10,
  } = state;

  return (
    <div className="relative min-h-[60vh] space-y-4 rounded-xl border border-border bg-card p-4">
      {/* Top Status Strip */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <Radio className="size-4 text-brand-primary" />
          <span className="font-heading text-body-base font-bold text-foreground">
            {t("consoleTitle")}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "size-2 rounded-full",
                state.connectionStatus === "connected"
                  ? "bg-status-success"
                  : "animate-pulse bg-status-warning",
              )}
              aria-hidden
            />
            <span className="text-body-xs text-muted-foreground tabular-nums">
              {t("participantsJoined", { count: participantCount })}
            </span>
          </div>
        </div>
      </div>

      {/* ── Lobby ── */}
      {sessionState === "lobby" && session && (
        <div className="flex flex-col items-center justify-center gap-6 py-12">
          <p className="text-body-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {t("joinCode")}
          </p>
          <span className="rounded-xl border border-border bg-muted/30 px-6 py-3 font-heading text-h1 font-bold tracking-widest text-foreground">
            {session.code}
          </span>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="size-4" />
            <span className="tabular-nums text-body-sm font-medium">
              {t("participantsWaiting", { count: participantCount })}
            </span>
          </div>
          <p className="text-body-xs text-muted-foreground">
            {t("questionCount", { count: session.questionCount })}
          </p>
        </div>
      )}

      {/* ── Question Phase ── */}
      {sessionState === "question" && currentQuestion && (
        <div className="mx-auto max-w-2xl space-y-5">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <span className="text-body-sm font-semibold text-muted-foreground tabular-nums">
              {t("questionProgress", { current: currentQuestion.questionIndex + 1, total: currentQuestion.total })}
            </span>
            <span className="text-body-sm text-muted-foreground tabular-nums">
              {t("answeredProgress", { answered: totalAnswered, total: totalParticipants || participantCount })}
            </span>
          </div>

          <MarkdownRenderer content={currentQuestion.prompt} />

          {/* Option Answer Bars */}
          <div className="space-y-3">
            {currentQuestion.options.map((opt, i) => {
              const count = answerCounts[i] ?? 0;
              const total = Math.max(1, totalAnswered || 1);
              const pct = Math.round((count / total) * 100);
              return (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-body-sm text-foreground">
                      <span className="mr-1.5 font-bold">{String.fromCharCode(65 + i)}.</span>
                      <MathText as="span">{opt}</MathText>
                    </span>
                    <span className="shrink-0 text-body-xs text-muted-foreground tabular-nums">
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-md bg-muted">
                    <div
                      className="h-full rounded-md bg-primary transition-[width] duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <QuestionSourceCitation origin={currentQuestion.origin} sourceEventName={currentQuestion.sourceEventName} />
        </div>
      )}

      {/* ── Reveal / Leaderboard ── */}
      {(sessionState === "reveal" || sessionState === "ended") && top10.length > 0 && (
        <div className="mx-auto max-w-lg space-y-3">
          <h3 className="font-heading text-body-base font-bold text-foreground">
            {sessionState === "ended" ? t("finalLeaderboard") : t("liveLeaderboard")}
          </h3>
          <div className="divide-y divide-border rounded-xl border border-border">
            {top10.map((entry) => (
              <div key={entry.userId} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-6 shrink-0 text-center font-heading text-body-sm font-bold tabular-nums text-muted-foreground">
                  {entry.rank}
                </span>
                <span className="flex-1 text-body-sm font-medium text-foreground">{entry.name}</span>
                <span className="tabular-nums text-body-sm font-bold text-primary">{entry.score}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Host Control Buttons ── */}
      {sessionState !== "ended" ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          {sessionState === "lobby" && (
            <Button
              isLoading={controlling}
              onClick={() => control("start")}
              className="rounded-lg text-body-sm font-medium"
            >
              <Play className="mr-1.5 size-4" />
              {t("startQuiz")}
            </Button>
          )}

          {sessionState === "question" && (
            <Button
              variant="outline"
              isLoading={controlling}
              onClick={() => control("reveal")}
              className="rounded-lg text-body-sm font-medium"
            >
              <CheckCircle2 className="mr-1.5 size-4" />
              {t("revealAnswers")}
            </Button>
          )}

          {sessionState === "reveal" && (
            <Button
              variant="outline"
              isLoading={controlling}
              onClick={() => control("next")}
              className="rounded-lg text-body-sm font-medium"
            >
              <ChevronRight className="mr-1.5 size-4" />
              {t("nextQuestion")}
            </Button>
          )}

          <Button
            variant="destructive"
            isLoading={controlling}
            onClick={() => control("end")}
            className="rounded-lg text-body-sm font-medium"
          >
            <StopCircle className="mr-1.5 size-4" />
            {t("endSession")}
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 border-t border-border pt-4">
          <Button
            variant="outline"
            onClick={() => {
              setSession(null);
              setPhase("setup");
              loadInitialData();
            }}
            className="rounded-lg text-body-sm font-medium"
          >
            {t("newSession")}
          </Button>
        </div>
      )}
    </div>
  );
}
