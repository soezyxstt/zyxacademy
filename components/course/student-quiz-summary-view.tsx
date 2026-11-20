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
          <div className="py-5 text-center space-y-3">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <BookOpen className="size-6" />
            </div>
            <div className="space-y-1 max-w-md mx-auto">
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
