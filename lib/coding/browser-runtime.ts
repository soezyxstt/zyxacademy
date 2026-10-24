import { executionResultSchema, runtimeLimitsSchema, type ExecutionResult } from "./contracts";
import type { PythonRuntime } from "./runtime";
import { PYTHON_RUNTIME_ASSETS, PYTHON_RUNTIME_REVISION } from "./runtime-assets";

export function createBrowserPythonRuntime(onPhase?: (phase: "loading" | "running") => void): PythonRuntime {
  return {
    async execute({ code, stdin, limits: rawLimits, signal }) {
      const limits = runtimeLimitsSchema.parse(rawLimits);
      if (signal?.aborted) return { status: "stopped", stdout: "", stderr: "", truncated: false };
      onPhase?.("loading");
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
          if (data.type === "connected") channel.port1.postMessage({ type: "run", code, stdin, ...limits, workerUrl: `${location.origin}/coding/worker.js`, assetBase: `${location.origin}/api/coding/runtime/${PYTHON_RUNTIME_REVISION}/`, revision: PYTHON_RUNTIME_REVISION, assets: PYTHON_RUNTIME_ASSETS });
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
