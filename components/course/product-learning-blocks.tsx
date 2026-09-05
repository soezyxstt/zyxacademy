"use client";

import React, { useState } from "react";
import {
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  HelpCircle,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { MathText } from "@/components/course/math-text";
import type {
  PublicFormativeCheckPayload,
  PublicLearningTimeEstimate,
  PublicWorkedExamplePayload,
} from "@/lib/articles/structured-read-model";
import { cn } from "@/lib/utils";

export interface ProductWorkedExampleProps {
  title?: string | null;
  content: string;
  workedExample: PublicWorkedExamplePayload;
  className?: string;
}

export function ProductWorkedExample({
  title,
  content,
  workedExample,
  className,
}: ProductWorkedExampleProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-status-success/30 bg-card p-4 sm:p-5 space-y-4",
        className,
      )}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/80 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-status-success/15 text-status-success">
            <BookOpen className="size-3.5" />
          </span>
          <h3 className="font-heading text-body-sm font-bold text-foreground">
            {title || "Contoh dan Pembahasan Bertahap"}
          </h3>
        </div>
      </div>

      {/* Problem Prompt */}
      {content ? (
        <div className="text-body-base leading-relaxed text-foreground">
          <MarkdownRenderer content={content} density="compact" />
        </div>
      ) : null}

      {/* Steps List */}
      <div className="space-y-3 pt-1">
        {workedExample.steps.map((step) => (
          <div
            key={step.stepIndex}
            className="rounded-lg border border-border/70 bg-muted/20 p-3.5 sm:p-4 space-y-2.5"
          >
            <div className="flex items-center gap-2">
              <span className="flex size-5 shrink-0 items-center justify-center rounded bg-primary/10 font-mono text-body-xs font-bold text-primary">
                {step.stepIndex + 1}
              </span>
              <h4 className="font-heading text-body-xs font-bold text-foreground">
                {step.label}
              </h4>
            </div>

            {/* Step Explanation */}
            <div className="text-body-sm text-foreground pl-7 leading-relaxed">
              <MarkdownRenderer content={step.explanation} density="compact" />
            </div>

            {/* Distinct Reason Block: Do not collapse into generic prose */}
            <div className="ml-7 rounded-md border-l-2 border-primary/40 bg-primary/5 p-2.5 text-body-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-primary">
                <Sparkles className="size-3 shrink-0" />
                <span>Landasan Bernalar / Alasan</span>
              </div>
              <p className="text-foreground/90 leading-relaxed">{step.reason}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Solution Verification */}
      {workedExample.verification ? (
        <div className="rounded-lg border border-status-success/40 bg-status-success/10 p-3.5 sm:p-4 flex items-start gap-3">
          <CheckCircle2 className="size-4 shrink-0 text-status-success mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-body-xs font-bold uppercase tracking-wider text-status-success">
              Verifikasi dan Pemeriksaan Solusi
            </h4>
            <p className="text-body-xs text-foreground leading-relaxed">
              {workedExample.verification}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export interface ProductFormativeCheckProps {
  title?: string | null;
  content: string;
  formativeCheck: PublicFormativeCheckPayload;
  className?: string;
}

export function ProductFormativeCheck({
  title,
  content,
  formativeCheck,
  className,
}: ProductFormativeCheckProps) {
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [isRevealed, setIsRevealed] = useState<boolean>(false);

  const optionLetters = ["A", "B", "C", "D", "E", "F"];

  const correctOption = formativeCheck.options?.find((o) => o.isCorrect);

  return (
    <div
      className={cn(
        "rounded-lg border border-status-warning/40 bg-card p-4 sm:p-5 space-y-4",
        className,
      )}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/80 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-status-warning/15 text-status-warning">
            <HelpCircle className="size-3.5" />
          </span>
          <h3 className="font-heading text-body-sm font-bold text-foreground">
            {title || "Cek Pemahaman Mandiri"}
          </h3>
        </div>
      </div>

      {/* Question prompt */}
      {content ? (
        <div className="text-body-base leading-relaxed text-foreground">
          <MarkdownRenderer content={content} density="compact" />
        </div>
      ) : null}

      {/* Options if Multiple Choice */}
      {formativeCheck.options && formativeCheck.options.length > 0 ? (
        <div className="space-y-2 pt-1" role="radiogroup" aria-label="Pilihan jawaban">
          {formativeCheck.options.map((opt, idx) => {
            const letter = optionLetters[idx] ?? String(idx + 1);
            const isSelected = selectedOptionId === opt.id;
            const isCorrect = opt.isCorrect;

            let borderStyle = "border-border/70 hover:border-primary/40 hover:bg-muted/40";
            if (isRevealed) {
              if (isCorrect) {
                borderStyle = "border-status-success bg-status-success/10";
              } else if (isSelected && !isCorrect) {
                borderStyle = "border-status-error bg-status-error/10";
              }
            } else if (isSelected) {
              borderStyle = "border-primary bg-primary/10";
            }

            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setSelectedOptionId(opt.id)}
                className={cn(
                  "w-full text-left p-3 rounded-lg border transition-colors flex items-start gap-3 text-body-sm text-foreground",
                  borderStyle,
                )}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-md font-mono text-body-xs font-bold",
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {letter}
                </span>
                <MathText as="span" className="min-w-0 flex-1 pt-0.5 leading-snug">{opt.text}</MathText>
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Keyboard-operable reveal control */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsRevealed(!isRevealed)}
          className="gap-1.5 text-body-xs font-semibold"
          aria-expanded={isRevealed}
        >
          {isRevealed ? (
            <>
              <ChevronUp className="size-3.5" />
              <span>Sembunyikan Pembahasan</span>
            </>
          ) : (
            <>
              <ChevronDown className="size-3.5" />
              <span>Buka Jawaban & Pembahasan</span>
            </>
          )}
        </Button>

        {isRevealed && selectedOptionId && formativeCheck.options ? (
          <span
            className={cn(
              "text-body-xs font-semibold",
              selectedOptionId === correctOption?.id
                ? "text-status-success"
                : "text-status-error",
            )}
          >
            {selectedOptionId === correctOption?.id
              ? "Jawaban pilihanmu tepat"
              : "Jawaban pilihanmu belum tepat"}
          </span>
        ) : null}
      </div>

      {/* Revealable Answer & Explanation */}
      {isRevealed ? (
        <div className="rounded-lg border border-border/80 bg-muted/30 p-4 space-y-3 animate-fade-in">
          <div>
            <span className="text-body-2xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">
              Jawaban Benar
            </span>
            <div className="text-body-sm font-semibold text-foreground">
              {correctOption ? (
                <MathText as="span">{`${optionLetters[formativeCheck.options?.indexOf(correctOption) ?? 0]}. ${correctOption.text}`}</MathText>
              ) : (
                <MathText as="span">{formativeCheck.answer}</MathText>
              )}
            </div>
          </div>

          <div className="border-t border-border/60 pt-2.5">
            <span className="text-body-2xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">
              Penjelasan / Pembahasan
            </span>
            <div className="text-body-sm text-foreground leading-relaxed">
              <MarkdownRenderer content={formativeCheck.explanation} density="compact" />
            </div>
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
