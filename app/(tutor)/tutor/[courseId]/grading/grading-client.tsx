"use client";

import { useCallback, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n/client";
import { toast } from "@/components/ui/toast";
import { ViewportSwitch } from "@/components/navigation/viewport-switch";
import { gradeSubmissionAction } from "@/app/actions/tutor-management";
import { useTryoutGradingDraft } from "@/features/grading/model/use-grading-drafts";
import type { SubmissionItem, TryoutGradingTab } from "@/features/grading/model/types";
import { TryoutGradingDesktop } from "@/features/grading/ui/desktop/tryout-grading-desktop";
import { TryoutGradingMobile } from "@/features/grading/ui/mobile/tryout-grading-mobile";

interface Props {
  courseId: string;
  tutorId?: string | null;
  queueHeader?: ReactNode;
  initialSubmissions: SubmissionItem[];
}

export function GradingClient({
  courseId,
  tutorId,
  initialSubmissions,
  queueHeader,
}: Props) {
  const router = useRouter();
  const tr = useTranslations("tutor.grading");
  const [isPending, startTransition] = useTransition();

  const [activeTab, setActiveTab] = useState<TryoutGradingTab>("pending");
  const [activeSub, setActiveSub] = useState<SubmissionItem | null>(null);

  const { scoreInput, notesInput, setScoreInput, setNotesInput, clearDraft } =
    useTryoutGradingDraft(courseId, activeSub, tutorId);

  const pendingList = useMemo(
    () => initialSubmissions.filter((s) => s.status === "pending_review"),
    [initialSubmissions]
  );
  const gradedList = useMemo(
    () => initialSubmissions.filter((s) => s.status === "graded"),
    [initialSubmissions]
  );

  const handleOpenGrade = useCallback((submission: SubmissionItem) => {
    setActiveSub(submission);
  }, []);

  const handleCloseSub = useCallback(() => {
    setActiveSub(null);
  }, []);

  const handleSaveGrade = useCallback(() => {
    if (!activeSub) return;
    const finalScore = parseInt(scoreInput, 10);

    if (isNaN(finalScore) || finalScore < 0 || finalScore > 100) {
      toast.error(tr("scoreInvalid"));
      return;
    }

    startTransition(async () => {
      try {
        const res = await gradeSubmissionAction(courseId, activeSub.id, finalScore, notesInput);
        if (res.success) {
          toast.success(tr("saved"));
          clearDraft();
          setActiveSub(null);
          router.refresh();
        }
      } catch {
        toast.error(tr("saveFailed"));
      }
    });
  }, [activeSub, clearDraft, courseId, notesInput, router, scoreInput, tr]);

  return (
    <ViewportSwitch
      desktop={() => (
        <TryoutGradingDesktop
          queueHeader={queueHeader}
          initialSubmissions={initialSubmissions}
          pendingList={pendingList}
          gradedList={gradedList}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          activeSub={activeSub}
          scoreInput={scoreInput}
          notesInput={notesInput}
          isPending={isPending}
          onOpenGrade={handleOpenGrade}
          onCloseSub={handleCloseSub}
          onScoreChange={setScoreInput}
          onNotesChange={setNotesInput}
          onSaveGrade={handleSaveGrade}
        />
      )}
      mobile={() => (
        <TryoutGradingMobile
          queueHeader={queueHeader}
          initialSubmissions={initialSubmissions}
          pendingList={pendingList}
          gradedList={gradedList}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          activeSub={activeSub}
          scoreInput={scoreInput}
          notesInput={notesInput}
          isPending={isPending}
          onOpenGrade={handleOpenGrade}
          onCloseSub={handleCloseSub}
          onScoreChange={setScoreInput}
          onNotesChange={setNotesInput}
          onSaveGrade={handleSaveGrade}
        />
      )}
    />
  );
}
