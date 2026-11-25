"use client";

import { Check } from "lucide-react";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { MathText } from "@/components/course/math-text";
import { useTranslations } from "@/lib/i18n/client";

interface TutorQuestionOptionPreviewProps {
  options: readonly string[];
  correctIndices: readonly number[];
  format?: "math" | "markdown";
}

export function TutorQuestionOptionPreview({
  options,
  correctIndices,
  format = "math",
}: TutorQuestionOptionPreviewProps) {
  const t = useTranslations("tutor.grading");

  return (
    <ul className="mt-(--compact-gap) divide-y divide-border/55 border-y border-border/55">
      {options.map((option, index) => (
        <li key={index} className="flex items-start gap-2.5 px-1 py-1.5 text-body-sm">
          <span className="w-4 shrink-0 font-mono font-medium text-muted-foreground">
            {String.fromCharCode(65 + index)}
          </span>
          <div className="min-w-0 flex-1 break-words leading-normal">
            {format === "markdown"
              ? <MarkdownRenderer content={option} density="compact" />
              : <MathText as="span">{option}</MathText>}
          </div>
          {correctIndices.includes(index) && (
            <>
              <Check className="mt-0.5 size-4 shrink-0 text-status-success" aria-hidden />
              <span className="sr-only">{t("correctAnswer")}</span>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
