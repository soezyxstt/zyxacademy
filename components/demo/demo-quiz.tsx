"use client";

import { useState } from "react";
import { CheckSquare, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { DemoQuizQuestion } from "@/app/(marketing)/demo/demo-data";
import { DemoAuthCta } from "./demo-shell";
import { useDemoState } from "./use-demo-state";

type QuizResult = {
  index: number;
  isCorrect: boolean;
  explanation: string | null;
};

export function DemoQuiz({
  questions,
  quizSetToken,
  nextPath,
}: {
  questions: DemoQuizQuestion[];
  quizSetToken: string;
  nextPath: string;
}) {
  const { state, save, ready, error: storageError } = useDemoState(nextPath);
  const signature = JSON.stringify(questions);
  const progress = state.quiz?.signature === signature ? state.quiz : null;
  const answers = progress?.answers ?? questions.map(() => []);
  const results = progress?.results ?? null;
  const score = progress?.score ?? null;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = (questionIndex: number, optionIndex: number, multiple: boolean) => {
    const next = answers.map((answer, index) => {
      if (index !== questionIndex) return answer;
      if (!multiple) return [optionIndex];
      return answer.includes(optionIndex) ? answer.filter(value => value !== optionIndex) : [...answer, optionIndex].sort((a, b) => a - b);
    });
    save(current => ({ ...current, quiz: { signature, questionCount: questions.length, answers: next, score: null, results: null } }));
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/demo/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          answers,
          questionIds: questions.map((question) => question.id),
          questionSetToken: quizSetToken,
        }),
      });
      const payload = await response.json().catch(() => null) as {
        score?: number;
        results?: QuizResult[];
        error?: string;
      } | null;
      if (!response.ok || !payload?.results) {
        throw new Error(payload?.error || "Kuis belum dapat diperiksa.");
      }
      save(current => ({ ...current, quiz: { signature, questionCount: questions.length, answers, score: payload.score ?? 0, results: payload.results ?? null } }));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Kuis belum dapat diperiksa.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl" aria-busy={!ready}>
      <Card variant="solid" className="p-5 sm:p-8">
        <div className="flex items-start gap-3 border-b border-border pb-5">
          <CheckSquare className="mt-1 size-5 shrink-0 text-brand-primary" aria-hidden="true" />
          <div>
            <h2 className="font-heading text-h5 font-bold text-foreground">Cek pemahamanmu</h2>
            <p className="mt-1 text-body-xs text-muted-foreground">Tiga soal, hasil hanya muncul setelah dikirim.</p>
          </div>
        </div>

        <div className="mt-8 space-y-8">
          {questions.map((question, questionIndex) => {
            const selected = answers[questionIndex] ?? [];
            const result = results?.[questionIndex];
            return (
              <fieldset key={`${question.prompt}-${questionIndex}`} className="space-y-3">
                <legend className="text-body-base font-semibold leading-relaxed text-foreground">
                  {questionIndex + 1}. {question.prompt}
                </legend>
                <div className="space-y-2">
                  {question.options.map((option, optionIndex) => {
                    const checked = selected.includes(optionIndex);
                    const inputId = `demo-question-${questionIndex}-option-${optionIndex}`;
                    return (
                      <label
                        key={inputId}
                        htmlFor={inputId}
                        className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background px-3 py-3 text-body-sm transition-colors has-[:checked]:border-brand-primary/50 has-[:checked]:bg-brand-primary/5"
                      >
                        <input
                          id={inputId}
                          type={question.multiple ? "checkbox" : "radio"}
                          name={`demo-question-${questionIndex}`}
                          checked={checked}
                          disabled={!ready || submitting}
                          onChange={() => choose(questionIndex, optionIndex, question.multiple)}
                          className="mt-0.5 size-4 accent-[var(--zx-accent)]"
                        />
                        <span className="leading-relaxed text-foreground">{option}</span>
                      </label>
                    );
                  })}
                </div>
                {result ? (
                  <p className={result.isCorrect ? "text-body-xs text-status-success" : "text-body-xs text-status-error"}>
                    {result.isCorrect ? "Jawaban benar." : "Jawaban belum tepat."}
                    {result.explanation ? ` ${result.explanation}` : ""}
                  </p>
                ) : null}
              </fieldset>
            );
          })}
        </div>

        {(error || storageError) ? <p role="alert" className="mt-6 text-body-sm text-status-error">{error || storageError}</p> : null}
        {score !== null ? (
          <p className="mt-6 rounded-lg bg-status-success/10 px-3 py-2 text-body-sm font-semibold text-status-success" aria-live="polite">
            Skor demo: {score} dari {questions.length}
          </p>
        ) : null}

        <Button type="button" onClick={submit} disabled={submitting || !ready} className="mt-6 gap-1.5 rounded-lg">
          {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {submitting ? "Memeriksa..." : "Kirim jawaban"}
        </Button>
      </Card>

      <div className="mt-5 flex flex-col gap-3 rounded-xl border border-brand-primary/20 bg-brand-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-body-base font-bold text-foreground">Lanjutkan latihan di akunmu</h2>
          <p className="mt-1 text-body-xs text-muted-foreground">Masuk untuk melanjutkan latihan di akun Free.</p>
        </div>
        <DemoAuthCta nextPath={nextPath} />
      </div>
    </div>
  );
}
