
import Link from "next/link";
import { History, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormattedDate } from "@/components/ui/formatted-date";
import { TranslatedText } from "@/components/i18n/translated-text";
import { cn } from "@/lib/utils";

export type StudentResultRow = { id: string; examTitle: string; examType: "quiz" | "tryout"; status: string; score: number | null; submittedAt: string };
function statusBadge(status: string) {
  const map: Record<string, string> = {
    completed: "completed",
    pending_review: "pendingReview",
    graded: "graded",
    late: "late",
  };
  const key = map[status];
  return key ? <TranslatedText namespace="learning" messageKey={`results.status.${key}`} /> : status;
}

export function StudentCourseResultsList({ href = (path: string) => path,  id, allSubmissions }: { href?: (path: string) => string;  id: string; allSubmissions: StudentResultRow[] }) {

  if (allSubmissions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 p-8 sm:p-12 text-center max-w-md mx-auto">
        <History className="size-10 text-muted-foreground/40 mb-3" aria-hidden />
        <h3 className="font-heading text-body-base font-bold text-foreground">
          <TranslatedText namespace="learning" messageKey="results.emptyTitle" />
        </h3>
        <p className="mt-1 text-body-xs text-muted-foreground leading-relaxed">
          <TranslatedText namespace="learning" messageKey="results.emptyDescription" />
        </p>
        <Button asChild size="sm" className="mt-5 rounded-md text-body-xs">
          <Link href={href(`/courses/${id}/quiz`)}>
            <TranslatedText namespace="learning" messageKey="results.startPractice" />
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
      {allSubmissions.map((submission) => (
        <li key={submission.id}>
          <Link href={href(`/courses/${id}/my-results/${submission.id}`)} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30">
            <div className="min-w-0 flex-1 text-left">
              <h2 className="break-words font-heading text-body-base font-semibold text-foreground group-hover:text-primary">
                {submission.examTitle}
              </h2>
              <p className="mt-1 text-body-sm text-muted-foreground">
                <TranslatedText namespace="learning" messageKey={submission.examType === "quiz" ? "results.quiz" : "results.tryout"} />,{" "}
                <FormattedDate
                  date={submission.submittedAt}
                  options={{
                    dateStyle: "medium",
                    timeStyle: "short",
                  }}
                />
              </p>
              <span
                className={cn(
                  "mt-2 inline-flex rounded-md px-2.5 py-0.5 text-body-xs font-semibold ring-1 ring-border/60",
                  submission.status === "pending_review"
                    ? "bg-status-warning/12 text-status-warning"
                    : "bg-muted/80 text-muted-foreground",
                )}
              >
                {statusBadge(submission.status)}
              </span>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-heading text-h6 font-bold tabular-nums text-foreground">
                {submission.score != null ? `${submission.score}%` : <TranslatedText namespace="learning" messageKey="results.pending" />}
              </p>
            </div>
            <ChevronRight
              className="size-5 shrink-0 text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100"
              aria-hidden
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}
