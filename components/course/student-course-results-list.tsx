
import Link from "next/link";
import { History } from "lucide-react";
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
      <div className="flex max-w-xl items-start gap-3 border-t border-border/55 py-(--group-gap)">
        <History className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <h3 className="font-heading text-body-base font-bold text-foreground">
            <TranslatedText namespace="learning" messageKey="results.emptyTitle" />
          </h3>
          <p className="mt-1 text-body-xs text-muted-foreground leading-relaxed">
            <TranslatedText namespace="learning" messageKey="results.emptyDescription" />
          </p>
          <Button asChild size="sm" variant="secondary" className="mt-(--compact-gap)">
            <Link href={href(`/courses/${id}/quiz`)}>
              <TranslatedText namespace="learning" messageKey="results.startPractice" />
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border/30">
      {allSubmissions.map((submission) => (
        <li key={submission.id}>
          <Link href={href(`/courses/${id}/my-results/${submission.id}`)} className="-mx-2 flex items-start gap-3 rounded-md px-2 py-(--row-padding) transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring">
            <div className="min-w-0 flex-1 text-left">
              <h2 className="wrap-anywhere font-heading text-body-base font-semibold text-foreground">
                {submission.examTitle}
              </h2>
              <div className="mt-0.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-body-xs text-muted-foreground">
                <span>
                  <TranslatedText namespace="learning" messageKey={submission.examType === "quiz" ? "results.quiz" : "results.tryout"} />, {" "}
                  <FormattedDate date={submission.submittedAt} options={{ dateStyle: "medium", timeStyle: "short" }} />
                </span>
                {!(submission.score == null && submission.status === "pending_review") && (
                  <span className={cn(submission.status === "pending_review" && "text-status-warning")}>
                    {statusBadge(submission.status)}
                  </span>
                )}
              </div>
            </div>
            {submission.score != null ? (
              <span className="shrink-0 text-body-sm font-semibold tabular-nums">{submission.score}%</span>
            ) : (
              <span className="max-w-24 shrink-0 text-right text-body-xs text-muted-foreground">
                {submission.status === "pending_review" ? statusBadge(submission.status) : <TranslatedText namespace="learning" messageKey="results.pending" />}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
