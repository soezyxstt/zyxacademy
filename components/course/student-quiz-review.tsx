import Link from "next/link";
import { Calendar, Award, Clock, ArrowLeft, CheckCircle2, XCircle, FileText, Download, Check } from "lucide-react";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { Reveal } from "@/components/ui/reveal";
import { Button } from "@/components/ui/button";
import { TranslatedText } from "@/components/i18n/translated-text";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { MathText } from "@/components/course/math-text";
import { cn } from "@/lib/utils";
import { FormattedDate } from "@/components/ui/formatted-date";
import { MistakeFeedbackButton } from "@/components/pka/mistake-feedback-button";
import { isShortAnswerCorrect, deduplicateAcceptableAnswers } from "@/lib/quiz/short-answer";
import { QuestionSourceCitation } from "@/components/course/question-source-citation";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";
export type StudentReviewQuestion = { id: string; prompt: string; options: string[]; correct_indices: number[]; explanation: string; difficulty: string; origin?: "zyx_original" | "historical_reference" | "itb_example"; sourceEventName?: string | null; sourceReferenceId?: string | null; gradedCorrect?: boolean };
function formatDuration(seconds: number | null) {
  if (seconds == null) return "-";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m} menit ${s} detik` : `${s} detik`;
}
export function StudentQuizReview({ href = (path: string) => path,  id, quizId, template, targetAttempt, snapshot, answers, unseenSnapshot = [], discussionAvailable = true }: { href?: (path: string) => string;
 id: string; quizId: string; template: { title: string };
 targetAttempt: { id: string; score: number | null; durationSeconds: number | null; submittedAt: Date | string | null; gradingStatus?: string | null } | null;
 snapshot: StudentReviewQuestion[]; answers: Record<string, any>; unseenSnapshot?: StudentReviewQuestion[];
 discussionAvailable?: boolean;
}) {

    return (
      <CoursePageShell
        title={<TranslatedText namespace="learning" messageKey={targetAttempt ? "quizTake.analysisTitle" : "quizTake.reviewTitle"} />}
        description={template.title}
        hideHeader
      >
        <Reveal>
          <div className="space-y-6 font-sans">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button asChild variant="outline" size="sm" className="rounded-md border-border/80 text-muted-foreground">
                <Link href={href(`/courses/${id}/quiz/${quizId}`)}>
                  <ArrowLeft className="mr-1.5 size-4" />
                  Kembali Ke Kuis
                </Link>
              </Button>

              {targetAttempt && discussionAvailable && (
                <Button asChild size="sm" className="rounded-md bg-brand-primary text-primary-foreground hover:bg-brand-primary/90 font-semibold shadow-xs">
                  <Link href={href(`/courses/${id}/quiz/${quizId}/summary/${targetAttempt.id}`)}>
                    Lihat Diagnosis & Rencana Belajar
                  </Link>
                </Button>
              )}
            </div>

            {targetAttempt && (
              <AdminStatStrip className="sm:grid-cols-3">
                <AdminStatStripItem icon={Award} label={<TranslatedText namespace="learning" messageKey="quizTake.finalScore" />} value={targetAttempt.score == null ? "-" : `${targetAttempt.score}%`} tone="brand" />
                <AdminStatStripItem icon={Clock} label={<TranslatedText namespace="learning" messageKey="quizTake.duration" />} value={formatDuration(targetAttempt.durationSeconds)} tone="info" />
                <AdminStatStripItem
                  icon={Calendar}
                  label={<TranslatedText namespace="learning" messageKey="quizTake.submittedAt" />}
                  value={targetAttempt.submittedAt ? (
                    <FormattedDate
                      date={targetAttempt.submittedAt}
                      options={{ dateStyle: "medium", timeStyle: "short" }}
                    />
                  ) : "-"}
                  tone="brand-secondary"
                />
              </AdminStatStrip>
            )}

            {targetAttempt && !discussionAvailable && (
              <p className="text-body-sm text-muted-foreground">Pembahasan tidak tersedia saat ini.</p>
            )}

            {!targetAttempt && (
              <div className="rounded-xl border border-brand-primary/30 bg-brand-primary/5 p-5 text-center">
                <h3 className="font-heading text-body-base font-bold text-brand-primary"><TranslatedText namespace="learning" messageKey="quizTake.fullDiscussion" /></h3>
                <p className="mt-1 text-body-sm text-brand-primary/80">
                  Anda tidak mengerjakan kuis ini. Berikut adalah seluruh kumpulan soal yang mungkin muncul pada kuis ini beserta penjelasannya.
                </p>
              </div>
            )}

            {/* Answered Questions */}
            {snapshot.length > 0 && (
              <div className="space-y-6">
                <h2 className="font-heading text-body-base font-bold text-foreground border-b border-border/60 pb-2">
                  Soal yang Anda Kerjakan
                </h2>
                {snapshot.map((q, idx) => {
                  const rawSubmitted = answers[q.id];
                  const qType = (q as any).question_type || (q as any).questionType || (q as any).type;
                  const studentSelected = Array.isArray(rawSubmitted)
                    ? rawSubmitted
                    : typeof rawSubmitted === "number"
                    ? [rawSubmitted]
                    : [];

                  const correctIndices = q.correct_indices ?? (q as any).correctIndices ?? [];

                  const submittedText = typeof rawSubmitted === "string"
                    ? rawSubmitted
                    : rawSubmitted && typeof rawSubmitted === "object" && "text" in rawSubmitted && typeof rawSubmitted.text === "string"
                    ? rawSubmitted.text
                    : Array.isArray(rawSubmitted)
                    ? String(rawSubmitted[0] ?? "")
                    : "";

                  const submittedFileKey = rawSubmitted && typeof rawSubmitted === "object" && "fileKey" in rawSubmitted && typeof rawSubmitted.fileKey === "string"
                    ? rawSubmitted.fileKey
                    : null;

                  const submittedFileName = rawSubmitted && typeof rawSubmitted === "object" && "fileName" in rawSubmitted && typeof rawSubmitted.fileName === "string"
                    ? rawSubmitted.fileName
                    : null;

                  const submittedFileSize = rawSubmitted && typeof rawSubmitted === "object" && "fileSize" in rawSubmitted && typeof rawSubmitted.fileSize === "string"
                    ? rawSubmitted.fileSize
                    : null;

                  const isMultiple = qType === "multiple_choices" || correctIndices.length > 1;
                  let isCorrect = false;
                  if (qType === "short_answer" || (Array.isArray((q as any).acceptable_answers) && (q as any).acceptable_answers.length > 0)) {
                    isCorrect = isShortAnswerCorrect(submittedText, (q as any).acceptable_answers);
                  } else if (qType === "essay") {
                    isCorrect = submittedText.trim().length > 0 || Boolean(submittedFileKey);
                  } else if (!isMultiple && (qType === "multiple_choice" || !qType)) {
                    const firstIdx = studentSelected[0];
                    isCorrect = firstIdx !== undefined && correctIndices.includes(firstIdx);
                  } else {
                    isCorrect =
                      studentSelected.length === correctIndices.length &&
                      studentSelected.every((val: number) => correctIndices.includes(val));
                  }

                  if (typeof q.gradedCorrect === "boolean") isCorrect = q.gradedCorrect;
                  const isEssayPending = qType === "essay" && targetAttempt?.gradingStatus === "pending";

                  return (
                    <div
                      key={q.id}
                      className={cn(
                        "rounded-xl border border-border/80 bg-card p-5 shadow-2xs transition-all relative overflow-hidden",
                        isEssayPending
                          ? "border-brand-secondary/30 bg-brand-secondary/5"
                          : isCorrect
                          ? "border-status-success/30 bg-status-success/5"
                          : "border-status-error/20 bg-status-error/5"
                      )}
                    >
                      <div
                        className={cn(
                          "absolute top-0 left-0 w-1 h-full",
                          isEssayPending
                            ? "bg-brand-secondary"
                            : isCorrect
                            ? "bg-status-success"
                            : "bg-status-error"
                        )}
                      />

                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-2.5">
                          <span className={cn(
                            "flex size-7 shrink-0 items-center justify-center rounded-lg text-body-sm font-bold text-white shadow-xs",
                            isEssayPending
                              ? "bg-brand-secondary"
                              : isCorrect
                              ? "bg-status-success"
                              : "bg-status-error"
                          )}>
                            {idx + 1}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "text-body-xs font-semibold uppercase tracking-wider",
                                q.difficulty === "easy" && "text-status-success",
                                q.difficulty === "medium" && "text-status-warning",
                                q.difficulty === "hard" && "text-status-error"
                              )}>
                                {q.difficulty}
                              </span>
                              {qType === "essay" ? (
                                isEssayPending ? (
                                  <span className="inline-flex items-center gap-0.5 text-body-xs text-brand-secondary font-semibold">
                                    <Clock className="size-3.5" /> Menunggu Koreksi
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-0.5 text-body-xs text-status-success font-semibold">
                                    <CheckCircle2 className="size-3.5" /> Telah Dinilai
                                  </span>
                                )
                              ) : isCorrect ? (
                                <span className="inline-flex items-center gap-0.5 text-body-xs text-status-success font-semibold">
                                  <CheckCircle2 className="size-3.5" /> Benar
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-0.5 text-body-xs text-status-error font-semibold">
                                  <XCircle className="size-3.5" /> Salah
                                </span>
                              )}
                            </div>
                            <div className="mt-2 text-body-base leading-relaxed text-foreground/90 font-medium">
                              <MarkdownRenderer content={q.prompt} className="space-y-3" />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Content rendering depending on question type */}
                      {qType === "short_answer" ? (
                        <div className="mt-4 pl-9 space-y-2.5">
                          <div className="rounded-lg border border-border bg-background/60 p-3">
                            <span className="text-body-2xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                              Jawaban Anda:
                            </span>
                            <div className="text-body-sm font-medium text-foreground">
                              {submittedText.trim() ? (
                                <MathText as="span">{submittedText.trim()}</MathText>
                              ) : (
                                <span className="text-muted-foreground italic">(Tidak menjawab)</span>
                              )}
                            </div>
                          </div>
                          {Array.isArray((q as any).acceptable_answers) && (q as any).acceptable_answers.length > 0 && (() => {
                            const displayAnswers = deduplicateAcceptableAnswers((q as any).acceptable_answers);
                            if (displayAnswers.length === 0) return null;
                            return (
                              <div className="rounded-lg border border-status-success/30 bg-status-success/5 p-3 space-y-2">
                                <span className="text-body-2xs font-semibold uppercase tracking-wider text-status-success block">
                                  Kunci Jawaban yang Diterima{displayAnswers.length > 1 ? ` (${displayAnswers.length} variasi format)` : ""}:
                                </span>
                                <div className="flex flex-wrap gap-2 pt-0.5">
                                  {displayAnswers.map((ans, aIdx) => (
                                    <div
                                      key={aIdx}
                                      className="inline-flex items-center gap-1.5 rounded-md border border-status-success/25 bg-background/80 px-2.5 py-1 text-body-sm font-medium text-foreground shadow-2xs"
                                    >
                                      <Check className="size-3.5 text-status-success shrink-0" />
                                      <MathText as="span">{ans}</MathText>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      ) : qType === "essay" ? (
                        <div className="mt-4 pl-9 space-y-3">
                          <div className="rounded-lg border border-border bg-background/60 p-3.5">
                            <span className="text-body-2xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                              Jawaban Esai Anda:
                            </span>
                            <p className="text-body-sm font-medium text-foreground whitespace-pre-wrap leading-relaxed">
                              {submittedText.trim() || <span className="text-muted-foreground italic">(Tidak menuliskan esai teks)</span>}
                            </p>
                          </div>

                          {submittedFileName && (
                            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/80 bg-card p-3">
                              <div className="flex min-w-0 items-center gap-2.5">
                                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-status-success/10 text-status-success">
                                  <FileText className="size-4" />
                                </span>
                                <div className="min-w-0">
                                  <p className="max-w-[200px] truncate text-body-xs font-bold text-foreground md:max-w-xs">{submittedFileName}</p>
                                  <p className="text-body-2xs text-muted-foreground">{submittedFileSize || <TranslatedText namespace="learning" messageKey="quizTake.pdfOrImage" />} • Cloudflare R2</p>
                                </div>
                              </div>
                              {submittedFileKey ? (
                                <Button
                                  variant="outline"
                                  size="xs"
                                  asChild
                                  className="gap-1 rounded-md border-border/80 text-muted-foreground hover:text-foreground"
                                >
                                  <a
                                    href={`/api/storage/file/${submittedFileKey.split("/").map(encodeURIComponent).join("/")}?download=1`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <Download className="size-3.5" />
                                    Unduh Lampiran
                                  </a>
                                </Button>
                              ) : null}
                            </div>
                          )}

                          {isEssayPending ? (
                            <div className="flex items-center gap-2 rounded-lg border border-brand-secondary/30 bg-brand-secondary/5 p-3 text-body-xs text-brand-secondary">
                              <Clock className="size-4 shrink-0" />
                              <span><TranslatedText namespace="learning" messageKey="quizTake.essayPending" /></span>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        /* Options list for Multiple Choice */
                        <ul className="mt-4 pl-9 space-y-2">
                          {q.options.map((opt, i) => {
                            const isStudentChoice = studentSelected.includes(i);
                            const isCorrectChoice = correctIndices.includes(i);

                            return (
                              <li
                                key={i}
                                className={cn(
                                  "flex items-center gap-3 rounded-lg border px-4 py-2.5 text-body-sm font-medium leading-normal",
                                  isStudentChoice && isCorrectChoice
                                    ? "border-status-success bg-status-success/10 text-status-success"
                                    : isStudentChoice && !isCorrectChoice
                                    ? "border-status-error bg-status-error/10 text-status-error"
                                    : !isStudentChoice && isCorrectChoice
                                    ? "border-status-success/50 border-dashed bg-status-success/5 text-foreground"
                                    : "border-border bg-background/50 text-muted-foreground"
                                )}
                              >
                                <span className={cn(
                                  "flex size-6 shrink-0 items-center justify-center rounded-full text-body-xs font-bold font-sans",
                                  isStudentChoice && isCorrectChoice
                                    ? "bg-status-success text-white"
                                    : isStudentChoice && !isCorrectChoice
                                    ? "bg-status-error text-white"
                                    : isCorrectChoice
                                    ? "border border-status-success text-status-success"
                                    : "bg-muted text-muted-foreground"
                                )}>
                                  {String.fromCharCode(65 + i)}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <MarkdownRenderer content={opt} className="space-y-3" />
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      {/* Explanation box */}
                      {q.explanation && (
                        <div className="mt-4 ml-9 space-y-3 border-t border-border/80 pt-4">
                          <h4 className="font-heading text-body-xs font-bold uppercase tracking-wider text-foreground"><TranslatedText namespace="learning" messageKey="review.explanation" /></h4>
                          <div className="text-body-sm text-muted-foreground leading-relaxed">
                            <MarkdownRenderer content={q.explanation} className="space-y-3" />
                          </div>
                        </div>
                      )}
                      {!isCorrect && (
                        <div className="mt-3 ml-9">
                          <MistakeFeedbackButton
                            questionId={q.id}
                            selectedAnswer={studentSelected.map((i) => q.options[i]).filter(Boolean).join("; ") || "(tidak menjawab)"}
                          />
                        </div>
                      )}
                      <QuestionSourceCitation origin={q.origin} sourceEventName={q.sourceEventName} />
                    </div>
                  );
                })}
              </div>
            )}

            {/* Unseen Questions */}
            {unseenSnapshot.length > 0 && (
              <div className="space-y-6 mt-10">
                <h2 className="font-heading text-body-base font-bold text-foreground border-b border-border/60 pb-2">
                  Soal Lainnya dalam Bank Soal <span className="text-body-sm font-medium text-muted-foreground ml-2">(Tidak Didapatkan)</span>
                </h2>
                {unseenSnapshot.map((q, idx) => {
                  const correctIndices = q.correct_indices ?? [];

                  return (
                    <div
                      key={q.id}
                      className="rounded-xl border border-border/80 bg-card p-5 shadow-2xs relative overflow-hidden"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-2.5">
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg text-body-sm font-bold text-foreground bg-muted border border-border/50">
                            {snapshot.length + idx + 1}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "text-body-xs font-semibold uppercase tracking-wider",
                                q.difficulty === "easy" && "text-status-success",
                                q.difficulty === "medium" && "text-status-warning",
                                q.difficulty === "hard" && "text-status-error"
                              )}>
                                {q.difficulty}
                              </span>
                            </div>
                            <div className="mt-2 text-body-base leading-relaxed text-foreground/90 font-medium">
                              <MarkdownRenderer content={q.prompt} className="space-y-3" />
                            </div>
                          </div>
                        </div>
                      </div>

                      <ul className="mt-4 pl-9 space-y-2">
                        {q.options.map((opt, i) => {
                          const isCorrectChoice = correctIndices.includes(i);
                          return (
                            <li
                              key={i}
                              className={cn(
                                "flex items-center gap-3 rounded-lg border px-4 py-2.5 transition-colors",
                                isCorrectChoice
                                  ? "border-status-success/30 bg-status-success/10"
                                  : "border-border/40 bg-muted/20"
                              )}
                            >
                              <span
                                className={cn(
                                  "flex size-6 shrink-0 items-center justify-center rounded-full text-body-xs font-bold",
                                  isCorrectChoice
                                    ? "bg-status-success text-white"
                                    : "bg-muted text-muted-foreground border border-border/60"
                                )}
                              >
                                {String.fromCharCode(65 + i)}
                              </span>
                              <div
                                className={cn(
                                  "min-w-0 flex-1 text-body-sm font-medium",
                                  isCorrectChoice ? "text-foreground" : "text-muted-foreground"
                                )}
                              >
                                <MarkdownRenderer content={opt} />
                              </div>
                              {isCorrectChoice && (
                                  <div className="ml-auto flex items-center text-status-success text-body-xs font-bold gap-1 uppercase tracking-wider">
                                  <CheckCircle2 className="size-4" />
                                  Kunci
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>

                      {q.explanation && (
                        <div className="mt-4 ml-9 space-y-3 border-t border-border/80 pt-4">
                          <h4 className="font-heading text-body-xs font-bold uppercase tracking-wider text-foreground"><TranslatedText namespace="learning" messageKey="review.explanation" /></h4>
                          <div className="text-body-sm text-muted-foreground leading-relaxed">
                            <MarkdownRenderer content={q.explanation} className="space-y-3" />
                          </div>
                        </div>
                      )}
                      <QuestionSourceCitation origin={q.origin} sourceEventName={q.sourceEventName} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Reveal>
      </CoursePageShell>
    );

}
