import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, BookOpen, Calendar, Clock } from "lucide-react";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { Reveal } from "@/components/ui/reveal";
import { Button } from "@/components/ui/button";
import { TranslatedText } from "@/components/i18n/translated-text";

export type QuizGatewayTemplate = {
  id: string;
  title: string;
  selectionRules: { count?: number };
  timeLimitSeconds: number | null;
  maxAttempts: number | null;
};

export function StudentQuizGateway({
  href = (path: string) => path,
  id,
  courseTitle,
  template,
  completedAttempts,
  inProgressAttempt,
  questionsCount,
  startAction,
  directReviewHref,
  hasOpenedDiscussionBeforeCompletion = false,
}: {
  href?: (path: string) => string;
  id: string;
  courseTitle: string;
  template: QuizGatewayTemplate;
  completedAttempts: {
    id: string;
    score: number | null;
    submittedAt: Date | null;
    durationSeconds: number | null;
  }[];
  inProgressAttempt: { id: string } | null;
  questionsCount: number;
  startAction: ReactNode;
  directReviewHref?: string | null;
  hasOpenedDiscussionBeforeCompletion?: boolean;
}) {
  const attemptsLeft = template.maxAttempts
    ? Math.max(0, template.maxAttempts - completedAttempts.length)
    : null;
  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "-";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m} menit ${s} detik` : `${s} detik`;
  };

  const showDirectReview = Boolean(directReviewHref) && questionsCount > 0;

  return (
    <CoursePageShell
      title={template.title}
      description={`${courseTitle} · Kuis Evaluasi`}
      hideHeader
    >
      <Reveal>
        <div className="grid min-w-0 gap-(--section-gap) font-sans lg:grid-cols-12">
          {/* Details Column */}
          <div className="min-w-0 space-y-(--related-gap) lg:col-span-8">
            <h2 className="font-heading text-body-base font-bold text-foreground">
              <TranslatedText namespace="learning" messageKey="quizTake.instructionsTitle" />
            </h2>

            <dl className="flex flex-col divide-y divide-border/40 border-y border-border/55 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-6 sm:gap-y-1.5 sm:divide-y-0 sm:py-2">
              <div className="flex items-baseline justify-between gap-3 py-1.5 sm:inline-flex sm:justify-start sm:gap-1.5 sm:py-0">
                <dt className="text-body-xs text-muted-foreground">
                  <TranslatedText namespace="learning" messageKey="quizTake.questionCount" />
                </dt>
                <dd className="text-body-sm font-semibold tabular-nums">
                  {template.selectionRules?.count ?? 10}
                </dd>
              </div>

              <div className="flex items-baseline justify-between gap-3 py-1.5 sm:inline-flex sm:justify-start sm:gap-1.5 sm:py-0">
                <dt className="text-body-xs text-muted-foreground">
                  <TranslatedText namespace="learning" messageKey="quizTake.duration" />
                </dt>
                <dd className="text-body-sm font-semibold tabular-nums">
                  {template.timeLimitSeconds ? (
                    <TranslatedText
                      namespace="learning"
                      messageKey="quizList.minutes"
                      values={{ count: Math.round(template.timeLimitSeconds / 60) }}
                    />
                  ) : (
                    <TranslatedText namespace="learning" messageKey="quizList.noLimit" />
                  )}
                </dd>
              </div>

              <div className="flex items-baseline justify-between gap-3 py-1.5 sm:inline-flex sm:justify-start sm:gap-1.5 sm:py-0">
                <dt className="text-body-xs text-muted-foreground">
                  <TranslatedText namespace="learning" messageKey="quizTake.attemptsRemaining" />
                </dt>
                <dd className="text-body-sm font-semibold tabular-nums">
                  {template.maxAttempts ? (
                    <TranslatedText
                      namespace="learning"
                      messageKey="quizTake.attemptsLeft"
                      values={{ remaining: attemptsLeft ?? 0, total: template.maxAttempts }}
                    />
                  ) : (
                    <TranslatedText namespace="learning" messageKey="quizTake.unlimitedAttempts" />
                  )}
                </dd>
              </div>
            </dl>

            <div className="text-body-sm leading-relaxed text-muted-foreground">
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  <TranslatedText
                    namespace="learning"
                    messageKey="quizTake.instructions.independent"
                  />
                </li>
                <li>
                  <TranslatedText namespace="learning" messageKey="quizTake.instructions.timer" />
                </li>
                <li>
                  <TranslatedText
                    namespace="learning"
                    messageKey="quizTake.instructions.autosave"
                  />
                </li>
                <li>
                  <TranslatedText namespace="learning" messageKey="quizTake.instructions.resume" />
                </li>
              </ul>
            </div>

            {showDirectReview && (
              <p className="text-body-xs text-muted-foreground">
                {hasOpenedDiscussionBeforeCompletion
                  ? "Pembahasan sudah dibuka sebelum mengerjakan; nilai tidak dihitung di leaderboard, namun pengerjaan tetap tercatat."
                  : "Anda dapat melihat pembahasan langsung tanpa mengerjakan terlebih dahulu; nilai pengerjaan selanjutnya tidak dihitung di leaderboard, namun pengerjaan tetap tercatat."}
              </p>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/55 pt-(--compact-gap)">
              <Button asChild variant="ghost">
                <Link href={href(`/courses/${id}/quiz`)}>
                  <TranslatedText namespace="learning" messageKey="quizTake.cancel" />
                </Link>
              </Button>
              {showDirectReview && directReviewHref && (
                <Button asChild variant="outline" className="gap-1.5">
                  <Link href={href(directReviewHref)}>
                    <BookOpen className="size-4" aria-hidden />
                    Lihat Pembahasan
                  </Link>
                </Button>
              )}
              {inProgressAttempt ? (
                <Button
                  asChild
                  className="bg-foreground text-background hover:bg-foreground/85"
                >
                  <Link
                    href={href(`/courses/${id}/quiz/${template.id}?attemptId=${inProgressAttempt.id}`)}
                  >
                    <TranslatedText namespace="learning" messageKey="quizList.continue" />
                  </Link>
                </Button>
              ) : template.maxAttempts && attemptsLeft !== null && attemptsLeft <= 0 ? (
                <div className="order-first flex w-full items-start gap-2 text-body-sm text-status-error">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  Batas percobaan maksimal telah tercapai. Anda tidak dapat memulai kuis ini lagi.
                </div>
              ) : questionsCount === 0 ? (
                <div className="order-first flex w-full items-start gap-2 text-body-sm text-status-error">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  Soal kuis belum tersedia untuk kelas ini. Hubungi pengajar Anda untuk mempublikasikan soal kuis.
                </div>
              ) : (
                startAction
              )}
            </div>
          </div>

          {/* Previous Attempts Sidebar */}
          <div className="min-w-0 space-y-(--compact-gap) lg:col-span-4 lg:border-l lg:border-border/55 lg:pl-(--section-gap)">
            <div>
              <h3 className="font-heading text-body-base font-bold text-foreground">
                <TranslatedText namespace="learning" messageKey="quizTake.attemptHistory" />
              </h3>
            </div>

            {completedAttempts.length === 0 ? (
              <div className="border-t border-border py-3">
                <p className="text-body-xs text-muted-foreground">
                  <TranslatedText namespace="learning" messageKey="quizTake.noCompletedAttempts" />
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border/60 border-t border-border">
                {completedAttempts.map((attempt, idx) => (
                  <li key={attempt.id} className="py-(--row-padding)">
                    <div className="flex items-center justify-between">
                      <span className="text-body-xs font-bold text-foreground">
                        <TranslatedText
                          namespace="learning"
                          messageKey="quizTake.attemptNumber"
                          values={{ number: completedAttempts.length - idx }}
                        />
                      </span>
                      <span className="text-body-sm font-semibold tabular-nums">
                        {attempt.score != null ? (
                          `${attempt.score}%`
                        ) : (
                          <TranslatedText namespace="learning" messageKey="results.pending" />
                        )}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-body-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="size-3" />
                        <span>
                          {attempt.submittedAt?.toLocaleDateString("id-ID", {
                            dateStyle: "medium",
                          })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="size-3" />
                        <span>
                          <TranslatedText
                            namespace="learning"
                            messageKey="quizTake.durationValue"
                            values={{ duration: formatDuration(attempt.durationSeconds) }}
                          />
                        </span>
                      </div>
                    </div>

                    <div className="mt-1 flex justify-end">
                      <Button asChild variant="ghost" size="sm">
                        <Link
                          href={href(`/courses/${id}/quiz/${template.id}?attemptId=${attempt.id}`)}
                        >
                          <TranslatedText namespace="learning" messageKey="summary.viewReview" />
                        </Link>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Reveal>
    </CoursePageShell>
  );
}
