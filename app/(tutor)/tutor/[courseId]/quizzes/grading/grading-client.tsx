"use client";

import { useCallback, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n/client";
import { toast } from "@/components/ui/toast";
import { ViewportSwitch } from "@/components/navigation/viewport-switch";
import {
  gradeQuizAttemptAction,
  getQuizAttemptDetailsAction,
} from "@/app/actions/tutor-quiz-grading";
import { useQuizGradingDraft } from "@/features/grading/model/use-grading-drafts";
import type { AttemptDetails, PendingAttemptItem } from "@/features/grading/model/types";
import { QuizGradingDesktop } from "@/features/grading/ui/desktop/quiz-grading-desktop";
import { QuizGradingMobile } from "@/features/grading/ui/mobile/quiz-grading-mobile";

interface Props {
  courseId: string;
  queueHeader?: ReactNode;
  pendingAttempts: PendingAttemptItem[];
}

/**
 * Interactive client container for tutors to review, inspect attachments, and grade pending student quiz attempts.
 * Lifts activeAttempt and persistent gradeInputs above ViewportSwitch so resizing never drops unsaved grades.
 */
export function TutorQuizGradingClient({ courseId, pendingAttempts, queueHeader }: Props) {
  const router = useRouter();
  const tr = useTranslations("tutor.grading");
  const [isPending, startTransition] = useTransition();

  const [searchQuery, setSearchQuery] = useState("");
  const [activeAttempt, setActiveAttempt] = useState<AttemptDetails | null>(null);
  const [loadingAttemptId, setLoadingAttemptId] = useState<string | null>(null);

  const { gradeInputs, setScore, setNotes, clearDraft } = useQuizGradingDraft(
    courseId,
    activeAttempt
  );

  const filteredAttempts = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return pendingAttempts.filter((a) => {
      const titleMatch = a.quizTitle.toLowerCase().includes(q);
      const nameMatch = a.studentName?.toLowerCase().includes(q) ?? false;
      const emailMatch = a.studentEmail?.toLowerCase().includes(q) ?? false;
      return titleMatch || nameMatch || emailMatch;
    });
  }, [pendingAttempts, searchQuery]);

  const handleSelectAttempt = useCallback(
    async (attemptId: string) => {
      setLoadingAttemptId(attemptId);
      try {
        const details = await getQuizAttemptDetailsAction(courseId, attemptId);
        if (!details) {
          toast.error(tr("loadAttemptFailed"));
          return;
        }
        setActiveAttempt(details);
      } catch {
        toast.error(tr("loadAttemptError"));
      } finally {
        setLoadingAttemptId(null);
      }
    },
    [courseId, tr]
  );

  const handleCloseAttempt = useCallback(() => {
    setActiveAttempt(null);
  }, []);

  const handleSave = useCallback(
    (finalize: boolean) => {
      if (!activeAttempt) return;

      const freeResponseQuestions = activeAttempt.questions.filter((q) => q.isFreeResponse);
      const essayQuestions = activeAttempt.questions.filter((q) => q.isEssay);

      if (finalize) {
        for (const eq of essayQuestions) {
          const input = gradeInputs[eq.id];
          const num = input ? parseInt(input.score, 10) : NaN;
          if (isNaN(num) || num < 0 || num > 100) {
            toast.error(tr("essayScoreRequired", { number: eq.index }));
            return;
          }
        }
      }

      const itemsToSubmit: Array<{
        questionId: string;
        score: number;
        reviewNotes?: string | null;
        expectedRevision: number;
      }> = [];

      for (const q of freeResponseQuestions) {
        const input = gradeInputs[q.id];
        if (!input) continue;
        const num = parseInt(input.score, 10);
        if (!isNaN(num) && num >= 0 && num <= 100) {
          itemsToSubmit.push({
            questionId: q.id,
            score: num,
            reviewNotes: input.notes.trim() || null,
            expectedRevision: input.expectedRevision,
          });
        }
      }

      if (itemsToSubmit.length === 0) {
        toast.error(tr("noScore"));
        return;
      }

      startTransition(async () => {
        try {
          const res = await gradeQuizAttemptAction({
            courseId,
            attemptId: activeAttempt.attemptId,
            items: itemsToSubmit,
          });

          if (res.success) {
            if (res.gradingStatus === "graded") {
              toast.success(tr("finalized"));
            } else {
              toast.success(tr("draftSaved"));
            }
            clearDraft();
            setActiveAttempt(null);
            router.refresh();
          } else {
            toast.error(tr("saveQuizGradeFailed"));
          }
        } catch {
          toast.error(tr("saveQuizGradeFailed"));
        }
      });
    },
    [activeAttempt, clearDraft, courseId, gradeInputs, router, tr]
  );

  return (
    <ViewportSwitch
      desktop={() => (
        <QuizGradingDesktop
          queueHeader={queueHeader}
          filteredAttempts={filteredAttempts}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          activeAttempt={activeAttempt}
          loadingAttemptId={loadingAttemptId}
          isPending={isPending}
          gradeInputs={gradeInputs}
          onSelectAttempt={handleSelectAttempt}
          onCloseAttempt={handleCloseAttempt}
          onScoreChange={setScore}
          onNotesChange={setNotes}
          onSave={handleSave}
        />
      )}
      mobile={() => (
        <QuizGradingMobile
          filteredAttempts={filteredAttempts}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          activeAttempt={activeAttempt}
          loadingAttemptId={loadingAttemptId}
          isPending={isPending}
          gradeInputs={gradeInputs}
          onSelectAttempt={handleSelectAttempt}
          onCloseAttempt={handleCloseAttempt}
          onScoreChange={setScore}
          onNotesChange={setNotes}
          onSave={handleSave}
        />
      )}
    />
  );
}
