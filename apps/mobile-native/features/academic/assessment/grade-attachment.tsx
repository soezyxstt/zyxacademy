import { useIsFocused } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useNativeSession } from "../../../auth/session-provider";
import { scopedFiles, type NativeDownloadTarget } from "../../../device/files";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import { Action } from "../courses/ui";
import { AssessmentNotice } from "./ui";

const policy = { mimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"], maxBytes: 4 * 1024 * 1024 };

export function GradeAttachment({ target, fileName }: { target: Extract<NativeDownloadTarget, { kind: "quiz-grade-attachment" }>; fileName?: string }) {
  const { transport, getSnapshot } = useNativeSession();
  const { canInteract } = useProtectedInteraction();
  const focused = useIsFocused();
  const operation = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    setBusy(false);
    setError(false);
    return () => {
      operation.current?.abort();
      operation.current = null;
    };
  }, [focused, transport]);

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
    <Action label={busy ? "Membuka lampiran…" : "Buka lampiran"} onPress={() => void open()}
      disabled={busy || !transport || !focused} testID={`academic-grade-attachment-${target.questionId}`} />
    {error ? <AssessmentNotice message="Lampiran belum bisa dibuka. Periksa akses lalu coba lagi." error /> : null}
  </>;
}
