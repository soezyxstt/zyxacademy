import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { randomUUID } from "expo-crypto";
import { useNativeSession } from "../../../auth/session-provider";
import { scopedFiles, type DocumentDraftRequest, type DraftDocument } from "../../../device/files";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import { FORM_FILE_MIMES } from "../../../../../packages/forms/file-types";
import { formFileSizeLimitMb } from "../../../../../packages/forms/presentation";
import type { FormQuestion } from "../../../../../packages/native-parity/operations/management-contract";

type LocalAttachment = { document: DraftDocument; request: DocumentDraftRequest };

export function useFormPreviewFiles(locale: "id" | "en") {
  const { getSnapshot, transport } = useNativeSession();
  const { canInteract } = useProtectedInteraction();
  const scope = useRef<AbortController | null>(null);
  const owned = useRef<Record<number, LocalAttachment>>({});
  const pending = useRef<AbortSignal | null>(null);
  const [files, setFiles] = useState<Record<number, LocalAttachment>>({});
  const [busy, setBusy] = useState<number>();
  const [error, setError] = useState<{ index: number; message: string }>();

  useFocusEffect(useCallback(() => {
    const controller = new AbortController();
    scope.current = controller;
    setBusy(undefined);
    setFiles({});
    setError(undefined);
    return () => {
      scope.current = null;
      controller.abort();
      owned.current = {};
    };
  }, [transport]));

  const current = (signal: AbortSignal) => {
    const snapshot = getSnapshot();
    return Boolean(transport && scope.current?.signal === signal && !signal.aborted && transport.isCurrent()
      && snapshot.transport === transport && !snapshot.revalidating && canInteract());
  };

  function clear(index?: number) {
    if (index === undefined) {
      Object.values(owned.current).forEach(({ document }) => document.release());
      owned.current = {};
    } else {
      owned.current[index]?.document.release();
      delete owned.current[index];
    }
    setFiles({ ...owned.current });
    setError(undefined);
  }

  async function run(index: number, task: (signal: AbortSignal) => Promise<void>) {
    const signal = scope.current?.signal;
    if (!signal || pending.current === signal || !current(signal)) return;
    pending.current = signal;
    setBusy(index);
    setError(undefined);
    try { await task(signal); }
    catch { if (current(signal)) setError({ index, message: "Berkas belum dapat dibuka. Coba lagi." }); }
    finally {
      if (pending.current === signal) pending.current = null;
      if (scope.current?.signal === signal) setBusy(undefined);
    }
  }

  function choose(index: number, question: FormQuestion) {
    if (!transport) return;
    void run(index, async signal => {
      const mimeTypes = question.allowedFileTypes ? FORM_FILE_MIMES.filter(type => question.allowedFileTypes?.includes(type)) : FORM_FILE_MIMES;
      const request: DocumentDraftRequest = {
        session: transport, signal, isDraftCurrent: () => current(signal),
        target: { route: "/admin/forms", locale, draftId: randomUUID() },
        policy: { mimeTypes, maxBytes: formFileSizeLimitMb(question.maxFileSizeMb) * 2 ** 20 },
      };
      const result = await scopedFiles.pickDocument(request);
      if (result.status === "ready") {
        if (!current(signal)) { result.document.release(); return; }
        owned.current[index]?.document.release();
        owned.current[index] = { document: result.document, request };
        setFiles({ ...owned.current });
      } else if (current(signal) && result.status !== "cancelled" && result.status !== "stale") {
        const message = result.status === "error" && result.issue === "size" ? "Berkas melebihi batas ukuran."
          : result.status === "error" && result.issue === "type" ? "Format berkas tidak diizinkan."
            : "Berkas belum dapat dipilih. Coba lagi.";
        setError({ index, message });
      }
    });
  }

  function share(index: number) {
    const attachment = owned.current[index];
    if (!attachment) return;
    void run(index, async () => {
      const result = await scopedFiles.shareDocument(attachment.document, attachment.request);
      if (result.status !== "finished" && result.status !== "cancelled" && result.status !== "stale") {
        throw new Error("File share unavailable.");
      }
    });
  }

  return { available: Boolean(transport), files, busy, error, choose, share, clear };
}
