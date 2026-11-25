"use client";

import { Check, Download, FileText, X } from "lucide-react";
import { useTranslations } from "@/lib/i18n/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MathText } from "@/components/course/math-text";

export interface TryoutSnapshotQuestion {
  id: string;
  type: "multiple_choice" | "multiple_choices" | "short_answer" | "essay" | string;
  prompt: string;
  options?: string[];
  correctIndex?: number;
  correctIndices?: number[];
  acceptableAnswers?: string[];
}

export interface TryoutSnapshotAnswer {
  index?: number;
  indices?: number[];
  text?: string;
  fileName?: string;
  fileSize?: string;
  fileKey?: string;
}

export function parseTryoutSnapshots(
  questionsSnapshot: unknown,
  answersSnapshot: unknown
): {
  questions: TryoutSnapshotQuestion[];
  answers: Record<string, TryoutSnapshotAnswer>;
} {
  let questions: TryoutSnapshotQuestion[] = [];
  if (typeof questionsSnapshot === "string") {
    try {
      const parsed = JSON.parse(questionsSnapshot);
      if (Array.isArray(parsed)) questions = parsed as TryoutSnapshotQuestion[];
    } catch {
      questions = [];
    }
  } else if (Array.isArray(questionsSnapshot)) {
    questions = questionsSnapshot as TryoutSnapshotQuestion[];
  }

  let answers: Record<string, TryoutSnapshotAnswer> = {};
  if (typeof answersSnapshot === "string") {
    try {
      const parsed = JSON.parse(answersSnapshot);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        answers = parsed as Record<string, TryoutSnapshotAnswer>;
      }
    } catch {
      answers = {};
    }
  } else if (answersSnapshot && typeof answersSnapshot === "object" && !Array.isArray(answersSnapshot)) {
    answers = answersSnapshot as Record<string, TryoutSnapshotAnswer>;
  }

  return { questions, answers };
}

interface TryoutQuestionCardProps {
  question: TryoutSnapshotQuestion;
  answer?: TryoutSnapshotAnswer;
  index: number;
  submissionId: string;
}

export function TryoutQuestionCard({
  question: q,
  answer: ans,
  index: idx,
  submissionId,
}: TryoutQuestionCardProps) {
  const tr = useTranslations("tutor.grading");
  const isEssay = q.type === "essay";
  const isMc = q.type === "multiple_choice" || q.type === "multiple_choices";
  const isShort = q.type === "short_answer";

  return (
    <article className="space-y-(--related-gap) py-(--row-padding)">
      <div className="flex items-start gap-2.5">
        <span className="w-5 shrink-0 font-mono text-body-sm font-medium tabular-nums text-muted-foreground">
          {idx + 1}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded-md text-body-2xs capitalize text-muted-foreground">
              {tr(q.type as "multiple_choice" | "multiple_choices" | "short_answer" | "essay")}
            </Badge>
            {!isEssay && (
              <Badge variant="secondary" className="rounded-md text-body-2xs">
                {tr("autoKey")}
              </Badge>
            )}
          </div>
          <MathText className="pt-2 text-body-base font-medium text-foreground" as="p">
            {q.prompt}
          </MathText>
        </div>
      </div>

      {isMc && q.options && (
        <ul className="divide-y divide-border/55 border-y border-border/55">
          {q.options.map((option, index) => {
            const isStudentChoice = q.type === "multiple_choice" ? ans?.index === index : ans?.indices?.includes(index);
            const isCorrect = q.type === "multiple_choice" ? q.correctIndex === index : q.correctIndices?.includes(index);

            return (
              <li
                key={index}
                className={`flex items-start gap-2.5 px-1 py-1.5 text-body-base ${isStudentChoice ? "bg-muted/35" : ""}`}
              >
                <span className="w-4 shrink-0 font-mono text-body-sm font-medium text-muted-foreground">
                  {String.fromCharCode(65 + index)}
                </span>
                <MathText className="min-w-0 flex-1 break-words leading-normal" as="span">
                  {option}
                </MathText>
                {(isCorrect || isStudentChoice) && (
                  <span className="flex shrink-0 items-center justify-end gap-1.5">
                    {isCorrect ? (
                      <>
                        <Check className="size-4 text-status-success" aria-hidden />
                        <span className="sr-only">{tr("correctAnswer")}</span>
                      </>
                    ) : (
                      <>
                        <X className="size-4 text-status-error" aria-hidden />
                        <span className="sr-only">{tr("incorrectAutomatic")}</span>
                      </>
                    )}
                    {isStudentChoice && (
                      <span className="text-body-xs text-muted-foreground">{tr("selectedAnswer")}</span>
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {isShort && (
        <div className="space-y-2">
          <div className="border-l-2 border-border pl-3 text-body-base">
            <span className="block text-body-xs font-semibold text-muted-foreground">
              {tr("studentAnswer")}
            </span>
            <p className="mt-0.5 text-body-base font-semibold text-foreground">
              <MathText as="span">{ans?.text || "-"}</MathText>
            </p>
          </div>
          <p className="text-body-base text-muted-foreground">
            {tr("correctAnswer")}{" "}
            <span className="font-semibold text-foreground">
              <MathText as="span">{(q.acceptableAnswers || []).join(" / ")}</MathText>
            </span>
          </p>
        </div>
      )}

      {isEssay && (
        <div className="space-y-(--compact-gap)">
          <div className="whitespace-pre-wrap border-l-2 border-border pl-3 text-body-base">
            <span className="mb-1 block text-body-xs font-semibold text-muted-foreground">
              {tr("essayAnswer")}
            </span>
            {ans?.text || (
              <span className="italic text-muted-foreground">{tr("noEssayAnswer")}</span>
            )}
          </div>

          {ans?.fileName && (
            <div className="flex flex-wrap items-center justify-between gap-(--related-gap) border-t border-border pt-3">
              <div className="flex min-w-0 items-center gap-(--compact-gap)">
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0">
                  <p className="max-w-[200px] truncate text-body-xs font-bold text-foreground md:max-w-xs">
                    {ans.fileName}
                  </p>
                  <p className="text-body-xs text-muted-foreground">
                    {ans.fileSize || tr("pdfImage")}
                  </p>
                </div>
              </div>
              {ans.fileKey ? (
                <Button
                  variant="outline"
                  size="xs"
                  asChild
                  className="gap-1 rounded-lg border-border/80 text-muted-foreground hover:text-foreground"
                >
                  <a
                    href={`/api/storage/file/${ans.fileKey.split("/").map(encodeURIComponent).join("/")}?download=1&submissionId=${encodeURIComponent(submissionId)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Download className="size-3.5" aria-hidden />
                    {tr("downloadFile")}
                  </a>
                </Button>
              ) : (
                <span className="shrink-0 text-body-xs italic text-muted-foreground">
                  {tr("fileUnavailable")}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
