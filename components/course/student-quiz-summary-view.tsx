import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen } from "lucide-react";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { Reveal } from "@/components/ui/reveal";
import { Button } from "@/components/ui/button";
import { TranslatedText } from "@/components/i18n/translated-text";
export function StudentQuizSummaryView({ title, reviewHref, historyHref, retryHref, pending, children }: { title: string; reviewHref: string; historyHref: string; retryHref: string; pending: boolean; children: ReactNode }) {
  return (
    <CoursePageShell
      title={<TranslatedText namespace="learning" messageKey="summary.title" />}
      description={title}
      hideHeader
    >
      <Reveal>
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-border/60">
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline" size="sm" className="rounded-md border-border/80 text-muted-foreground hover:text-foreground">
                <Link href={reviewHref}>
                  <ArrowLeft className="mr-1.5 size-4" />
                  <TranslatedText namespace="learning" messageKey="summary.viewReview" />
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm" className="rounded-md text-body-sm text-muted-foreground hover:text-foreground">
                <Link href={historyHref}>
                  <TranslatedText namespace="learning" messageKey="summary.examHistory" />
                </Link>
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button asChild variant="secondary" size="sm" className="rounded-md">
                <Link href={retryHref}>
                  <BookOpen className="mr-1.5 size-4" />
                  <TranslatedText namespace="learning" messageKey="summary.retryQuiz" />
                </Link>
              </Button>
            </div>
          </div>

          {pending ? (
            <div className="rounded-xl border border-border bg-card p-6 text-center space-y-4">
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
        </div>
      </Reveal>
    </CoursePageShell>
  );
}
