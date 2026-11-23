"use client";

import { Download, FileText } from "lucide-react";
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
  singleColumnOptions?: boolean;
}

export function TryoutQuestionCard({
  question: q,
  answer: ans,
  index: idx,
  submissionId,
  singleColumnOptions = false,
}: TryoutQuestionCardProps) {
  const tr = useTranslations("tutor.grading");
  const isEssay = q.type === "essay";
  const isMc = q.type === "multiple_choice" || q.type === "multiple_choices";
  const isShort = q.type === "short_answer";

  return (
    <article className="space-y-(--related-gap) py-(--row-padding)">
      <div className="flex items-start gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary font-mono text-body-sm font-bold text-primary-foreground shadow-xs">
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
        <div className={singleColumnOptions ? "grid grid-cols-1 gap-2" : "grid gap-2 sm:grid-cols-2 sm:pl-9"}>
          {q.options.map((opt: string, i: number) => {
            const isStudentChoice =
              q.type === "multiple_choice"
                ? ans?.index === i
                : ans?.indices?.includes(i);
            const isCorrect =
              q.type === "multiple_choice"
                ? q.correctIndex === i
                : q.correctIndices?.includes(i);

            return (
              <div
                key={i}
                className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-body-base ${
                  isStudentChoice && isCorrect
                    ? "border-emerald-500/25 bg-emerald-500/5 text-emerald-700"
                    : isStudentChoice && !isCorrect
                    ? "border-rose-500/25 bg-rose-500/5 text-rose-700"
                    : !isStudentChoice && isCorrect
                    ? "border-dashed border-emerald-500/20 bg-emerald-500/5 text-muted-foreground"
                    : "border-border/50 bg-muted/10 text-muted-foreground"
                }`}
              >
                <span
                  className={`flex size-5 shrink-0 items-center justify-center rounded-md text-body-2xs font-bold ${
                    isStudentChoice && isCorrect
                      ? "bg-emerald-500 text-white"
                      : isStudentChoice && !isCorrect
                      ? "bg-rose-500 text-white"
                      : isCorrect
                      ? "border border-emerald-500 text-emerald-500"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="min-w-0 break-words">
                  <MathText className="leading-normal" as="span">
                    {opt}
                  </MathText>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {isShort && (
        <div className={singleColumnOptions ? "space-y-2" : "space-y-2 sm:pl-9"}>
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
        <div className={singleColumnOptions ? "space-y-(--compact-gap)" : "space-y-(--compact-gap) sm:pl-9"}>
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
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-status-success/10 text-status-success">
                  <FileText className="size-5" aria-hidden />
                </span>
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
