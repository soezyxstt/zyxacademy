import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import type { OpenFormAttachment } from "./form-media";
import { Action, Copy } from "./ui";

type Props = { open: OpenFormAttachment; formId: string; responseId: string; index: number };

export function FormAttachment({ open, formId, responseId, index }: Props) {
  const { canInteract } = useProtectedInteraction();
  const focus = useRef(false);
  const operation = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const stop = useCallback(() => {
    operation.current?.abort();
    operation.current = null;
  }, []);
  useFocusEffect(useCallback(() => {
    focus.current = true;
    setBusy(false);
    setError("");
    return () => { focus.current = false; stop(); };
  }, [open, stop]));
  useEffect(() => {
    setError("");
    setBusy(false);
    return stop;
  }, [formId, responseId, index, stop]);

  async function show() {
    if (!focus.current || operation.current || !canInteract()) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setError("");
    const current = () => focus.current && operation.current === controller && !controller.signal.aborted && canInteract();
    try {
      const result = await open({ formId, responseId, index }, controller.signal, current);
      if (current() && result.status !== "finished" && result.status !== "stale" && result.status !== "cancelled") {
        setError(result.status === "error" && result.issue === "not-found" ? "Lampiran tidak tersedia." : "Lampiran belum bisa dibuka. Coba lagi.");
      }
    } catch {
      if (current()) setError("Lampiran belum bisa dibuka. Coba lagi.");
    } finally {
      if (operation.current === controller) {
        operation.current = null;
        setBusy(false);
      }
    }
  }

  return <>
    <Action onPress={() => void show()} busy={busy}>Buka lampiran</Action>
    {error ? <Copy status="error">{error}</Copy> : null}
  </>;
}
