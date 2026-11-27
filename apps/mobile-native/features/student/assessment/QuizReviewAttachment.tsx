import { useEffect, useRef, useState } from "react";
import type { Attachment } from "../../../../../packages/native-parity/student/assessment/contract";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import { Body, Button, ButtonRow, useAssessment, useAssessmentCopy } from "./ui";

export function QuizReviewAttachment({ attemptId, questionId, attachment }: {
  attemptId: string; questionId: string; attachment: Pick<Attachment, "fileName" | "fileSize">;
}) {
  const { route, shareQuizReviewAttachment, focused } = useAssessment();
  const { tx } = useAssessmentCopy();
  const { canInteract, suspended } = useProtectedInteraction();
  const pending = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (suspended || focused === false) pending.current?.abort();
    return () => pending.current?.abort();
  }, [suspended, focused, attemptId, questionId]);

  async function open() {
    if (!shareQuizReviewAttachment || pending.current || focused === false || !canInteract()) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError(false);
    try {
      const result = await shareQuizReviewAttachment(route.params.id, attemptId, questionId, attachment.fileName, controller.signal);
      if (!controller.signal.aborted) setError(result.status !== "finished" && result.status !== "cancelled");
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      if (pending.current === controller) pending.current = null;
      setBusy(false);
    }
  }

  return <>
    <ButtonRow>
      <Body tone="muted">{attachment.fileName}{attachment.fileSize ? ` · ${attachment.fileSize}` : ""}</Body>
      {shareQuizReviewAttachment && <Button size="sm" variant="outline" disabled={suspended} isLoading={busy}
        onPress={() => void open()} testID="student-quiz-review-attachment">{tx("Unduh lampiran", "Download attachment")}</Button>}
    </ButtonRow>
    {error ? <Body tone="error">{tx("Lampiran belum dapat dimuat.", "The attachment could not be loaded.")}</Body> : null}
  </>;
}
