import { useIsFocused } from "expo-router";
import { useContext, useLayoutEffect, useRef, useState } from "react";
import { useNativeSession } from "../../../auth/session-provider";
import { scopedFiles, type NativeDownloadTarget } from "../../../device/files";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import { Button } from "../../../components/Button";
import { CourseTheme } from "../courses/ui";
import { tryoutGradeAttachmentPolicy } from "../../../../../packages/academic/tryout-grade-attachment";
import { AssessmentNotice } from "./ui";

const quizPolicy = { mimeTypes: tryoutGradeAttachmentPolicy.mimeTypes, maxBytes: 4 * 1024 * 1024 };
type Target = Extract<NativeDownloadTarget, { kind: "quiz-grade-attachment" | "tryout-grade-attachment" }>;

export function GradeAttachment({ target, fileName, theme }: { target: Target; fileName?: string; theme?: "light" | "dark" }) {
  const courseTheme = useContext(CourseTheme);
  const targetId = target.kind === "tryout-grade-attachment" ? target.submissionId : target.attemptId;
  const targetKey = JSON.stringify([target.kind, target.courseId, targetId, target.questionId]);
  const policy = target.kind === "tryout-grade-attachment" ? tryoutGradeAttachmentPolicy : quizPolicy;
  const { transport, getSnapshot } = useNativeSession();
  const { canInteract } = useProtectedInteraction();
  const focused = useIsFocused();
  const operation = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useLayoutEffect(() => {
    setBusy(false);
    setError(false);
    return () => {
      operation.current?.abort();
      operation.current = null;
    };
  }, [focused, transport, targetKey]);

  async function open() {
    if (!focused || !transport?.isCurrent() || !canInteract() || operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setError(false);
    const isTargetCurrent = () => {
      const snapshot = getSnapshot();
      return operation.current === controller && !controller.signal.aborted && canInteract() &&
        snapshot.transport === transport && !snapshot.revalidating;
    };
    try {
      const result = await scopedFiles.shareAuthorizedDownload({ session: transport, target, policy, fileName,
        signal: controller.signal, isTargetCurrent, title: "Lampiran jawaban" });
      if (isTargetCurrent() && result.status !== "finished" && result.status !== "cancelled" && result.status !== "stale") setError(true);
    } catch {
      if (isTargetCurrent()) setError(true);
    } finally {
      if (operation.current === controller && !controller.signal.aborted) {
        operation.current = null;
        setBusy(false);
      }
    }
  }

  return <>
    <Button theme={theme ?? courseTheme} variant="outline" onPress={() => void open()}
      disabled={busy || !transport || !focused} testID={`academic-grade-attachment-${target.questionId}`}>
      {busy ? "Membuka lampiran…" : "Buka lampiran"}
    </Button>
    {error ? <AssessmentNotice message="Lampiran belum bisa dibuka. Periksa akses lalu coba lagi." error /> : null}
  </>;
}
