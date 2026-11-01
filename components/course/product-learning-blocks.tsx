"use client";

import React, { useState } from "react";
import {
  BookOpen,
  BookOpenCheck,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  HelpCircle,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownRenderer, type MarkdownDensity } from "@/components/course/markdown-renderer";
import { MathText } from "@/components/course/math-text";
import { useFormativeCheckEndpointBase } from "@/components/course/formative-check-endpoint-context";
import type {
  PublicFormativeCheckPayload,
  PublicLearningTimeEstimate,
  PublicWorkedExamplePayload,
} from "@/lib/articles/structured-read-model";
import type { FormativeLearnerResponse } from "@/lib/materials/formative-evaluation";
import { cn } from "@/lib/utils";

export interface ProductWorkedExampleProps {
  title?: string | null;
  content?: string;
  contentNode?: React.ReactNode;
  workedExample?: PublicWorkedExamplePayload;
  example?: PublicWorkedExamplePayload;
  className?: string;
  density?: MarkdownDensity;
}

/** Presents a worked example with a vertical timeline stepper in the course article. */
export function ProductWorkedExample({
  title,
  content = "",
  workedExample: workedExampleProp,
  example,
  contentNode,
  className,
  density = "default",
}: ProductWorkedExampleProps) {
  const workedExample = workedExampleProp ?? example;
  if (!workedExample) return null;
  return (
    <section
      aria-label={title || "Contoh dan Pembahasan Bertahap"}
      className={cn("my-6 space-y-4", className)}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border/60 pb-2.5">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-status-success/15 text-status-success">
          <BookOpen className="size-3.5" />
        </span>
        <h3 className="font-heading text-body-base font-bold text-foreground">
          <MathText className="normal-case">{title || "Contoh dan Pembahasan Bertahap"}</MathText>
        </h3>
      </div>

      {/* Problem Prompt */}
      {contentNode || content ? (
        <div className="rounded-lg border border-border/60 bg-muted/20 p-3.5 text-body-base leading-relaxed text-foreground">
          {contentNode ?? <MarkdownRenderer content={content} density={density} />}
        </div>
      ) : null}

      {/* Vertical Timeline Stepper */}
      <ol className="relative ml-3 space-y-5 border-l-2 border-border/80 pl-6 pt-1">
        {workedExample.steps.map((step) => (
          <li key={step.stepIndex} className="relative">
            {/* Step number badge pinned to the vertical line */}
            <span className="absolute -left-[35px] top-0 flex size-5.5 items-center justify-center rounded-full border-2 border-primary/70 bg-background font-mono text-body-2xs font-bold text-primary shadow-2xs">
              {step.stepIndex + 1}
            </span>

            <div className="space-y-1">
              <h4 className="font-heading text-body-sm font-bold text-foreground">
                <MathText className="normal-case">{step.label}</MathText>
              </h4>

              <div className="text-body-sm leading-relaxed text-foreground">
                <MarkdownRenderer content={step.explanation} density={density} />
              </div>

              {step.reason ? (
                <div className="text-body-sm leading-relaxed text-muted-foreground">
                  <MarkdownRenderer content={step.reason} density={density} />
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      {/* Solution Verification */}
      {workedExample.verification ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-status-success/30 bg-status-success/5 p-3.5 text-body-sm">
          <CheckCircle2 className="size-4 shrink-0 text-status-success mt-0.5" />
          <div className="min-w-0 leading-relaxed text-foreground">
            <span className="mb-0.5 block text-body-xs font-semibold text-status-success">
              Kesimpulan dan Verifikasi
            </span>
            <MarkdownRenderer content={workedExample.verification} density={density} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

export interface ProductFormativeCheckProps {
  density?: MarkdownDensity;
  title?: string | null;
  content: string;
  contentNode?: React.ReactNode;
  formativeCheck: PublicFormativeCheckPayload;
  locator: {
    articleId: string;
    articleVersion: number;
    sectionId: string;
    blockId: string;
  };
  className?: string;
}

type FormativeCheckUiState = "idle" | "answering" | "submitting" | "evaluated" | "revealed" | "error";

interface FormativeCheckResult {
  verdict: "correct" | "partial" | "incorrect" | "ungradable";
  feedback: string;
  criteria?: Array<{ criterionId: string; status: "met" | "partial" | "missed" }>;
  misconceptions?: string[];
  canRetry: boolean;
  revealAllowed: boolean;
}

interface FormativeCheckReveal {
  answer: string;
  explanation: string;
}

const verdictLabels: Record<FormativeCheckResult["verdict"], string> = {
  correct: "Benar",
  partial: "Sebagian tepat",
  incorrect: "Belum tepat",
  ungradable: "Belum dapat dinilai",
};

const verdictClasses: Record<FormativeCheckResult["verdict"], string> = {
  correct: "border-status-success/40 bg-status-success/10 text-status-success",
  partial: "border-status-warning/40 bg-status-warning/10 text-status-warning",
  incorrect: "border-status-error/40 bg-status-error/10 text-status-error",
  ungradable: "border-border/80 bg-muted/30 text-muted-foreground",
};

export function ProductFormativeCheck({
  density = "default",
  title,
  content,
  formativeCheck,
  contentNode,
  locator,
  className,
}: ProductFormativeCheckProps) {
  const endpointBase = useFormativeCheckEndpointBase();
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [textValue, setTextValue] = useState("");
  const [numericValue, setNumericValue] = useState("");
  const [conceptualValue, setConceptualValue] = useState("");
  const [uiState, setUiState] = useState<FormativeCheckUiState>("idle");
  const [result, setResult] = useState<FormativeCheckResult | null>(null);
  const [reveal, setReveal] = useState<FormativeCheckReveal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hintIndex, setHintIndex] = useState(0);
  const [isRevealing, setIsRevealing] = useState(false);

  const optionLetters = ["A", "B", "C", "D", "E", "F"];
  const isLegacy = formativeCheck.evaluationMode === null;
  const isEvaluated = Boolean(result);
  const hints = formativeCheck.feedbackPolicy?.hints ?? [];
  const isSubmitting = uiState === "submitting";

  const getLearnerResponse = (): FormativeLearnerResponse | null => {
    switch (formativeCheck.checkKind) {
      case "multiple_choice":
        return selectedOptionId ? { kind: "choice", optionId: selectedOptionId } : null;
      case "short_answer":
        return textValue.trim() ? { kind: "text", text: textValue } : null;
      case "numeric_answer":
        return numericValue.trim() ? { kind: "numeric", value: numericValue } : null;
      case "conceptual_explanation":
        return conceptualValue.trim() ? { kind: "conceptual", text: conceptualValue } : null;
    }
  };

  const setAnswering = () => {
    if (!isEvaluated && !isSubmitting) {
      setError(null);
      setUiState("answering");
    }
  };

  const submitResponse = async () => {
    const response = getLearnerResponse();
    if (!response) {
      setError("Isi responsmu sebelum mengirim jawaban.");
      setUiState("error");
      return;
    }

    setError(null);
    setUiState("submitting");
    try {
      const serverResponse = await fetch(`${endpointBase}/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...locator, response }),
      });
      const body = (await serverResponse.json().catch(() => null)) as { ok?: boolean; result?: FormativeCheckResult; error?: unknown } | null;
      if (!serverResponse.ok || !body?.ok || !body.result) {
        throw new Error(typeof body?.error === "string" ? body.error : "Cek pemahaman tidak dapat diproses.");
      }
      setResult(body.result);
      setReveal(null);
      setUiState("evaluated");
    } catch (submissionError) {
      const message = submissionError instanceof Error && submissionError.message.length <= 240
        ? submissionError.message
        : "Cek pemahaman tidak dapat diproses sekarang.";
      setError(message);
      setUiState("error");
    }
  };

  const revealAnswer = async () => {
    if (reveal) {
      setReveal(null);
      setUiState(result ? "evaluated" : "idle");
      return;
    }

    setError(null);
    setIsRevealing(true);
    try {
      const serverResponse = await fetch(`${endpointBase}/reveal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(locator),
      });
      const body = (await serverResponse.json().catch(() => null)) as FormativeCheckReveal & { error?: unknown };
      if (!serverResponse.ok || typeof body.answer !== "string" || typeof body.explanation !== "string") {
        throw new Error(typeof body.error === "string" ? body.error : "Pembahasan tidak dapat dibuka.");
      }
      setReveal({ answer: body.answer, explanation: body.explanation });
      setUiState("revealed");
    } catch (revealError) {
      const message = revealError instanceof Error && revealError.message.length <= 240
        ? revealError.message
        : "Pembahasan tidak dapat dibuka sekarang.";
      setError(message);
      setUiState("error");
    } finally {
      setIsRevealing(false);
    }
  };

  const retry = () => {
    setResult(null);
    setReveal(null);
    setError(null);
    setHintIndex(0);
    setUiState("answering");
  };

  const criteriaSummary = result?.criteria
    ? (() => {
        const met = result.criteria.filter((criterion) => criterion.status === "met").length;
        const partial = result.criteria.filter((criterion) => criterion.status === "partial").length;
        return `${met} aspek terpenuhi${partial > 0 ? `, ${partial} aspek perlu diperjelas` : ""}.`;
      })()
    : null;

  return (
    <div
      className={cn(
        "rounded-r-lg border-l-4 border-l-status-warning border-t border-r border-b border-border/70 bg-card p-4 sm:p-5 space-y-4 shadow-xs",
        className,
      )}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-status-warning/15 text-status-warning">
            <HelpCircle className="size-3.5" />
          </span>
          <h3 className="font-heading text-body-sm font-bold text-foreground">
            <MathText className="normal-case">{title || "Cek Pemahaman Mandiri"}</MathText>
          </h3>
        </div>
        <span className="rounded-md px-2 py-0.5 text-body-xs font-semibold uppercase tracking-wider text-status-warning bg-status-warning/10">
          Cek Pemahaman
        </span>
      </div>

      {/* Question prompt */}
      {contentNode || content ? (
        <div className="text-body-base leading-relaxed text-foreground">
          {contentNode ?? <MarkdownRenderer content={content} />}
        </div>
      ) : null}

      <form onSubmit={(event) => { event.preventDefault(); void submitResponse(); }} className="space-y-4" aria-busy={isSubmitting}>
        {formativeCheck.checkKind === "multiple_choice" && formativeCheck.options?.length ? (
          <div className="space-y-2 pt-1" role="radiogroup" aria-label="Pilihan jawaban">
            {formativeCheck.options.map((option, index) => {
              const isSelected = selectedOptionId === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={isEvaluated || isSubmitting || Boolean(reveal)}
                  onClick={() => { setSelectedOptionId(option.id); setAnswering(); }}
                  className={cn(
                    "w-full text-left rounded-lg border p-3 transition-colors flex items-start gap-3 text-body-sm text-foreground",
                    isSelected ? "border-primary bg-primary/10" : "border-border/70 hover:border-primary/40 hover:bg-muted/40",
                  )}
                >
                  <span className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-md font-mono text-body-xs font-bold",
                    isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}>
                    {optionLetters[index] ?? String(index + 1)}
                  </span>
                  <MathText as="span" className="min-w-0 flex-1 pt-0.5 leading-snug">{option.text}</MathText>
                </button>
              );
            })}
          </div>
        ) : null}

        {formativeCheck.checkKind === "short_answer" ? (
          <div className="space-y-2">
            <label htmlFor={`formative-text-${locator.blockId}`} className="text-body-sm font-semibold text-foreground">Jawaban singkat</label>
            <Textarea
              id={`formative-text-${locator.blockId}`}
              value={textValue}
              maxLength={2000}
              disabled={isEvaluated || isSubmitting || Boolean(reveal)}
              onChange={(event) => { setTextValue(event.target.value); setAnswering(); }}
              placeholder="Tulis jawabanmu"
              className="min-h-20"
            />
          </div>
        ) : null}

        {formativeCheck.checkKind === "numeric_answer" ? (
          <div className="space-y-2">
            <label htmlFor={`formative-numeric-${locator.blockId}`} className="text-body-sm font-semibold text-foreground">Nilai jawaban</label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id={`formative-numeric-${locator.blockId}`}
                value={numericValue}
                maxLength={200}
                disabled={isEvaluated || isSubmitting || Boolean(reveal)}
                onChange={(event) => { setNumericValue(event.target.value); setAnswering(); }}
                inputMode="decimal"
                placeholder="Masukkan angka"
                className="min-w-[140px] flex-1"
              />
              {formativeCheck.unit ? <span className="text-body-sm text-muted-foreground">{formativeCheck.unit}</span> : null}
            </div>
          </div>
        ) : null}

        {formativeCheck.checkKind === "conceptual_explanation" ? (
          <div className="space-y-2">
            <label htmlFor={`formative-conceptual-${locator.blockId}`} className="text-body-sm font-semibold text-foreground">Penjelasanmu</label>
            <Textarea
              id={`formative-conceptual-${locator.blockId}`}
              value={conceptualValue}
              maxLength={6000}
              disabled={isEvaluated || isSubmitting || Boolean(reveal)}
              onChange={(event) => { setConceptualValue(event.target.value); setAnswering(); }}
              placeholder="Jelaskan alasan atau langkah berpikirmu"
              className="min-h-28"
            />
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {!isLegacy ? (
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || isEvaluated || !getLearnerResponse()}
              className={cn(
                "gap-1.5 text-body-sm transition-all",
                !getLearnerResponse() && !isEvaluated
                  ? "bg-muted text-muted-foreground hover:bg-muted hover:text-muted-foreground opacity-60 cursor-not-allowed border border-border/70"
                  : "bg-primary text-primary-foreground",
              )}
            >
              {isSubmitting ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
              {isSubmitting ? "Memeriksa" : "Periksa jawaban"}
            </Button>
          ) : null}

          {isLegacy || result?.revealAllowed ? (
            <Button type="button" variant="outline" size="sm" disabled={isRevealing} onClick={() => void revealAnswer()} className="gap-1.5 text-body-sm" aria-expanded={Boolean(reveal)}>
              {isRevealing ? <Loader2 className="size-3.5 animate-spin" /> : reveal ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
              {reveal ? "Sembunyikan pembahasan" : isRevealing ? "Membuka pembahasan" : "Buka jawaban dan pembahasan"}
            </Button>
          ) : null}

          {result?.canRetry ? (
            <Button type="button" variant="ghost" size="sm" onClick={retry} className="gap-1.5 text-body-sm">
              <RotateCcw className="size-3.5" />
              Coba lagi
            </Button>
          ) : null}
        </div>
      </form>

      {error ? <p role="alert" className="rounded-lg border border-status-error/40 bg-status-error/10 px-3 py-2 text-body-sm text-status-error">{error}</p> : null}

      {result ? (
        <div role="status" aria-live="polite" className={cn("space-y-2 rounded-lg border p-3.5 text-body-sm", verdictClasses[result.verdict])}>
          <p className="font-semibold">Hasil: {verdictLabels[result.verdict]}</p>
          <p className="leading-relaxed">{result.feedback}</p>
          {criteriaSummary ? <p className="text-body-xs">{criteriaSummary}</p> : null}
        </div>
      ) : null}

      {result && hints.length > 0 && hintIndex < hints.length ? (
        <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3.5">
          {hintIndex > 0 ? <p className="text-body-sm text-foreground">{hints[hintIndex - 1]}</p> : null}
          <Button type="button" variant="outline" size="sm" onClick={() => setHintIndex((current) => Math.min(current + 1, hints.length))} className="gap-1.5 text-body-sm">
            <BookOpenCheck className="size-3.5" />
            {hintIndex === 0 ? "Tampilkan petunjuk" : "Petunjuk berikutnya"}
          </Button>
        </div>
      ) : result && hintIndex > 0 && hints.length > 0 ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3.5 text-body-sm text-foreground">
          <p>{hints[hintIndex - 1]}</p>
        </div>
      ) : null}

      {reveal ? (
        <div className="space-y-3 rounded-lg border border-border/80 bg-muted/30 p-4 animate-fade-in">
          <div>
            <span className="mb-1 block text-body-2xs font-bold uppercase tracking-wider text-muted-foreground">Jawaban</span>
            <div className="text-body-sm font-semibold text-foreground"><MathText as="span">{reveal.answer}</MathText></div>
          </div>
          <div className="border-t border-border/60 pt-2.5">
            <span className="mb-1 block text-body-2xs font-bold uppercase tracking-wider text-muted-foreground">Penjelasan dan pembahasan</span>
            <div className="text-body-sm leading-relaxed text-foreground"><MarkdownRenderer content={reveal.explanation} /></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export interface ProductLearningTimeBadgeProps {
  timeEstimate: PublicLearningTimeEstimate;
  className?: string;
}

export function ProductLearningTimeBadge({
  timeEstimate,
  className,
}: ProductLearningTimeBadgeProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-1.5 text-body-xs",
        className,
      )}
      aria-label="Estimasi waktu belajar bagian"
    >
      <div className="flex items-center gap-1 font-semibold text-foreground">
        <Clock className="size-3.5 text-primary" />
        <span>~{timeEstimate.totalMinutes} mnt total</span>
      </div>
      <span className="text-border">·</span>
      <div className="flex items-center gap-1 text-muted-foreground">
        <span>Baca: {timeEstimate.readingMinutes} mnt</span>
      </div>
      {timeEstimate.examplesMinutes > 0 ? (
        <>
          <span className="text-border">·</span>
          <div className="flex items-center gap-1 text-muted-foreground">
            <BookOpen className="size-3" />
            <span>Contoh: {timeEstimate.examplesMinutes} mnt</span>
          </div>
        </>
      ) : null}
      {timeEstimate.practiceMinutes > 0 ? (
        <>
          <span className="text-border">·</span>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Brain className="size-3" />
            <span>Latihan: {timeEstimate.practiceMinutes} mnt</span>
          </div>
        </>
      ) : null}
    </div>
  );
}
