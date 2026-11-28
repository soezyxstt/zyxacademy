"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useTutor } from "@/components/course/tutor-drawer";
import type { SubmissionReviewFixture, SubmissionListItem, ReviewItem } from "@/lib/student-course-fixtures";
import { useTranslations } from "@/lib/i18n/client";
import { useStudentExperience } from "@/components/student-experience-provider";
import {
  FocusedAssessmentReview,
  type FocusedReviewQuestion,
} from "@/components/course/focused-assessment-review";

export type ExtendedReviewItem = ReviewItem & {
  promptUi?: Record<string, unknown> | null;
  explanationUi?: Record<string, unknown> | null;
  options?: string[];
  studentSelectedIndices?: number[];
  correctIndices?: number[];
  acceptableAnswers?: string[];
  submittedFileKey?: string | null;
  submittedFileName?: string | null;
  submittedFileSize?: string | null;
};

export type ExtendedSubmissionReview = Omit<SubmissionReviewFixture, "items"> & {
  items: ExtendedReviewItem[];
  leaderboardEligible?: boolean;
};

type ReviewClientProps = {
  courseId: string;
  listItem: SubmissionListItem;
  review: ExtendedSubmissionReview;
  isDirectPreview?: boolean;
  leaderboardEligible?: boolean;
  startActionHref?: string;
  defaultViewMode?: "focused" | "all";
};

export function ReviewClient({
  courseId,
  listItem,
  review,
  isDirectPreview = false,
  leaderboardEligible,
  startActionHref,
  defaultViewMode = "focused",
}: ReviewClientProps) {
  const t = useTranslations("learning");
  const experience = useStudentExperience();
  const { openMistake } = useTutor();
  const [userPlan, setUserPlan] = useState<string>("essential");

  const loadPlan = () => {
    try {
      setUserPlan(localStorage.getItem("zyx-user-plan") || "essential");
    } catch {
      setUserPlan("essential");
    }
  };

  useEffect(() => {
    if (experience.mode === "demo") return;
    const timer = window.setTimeout(loadPlan, 0);

    window.addEventListener("zyx-plan-changed", loadPlan);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("zyx-plan-changed", loadPlan);
    };
  }, [experience.mode]);

  const isVideoUnlocked = userPlan === "essential" || userPlan === "premium";
  const resolvedLeaderboardEligible = leaderboardEligible ?? review.leaderboardEligible;

  const questions: FocusedReviewQuestion[] = review.items.map((item, idx) => {
    const status: FocusedReviewQuestion["status"] = isDirectPreview
      ? "study"
      : item.correct === true
        ? "correct"
        : item.correct === false
          ? "incorrect"
          : "pending";

    const statusLabel = isDirectPreview
      ? "Mode Belajar"
      : item.correct === true
        ? t("review.correct")
        : item.correct === false
          ? t("review.incorrect")
          : t("review.pendingReview");

    return {
      id: item.questionId,
      order: idx + 1,
      section: isDirectPreview ? "unseen" : "answered",
      prompt: item.prompt,
      promptUi: item.promptUi ?? null,
      questionType: item.questionType,
      status,
      statusLabel,
      options: item.options,
      studentSelectedIndices: item.studentSelectedIndices,
      correctIndices: item.correctIndices,
      submittedText: item.userAnswer,
      acceptableAnswers: item.acceptableAnswers,
      userAnswerLabel: item.userAnswer,
      correctAnswerLabel: item.correctAnswerLabel,
      submittedFileKey: item.submittedFileKey ?? null,
      submittedFileName: item.submittedFileName ?? null,
      submittedFileSize: item.submittedFileSize ?? null,
      isEssayPending: !isDirectPreview && item.questionType === "essay" && item.correct === null,
      teacherNote: item.teacherNote,
      explanationMarkdown: item.explanationText ?? null,
      explanationUi: item.explanationUi ?? null,
      explanationImage: item.explanationImage ?? null,
      explanationVideoUrl: item.explanationVideoUrl ?? null,
      explanationVideoKind: item.explanationVideoKind,
      origin: item.origin,
      sourceEventName: item.sourceEventName,
      sourceReferenceId: item.sourceReferenceId,
      mistakeAction:
        !isDirectPreview && item.correct === false ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => openMistake(item.questionId, item.userAnswer || "")}
            className="flex h-9 items-center gap-1.5 rounded-lg border-brand-primary/30 text-body-sm font-semibold text-brand-primary hover:bg-brand-primary/5"
          >
            {t("review.askZyra")}
          </Button>
        ) : undefined,
    };
  });

  const statsSlot = (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/55 pb-(--row-padding)">
      <div className="min-w-0">
        <h2 className="wrap-anywhere font-heading text-body-base font-bold text-foreground">
          {review.examTitle}
        </h2>
      </div>
      {!isDirectPreview && (
        <div className="flex flex-wrap items-start gap-(--related-gap)">
          <div className="text-left md:text-right">
            <span className="text-body-xs text-muted-foreground">{t("review.finalScore")}</span>
            <p className="text-body-sm font-semibold tabular-nums text-foreground">
              {listItem.score != null ? `${listItem.score}%` : t("review.pending")}
            </p>
          </div>
          <div className="text-left md:text-right">
            <span className="text-body-xs text-muted-foreground">{t("review.activePlan")}</span>
            <p className="text-body-sm font-medium capitalize text-foreground">{userPlan}</p>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <FocusedAssessmentReview
      courseId={courseId}
      assessmentKind={review.examType === "quiz" ? "quiz" : "tryout"}
      assessmentId={review.examId}
      title={review.examTitle}
      questions={questions}
      defaultViewMode={defaultViewMode}
      statsSlot={statsSlot}
      isDirectPreview={isDirectPreview}
      leaderboardEligible={resolvedLeaderboardEligible}
      startActionHref={startActionHref}
      startActionLabel="Kerjakan Tryout"
      isVideoUnlocked={isVideoUnlocked}
    />
  );
}
