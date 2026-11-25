"use client";

import { Download, FileText } from "lucide-react";
import { useTranslations } from "@/lib/i18n/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MathText } from "@/components/course/math-text";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import type { QuestionDetail } from "@/features/grading/model/types";

interface QuizQuestionContentProps {
  question: QuestionDetail;
}

export function QuizQuestionContent({
  question: q,
}: QuizQuestionContentProps) {
  const tr = useTranslations("tutor.grading");

  const typeLabel =
    q.questionType === "essay"
      ? tr("essay")
      : q.questionType === "short_answer"
      ? tr("shortAnswer")
      : tr("multipleChoice");

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-heading text-body-sm font-bold text-foreground">
            {tr("questionNumber", { number: q.index })}
          </span>
          <Badge variant="outline" className="rounded-md text-body-xs font-medium">
            {typeLabel}
          </Badge>
        </div>

        {!q.isFreeResponse ? (
          <Badge
            variant={q.isDeterministicCorrect ? "default" : "outline"}
            className={
              q.isDeterministicCorrect
                ? "rounded-md text-body-xs"
                : "rounded-md border-destructive/50 text-body-xs text-destructive"
            }
          >
            {q.isDeterministicCorrect ? tr("correctAutomatic") : tr("incorrectAutomatic")}
          </Badge>
        ) : q.isShortAnswer ? (
          <Badge
            variant="outline"
            className="rounded-md border-border text-body-xs text-muted-foreground"
          >
            {q.isDeterministicCorrect ? tr("keyMatched") : tr("keyNotMatched")}
          </Badge>
        ) : (
          <Badge
            variant={q.currentScore !== null ? "default" : "secondary"}
            className="rounded-md text-body-xs"
          >
            {q.currentScore !== null ? tr("scored", { score: q.currentScore }) : tr("mustGrade")}
          </Badge>
        )}
      </div>

      <MarkdownRenderer content={q.prompt} />

      {q.acceptableAnswers && q.acceptableAnswers.length > 0 && (
        <div className="text-body-base text-muted-foreground">
          <span className="font-semibold text-foreground">{tr("referenceAnswer")} </span>
          {q.acceptableAnswers.join(", ")}
        </div>
      )}

      <div className="space-y-1.5">
        <span className="text-body-xs font-semibold text-muted-foreground">
          {tr("studentAnswer")}
        </span>
        <div className="whitespace-pre-wrap border-l-2 border-border pl-3 text-body-base text-foreground">
          {q.submittedText ? (
            <MathText>{q.submittedText}</MathText>
          ) : (
            <span className="italic text-muted-foreground">{tr("noAnswer")}</span>
          )}
        </div>
      </div>

      {q.fileName && (
        <div className="flex flex-wrap items-center justify-between gap-(--compact-gap) border-t border-border/55 pt-(--compact-gap)">
          <div className="flex min-w-0 items-center gap-2.5">
            <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <p className="max-w-[200px] truncate text-body-xs font-bold text-foreground md:max-w-xs">
                {q.fileName}
              </p>
              <p className="text-body-xs text-muted-foreground">
                {q.fileSize || tr("pdfImage")} · {tr("cloudStorage")}
              </p>
            </div>
          </div>
          {q.fileKey ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-lg" asChild>
                    <a
                      href={`/api/storage/file/${q.fileKey.split("/").map(encodeURIComponent).join("/")}?download=1`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={tr("downloadFile")}
                    >
                      <Download aria-hidden />
                    </a>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{tr("downloadFile")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <span className="shrink-0 text-body-xs italic text-muted-foreground">
              {tr("fileUnavailable")}
            </span>
          )}
        </div>
      )}
    </>
  );
}
