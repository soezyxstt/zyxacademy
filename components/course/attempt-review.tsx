"use client";

import { useState } from "react";
import Link from "next/link";
import { StudentAccountBoundary } from "@/components/student-account-boundary";
import { useQuizAttempt } from "@/hooks/use-quiz-attempt";
import { checkReviewAnswerCorrectness } from "@/lib/quiz/review";
import {
 ChevronDown,
 Loader2,
 TrendingDown,
 TriangleAlert,
 ArrowRight,
 Layers,
 ListChecks,
 BookOpen,
 Check,
 CheckSquare,
 CircleDot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MathText } from "@/components/course/math-text";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { cn } from "@/lib/utils";
import { MistakeFeedbackButton } from "@/components/pka/mistake-feedback-button";
import { deduplicateAcceptableAnswers } from "@/lib/quiz/short-answer";
import { QuestionSourceCitation } from "@/components/course/question-source-citation";
import { useTranslations } from "@/lib/i18n/client";

const KIND_ICON = {
 flashcards: Layers,
 quiz: ListChecks,
 module: BookOpen,
};

export function AttemptReview({ attemptId }: { attemptId: string }) {
 return <StudentAccountBoundary>{({ data }) => data?.user
   ? <LiveAttemptReview key={`${data.user.id}:${attemptId}`} userId={data.user.id} attemptId={attemptId} />
   : <div className="h-40 animate-pulse rounded-md bg-muted" aria-busy="true" />}
 </StudentAccountBoundary>;
}

function LiveAttemptReview({ userId, attemptId }: { userId: string; attemptId: string }) {
 const t = useTranslations("studentCourse");
 const [openFeedback, setOpenFeedback] = useState<Record<number, boolean>>({});
 const { data: attempt, error, retry, isFeedbackPending, isFeedbackTimeout } = useQuizAttempt(userId, attemptId);

 if (error) {
 return (
 <div className="flex items-center gap-2 py-4 text-status-error text-body-sm">
 <TriangleAlert className="size-4" />
 <span>{t("attemptReview.loadFailed")}</span>
 <Button
 variant="ghost"
 size="sm"
 onClick={retry}
 >
 {t("attemptReview.retry")}
 </Button>
 </div>
 );
 }

 if (!attempt) {
 return (
 <div className="space-y-4">
 <div className="h-16 bg-muted rounded-md animate-pulse" />
 <div className="h-40 bg-muted rounded-md animate-pulse" />
 </div>
 );
 }

 const { questionsSnapshot, answersSnapshot, score, feedback, strongAreas, weakAreas, recommendedNextSteps } = attempt;

 // Grade stats
 let correctCount = 0;
 questionsSnapshot.forEach((q) => {
 const submitted = answersSnapshot?.[q.id];
 if (checkReviewAnswerCorrectness(q, submitted)) correctCount++;
 });
 const totalCount = questionsSnapshot.length;

 const toggleFeedback = (idx: number) => {
 setOpenFeedback((prev) => ({ ...prev, [idx]: !prev[idx] }));
 };

 return (
 <div className="space-y-8 font-sans">
 {/* Header */}
 <div>
 <h2 className="font-heading text-h5 font-bold text-foreground">
 {score ?? "-"}
 <span className="text-body-sm font-normal text-muted-foreground ml-1">/100</span>
 </h2>
 <p className="text-body-sm text-muted-foreground mt-1">
 {correctCount} dari {totalCount} benar
 </p>
 </div>

 {/* Strong / Weak Areas */}
 <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6">
 <div>
 <span className="text-body-sm font-semibold uppercase tracking-wide text-muted-foreground">
 {t("attemptReview.strengths")}
 </span>
 <ul className="mt-2 space-y-1 text-body-base">
  {strongAreas && strongAreas.length > 0 ? (
  strongAreas.map((area, idx) => <li key={idx}><MathText as="span">{area}</MathText></li>)
  ) : (
 <li className="text-muted-foreground text-body-sm">{t("attemptReview.noStrengths")}</li>
 )}
 </ul>
 </div>
 <div>
 <span className="text-body-sm font-semibold uppercase tracking-wide text-muted-foreground">
 {t("attemptReview.needsPractice")}
 </span>
 <ul className="mt-2 space-y-1 text-body-base">
 {weakAreas && weakAreas.length > 0 ? (
 weakAreas.map((area, idx) => (
 <li key={idx} className="flex items-center gap-1.5">
  <TrendingDown className="size-3.5 text-status-error" />
  <MathText as="span">{area}</MathText>
 </li>
 ))
 ) : (
 <li className="text-muted-foreground text-body-sm">{t("attemptReview.noWeakAreas")}</li>
 )}
 </ul>
 </div>
 </div>

 {/* E2: Embedded remediation ; mastery delta + root cause */}
 {attempt.remediation && attempt.remediation.concepts.length > 0 && (
 <div className="border-t border-border pt-8 space-y-6">
 <div>
 <h3 className="font-heading text-body-base font-bold text-foreground">{t("attemptReview.masteryChange")}</h3>
 <ul className="mt-3 space-y-3">
 {attempt.remediation.concepts.map((c) => (
 <li key={c.conceptName} className="space-y-1">
 <div className="flex items-center justify-between gap-3 text-body-sm">
 <span className="font-medium text-foreground"><MathText as="span">{c.conceptName}</MathText></span>
 <span className="tabular-nums text-muted-foreground">
 {c.before}
 <ArrowRight className="inline size-3 mx-1" />
 {c.after}
 <span
 className={cn(
 "ml-2 font-semibold",
 c.delta >= 0 ? "text-status-success" : "text-status-error",
 )}
 >
 {c.delta >= 0 ? "+" : ""}
 {c.delta}
 </span>
 </span>
 </div>
 <div className="h-1.5 rounded-md bg-muted">
 <div
 className="h-full rounded-md bg-primary transition-[width] duration-500 ease-out"
 style={{ width: `${Math.max(0, Math.min(100, c.after))}%` }}
 />
 </div>
 </li>
 ))}
 </ul>
 </div>

 {attempt.remediation.rootCauses.length > 0 && (
 <div>
 <h3 className="font-heading text-body-base font-bold text-foreground">{t("attemptReview.possibleRootCauses")}</h3>
 <ul className="mt-3 space-y-2 text-body-sm">
 {attempt.remediation.rootCauses.map((rc) => (
 <li key={rc.conceptName}>
 <span className="font-medium text-foreground">
 <MathText as="span">{rc.conceptName}</MathText> ({rc.mastery})
 </span>
 <span className="text-muted-foreground"> {t("attemptReview.dependsOn")} </span>
 <span className="text-status-error">
 {rc.blockedBy.map((b, bIdx) => (
   <span key={b.conceptName}>
     {bIdx > 0 ? ", " : ""}
     <MathText as="span">{b.conceptName}</MathText> ({b.mastery})
   </span>
 ))}
 </span>
 </li>
 ))}
 </ul>
 <p className="mt-3 text-body-sm text-muted-foreground">
 Estimasi tinjauan: sekitar {attempt.remediation.estimatedMinutes} menit.
 </p>
 </div>
 )}
 </div>
 )}

 {/* Questions List */}
 <div className="divide-y divide-border mt-8">
 {questionsSnapshot.map((q, idx) => {
 const submitted = answersSnapshot[q.id] ?? [];
 const isCorrect = checkReviewAnswerCorrectness(q, submitted);

 const fbItem = feedback?.find((f) => f.questionIndex === idx);
 const hasFb = !!fbItem;

 const qType = q.question_type || q.questionType || q.type;
 const submittedOptions = qType !== "short_answer" && qType !== "essay" && Array.isArray(submitted)
   ? submitted.map((index: number) => q.options?.[index] ?? `Opsi ${index}`)
   : null;
 const correctOptionIndices: number[] = Array.isArray(q.correct_indices) ? q.correct_indices : q.correctIndices || [];
 const correctOptions = qType !== "short_answer" && qType !== "essay"
   ? correctOptionIndices.map((index) => q.options?.[index] ?? `Opsi ${index}`)
   : null;
 let submittedLabel = "";
 if (qType === "short_answer" || qType === "essay") {
   submittedLabel = typeof submitted === "string" ? submitted : Array.isArray(submitted) ? String(submitted[0] ?? "") : "";
 } else {
   const indices = Array.isArray(submitted) ? submitted : [];
   submittedLabel = indices.map((i: number) => q.options?.[i] ?? `Opsi ${i}`).join(", ");
 }

 let correctLabel = "";
 let acceptableArray: string[] = [];
 if (qType === "short_answer") {
   const acc = q.acceptable_answers || q.acceptableAnswers || [];
   acceptableArray = Array.isArray(acc) ? deduplicateAcceptableAnswers(acc) : [];
   correctLabel = acceptableArray.join(", ");
 } else if (qType === "essay") {
 correctLabel = q.explanation || t("attemptReview.essayAnswer");
 } else {
   const correctArr = Array.isArray(q.correct_indices) ? q.correct_indices : q.correctIndices || [];
   correctLabel = correctArr.map((i: number) => q.options?.[i] ?? `Opsi ${i}`).join(", ");
 }

 const isQuestionMultiple = qType === "multiple_choices" || (Array.isArray(q.correct_indices) && q.correct_indices.length > 1) || (Array.isArray(q.correctIndices) && q.correctIndices.length > 1);

 return (
 <div key={q.id} className="py-6 first:pt-0">
 <div className="flex items-start justify-between gap-4">
 <div className="min-w-0 flex-1">
  <div className="flex items-center gap-2">
   <span className="text-body-sm font-semibold text-muted-foreground">Soal {idx + 1}</span>
   {isQuestionMultiple ? (
    <span className="inline-flex items-center gap-1 rounded-md border border-brand-secondary/35 bg-brand-secondary/10 px-2 py-0.5 text-body-2xs font-bold text-brand-secondary">
     <CheckSquare className="size-3" />
     Pilihan Jamak
    </span>
   ) : qType === "multiple_choice" || (!qType && !isQuestionMultiple) ? (
    <span className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-muted/40 px-2 py-0.5 text-body-2xs font-medium text-muted-foreground">
     <CircleDot className="size-3" />
     Pilihan Tunggal
    </span>
   ) : null}
  </div>
 <div className="mt-2 text-body-base font-medium text-foreground">
 <MarkdownRenderer content={q.prompt} />
 </div>
 </div>
 <span
 className={cn(
            "text-body-xs font-semibold px-2 py-0.5 rounded-md border",
 isCorrect
 ? "bg-status-success/10 text-status-success border-status-success/20"
 : "bg-status-error/10 text-status-error border-status-error/20"
 )}
 >
 {isCorrect ? t("attemptReview.correct") : t("attemptReview.incorrect")}
 </span>
 </div>

 {/* Answers */}
 <div className="mt-4 space-y-1.5 pl-4 border-l-2 border-muted text-body-sm">
 <div>
 <span className="text-muted-foreground">{t("attemptReview.yourAnswer")} </span>
 {submittedOptions ? submittedOptions.length ? submittedOptions.map((option, index) => <MarkdownRenderer key={index} content={option} density="compact" className="font-medium" />) : "-" : <MathText className="font-medium" as="span">{submittedLabel || "-"}</MathText>}
 </div>
 {qType === "short_answer" && acceptableArray.length > 0 ? (
 <div className="pt-1">
 <span className="text-muted-foreground block mb-1 text-body-xs font-semibold uppercase tracking-wider text-status-success">
 {t("attemptReview.acceptedAnswers")}{acceptableArray.length > 1 ? ` (${t("attemptReview.formatVariants", { count: acceptableArray.length })})` : ""}:
 </span>
 <div className="flex flex-wrap gap-1.5">
 {acceptableArray.map((ans, aIdx) => (
 <span
 key={aIdx}
 className="inline-flex items-center gap-1 rounded-md border border-status-success/25 bg-background px-2.5 py-1 text-body-xs font-medium text-foreground shadow-2xs"
 >
 <Check className="size-3 text-status-success shrink-0" />
 <MathText as="span">{ans}</MathText>
 </span>
 ))}
 </div>
 </div>
 ) : (
 <div>
 <span className="text-muted-foreground">{t("attemptReview.correctAnswer")} </span>
 {correctOptions ? correctOptions.map((option, index) => <MarkdownRenderer key={index} content={option} density="compact" className="text-status-success font-semibold" />) : <MarkdownRenderer content={correctLabel} density="compact" className="text-status-success font-semibold" />}
 </div>
 )}
 </div>

 {/* Mistake feedback */}
 {!isCorrect && (
 <div className="mt-5 border-t border-border/80 pt-5">
 {hasFb ? (
 <div className="space-y-4">
 <Button
 variant="ghost"
 size="sm"
 onClick={() => toggleFeedback(idx)}
 className="text-body-sm font-medium flex items-center gap-2 text-brand-primary hover:bg-transparent hover:text-brand-primary/80 p-0 h-auto"
 >
 <span className="font-heading font-bold uppercase tracking-wider text-body-xs">{t("attemptReview.mistakeAnalysis")}</span>
 <ChevronDown
 className={cn(
 "size-4 transition-transform duration-200 text-muted-foreground",
 openFeedback[idx] && "rotate-180"
 )}
 />
 </Button>

 {openFeedback[idx] && (
 <div className="animate-in fade-in duration-200 pl-4 border-l-2 border-brand-primary/30 space-y-3">
  {fbItem.payload.misconceptionName && (
  <h6 className="text-body-sm font-semibold text-foreground">
  {t("attemptReview.misconception")}: <MathText as="span">{fbItem.payload.misconceptionName}</MathText>
  </h6>
  )}
  <p className="text-body-base text-muted-foreground">
  <MathText as="span">{fbItem.payload.whyWrong}</MathText>
  </p>
  {fbItem.payload.correctApproach && fbItem.payload.correctApproach.length > 0 && (
  <div className="space-y-1">
  <span className="text-body-sm font-semibold text-foreground">{t("attemptReview.correctSteps")}</span>
  <ol className="list-decimal pl-4 space-y-1 text-body-sm text-muted-foreground">
  {fbItem.payload.correctApproach.map((stepMsg, sIdx) => (
  <li key={sIdx}><MathText as="span">{stepMsg}</MathText></li>
  ))}
  </ol>
  </div>
  )}
 <div className="flex flex-wrap items-center gap-3 pt-2">
 <MistakeFeedbackButton
 questionId={q.id}
 selectedAnswer={submittedLabel || t("attemptReview.noAnswer")}
 />
 <Link
 href={fbItem.payload.reviewHref}
 className="inline-flex items-center text-primary text-body-sm hover:underline"
 >
 {t("attemptReview.reviewConcept")}
 </Link>
 </div>
 </div>
 )}
 <QuestionSourceCitation origin={q.origin} sourceEventName={q.sourceEventName} />
 </div>
 ) : isFeedbackPending ? (
 <div className="flex items-center gap-2 text-body-sm text-brand-primary mt-2 font-medium">
 <Loader2 className="animate-spin size-3.5" />
 <span>{t("attemptReview.analyzingMistake")}</span>
 </div>
 ) : isFeedbackTimeout ? (
 <div className="flex items-center gap-2 py-2 text-status-error text-body-sm">
 <TriangleAlert className="size-4" />
 <span>{t("attemptReview.autoExplanationFailed")}</span>
 <Button
 variant="ghost"
 size="sm"
 className="h-auto p-0"
 onClick={retry}
 >
 {t("attemptReview.retry")}
 </Button>
 </div>
 ) : null}
 </div>
 )}
 </div>
 );
 })}
 </div>

 {/* Recommended Next Steps */}
 {recommendedNextSteps && recommendedNextSteps.length > 0 && (
 <div className="border-t border-border pt-8">
 <h3 className="font-heading text-body-base font-bold text-foreground">{t("attemptReview.nextSteps")}</h3>
 <ul className="divide-y divide-border mt-3">
 {recommendedNextSteps.map((item, index) => {
 const Icon = KIND_ICON[item.kind] || BookOpen;
 return (
 <li
 key={item.id}
 className="py-3 flex items-center gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300"
 style={{ animationDelay: `${index * 50}ms` }}
 >
 <div className="size-5 rounded-full border border-border flex items-center justify-center shrink-0">
 <span className="text-body-xs font-bold">{index + 1}</span>
 </div>
 <Icon className="size-4 text-muted-foreground shrink-0" />
 <span className="text-body-base font-medium flex-1 min-w-0 break-words">
 {item.title}
 </span>
 <Button variant="ghost" size="sm" asChild>
 <Link href={item.href} aria-label={t("attemptReview.openNamed", { title: item.title })}>
 <ArrowRight className="size-4" />
 </Link>
 </Button>
 </li>
 );
 })}
 </ul>
 </div>
 )}
 </div>
 );
}
