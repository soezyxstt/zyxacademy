
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
      <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 py-12 text-center">
        <div className="mx-auto flex max-w-md flex-col items-center">
          <History className="size-10 text-muted-foreground/40 mb-3" aria-hidden />
          <h3 className="font-heading text-body-base font-bold text-foreground">
            <TranslatedText namespace="learning" messageKey="results.emptyTitle" />
          </h3>
          <p className="mt-1 text-body-xs text-muted-foreground leading-relaxed">
            <TranslatedText namespace="learning" messageKey="results.emptyDescription" />
          </p>
          <Button asChild size="sm" className="mt-5 rounded-md text-body-sm">
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
          <Link href={href(`/courses/${id}/my-results/${submission.id}`)} className="group -mx-2.5 flex items-center gap-3 rounded-lg px-2.5 py-3 transition-colors hover:bg-muted/40">
            <div className="min-w-0 flex-1 text-left">
              <h2 className="break-words font-heading text-body-base font-semibold text-foreground transition-colors group-hover:text-brand-primary">
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
                  "mt-2 inline-flex rounded-md px-2.5 py-0.5 text-body-xs font-semibold ring-1 ring-border/40",
                  submission.status === "pending_review"
                    ? "bg-status-warning/12 text-status-warning"
                    : "bg-muted/60 text-muted-foreground",
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
              className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
              aria-hidden
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}
