"use client";

import { useState } from "react";
import { Brain, Check, X, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MathText } from "@/components/course/math-text";
import { submitReviewAction } from "./actions";
import { toast } from "@/components/ui/toast";

interface Flashcard {
  id: string;
  setId: string;
  koId: string | null;
  front: string;
  back: string;
  explanation: string | null;
  status: string;
  metadata: any;
  createdAt: Date;
}

interface QueueItem {
  card: Flashcard;
  progress: any;
  dueStatus: "new" | "review";
  nextReviewDue: Date;
}

type FlashcardClientProps = {
  courseId: string;
  initialQueue: QueueItem[];
  studentId: string;
};

export function FlashcardClient({ courseId, initialQueue, studentId }: FlashcardClientProps) {
  const [queue, setQueue] = useState<QueueItem[]>(initialQueue);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [mode, setMode] = useState<"standard" | "exam">("standard");
  const [typedAnswer, setTypedAnswer] = useState("");
  const [isChecked, setIsChecked] = useState(false);
  const [passedExam, setPassedExam] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);

  const currentItem = queue[currentIndex];

  const handleFlip = () => {
    if (mode === "exam" && !isChecked) {
      toast.warning("Silakan periksa jawaban Anda terlebih dahulu sebelum membalik kartu.");
      return;
    }
    setIsFlipped(!isFlipped);
  };

  const handleCheckAnswer = () => {
    if (!typedAnswer.trim()) {
      toast.error("Silakan masukkan jawaban Anda terlebih dahulu.");
      return;
    }

    if (!currentItem) return;

    // Normalization & verification client-side
    const normalize = (text: string) =>
      text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const normUser = normalize(typedAnswer);
    const normCorrect = normalize(currentItem.card.back);

    const isCorrect = normCorrect.includes(normUser) || normUser.includes(normCorrect);
    setPassedExam(isCorrect);
    setIsChecked(true);
    setIsFlipped(true); // Flip automatically to show answer/explanation
  };

  const handleGrade = async (grade: number) => {
    if (!currentItem) return;

    setLoading(true);
    try {
      // Call server action wrapper
      await submitReviewAction(
        studentId,
        currentItem.card.id,
        grade,
        mode === "exam" ? typedAnswer : undefined,
        mode === "exam",
        courseId
      );

      toast.success("Penilaian berhasil disimpan!");
      setCompletedCount((prev) => prev + 1);

      // If user selected "Again / Ulangi" (grade 1), put the card back at the end of the queue for retry
      if (grade === 1) {
        setQueue((prevQueue) => [
          ...prevQueue,
          {
            ...currentItem,
            dueStatus: "review", // now it is a review card in this session
            nextReviewDue: new Date(),
          },
        ]);
        toast.info("Kartu dimasukkan kembali ke akhir antrean untuk diulangi.");
      }

      // Reset state for next card
      setIsFlipped(false);
      setTypedAnswer("");
      setIsChecked(false);
      setPassedExam(null);

      // Go to next card
      setCurrentIndex((prev) => prev + 1);
    } catch (error) {
      console.error(error);
      toast.error("Gagal menyimpan penilaian. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  // Helper styles for 3D card
  const cardStyle: React.CSSProperties = {
    perspective: "1000px",
  };

  const innerStyle = (flipped: boolean): React.CSSProperties => ({
    transformStyle: "preserve-3d",
    transition: "transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
    transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
  });

  const faceStyle: React.CSSProperties = {
    backfaceVisibility: "hidden",
    WebkitBackfaceVisibility: "hidden",
  };

  if (queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center rounded-xl border border-dashed border-border/60 bg-muted/15 p-6">
        <p className="text-body-sm text-muted-foreground">
          Semua flashcard yang diterbitkan sudah Anda pelajari atau tidak ada kartu yang perlu diulas hari ini. Silakan kembali lagi nanti!
        </p>
      </div>
    );
  }

  const isFinished = currentIndex >= queue.length;

  if (isFinished) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-border/60 bg-card p-8 text-center shadow-xs">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
          <Check className="size-6" />
        </div>
        <h3 className="mt-4 font-heading text-body-lg font-bold text-foreground">
          Sesi Review Selesai! 🎉
        </h3>
        <p className="mt-2 text-body-sm text-muted-foreground">
          Anda berhasil mengulas {completedCount} flashcard pada sesi ini. Tetap pertahankan konsistensi belajar Anda!
        </p>
        <Button
          onClick={() => {
            setCurrentIndex(0);
            setCompletedCount(0);
            setIsFlipped(false);
          }}
          className="mt-6 rounded-md bg-brand-primary text-white hover:bg-brand-primary/95"
        >
          Ulangi Sesi
        </Button>
      </div>
    );
  }

  const activeCard = currentItem.card;
  const progressPercent = Math.round((currentIndex / queue.length) * 100);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Top Controls and Stats */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-border/60 bg-card/60 p-4 backdrop-blur-xs">
        <div>
          <span className="text-body-xs font-semibold text-muted-foreground">
            Progress Sesi: {currentIndex} / {queue.length} Kartu
          </span>
          <div className="mt-1.5 h-1.5 w-40 overflow-hidden rounded bg-muted">
            <div
              className="h-full bg-brand-primary transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Mode Selector - Rectangular rounded-md buttons (No Pills!) */}
        <div className="flex rounded-lg border border-border p-0.5 bg-muted/40 w-fit shrink-0">
          <button
            onClick={() => {
              if (loading) return;
              setMode("standard");
              setIsFlipped(false);
              setTypedAnswer("");
              setIsChecked(false);
            }}
            disabled={loading}
            className={`px-3 py-1 text-body-xs font-semibold rounded-md transition-colors ${
              mode === "standard"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Mode Standar
          </button>
          <button
            onClick={() => {
              if (loading) return;
              setMode("exam");
              setIsFlipped(false);
              setTypedAnswer("");
              setIsChecked(false);
            }}
            disabled={loading}
            className={`px-3 py-1 text-body-xs font-semibold rounded-md transition-colors ${
              mode === "exam"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Mode Ujian (Ketik)
          </button>
        </div>
      </div>

      {/* Spaced Repetition Info Alert */}
      {currentItem.dueStatus === "review" && (
        <div className="flex items-center gap-2 rounded-lg border border-brand-primary/20 bg-brand-primary/5 p-3 text-body-xs text-brand-primary">
          <Brain className="size-4 shrink-0" />
          <span>Kartu ini telah jatuh tempo untuk diulas kembali sesuai jadwal pengulangan berjeda Anda.</span>
        </div>
      )}

      {/* 3D Flip Card Container */}
      <div
        className="relative w-full h-80 select-none cursor-pointer"
        style={cardStyle}
        onClick={(e) => {
          // Avoid flipping when clicking buttons or input elements
          const target = e.target as HTMLElement;
          if (target.closest("button") || target.closest("input") || target.closest("textarea")) {
            return;
          }
          handleFlip();
        }}
      >
        <div
          className="relative w-full h-full transform-style-3d"
          style={innerStyle(isFlipped)}
        >
          {/* FRONT FACE */}
          <div
            className="absolute inset-0 w-full h-full rounded-2xl border border-border bg-card p-6 shadow-sm flex flex-col justify-between"
            style={faceStyle}
          >
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <span className="inline-flex rounded-md border border-brand-primary/20 bg-brand-primary/5 px-2 py-0.5 text-body-xs font-semibold text-brand-primary capitalize">
                Konsep: {activeCard.koId ? "Knowledge Object" : "Materi"}
              </span>
              <span className="text-body-xs font-medium text-muted-foreground">
                Tanya
              </span>
            </div>

            <div className="flex-1 flex items-center justify-center py-4 overflow-y-auto">
              <MathText className="font-heading text-body-lg font-bold text-foreground text-center" as="div">
                {activeCard.front}
              </MathText>
            </div>

            <div className="flex items-center justify-center gap-1.5 text-body-xs text-muted-foreground border-t border-border/40 pt-3">
              <RotateCw className="size-3" />
              <span>Ketuk area kartu untuk membalik</span>
            </div>
          </div>

          {/* BACK FACE */}
          <div
            className="absolute inset-0 w-full h-full rounded-2xl border border-border bg-card p-6 shadow-sm flex flex-col justify-between rotate-y-180"
            style={faceStyle}
          >
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <span className="inline-flex rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2 py-0.5 text-body-xs font-semibold text-emerald-600">
                Jawaban
              </span>
              {typeof activeCard.metadata?.recallDifficulty === "number" ? (
                <span
                  className="flex items-center gap-1 text-body-xs font-medium text-muted-foreground"
                  title={`Tingkat ingatan ${activeCard.metadata.recallDifficulty} dari 5`}
                >
                  <span className="hidden sm:inline">Ingatan</span>
                  <span className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span
                        key={n}
                        className={
                          "size-1.5 rounded-full " +
                          (n <= activeCard.metadata.recallDifficulty ? "bg-status-warning" : "bg-muted")
                        }
                      />
                    ))}
                  </span>
                </span>
              ) : (
                <span className="text-body-xs font-medium text-muted-foreground">Detail</span>
              )}
            </div>

            <div className="flex-1 flex flex-col justify-center py-4 overflow-y-auto space-y-3">
              <MathText className="font-heading text-body-base font-bold text-foreground text-center" as="div">
                {activeCard.back}
              </MathText>
              {activeCard.explanation && (
                <div className="rounded-lg bg-muted/40 p-3 border border-border/50">
                  <div className="text-body-xs font-semibold text-muted-foreground mb-0.5">Penjelasan:</div>
                  <MathText className="text-body-xs text-muted-foreground" as="div">
                    {activeCard.explanation}
                  </MathText>
                </div>
              )}
            </div>

            <div className="flex items-center justify-center gap-1.5 text-body-xs text-muted-foreground border-t border-border/40 pt-3">
              <RotateCw className="size-3" />
              <span>Ketuk untuk kembali ke pertanyaan</span>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Input Area for Exam Mode */}
      {mode === "exam" && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-body-xs font-semibold text-foreground">
              Jawaban Anda:
            </label>
            {isChecked && (
              <span className={`flex items-center gap-1 text-body-xs font-bold ${passedExam ? "text-emerald-600" : "text-rose-600"}`}>
                {passedExam ? (
                  <>
                    <Check className="size-3.5" /> Benar (Lolos Cocokan)
                  </>
                ) : (
                  <>
                    <X className="size-3.5" /> Kurang Tepat
                  </>
                )}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              disabled={isChecked || loading}
              value={typedAnswer}
              onChange={(e) => setTypedAnswer(e.target.value)}
              placeholder="Tuliskan kata kunci atau nilai jawaban..."
              className="flex-1 h-9 px-3 rounded-md border border-input bg-background text-body-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
            />
            {!isChecked ? (
              <Button
                onClick={handleCheckAnswer}
                disabled={loading}
                size="lg"
                className="rounded-md bg-brand-primary text-white hover:bg-brand-primary/95 h-9"
              >
                Periksa
              </Button>
            ) : (
              <Button
                onClick={() => {
                  setIsChecked(false);
                  setTypedAnswer("");
                  setPassedExam(null);
                  setIsFlipped(false);
                }}
                variant="outline"
                size="lg"
                className="rounded-md h-9"
              >
                Coba Lagi
              </Button>
            )}
          </div>
        </div>
      )}

      {/* SM-2 Recall Self-Evaluation Grade Buttons (Visible when flipped or checked) */}
      {(isFlipped || isChecked) && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Button
              type="button"
              disabled={loading}
              onClick={() => handleGrade(1)}
              className="w-full rounded-md border border-transparent bg-status-error/10 text-status-error hover:bg-status-error/20 active:scale-[0.98] text-body-xs font-bold py-3.5 h-auto transition-all"
            >
              Ulangi (SM-2: 1)
            </Button>
            <Button
              type="button"
              disabled={loading}
              onClick={() => handleGrade(2)}
              className="w-full rounded-md border border-transparent bg-status-warning/10 text-status-warning hover:bg-status-warning/20 active:scale-[0.98] text-body-xs font-bold py-3.5 h-auto transition-all"
            >
              Sulit (SM-2: 2)
            </Button>
            <Button
              type="button"
              disabled={loading}
              onClick={() => handleGrade(3)}
              className="w-full rounded-md border border-transparent bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20 active:scale-[0.98] text-body-xs font-bold py-3.5 h-auto transition-all"
            >
              Bagus (SM-2: 3)
            </Button>
            <Button
              type="button"
              disabled={loading}
              onClick={() => handleGrade(4)}
              className="w-full rounded-md border border-transparent bg-status-success/10 text-status-success hover:bg-status-success/20 active:scale-[0.98] text-body-xs font-bold py-3.5 h-auto transition-all"
            >
              Mudah (SM-2: 4)
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
