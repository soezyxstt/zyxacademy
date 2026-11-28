import Link from "next/link";
import { Calendar, Award, Clock, ListChecks } from "lucide-react";
import { CoursePageShell } from "@/components/course/course-page-shell";
import { Reveal } from "@/components/ui/reveal";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TranslatedText } from "@/components/i18n/translated-text";
import { FormattedDate } from "@/components/ui/formatted-date";
import { MistakeFeedbackButton } from "@/components/pka/mistake-feedback-button";
import { checkAnswerCorrectness, questionAnswerType } from "@/lib/gamification/question-grading";
import { answerToStableOptionIds } from "@/lib/asesmen/attempt";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";
import {
  FocusedAssessmentReview,
  type FocusedReviewQuestion,
} from "@/components/course/focused-assessment-review";

export type StudentReviewQuestion = {
  id: string;
  prompt: string;
  promptUi?: Record<string, unknown> | null;
  options: string[];
  correct_indices: number[];
  explanation: string;
  explanationUi?: Record<string, unknown> | null;
  difficulty: string;
  question_type?: string;
  acceptable_answers?: string[];
  stable_option_ids?: string[];
  origin?: "zyx_original" | "historical_reference" | "itb_example";
  sourceEventName?: string | null;
  sourceReferenceId?: string | null;
  gradedCorrect?: boolean;
};

function formatDuration(seconds: number | null) {
  if (seconds == null) return "-";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m} menit ${s} detik` : `${s} detik`;
}

export function StudentQuizReview({
  href = (path: string) => path,
  id,
  visualCourseId = id,
  quizId,
  template,
  targetAttempt,
  snapshot,
  answers,
  unseenSnapshot = [],
  discussionAvailable = true,
  defaultViewMode = "all",
  isDirectPreview = false,
  leaderboardEligible,
  startActionHref,
}: {
  href?: (path: string) => string;
  id: string;
  quizId: string;
  template: { title: string };
  visualCourseId?: string;
  targetAttempt: {
    id: string;
    score: number | null;
    durationSeconds: number | null;
    submittedAt: Date | string | null;
    gradingStatus?: string | null;
    leaderboardEligible?: boolean | null;
  } | null;
  snapshot: StudentReviewQuestion[];
  answers: Record<string, any>;
  unseenSnapshot?: StudentReviewQuestion[];
  discussionAvailable?: boolean;
  defaultViewMode?: "focused" | "all";
  isDirectPreview?: boolean;
  leaderboardEligible?: boolean;
  startActionHref?: string;
}) {
  const answeredItems: FocusedReviewQuestion[] = snapshot.map((q, idx) => {
    const rawSubmitted = answers[q.id];
    const qType = questionAnswerType(q);
    let studentSelected = Array.isArray(rawSubmitted)
      ? rawSubmitted
      : typeof rawSubmitted === "number"
        ? [rawSubmitted]
        : [];
    if (
      q.stable_option_ids &&
      (typeof rawSubmitted === "string" ||
        (Array.isArray(rawSubmitted) && rawSubmitted.some((value) => typeof value === "string")))
    ) {
      try {
        studentSelected = answerToStableOptionIds(q.stable_option_ids, rawSubmitted).map((optId) =>
          q.stable_option_ids!.indexOf(optId),
        );
      } catch {
        studentSelected = [];
      }
    }

    const correctIndices = q.correct_indices ?? (q as any).correctIndices ?? [];

    const submittedText =
      typeof rawSubmitted === "string"
        ? rawSubmitted
        : rawSubmitted &&
            typeof rawSubmitted === "object" &&
            "text" in rawSubmitted &&
            typeof rawSubmitted.text === "string"
          ? rawSubmitted.text
          : Array.isArray(rawSubmitted)
            ? String(rawSubmitted[0] ?? "")
            : "";

    const submittedFileKey =
      rawSubmitted &&
      typeof rawSubmitted === "object" &&
      "fileKey" in rawSubmitted &&
      typeof rawSubmitted.fileKey === "string"
        ? rawSubmitted.fileKey
        : null;

    const submittedFileName =
      rawSubmitted &&
      typeof rawSubmitted === "object" &&
      "fileName" in rawSubmitted &&
      typeof rawSubmitted.fileName === "string"
        ? rawSubmitted.fileName
        : null;

    const submittedFileSize =
      rawSubmitted &&
      typeof rawSubmitted === "object" &&
      "fileSize" in rawSubmitted &&
      typeof rawSubmitted.fileSize === "string"
        ? rawSubmitted.fileSize
        : null;

    let isCorrect =
      qType === "essay"
        ? submittedText.trim().length > 0 || Boolean(submittedFileKey)
        : checkAnswerCorrectness(q, rawSubmitted);

    if (qType === "essay" && typeof q.gradedCorrect === "boolean") {
      isCorrect = q.gradedCorrect;
    }
    const isEssayPending = qType === "essay" && targetAttempt?.gradingStatus === "pending";

    const status: FocusedReviewQuestion["status"] = isEssayPending
      ? "pending"
      : qType === "essay"
        ? "correct"
        : isCorrect
          ? "correct"
          : "incorrect";

    const statusLabel =
      qType === "essay"
        ? isEssayPending
          ? "Menunggu Koreksi"
          : "Telah Dinilai"
        : isCorrect
          ? "Benar"
          : "Salah";

    return {
      id: q.id,
      order: idx + 1,
      section: "answered",
      prompt: q.prompt,
      promptUi: q.promptUi ?? null,
      questionType: qType as FocusedReviewQuestion["questionType"],
      difficulty: q.difficulty,
      status,
      statusLabel,
      options: q.options,
      studentSelectedIndices: studentSelected,
      correctIndices,
      submittedText,
      acceptableAnswers: q.acceptable_answers,
      submittedFileKey,
      submittedFileName,
      submittedFileSize,
      isEssayPending,
      explanationMarkdown: q.explanation,
      explanationUi: q.explanationUi ?? null,
      origin: q.origin,
      sourceEventName: q.sourceEventName,
      sourceReferenceId: q.sourceReferenceId,
      attemptContext: targetAttempt
        ? {
            courseId: visualCourseId,
            attemptId: targetAttempt.id,
            questionId: q.id,
          }
        : null,
      mistakeAction: !isCorrect ? (
        <MistakeFeedbackButton
          questionId={q.id}
          selectedAnswer={
            studentSelected
              .map((i) => q.options[i])
              .filter(Boolean)
              .join("; ") || "(tidak menjawab)"
          }
        />
      ) : undefined,
    };
  });

  const unseenItems: FocusedReviewQuestion[] = unseenSnapshot.map((q, idx) => {
    const qType = questionAnswerType(q);
    return {
      id: q.id,
      order: snapshot.length + idx + 1,
      section: "unseen",
      prompt: q.prompt,
      promptUi: q.promptUi ?? null,
      questionType: qType as FocusedReviewQuestion["questionType"],
      difficulty: q.difficulty,
      status: "study",
      statusLabel: "Mode Belajar",
      options: q.options,
      correctIndices: q.correct_indices ?? [],
      acceptableAnswers: q.acceptable_answers,
      explanationMarkdown: q.explanation,
      explanationUi: q.explanationUi ?? null,
      origin: q.origin,
      sourceEventName: q.sourceEventName,
      sourceReferenceId: q.sourceReferenceId,
    };
  });

  const allQuestions = [...answeredItems, ...unseenItems];
  const resolvedLeaderboardEligible =
    leaderboardEligible ??
    (typeof targetAttempt?.leaderboardEligible === "boolean"
      ? targetAttempt.leaderboardEligible
      : undefined);

  const statsSlot = targetAttempt ? (
    <AdminStatStrip>
      <AdminStatStripItem
        icon={Award}
        label={<TranslatedText namespace="learning" messageKey="quizTake.finalScore" />}
        value={targetAttempt.score == null ? "-" : `${targetAttempt.score}%`}
        tone="brand"
      />
      <AdminStatStripItem
        icon={Clock}
        label={<TranslatedText namespace="learning" messageKey="quizTake.duration" />}
        value={formatDuration(targetAttempt.durationSeconds)}
        tone="info"
      />
      <AdminStatStripItem
        icon={Calendar}
        label={<TranslatedText namespace="learning" messageKey="quizTake.submittedAt" />}
        value={
          targetAttempt.submittedAt ? (
            <FormattedDate
              date={targetAttempt.submittedAt}
              options={{ dateStyle: "medium", timeStyle: "short" }}
            />
          ) : (
            "-"
          )
        }
        tone="brand-secondary"
      />
    </AdminStatStrip>
  ) : undefined;

  const noticeSlot = (
    <>
      {targetAttempt && !discussionAvailable && (
        <p className="text-body-sm text-muted-foreground">
          Pembahasan tidak tersedia saat ini.
        </p>
      )}
      {!targetAttempt && !isDirectPreview && (
        <div className="border-b border-border pb-3">
          <h3 className="font-heading text-body-base font-bold text-brand-primary">
            <TranslatedText namespace="learning" messageKey="quizTake.fullDiscussion" />
          </h3>
          <p className="mt-1 text-body-sm text-brand-primary/80">
            Anda tidak mengerjakan kuis ini. Berikut adalah seluruh kumpulan soal yang mungkin muncul pada kuis ini beserta penjelasannya.
          </p>
        </div>
      )}
    </>
  );

  return (
    <CoursePageShell
      title={
        <TranslatedText
          namespace="learning"
          messageKey={targetAttempt ? "quizTake.analysisTitle" : "quizTake.reviewTitle"}
        />
      }
      description={template.title}
      backHref={href(`/courses/${id}/quiz/${quizId}`)}
      backLabel={<TranslatedText namespace="learning" messageKey="quizTake.backToQuiz" />}
      actions={
        targetAttempt && discussionAvailable ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button asChild size="icon-lg">
                  <Link href={href(`/courses/${id}/quiz/${quizId}/summary/${targetAttempt.id}`)}>
                    <ListChecks aria-hidden />
                    <span className="sr-only">
                      <TranslatedText namespace="learning" messageKey="reviewPage.viewDiagnosis" />
                    </span>
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <TranslatedText namespace="learning" messageKey="reviewPage.viewDiagnosis" />
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : undefined
      }
    >
      <Reveal>
        <FocusedAssessmentReview
          courseId={visualCourseId}
          assessmentKind="quiz"
          assessmentId={quizId}
          title={template.title}
          questions={allQuestions}
          defaultViewMode={defaultViewMode}
          statsSlot={statsSlot}
          noticeSlot={noticeSlot}
          isDirectPreview={isDirectPreview}
          leaderboardEligible={resolvedLeaderboardEligible}
          startActionHref={startActionHref}
          startActionLabel="Kerjakan Kuis"
          answeredSectionTitle="Soal yang Anda Kerjakan"
          unseenSectionTitle="Soal Lainnya dalam Bank Soal"
        />
      </Reveal>
    </CoursePageShell>
  );
}
