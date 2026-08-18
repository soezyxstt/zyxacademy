"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Radio, Users, AlertTriangle } from "lucide-react";
import { useLiveQuizSocket } from "@/components/live/use-live-quiz-socket";
import { MathText } from "@/components/course/math-text";
import { QuestionSourceCitation } from "@/components/course/question-source-citation";
import { cn } from "@/lib/utils";

interface Template {
  id: string;
  title: string;
}

interface SessionData {
  sessionId: string;
  code: string;
  wsUrl: string | null;
  hostToken: string | null;
  questionCount: number;
}

type Phase = "setup" | "session";

export default function LiveHostPage() {
  const { id: courseId } = useParams<{ id: string }>();

  const [phase, setPhase] = useState<Phase>("setup");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [creating, setCreating] = useState(false);
  const [session, setSession] = useState<SessionData | null>(null);
  const [controlling, setControlling] = useState(false);

  const wsUrl = session && session.wsUrl && session.hostToken
    ? `${session.wsUrl}?token=${session.hostToken}`
    : null;

  const { state } = useLiveQuizSocket(phase === "session" ? wsUrl : null);

  // Load quiz templates for this course
  useEffect(() => {
    const ac = new AbortController();
    fetch(`/api/live/sessions?courseId=${courseId}`, { signal: ac.signal })
      .then((r) => r.json())
      .catch(() => null)
      .finally(() => setLoadingTemplates(false));

    // Also load templates list
    fetch(`/api/quiz/templates?courseId=${courseId}`, { signal: ac.signal })
      .then(async (r) => {
        if (!r.ok) return;
        const data = await r.json();
        const list: Template[] = Array.isArray(data)
          ? data.map((t: { id: string; title: string }) => ({ id: t.id, title: t.title }))
          : [];
        setTemplates(list);
      })
      .catch(() => null);

    return () => ac.abort();
  }, [courseId]);

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
    [session]
  );

  if (!process.env.NEXT_PUBLIC_REALTIME_URL) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <AlertTriangle className="mx-auto mb-3 size-8 text-status-warning" />
        <p className="text-body-sm text-muted-foreground">
          Kuis langsung tidak terkonfigurasi. Atur NEXT_PUBLIC_REALTIME_URL dan FEATURE_LIVE=1.
        </p>
      </div>
    );
  }

  // ── Setup phase ─────────────────────────────────────────────────────────────
  if (phase === "setup") {
    return (
      <div className="mx-auto max-w-lg space-y-6 px-4 py-12">
        <div className="border-b border-border pb-4">
          <div className="flex items-center gap-2">
            <Radio className="size-4 text-brand-primary" />
            <h1 className="font-heading text-h5 font-semibold text-foreground">
              Kuis Langsung
            </h1>
          </div>
          <p className="mt-1 text-body-sm text-muted-foreground">
            Pilih templat kuis untuk memulai sesi langsung untuk kelas ini.
          </p>
        </div>

        {loadingTemplates ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span className="text-body-sm">Memuat templat...</span>
          </div>
        ) : templates.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">
            Tidak ada templat kuis yang diterbitkan untuk kelas ini.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-body-sm font-medium text-foreground">Templat kuis</label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger className="rounded-md">
                  <SelectValue placeholder="Pilih templat..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
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
              className="rounded-lg"
            >
              Mulai sesi
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ── Active session ───────────────────────────────────────────────────────────
  const { sessionState, participantCount, currentQuestion, answerCounts, totalAnswered, totalParticipants, top10 } = state;

  return (
    <div className="relative min-h-[70vh] space-y-8 px-4 py-10">
      {/* Connection dot */}
      <div className="absolute right-4 top-4 flex items-center gap-1.5">
        <span
          className={cn(
            "size-2 rounded-full",
            state.connectionStatus === "connected"
              ? "bg-status-success"
              : "animate-pulse bg-status-warning"
          )}
          aria-hidden
        />
        <span className="text-body-xs text-muted-foreground tabular-nums">
          {participantCount} bergabung
        </span>
      </div>

      {/* ── Lobby ── */}
      {sessionState === "lobby" && session && (
        <div className="flex flex-col items-center justify-center gap-6 pt-8">
          <p className="text-body-sm font-medium uppercase tracking-widest text-muted-foreground">
            Kode gabung
          </p>
          <span className="font-heading text-h1 font-bold tracking-widest text-foreground">
            {session.code}
          </span>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="size-4" />
            <span className="tabular-nums text-body-base font-medium">{participantCount} peserta</span>
          </div>
          <p className="text-body-sm text-muted-foreground">
            {session.questionCount} soal
          </p>
        </div>
      )}

      {/* ── Question phase ── */}
      {sessionState === "question" && currentQuestion && (
        <div className="mx-auto max-w-2xl space-y-5">
          <div className="flex items-center justify-between">
            <span className="text-body-sm font-medium text-muted-foreground tabular-nums">
              Q {currentQuestion.questionIndex + 1} / {currentQuestion.total}
            </span>
            <span className="text-body-sm text-muted-foreground tabular-nums">
              {totalAnswered} / {totalParticipants || participantCount} menjawab
            </span>
          </div>

          <MathText className="font-sans text-body-base font-semibold text-foreground block" as="div">
            {currentQuestion.prompt}
          </MathText>

          {/* Per-option count bars */}
          <div className="space-y-2.5">
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
                    <span className="shrink-0 text-body-xs text-muted-foreground tabular-nums">{count}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-md bg-muted">
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
          <h2 className="font-heading text-body-base font-semibold text-foreground">
            {sessionState === "ended" ? "Papan skor akhir" : "Papan Skor"}
          </h2>
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

      {/* ── Controls ── */}
      {sessionState !== "ended" && (
        <div className="flex gap-2 pt-4">
          {sessionState === "lobby" && (
            <Button isLoading={controlling} onClick={() => control("start")} className="rounded-lg">
              Mulai
            </Button>
          )}
          {sessionState === "reveal" && (
            <Button variant="outline" isLoading={controlling} onClick={() => control("next")} className="rounded-lg">
              Berikutnya
            </Button>
          )}
          {sessionState === "question" && (
            <Button variant="outline" isLoading={controlling} onClick={() => control("reveal")} className="rounded-lg">
              Tampilkan
            </Button>
          )}
          <Button
            variant="destructive"
            isLoading={controlling}
            onClick={() => control("end")}
            className="rounded-lg"
          >
            Akhiri
          </Button>
        </div>
      )}
    </div>
  );
}
