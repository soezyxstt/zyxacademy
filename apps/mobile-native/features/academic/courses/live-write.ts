import { useEffect, useRef, useState } from "react";
import { randomUUID } from "expo-crypto";
import type { AdminCourseEditResponse } from "../../../../../packages/native-parity/academic/courses/edit-contract";

export function useCourseWrite<Draft>(write: (draft: Draft, requestId: string, signal: AbortSignal) => Promise<AdminCourseEditResponse>, onSaved: () => void) {
  const [status, setStatus] = useState<AdminCourseEditResponse["status"] | "sending" | null>(null);
  const pending = useRef<{ requestId: string; draft: Draft } | null>(null);
  const sending = useRef<AbortController | null>(null);
  useEffect(() => () => sending.current?.abort(), []);

  async function send(request: NonNullable<typeof pending.current>) {
    if (sending.current) return;
    pending.current = request;
    const controller = new AbortController();
    sending.current = controller;
    setStatus("sending");
    try {
      const result = await write(request.draft, request.requestId, controller.signal);
      if (controller.signal.aborted) return;
      if (result.status === "saved") onSaved();
      else setStatus(result.status);
    } catch {
      if (!controller.signal.aborted) setStatus("retry");
    } finally {
      sending.current = null;
    }
  }

  const busy = status === "sending";
  const stale = status === "conflict" || status === "missing";
  return {
    status, setStatus, busy, stale,
    editable: !busy && !stale && status !== "denied" && status !== "retry",
    submit(draft: Draft) { void send({ draft, requestId: randomUUID() }); },
    retry() { if (pending.current) void send(pending.current); },
  };
}
