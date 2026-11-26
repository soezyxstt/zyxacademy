import { useEffect, useRef, useState } from "react";
import { randomUUID } from "expo-crypto";
import type { AdminCourseEditResponse, CourseWriteTarget } from "../../../../../packages/native-parity/academic/courses/edit-contract";

export function useCourseWrite<Draft>(target: CourseWriteTarget<Draft>, onSaved: () => void) {
  const [status, setStatus] = useState<AdminCourseEditResponse["status"] | "sending" | null>(
    () => target.pending() ? "retry" : null,
  );
  const sending = useRef<AbortController | null>(null);
  useEffect(() => () => sending.current?.abort(), []);

  async function send(draft: Draft, requestId: string) {
    if (sending.current) return;
    const controller = new AbortController();
    sending.current = controller;
    setStatus("sending");
    try {
      const result = await target.submit(draft, requestId, controller.signal);
      if (controller.signal.aborted) return;
      if (result.status === "saved") {
        onSaved();
        target.acknowledge(requestId);
      } else {
        setStatus(result.status);
      }
    } catch {
      if (!controller.signal.aborted) setStatus("retry");
    } finally {
      sending.current = null;
    }
  }

  const pending = target.pending();
  const busy = status === "sending";
  const stale = status === "conflict" || status === "missing";
  const editable = !pending && !busy && !stale && status !== "denied" && status !== "retry";
  return {
    status, setStatus, busy, stale, editable,
    confirmed: pending?.confirmed ?? false,
    submit(draft: Draft) {
      if (target.pending()) {
        setStatus("retry");
      } else {
        void send(draft, randomUUID());
      }
    },
    retry() {
      const request = target.pending();
      if (request) void send(request.draft, request.requestId);
    },
  };
}
