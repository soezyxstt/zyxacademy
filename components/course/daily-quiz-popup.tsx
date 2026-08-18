"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, CheckCircle2, XCircle, BrainCircuit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MathText } from "@/components/course/math-text";
import { cn } from "@/lib/utils";

type TriviaQuestion = {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

const TRIVIA_DATA: Record<string, TriviaQuestion> = {
  "calc-1": {
    question: "Siapakah ilmuwan Jerman yang dianggap sebagai penemu kalkulus modern bersama dengan Isaac Newton?",
    options: ["Albert Einstein", "Gottfried Wilhelm Leibniz", "René Descartes", "Galileo Galilei"],
    correctIndex: 1,
    explanation: "Kalkulus dikembangkan secara independen pada pertengahan abad ke-17 oleh Sir Isaac Newton di Inggris dan Gottfried Wilhelm Leibniz di Jerman. Leibniz lah yang memperkenalkan notasi dx dan lambang integral (∫) yang kita gunakan sekarang.",
  },
  "physics-1": {
    question: "Manakah dari berikut ini yang merupakan satu-satunya besaran vektor di bawah ini?",
    options: ["Kelajuan", "Massa", "Suhu", "Perpindahan"],
    correctIndex: 3,
    explanation: "Perpindahan adalah besaran vektor karena memiliki besar dan arah. Sementara kelajuan, massa, dan suhu hanya memiliki besar saja sehingga termasuk besaran skalar.",
  },
  "chem-1": {
    question: "Unsur kimia apakah yang memiliki nomor atom 1 dan merupakan unsur paling melimpah di alam semesta?",
    options: ["Helium", "Hidrogen", "Oksigen", "Nitrogen"],
    correctIndex: 1,
    explanation: "Hidrogen (H) adalah unsur kimia dengan nomor atom 1. Sekitar 75% massa elemental alam semesta terdiri dari hidrogen, menjadikannya unsur paling melimpah.",
  },
};

const DAILY_QUIZ_STORAGE_PREFIX = "zyx-daily-quiz";

function getTodayString() {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const date = String(today.getDate()).padStart(2, "0");

  return `${today.getFullYear()}-${month}-${date}`;
}

function getLegacyTodayString() {
  const today = new Date();

  return `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
}

function getDailyQuizStorageKey(courseId: string) {
  return `${DAILY_QUIZ_STORAGE_PREFIX}-${courseId}-${getTodayString()}`;
}

function getLegacyDailyQuizStorageKey(courseId: string) {
  return `${DAILY_QUIZ_STORAGE_PREFIX}-${courseId}-${getLegacyTodayString()}`;
}

function hasCompletedDailyQuizToday(courseId: string) {
  if (typeof window === "undefined") return true;

  return (
    window.localStorage.getItem(getDailyQuizStorageKey(courseId)) === "completed" ||
    window.localStorage.getItem(getLegacyDailyQuizStorageKey(courseId)) === "completed"
  );
}

function markDailyQuizCompletedToday(courseId: string) {
  window.localStorage.setItem(getDailyQuizStorageKey(courseId), "completed");
}

type DailyQuizPopupProps = {
  courseId: string;
  courseTitle: string;
  triggerManual?: boolean;
  onCloseManual?: () => void;
  dailyTrivia?: {
    id: string;
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  } | null;
};

export function DailyQuizPopup({
  courseId,
  courseTitle,
  triggerManual = false,
  onCloseManual,
  dailyTrivia,
}: DailyQuizPopupProps) {
  const [show, setShow] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  const trivia = dailyTrivia || TRIVIA_DATA[courseId] || TRIVIA_DATA["calc-1"];

  useEffect(() => {
    const quizCompleted = hasCompletedDailyQuizToday(courseId);
    const delay = triggerManual ? 0 : 800;

    if (triggerManual) {
      if (quizCompleted) {
        const timer = setTimeout(() => onCloseManual?.(), delay);
        return () => clearTimeout(timer);
      }

      const timer = setTimeout(() => {
        setShow(true);
        setSubmitted(false);
        setSelectedIdx(null);
      }, delay);
      return () => clearTimeout(timer);
    } else if (!quizCompleted) {
      const timer = setTimeout(() => {
        setShow(true);
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [courseId, triggerManual, onCloseManual]);

  // Listen to simulator reset events
  useEffect(() => {
    const handleReset = () => {
      if (!triggerManual) {
        setShow(false);
        setSubmitted(false);
        setSelectedIdx(null);
      }
    };
    window.addEventListener("zyx-daily-quiz-reset", handleReset);
    return () => window.removeEventListener("zyx-daily-quiz-reset", handleReset);
  }, [triggerManual]);

  function handleSubmit() {
    if (selectedIdx === null) return;

    const correct = selectedIdx === trivia.correctIndex;
    setIsCorrect(correct);
    setSubmitted(true);

    markDailyQuizCompletedToday(courseId);
  }

  function handleClose() {
    setShow(false);
    if (onCloseManual) {
      onCloseManual();
    }
  }

  if (!show) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 grid min-h-dvh place-items-center overflow-y-auto bg-black/60 p-4 font-sans backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
      <div className="relative my-auto w-full max-w-lg rounded-3xl border border-brand-primary/30 bg-card/95 p-6 shadow-2xl backdrop-blur-md md:p-8 animate-in zoom-in-95 duration-200">
        <span className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground hover:bg-border cursor-pointer transition-colors" onClick={handleClose}>
          ✕
        </span>

        <div className="flex items-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
            <BrainCircuit className="size-5" />
          </span>
          <div>
            <span className="text-[10px] font-bold tracking-widest uppercase text-brand-primary">Kuis Harian Pop-Up</span>
            <h3 className="font-heading text-body-base font-bold text-foreground leading-tight">{courseTitle} Trivia</h3>
          </div>
        </div>

        {!submitted ? (
          <div className="mt-6">
            <p className="text-body-base font-semibold text-foreground leading-relaxed">
              <MathText>{trivia.question}</MathText>
            </p>

            <ul className="mt-5 space-y-2.5">
              {trivia.options.map((opt, idx) => {
                const selected = selectedIdx === idx;
                return (
                  <li key={idx}>
                    <button
                      type="button"
                      onClick={() => setSelectedIdx(idx)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left text-body-sm font-medium transition-all",
                        selected
                          ? "border-brand-primary bg-brand-primary/10 ring-1 ring-brand-primary"
                          : "border-border bg-muted/20 hover:border-brand-primary/30 hover:bg-muted/40"
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-7 shrink-0 items-center justify-center rounded-lg text-body-xs font-bold transition-colors",
                          selected ? "bg-brand-primary text-white" : "bg-muted text-muted-foreground"
                        )}
                      >
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <MathText className="text-foreground">{opt}</MathText>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={handleClose} className="rounded-md">
                Nanti saja
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={selectedIdx === null}
                className="rounded-md bg-brand-primary px-6"
              >
                Kirim Jawaban
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-4 animate-in fade-in duration-300">
            <div
              className={cn(
                "rounded-2xl border p-4 flex items-start gap-3",
                isCorrect
                  ? "bg-status-success/10 border-status-success/20 text-status-success"
                  : "bg-status-error/10 border-status-error/20 text-status-error"
              )}
            >
              {isCorrect ? (
                <CheckCircle2 className="size-6 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="size-6 shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-bold text-body-base leading-none">
                  {isCorrect ? "Jawaban Benar!" : "Jawaban Kurang Tepat"}
                </p>
                <p className="text-body-xs mt-1 text-foreground/80">
                  {isCorrect
                    ? "Hebat! Kamu berhasil menjawab trivia hari ini dengan benar."
                    : (
                      <>
                        Jawaban yang benar adalah:{" "}
                        <MathText>{trivia.options[trivia.correctIndex]}</MathText>
                      </>
                    )}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-brand-primary/20 bg-brand-primary/5 p-4">
              <h4 className="font-heading text-body-xs font-bold text-brand-primary flex items-center gap-1.5">
                <Sparkles className="size-3.5" />
                Pembahasan:
              </h4>
              <p className="mt-2 text-body-xs text-muted-foreground leading-relaxed">
                <MathText>{trivia.explanation}</MathText>
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button onClick={handleClose} className="rounded-md bg-foreground text-background hover:bg-foreground/90 px-6">
                Selesai & Tutup
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
