import type { ReactNode } from "react";
import Link from "next/link";
import { BookOpen, History, RotateCcw } from "lucide-react";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { Reveal } from "@/components/ui/reveal";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TranslatedText } from "@/components/i18n/translated-text";
export function StudentQuizSummaryView({ title, reviewHref, historyHref, retryHref, pending, children }: { title: string; reviewHref: string; historyHref: string; retryHref: string; pending: boolean; children: ReactNode }) {
  return (
    <CoursePageShell
      title={<TranslatedText namespace="learning" messageKey="summary.title" />}
      description={title}
      backHref={reviewHref}
      backLabel={<TranslatedText namespace="learning" messageKey="summary.viewReview" />}
      actions={(
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild variant="ghost" size="icon-lg">
                <Link href={historyHref}>
                  <History aria-hidden />
                  <span className="sr-only"><TranslatedText namespace="learning" messageKey="summary.examHistory" /></span>
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent><TranslatedText namespace="learning" messageKey="summary.examHistory" /></TooltipContent>
          </Tooltip>
          <Button asChild variant="secondary" size="lg">
            <Link href={retryHref}>
              <RotateCcw aria-hidden />
              <TranslatedText namespace="learning" messageKey="summary.retryQuiz" />
            </Link>
          </Button>
        </TooltipProvider>
      )}
    >
      <Reveal>
        {pending ? (
          <div role="status" className="flex max-w-xl items-start gap-3 border-t border-border/55 py-(--group-gap)">
            <BookOpen className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 space-y-1">
              <h3 className="font-heading text-body-base font-bold text-foreground">
                <TranslatedText namespace="learning" messageKey="summary.pendingTitle" />
              </h3>
              <p className="text-body-sm text-muted-foreground">
                <TranslatedText namespace="learning" messageKey="summary.pendingDescription" />
              </p>
            </div>
          </div>
        ) : (
          children
        )}
      </Reveal>
    </CoursePageShell>
  );
}
