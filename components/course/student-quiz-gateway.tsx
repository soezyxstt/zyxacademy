
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
        <div className="grid grid-cols-1 gap-6 font-sans lg:grid-cols-12">

          {/* Details Column */}
          <div className="space-y-5 lg:col-span-8">
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="font-heading text-body-base font-bold text-foreground"><TranslatedText namespace="learning" messageKey="quizTake.instructionsTitle" /></h2>

              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 border-y border-border/60 py-4 text-center">
                <div>
                  <span className="block text-body-xs font-semibold text-muted-foreground uppercase tracking-wide"><TranslatedText namespace="learning" messageKey="quizTake.questionCount" /></span>
                  <span className="font-heading text-h6 font-bold text-foreground">
                    {((template.selectionRules as { count?: number })?.count ?? 10)} Soal
                  </span>
                </div>

                <div>
                  <span className="block text-body-xs font-semibold text-muted-foreground uppercase tracking-wide"><TranslatedText namespace="learning" messageKey="quizTake.duration" /></span>
                  <span className="font-heading text-h6 font-bold text-foreground">
                    {template.timeLimitSeconds ? <TranslatedText namespace="learning" messageKey="quizList.minutes" values={{ count: Math.round(template.timeLimitSeconds / 60) }} /> : <TranslatedText namespace="learning" messageKey="quizList.noLimit" />}
                  </span>
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <span className="block text-body-xs font-semibold text-muted-foreground uppercase tracking-wide"><TranslatedText namespace="learning" messageKey="quizTake.attemptsRemaining" /></span>
                  <span className="font-heading text-h6 font-bold text-foreground">
                    {template.maxAttempts ? <TranslatedText namespace="learning" messageKey="quizTake.attemptsLeft" values={{ remaining: attemptsLeft ?? 0, total: template.maxAttempts }} /> : <TranslatedText namespace="learning" messageKey="quizTake.unlimitedAttempts" />}
                  </span>
                </div>
              </div>

              <div className="mt-5 space-y-3 text-body-sm text-muted-foreground leading-relaxed">
                <ul className="list-disc pl-5 space-y-1">
                  <li><TranslatedText namespace="learning" messageKey="quizTake.instructions.independent" /></li>
                  <li><TranslatedText namespace="learning" messageKey="quizTake.instructions.timer" /></li>
                  <li><TranslatedText namespace="learning" messageKey="quizTake.instructions.autosave" /></li>
                  <li><TranslatedText namespace="learning" messageKey="quizTake.instructions.resume" /></li>
                </ul>
              </div>

              {/* Action buttons */}
              <div className="mt-6 flex flex-wrap items-center gap-3">
                {inProgressAttempt ? (
                  <Button asChild className="bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-md interactive shadow-sm">
                    <Link href={href(`/courses/${id}/quiz/${template.id}?attemptId=${inProgressAttempt.id}`)}>
                      Lanjutkan Kuis
                    </Link>
                  </Button>
                ) : template.maxAttempts && attemptsLeft !== null && attemptsLeft <= 0 ? (
                  <div className="flex items-center gap-2 text-status-error font-semibold text-body-sm bg-status-error/10 p-3 rounded-lg border border-status-error/20 w-full justify-center">
                    <AlertTriangle className="size-4" />
                    Batas percobaan maksimal telah tercapai. Anda tidak dapat memulai kuis ini lagi.
                  </div>
                ) : questionsCount === 0 ? (
                  <div className="flex items-center gap-2 text-status-error font-semibold text-body-sm bg-status-error/10 p-3 rounded-lg border border-status-error/20 w-full justify-center">
                    <AlertTriangle className="size-4" />
                    Soal kuis belum tersedia untuk kelas ini. Hubungi pengajar Anda untuk mempublikasikan soal kuis.
                  </div>
                ) : (
                  startAction
                )}

                <Button asChild variant="outline" className="border-border/80 rounded-md">
                  <Link href={href(`/courses/${id}/quiz`)}><TranslatedText namespace="learning" messageKey="quizTake.cancel" /></Link>
                </Button>
              </div>
            </div>
          </div>

          {/* Previous Attempts Sidebar */}
          <div className="space-y-4 lg:col-span-4 lg:border-l lg:border-border lg:pl-6">
            <div>
              <h3 className="font-heading text-body-base font-bold text-foreground"><TranslatedText namespace="learning" messageKey="quizTake.attemptHistory" /></h3>
            </div>

            {completedAttempts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/80 bg-muted/10 p-5 text-center">
                <p className="text-body-xs text-muted-foreground"><TranslatedText namespace="learning" messageKey="quizTake.noCompletedAttempts" /></p>
              </div>
            ) : (
              <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card">
                {completedAttempts.map((attempt, idx) => (
                  <li key={attempt.id} className="p-3.5 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-body-xs font-bold text-foreground"><TranslatedText namespace="learning" messageKey="quizTake.attemptNumber" values={{ number: completedAttempts.length - idx }} /></span>
                      <span className="font-heading text-body-base font-bold text-brand-primary">{attempt.score}%</span>
                    </div>

                    <div className="mt-2 space-y-1 text-body-xs text-muted-foreground">
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

                    <div className="mt-3">
                      <Button asChild variant="outline" size="sm" className="w-full rounded-md font-semibold text-body-xs border-border/80">
                        <Link href={href(`/courses/${id}/quiz/${template.id}?attemptId=${attempt.id}`)}>
                          Lihat Pembahasan
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
