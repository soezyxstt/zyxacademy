"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, AlertTriangle, Play } from "lucide-react";
import { useLiveQuizSocket } from "@/components/live/use-live-quiz-socket";
import { quizOptionClasses, quizOptionLetterClasses } from "@/components/course/quiz-option-styles";
import type { QuizOptionState } from "@/components/course/quiz-option-styles";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { MathText } from "@/components/course/math-text";
import { QuestionSourceCitation } from "@/components/course/question-source-citation";
// Fixture import removed
import { getCourseAction } from "@/app/(student)/dashboard/actions";
import { cn } from "@/lib/utils";

interface JoinResponse {
  sessionId: string;
  token: string;
  wsUrl: string;
  sessionState: string;
}

type ViewPhase = "join" | "live";

export default function LiveStudentPage() {
  const { id: courseId } = useParams<{ id: string }>();
  const [course, setCourse] = useState<any>(undefined);

  useEffect(() => {
    getCourseAction(courseId).then(setCourse).catch(console.error);
  }, [courseId]);

  const title = course ? `Kuis Langsung: ${course.title}` : "Kuis Langsung";

  const [phase, setPhase] = useState<ViewPhase>("join");
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [wsFullUrl, setWsFullUrl] = useState<string | null>(null);

  // Student join tokens expire after 60s; re-mint a fresh signed URL on every
  // reconnect instead of replaying the expired one.
  const refreshConnectionUrl = useCallback(async () => {
    try {
      const res = await fetch("/api/live/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim().toUpperCase(), courseId }),
      });
      if (!res.ok) return null;
      const data: JoinResponse = await res.json();
      return `${data.wsUrl}?token=${data.token}`;
    } catch {
      throw new Error("Gagal memperbarui koneksi.");
    }
  }, [code, courseId]);

  const { state, sendAnswer } = useLiveQuizSocket(
    phase === "live" ? wsFullUrl : null,
    refreshConnectionUrl
  );

  const handleJoin = useCallback(async () => {
    const trimmedCode = code.trim().toUpperCase();
    if (trimmedCode.length !== 6) {
      toast.error("Kode harus terdiri dari 6 karakter.");
      return;
    }
    setJoining(true);
    try {
      const res = await fetch("/api/live/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmedCode, courseId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Gagal bergabung");
      }
      const data: JoinResponse = await res.json();
      const wsEndpoint = `${data.wsUrl}?token=${data.token}`;
      setWsFullUrl(wsEndpoint);
      setPhase("live");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal bergabung ke sesi");
    } finally {
      setJoining(false);
    }
  }, [code, courseId]);

  if (!process.env.NEXT_PUBLIC_REALTIME_URL) {
    return (
      <CoursePageShell title={title} icon={Play}>
        <div className="mx-auto max-w-md px-4 py-12 text-center rounded-xl border border-dashed border-border bg-card/50">
          <Play className="mx-auto mb-3 size-10 text-muted-foreground/40" />
          <h3 className="font-heading text-body-base font-bold text-foreground">
            Belum ada sesi kuis langsung
          </h3>
          <p className="mt-1 text-body-xs text-muted-foreground leading-relaxed">
            Kuis interaktif langsung diadakan pada waktu tertentu bersama tutor. Pantau jadwal kelas untuk sesi mendatang.
          </p>
          <Button asChild size="sm" variant="outline" className="mt-5 rounded-md text-body-xs">
            <Link href={`/courses/${courseId}`}>
              Kembali ke Ringkasan
            </Link>
          </Button>
        </div>
      </CoursePageShell>
    );
  }

  if (phase === "join") {
    return (
      <CoursePageShell title={title} icon={Play}>
        <div className="mx-auto flex max-w-xs flex-col items-center gap-6 px-4 py-20">
          <h1 className="font-heading text-h5 font-semibold text-foreground">Gabung kuis langsung</h1>
          <Input
            className="rounded-lg text-center font-sans text-body-sm tracking-widest uppercase"
            placeholder="ABC123"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            autoFocus
          />
          <Button
            onClick={handleJoin}
            disabled={code.trim().length === 0}
            isLoading={joining}
            className="w-full rounded-lg"
          >
            Gabung
          </Button>
        </div>
      </CoursePageShell>
    );
  }

  return (
    <CoursePageShell title={title} icon={Play}>
      <LiveView
        state={state}
        sendAnswer={sendAnswer}
      />
    </CoursePageShell>
  );
}

// ── Live view (after joining) ────────────────────────────────────────────────

interface LiveViewProps {
  state: ReturnType<typeof useLiveQuizSocket>["state"];
  sendAnswer: (qi: number, choice: number) => void;
}

function LiveView({ state, sendAnswer }: LiveViewProps) {
  const {
    connectionStatus,
    sessionState,
    participantCount,
    currentQuestion,
    myAnswer,
    countdown,
    revealCorrectIndex,
    top10,
    yourRank,
    yourScore,
    finalBoard,
  } = state;

  const handleAnswer = useCallback(
    (choice: number) => {
      if (myAnswer !== null || !currentQuestion) return;
      sendAnswer(currentQuestion.questionIndex, choice);
    },
    [myAnswer, currentQuestion, sendAnswer]
  );

  return (
    <div className="relative min-h-[70vh] space-y-6 px-4 py-8">
      {/* Connection dot */}
      <div className="absolute right-4 top-4">
        <span
          className={cn(
            "size-2 rounded-full",
            connectionStatus === "connected"
              ? "bg-status-success"
              : "animate-pulse bg-status-warning"
          )}
          aria-hidden
        />
      </div>

      {/* Lobby wait */}
      {sessionState === "lobby" && (
        <div className="flex flex-col items-center gap-3 pt-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
          <p className="text-body-base font-medium text-foreground">Menunggu penyelenggara memulai...</p>
          <p className="text-body-sm text-muted-foreground tabular-nums">
            {participantCount} bergabung
          </p>
        </div>
      )}

      {/* Question */}
      {(sessionState === "question" || sessionState === "reveal") && currentQuestion && (
        <div className="mx-auto max-w-xl space-y-5">
          {/* Countdown */}
          <div className="flex items-center justify-between">
            <span className="text-body-sm text-muted-foreground tabular-nums">
              Q {currentQuestion.questionIndex + 1} / {currentQuestion.total}
            </span>
            {sessionState === "question" && (
              <span
                className={cn(
                  "font-heading text-h5 font-semibold tabular-nums transition-colors duration-300",
                  countdown <= 5 ? "text-status-error" : "text-foreground"
                )}
              >
                {countdown}
              </span>
            )}
          </div>

          <MathText className="font-sans text-body-base font-semibold text-foreground block" as="div">
            {currentQuestion.prompt}
          </MathText>

          <ul className="space-y-2">
            {currentQuestion.options.map((opt, i) => {
              let optState: QuizOptionState = "idle";
              if (sessionState === "reveal") {
                if (i === revealCorrectIndex) optState = "correct";
                else if (i === myAnswer) optState = "wrong";
              } else if (myAnswer === i) {
                optState = "selected";
              }

              const locked = myAnswer !== null || sessionState === "reveal";

              return (
                <li key={i}>
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => handleAnswer(i)}
                    className={cn(
                      quizOptionClasses(optState),
                      locked && "opacity-60 pointer-events-none"
                    )}
                  >
                    <span className={quizOptionLetterClasses(optState)}>
                      {String.fromCharCode(65 + i)}
                    </span>
                    <MathText className="flex-1 text-left leading-normal" as="span">{opt}</MathText>
                  </button>
                </li>
              );
            })}
          </ul>
          <QuestionSourceCitation origin={currentQuestion.origin} sourceEventName={currentQuestion.sourceEventName} />

          {myAnswer !== null && sessionState === "question" && (
            <p className="text-body-sm text-muted-foreground">
              Jawaban dikunci. Menunggu hasil.
            </p>
          )}
        </div>
      )}

      {/* Between-question leaderboard (after reveal) */}
      {sessionState === "reveal" && top10.length > 0 && (
        <Leaderboard
          top10={top10}
          yourRank={yourRank}
          yourScore={yourScore}
          title="Papan Skor"
        />
      )}

      {/* Final */}
      {sessionState === "ended" && (
        <div className="mx-auto max-w-lg space-y-6">
          <div className="text-center">
            <p className="font-heading text-body-base font-bold text-foreground">Sesi berakhir</p>
            <p className="mt-1 text-body-sm text-muted-foreground">
              Skor Anda: <span className="font-bold tabular-nums text-primary">{yourScore}</span>
              {yourRank ? ` · Peringkat ${yourRank}` : ""}
            </p>
          </div>
          <Leaderboard
            top10={finalBoard.slice(0, 10)}
            yourRank={yourRank}
            yourScore={yourScore}
            title="Papan skor akhir"
          />
        </div>
      )}
    </div>
  );
}

// ── Leaderboard component ────────────────────────────────────────────────────

interface LeaderboardProps {
  top10: Array<{ userId: string; name: string; score: number; rank: number }>;
  yourRank: number | null;
  yourScore: number;
  title: string;
}

function Leaderboard({ top10, yourRank, yourScore, title }: LeaderboardProps) {
  const prevRef = useRef<typeof top10>([]);

  useEffect(() => {
    prevRef.current = top10;
  }, [top10]);

  return (
    <div className="mx-auto max-w-lg space-y-2">
      <h2 className="font-heading text-body-base font-semibold text-foreground">{title}</h2>
      {yourRank && !top10.find((e) => e.rank === yourRank) && (
        <div className="mb-1 flex items-center gap-3 rounded-lg border-l-2 border-primary bg-primary/5 px-4 py-2">
          <span className="w-6 shrink-0 text-center text-body-sm font-bold tabular-nums text-primary">
            {yourRank}
          </span>
          <span className="flex-1 text-body-sm font-medium text-foreground">Anda</span>
          <span className="tabular-nums text-body-sm font-bold text-primary">{yourScore}</span>
        </div>
      )}
      <div className="divide-y divide-border rounded-xl border border-border">
        {top10.map((entry) => {
          const isMe = entry.rank === yourRank;
          return (
            <div
              key={entry.userId}
              className={cn(
                "flex items-center gap-3 px-4 py-2.5 transition-transform duration-300",
                isMe && "border-l-2 border-primary bg-primary/5"
              )}
            >
              <span className="w-6 shrink-0 text-center font-heading text-body-sm font-bold tabular-nums text-muted-foreground">
                {entry.rank}
              </span>
              <span className="flex-1 text-body-sm font-medium text-foreground">{entry.name}</span>
              <span className="tabular-nums text-body-sm font-bold text-primary">{entry.score}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
