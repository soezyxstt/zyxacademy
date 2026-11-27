import { Landmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatQuestionSourceCitation } from "@/lib/asesmen/question-provenance";

type QuestionSourceCitationProps = {
  origin?: string | null;
  sourceEventName?: string | null;
  className?: string;
};

export function QuestionSourceCitation({ origin, sourceEventName, className }: QuestionSourceCitationProps) {
  const label = formatQuestionSourceCitation(origin, sourceEventName);
  if (!label) return null;

  return (
    <div className={cn("mt-5 flex justify-end border-t border-border/70 pt-3", className)}>
      <p className="flex items-center gap-1.5 text-right text-body-xs font-medium text-muted-foreground">
        <Landmark className="size-3.5 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </p>
    </div>
  );
}
