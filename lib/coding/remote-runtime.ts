import type { ExecutionResult } from "./contracts";
import type { PythonRuntime } from "./runtime";
import { takeWarmRemotePython } from "./remote-warm";

type Terminal = { output(text: string): void; input(send: (value: string) => void): void };

export function createRemotePythonRuntime(courseId: string, onPhase: (phase: "loading" | "running") => void, terminal: Terminal): PythonRuntime {
  return {
    async execute({ code, limits, signal }) {
      const unavailable = (): ExecutionResult => ({ status: "unavailable", stdout: "", stderr: "Python belum tersedia. Coba lagi.", truncated: false });
      onPhase("loading");
      const attempt = async (allowWarm: boolean, retry: boolean): Promise<ExecutionResult> => {
      const warm = allowWarm ? await takeWarmRemotePython(courseId, signal) : null;
      if (signal?.aborted) { warm?.close(); return { status: "stopped", stdout: "", stderr: "", truncated: false }; }
      let connection: { url: string; ticket: string } | undefined;
      try {
        if (!warm) {
        const response = await fetch("/api/coding/terminal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId }), signal });
        if (!response.ok) return unavailable();
        connection = await response.json();
        if (connection.url !== "wss://zyx-py-runtime.onrender.com/v1/terminal" || typeof connection.ticket !== "string" || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(connection.ticket)) return unavailable();
        }
      } catch { return signal?.aborted ? { status: "stopped", stdout: "", stderr: "", truncated: false } : unavailable(); }
      return new Promise<ExecutionResult>((resolve) => {
        let socket: WebSocket;
        try { socket = warm ?? new WebSocket(connection!.url, ["zyx-v1", `ticket.${connection!.ticket}`]); } catch { resolve(unavailable()); return; }
        let output = "", truncated = false, settled = false, sent = false;
        const decoder = new TextDecoder();
        const timer = setTimeout(() => finish(unavailable()), 90_000);
        const finish = (result: ExecutionResult) => {
          if (settled) return;
          settled = true; clearTimeout(timer); signal?.removeEventListener("abort", stop); socket.close(); resolve(result);
        };
        const stop = () => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "stop" })); finish({ status: "stopped", stdout: output, stderr: "", truncated }); };
        signal?.addEventListener("abort", stop, { once: true });
        if (signal?.aborted) { stop(); return; }
        socket.onmessage = (event) => {
          if (settled) return;
          let message: { type?: string; data?: string; status?: string };
          try { message = JSON.parse(event.data); } catch { finish(unavailable()); return; }
          if (!message || typeof message !== "object") { finish(unavailable()); return; }
          if (message.type === "ready") { try { socket.send(JSON.stringify({ type: "start", code })); sent = true; } catch { retryBeforeSend(); } }
          if (message.type === "running") {
            clearTimeout(timer); onPhase("running");
            terminal.input((value) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "input", data: value + "\n" })); });
          }
          if (message.type === "output" && typeof message.data === "string") {
            try {
              const bytes = Uint8Array.from(atob(message.data), (c) => c.charCodeAt(0));
              const text = decoder.decode(bytes, { stream: true });
              const visible = text.slice(0, Math.max(0, limits.maxOutputChars - output.length));
              output += visible; truncated ||= visible.length < text.length;
              if (visible) terminal.output(visible);
            } catch { finish(unavailable()); }
          }
          if (message.type === "result") {
            const statuses: Record<string, ExecutionResult["status"]> = { completed: "completed", stopped: "stopped", error: "runtime_error", output_limit: "runtime_error", input_limit: "runtime_error", unavailable: "unavailable" };
            const status = statuses[message.status ?? ""] ?? "unavailable";
            finish({ status, stdout: output, stderr: status === "unavailable" ? "Python belum tersedia. Coba lagi." : "", truncated: truncated || message.status === "output_limit" });
          }
        };
        const retryBeforeSend = () => {
          if (settled) return;
          if (!sent && retry && !signal?.aborted) {
            settled = true; clearTimeout(timer); signal?.removeEventListener("abort", stop); socket.close();
            void new Promise<void>(done => setTimeout(done, 1500)).then(() => attempt(false, false)).then(resolve, () => resolve(unavailable()));
          } else finish(unavailable());
        };
        socket.onerror = retryBeforeSend;
        socket.onclose = retryBeforeSend;
        if (warm) { try { if (socket.readyState !== WebSocket.OPEN) throw new Error(); socket.send(JSON.stringify({ type: "start", code })); sent = true; } catch { retryBeforeSend(); } }
      });
      };
      return attempt(true, true);
    },
  };
}
