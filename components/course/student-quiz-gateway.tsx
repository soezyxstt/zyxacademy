
import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Calendar, Clock } from "lucide-react";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { Reveal } from "@/components/ui/reveal";
import { Button } from "@/components/ui/button";
import { TranslatedText } from "@/components/i18n/translated-text";

export type QuizGatewayTemplate = { id: string; title: string; selectionRules: { count?: number }; timeLimitSeconds: number | null; maxAttempts: number | null };
export function StudentQuizGateway({ href = (path: string) => path,  id, courseTitle, template, completedAttempts, inProgressAttempt, questionsCount, startAction }: { href?: (path: string) => string;
  id: string;
  courseTitle: string;
  template: QuizGatewayTemplate;
  completedAttempts: { id: string; score: number | null; submittedAt: Date | null; durationSeconds: number | null }[];
  inProgressAttempt: { id: string } | null;
  questionsCount: number;
  startAction: ReactNode;
}) {

  const attemptsLeft = template.maxAttempts ? Math.max(0, template.maxAttempts - completedAttempts.length) : null;
  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "-";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m} menit ${s} detik` : `${s} detik`;
  };
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
            <h2 className="font-heading text-body-base font-bold text-foreground"><TranslatedText namespace="learning" messageKey="quizTake.instructionsTitle" /></h2>

            <dl className="grid grid-cols-2 gap-(--compact-gap) border-y border-border/55 py-(--row-padding) sm:grid-cols-3">
              <div>
                <dt className="text-body-xs text-muted-foreground"><TranslatedText namespace="learning" messageKey="quizTake.questionCount" /></dt>
                <dd className="text-body-sm font-semibold tabular-nums">{template.selectionRules?.count ?? 10}</dd>
              </div>

              <div>
                <dt className="text-body-xs text-muted-foreground"><TranslatedText namespace="learning" messageKey="quizTake.duration" /></dt>
                <dd className="text-body-sm font-semibold tabular-nums">
                  {template.timeLimitSeconds ? <TranslatedText namespace="learning" messageKey="quizList.minutes" values={{ count: Math.round(template.timeLimitSeconds / 60) }} /> : <TranslatedText namespace="learning" messageKey="quizList.noLimit" />}
                </dd>
              </div>

              <div className="col-span-2 sm:col-span-1">
                <dt className="text-body-xs text-muted-foreground"><TranslatedText namespace="learning" messageKey="quizTake.attemptsRemaining" /></dt>
                <dd className="text-body-sm font-semibold tabular-nums">
                  {template.maxAttempts ? <TranslatedText namespace="learning" messageKey="quizTake.attemptsLeft" values={{ remaining: attemptsLeft ?? 0, total: template.maxAttempts }} /> : <TranslatedText namespace="learning" messageKey="quizTake.unlimitedAttempts" />}
                </dd>
              </div>
            </dl>

            <div className="text-body-sm leading-relaxed text-muted-foreground">
              <ul className="list-disc pl-5 space-y-1">
                <li><TranslatedText namespace="learning" messageKey="quizTake.instructions.independent" /></li>
                <li><TranslatedText namespace="learning" messageKey="quizTake.instructions.timer" /></li>
                <li><TranslatedText namespace="learning" messageKey="quizTake.instructions.autosave" /></li>
                <li><TranslatedText namespace="learning" messageKey="quizTake.instructions.resume" /></li>
              </ul>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/55 pt-(--compact-gap)">
              <Button asChild variant="ghost">
                <Link href={href(`/courses/${id}/quiz`)}><TranslatedText namespace="learning" messageKey="quizTake.cancel" /></Link>
              </Button>
              {inProgressAttempt ? (
                <Button asChild className="bg-foreground text-background hover:bg-foreground/85">
                  <Link href={href(`/courses/${id}/quiz/${template.id}?attemptId=${inProgressAttempt.id}`)}>
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
              <h3 className="font-heading text-body-base font-bold text-foreground"><TranslatedText namespace="learning" messageKey="quizTake.attemptHistory" /></h3>
            </div>

            {completedAttempts.length === 0 ? (
              <div className="border-t border-border py-3">
                <p className="text-body-xs text-muted-foreground"><TranslatedText namespace="learning" messageKey="quizTake.noCompletedAttempts" /></p>
              </div>
            ) : (
              <ul className="divide-y divide-border/60 border-t border-border">
                {completedAttempts.map((attempt, idx) => (
                  <li key={attempt.id} className="py-(--row-padding)">
                    <div className="flex items-center justify-between">
                      <span className="text-body-xs font-bold text-foreground"><TranslatedText namespace="learning" messageKey="quizTake.attemptNumber" values={{ number: completedAttempts.length - idx }} /></span>
                      <span className="text-body-sm font-semibold tabular-nums">
                        {attempt.score != null ? `${attempt.score}%` : <TranslatedText namespace="learning" messageKey="results.pending" />}
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
                        <span><TranslatedText namespace="learning" messageKey="quizTake.durationValue" values={{ duration: formatDuration(attempt.durationSeconds) }} /></span>
                      </div>
                    </div>

                    <div className="mt-1 flex justify-end">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={href(`/courses/${id}/quiz/${template.id}?attemptId=${attempt.id}`)}>
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
