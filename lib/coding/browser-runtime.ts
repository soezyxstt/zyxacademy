import { executionResultSchema, runtimeLimitsSchema, type ExecutionResult } from "./contracts";
import type { PythonRuntime } from "./runtime";
import { PYTHON_RUNTIME_ASSETS, PYTHON_RUNTIME_REVISION } from "./runtime-assets";

type WarmFrame = {
  ready: Promise<boolean>;
  port: MessagePort;
  handle?: (data: unknown) => void;
  dispose: () => void;
  claim: () => void;
};
let warmFrame: WarmFrame | undefined;
let warmUsers = 0;

function prepareFrame(): WarmFrame {
  const frame = document.createElement("iframe");
  frame.sandbox.add("allow-scripts");
  frame.allow = "cross-origin-isolated";
  frame.hidden = true;
  frame.title = "Python runtime";
  frame.src = "/coding/runtime-frame";
  const channel = new MessageChannel();
  let settle!: (ready: boolean) => void;
  let closed = false;
  const ready = new Promise<boolean>((resolve) => { settle = resolve; });
  const dispose = () => {
    if (closed) return;
    closed = true;
    clearTimeout(expiry);
    settle(false);
    channel.port1.postMessage({ type: "stop" });
    channel.port1.close();
    frame.remove();
    if (warmFrame === prepared) warmFrame = undefined;
  };
  // A ready but unused interpreter must not remain allocated indefinitely.
  const expiry = setTimeout(dispose, 120_000);
  const prepared: WarmFrame = { ready, port: channel.port1, dispose, claim: () => clearTimeout(expiry) };
  channel.port1.onmessage = ({ data }) => {
    if (data.type === "connected") channel.port1.postMessage({ type: "run", prepare: true, code: "", stdin: "", interactive: true, timeoutMs: 5000, maxOutputChars: 8000, workerUrl: `${location.origin}/coding/worker.js`, assetBase: `${location.origin}/api/coding/runtime/${PYTHON_RUNTIME_REVISION}/`, revision: PYTHON_RUNTIME_REVISION, assets: PYTHON_RUNTIME_ASSETS });
    if (data.type === "prepared") settle(true);
    if (data.type === "result") { settle(false); if (!prepared.handle) dispose(); }
    prepared.handle?.(data);
  };
  frame.onload = () => frame.contentWindow?.postMessage({ type: "connect" }, "*", [channel.port2]);
  document.body.appendChild(frame);
  return prepared;
}

export function preloadPythonAssets(): () => void {
  warmUsers++;
  warmFrame ??= prepareFrame();
  return () => {
    warmUsers--;
    if (!warmUsers) warmFrame?.dispose();
  };
}

type TerminalCallbacks = { output: (text: string) => void; input: (send: (value: string) => void) => void };
export function createBrowserPythonRuntime(onPhase?: (phase: "loading" | "running") => void, terminal?: TerminalCallbacks): PythonRuntime {
  return {
    async execute({ code, stdin, limits: rawLimits, signal }) {
      const limits = runtimeLimitsSchema.parse(rawLimits);
      if (signal?.aborted) return { status: "stopped", stdout: "", stderr: "", truncated: false };
      onPhase?.("loading");
      if (terminal) {
        const prepared = warmFrame ?? prepareFrame();
        if (warmFrame === prepared) warmFrame = undefined;
        prepared.claim();
        return new Promise<ExecutionResult>((resolve) => {
          let settled = false;
          const finish = (result: ExecutionResult) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal?.removeEventListener("abort", stop);
            prepared.dispose();
            resolve(result);
            if (warmUsers && !warmFrame) warmFrame = prepareFrame();
          };
          const stop = () => finish({ status: "stopped", stdout: "", stderr: "", truncated: false });
          const timer = setTimeout(() => finish({ status: "unavailable", stdout: "", stderr: "Python belum dapat dimuat. Coba lagi.", truncated: false }), 50_000 + limits.timeoutMs);
          signal?.addEventListener("abort", stop, { once: true });
          prepared.handle = (message: unknown) => {
            const data = message as { type?: string; text?: unknown; result?: unknown };
            if (data.type === "running") onPhase?.("running");
            if (data.type === "output" && typeof data.text === "string") terminal.output(data.text);
            if (data.type === "input-request") terminal.input((value) => prepared.port.postMessage({ type: "input", value }));
            if (data.type === "result") {
              const parsed = executionResultSchema.safeParse(data.result);
              finish(parsed.success ? parsed.data : { status: "unavailable", stdout: "", stderr: "Hasil eksekusi tidak tersedia.", truncated: false });
            }
          };
          void prepared.ready.then((ok) => {
            if (settled) return;
            if (!ok) return finish({ status: "unavailable", stdout: "", stderr: "Python belum dapat dimuat. Coba lagi.", truncated: false });
            prepared.port.postMessage({ type: "execute", code, stdin, ...limits });
          });
        });
      }
      return new Promise<ExecutionResult>((resolve) => {
        const frame = document.createElement("iframe");
        frame.sandbox.add("allow-scripts");
        frame.hidden = true;
        frame.title = "Python runtime";
        frame.src = "/coding/runtime-frame";
        const channel = new MessageChannel();
        let settled = false;
        const finish = (result: ExecutionResult) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal?.removeEventListener("abort", stop);
          channel.port1.close(); frame.remove(); resolve(result);
        };
        const stop = () => { channel.port1.postMessage({ type: "stop" }); finish({ status: "stopped", stdout: "", stderr: "", truncated: false }); };
        const timer = setTimeout(() => finish({ status: "unavailable", stdout: "", stderr: "Python belum dapat dimuat. Coba lagi.", truncated: false }), 50_000 + limits.timeoutMs);
        signal?.addEventListener("abort", stop, { once: true });
        channel.port1.onmessage = ({ data }) => {
          if (data.type === "connected") channel.port1.postMessage({ type: "run", code, stdin, interactive: false, ...limits, workerUrl: `${location.origin}/coding/worker.js`, assetBase: `${location.origin}/api/coding/runtime/${PYTHON_RUNTIME_REVISION}/`, revision: PYTHON_RUNTIME_REVISION, assets: PYTHON_RUNTIME_ASSETS });
          if (data.type === "running") onPhase?.("running");
          if (data.type === "result") {
            const parsed = executionResultSchema.safeParse(data.result);
            finish(parsed.success ? parsed.data : { status: "unavailable", stdout: "", stderr: "Hasil eksekusi tidak tersedia.", truncated: false });
          }
        };
        frame.onload = () => frame.contentWindow?.postMessage({ type: "connect" }, "*", [channel.port2]);
        document.body.appendChild(frame);
      });
    },
  };
}
