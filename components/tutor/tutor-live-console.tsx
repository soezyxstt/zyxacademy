"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Radio, Users, AlertTriangle, Play, ChevronRight, CheckCircle2, StopCircle } from "lucide-react";
import { useLiveQuizSocket } from "@/components/live/use-live-quiz-socket";
import { MathText } from "@/components/course/math-text";
import { QuestionSourceCitation } from "@/components/course/question-source-citation";
import { cn } from "@/lib/utils";

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
          throw new Error("Gagal memuat templat kuis");
        }
        if (!sessionsRes.ok) {
          throw new Error("Gagal memuat sesi kuis langsung");
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
      } catch (err) {
        if (signal?.aborted) return;
        setLoadError(err instanceof Error ? err.message : "Gagal memuat data");
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [courseId],
  );

  useEffect(() => {
    const ac = new AbortController();
    loadInitialData(ac.signal);
    return () => ac.abort();
  }, [loadInitialData]);

  const createSession = useCallback(async () => {
    if (!selectedTemplateId) {
      toast.error("Pilih templat kuis terlebih dahulu.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/live/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, templateId: selectedTemplateId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Gagal membuat sesi");
      }
      const data: SessionData = await res.json();
      setSession(data);
      setPhase("session");
      toast.success("Sesi langsung berhasil dibuat.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal membuat sesi");
    } finally {
      setCreating(false);
    }
  }, [courseId, selectedTemplateId]);

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
          const err = await res.json();
          throw new Error(err.error ?? "Kontrol gagal");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Kontrol gagal");
      } finally {
        setControlling(false);
      }
    },
    [session],
  );

  if (!process.env.NEXT_PUBLIC_REALTIME_URL) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <AlertTriangle className="mx-auto size-8 text-status-warning" />
        <p className="mt-3 text-body-sm text-muted-foreground">
          Kuis langsung tidak terkonfigurasi pada lingkungan ini.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
        <p className="mt-2 text-body-sm">Memuat konsol kuis langsung...</p>
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
          Coba lagi
        </Button>
      </div>
    );
  }

  // ── Setup Phase ─────────────────────────────────────────────────────────────
  if (phase === "setup") {
    return (
      <div className="mx-auto max-w-xl space-y-6 rounded-xl border border-border bg-card p-6">
        <div className="border-b border-border pb-4">
          <div className="flex items-center gap-2">
            <Radio className="size-5 text-brand-primary" />
            <h2 className="font-heading text-h5 font-bold text-foreground">
              Pengaturan Sesi Langsung
            </h2>
          </div>
          <p className="mt-1 text-body-sm text-muted-foreground">
            {courseTitle
              ? `Pilih templat kuis yang telah diterbitkan untuk ${courseTitle}.`
              : "Pilih templat kuis yang telah diterbitkan untuk memulai sesi."}
          </p>
        </div>

        {templates.length === 0 ? (
          <div className="rounded-lg bg-muted/40 p-4 text-body-sm text-muted-foreground">
            Belum ada templat kuis yang diterbitkan untuk kelas ini. Terbitkan kuis terlebih dahulu pada menu Kuis.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-body-sm font-medium text-foreground">Templat kuis</label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger className="rounded-lg text-body-sm">
                  <SelectValue placeholder="Pilih templat kuis..." />
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

            <Button
              onClick={createSession}
              disabled={!selectedTemplateId}
              isLoading={creating}
              className="w-full rounded-lg text-body-sm font-medium"
            >
              <Play className="mr-2 size-4" />
              Mulai sesi langsung
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
    <div className="relative min-h-[60vh] space-y-6 rounded-xl border border-border bg-card p-6">
      {/* Top Status Strip */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <Radio className="size-4 text-brand-primary" />
          <span className="font-heading text-body-base font-bold text-foreground">
            Konsol Kuis Langsung
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
              {participantCount} peserta bergabung
            </span>
          </div>
        </div>
      </div>

      {/* ── Lobby ── */}
      {sessionState === "lobby" && session && (
        <div className="flex flex-col items-center justify-center gap-6 py-12">
          <p className="text-body-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Kode Bergabung
          </p>
          <span className="rounded-xl border border-border bg-muted/30 px-6 py-3 font-heading text-h1 font-bold tracking-widest text-foreground">
            {session.code}
          </span>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="size-4" />
            <span className="tabular-nums text-body-sm font-medium">
              {participantCount} peserta di ruang tunggu
            </span>
          </div>
          <p className="text-body-xs text-muted-foreground">
            Total {session.questionCount} soal disiapkan
          </p>
        </div>
      )}

      {/* ── Question Phase ── */}
      {sessionState === "question" && currentQuestion && (
        <div className="mx-auto max-w-2xl space-y-5">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <span className="text-body-sm font-semibold text-muted-foreground tabular-nums">
              Soal {currentQuestion.questionIndex + 1} / {currentQuestion.total}
            </span>
            <span className="text-body-sm text-muted-foreground tabular-nums">
              {totalAnswered} / {totalParticipants || participantCount} menjawab
            </span>
          </div>

          <MathText className="font-sans text-body-base font-semibold text-foreground block" as="div">
            {currentQuestion.prompt}
          </MathText>

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
            {sessionState === "ended" ? "Papan Skor Akhir" : "Papan Skor Sementara"}
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
              Mulai kuis
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
              Tampilkan jawaban
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
              Soal berikutnya
            </Button>
          )}

          <Button
            variant="destructive"
            isLoading={controlling}
            onClick={() => control("end")}
            className="rounded-lg text-body-sm font-medium"
          >
            <StopCircle className="mr-1.5 size-4" />
            Akhiri sesi
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
            Buat sesi baru
          </Button>
        </div>
      )}
    </div>
  );
}
