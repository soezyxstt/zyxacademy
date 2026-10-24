import "server-only";
import { chromium, type Browser } from "playwright-core";
import { acquireSteelVerificationBrowser, acquireVerificationBrowser, type VerificationBrowserSession } from "../compute/product-v4-browser-session";
import { verificationBrowserFailureCode } from "../compute/product-v4-browser-config";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PYTHON_RUNTIME_ASSETS, PYTHON_RUNTIME_REVISION } from "./runtime-assets";
import { executionResultSchema } from "./contracts";
import type { PythonRuntime } from "./runtime";

/** No learner code runs in Node. Each case gets a new context and a disposable Worker.
 * Route all browser traffic to fixed local assets; deny all other requests and sockets.
 */
export async function createTrustedPythonRuntime(): Promise<PythonRuntime & { close(): Promise<void> }> {
  const provider = process.env.CODING_BROWSER_PROVIDER ?? (process.env.NODE_ENV === "production" ? "cloudflare" : "local");
  let session: VerificationBrowserSession;
  try {
    if (provider === "steel") session = await acquireSteelVerificationBrowser(process.env.STEEL_API_KEY ?? "");
    else if (provider === "cloudflare") session = await acquireVerificationBrowser(process.env.CF_ACCOUNT_ID ?? "", process.env.CF_API_TOKEN ?? "");
    else if (provider === "local" && process.env.NODE_ENV !== "production") {
      const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
      session = { browser, close: () => browser.close() };
    } else throw new Error("CODING_RUNTIME_CONFIGURATION_REQUIRED");
  } catch (error) {
    // Provider errors can contain credentials. Log categories only, never the error itself.
    console.warn("CODING_RUNTIME_ACQUIRE_FAILED", verificationBrowserFailureCode(error) ?? "CODING_RUNTIME_UNAVAILABLE");
    throw new Error("CODING_RUNTIME_UNAVAILABLE");
  }
  const close = async () => {
    try { await session.close(); }
    catch (error) {
      console.warn("CODING_RUNTIME_RELEASE_FAILED", verificationBrowserFailureCode(error) ?? "CODING_RUNTIME_UNAVAILABLE");
      throw new Error("CODING_RUNTIME_RELEASE_FAILED");
    }
  };
  try { return await createIsolatedBrowserPythonRuntime(session.browser, close); }
  catch (error) { await close(); throw error; }
}

/** Shared implementation; injected browsers are used only by trusted server callers and tests. */
export async function createIsolatedBrowserPythonRuntime(browser: Browser, close = () => browser.close()): Promise<PythonRuntime & { close(): Promise<void> }> {
  const root = dirname(createRequire(join(process.cwd(), "package.json")).resolve(["pyo", "dide"].join("")));
  const workerSource = await readFile(join(process.cwd(), "public/coding/worker.js"), "utf8");
  return {
    close,
    async execute({ code, stdin, limits, signal }) {
      const context = await browser.newContext({ serviceWorkers: "block", acceptDownloads: false });
      let timer: ReturnType<typeof setTimeout> | undefined;
      let aborted = false;
      let phase = "routing";
      let closing: Promise<void> | undefined;
      const closeContext = () => closing ??= context.close();
      let cancel!: (reason: Error) => void;
      const cancelled = new Promise<never>((_, reject) => { cancel = reject; });
      // Closing a remote context can leave an in-flight CDP setup command pending.
      // Race cancellation explicitly instead of relying on that command to reject.
      const stop = () => { aborted = true; cancel(new Error("CODING_RUNTIME_STOPPED")); void closeContext().catch(() => {}); };
      signal?.addEventListener("abort", stop, { once: true });
      try {
        timer = setTimeout(() => { cancel(new Error("CODING_RUNTIME_DEADLINE")); void closeContext().catch(() => {}); }, 30_000);
        const run = async () => {
          if (signal?.aborted) { stop(); throw new Error("CODING_RUNTIME_STOPPED"); }
          context.setDefaultTimeout(15_000);
          await context.route("**/*", async (route) => {
            const url = new URL(route.request().url());
            const asset = url.pathname.slice(1);
            if (url.origin === "https://python.zyx.invalid" && url.pathname === "/runner") return route.fulfill({ contentType: "text/html", headers: { "Content-Security-Policy": "default-src 'none'; script-src blob: 'wasm-unsafe-eval' https://python.zyx.invalid/; connect-src https://python.zyx.invalid/; worker-src blob:; object-src 'none'; base-uri 'none'; form-action 'none'" }, body: "<!doctype html><html><body></body></html>" });
            if (url.origin !== "https://python.zyx.invalid" || !Object.hasOwn(PYTHON_RUNTIME_ASSETS, asset) || route.request().method() !== "GET") return route.abort();
            await route.fulfill({ body: await readFile(join(root, asset)), headers: { "Access-Control-Allow-Origin": "*" }, contentType: PYTHON_RUNTIME_ASSETS[asset as keyof typeof PYTHON_RUNTIME_ASSETS] });
          });
          await context.routeWebSocket(/.*/, (socket) => socket.close());
          phase = "page";
          const page = await context.newPage();
          await page.goto("https://python.zyx.invalid/runner");
          await page.exposeFunction("__codingRuntimePhase", (value: unknown) => {
            // Diagnostics only. Never log Worker payloads, learner code or errors.
            if (value === "module" || value === "wasm-stdlib" || value === "execution") phase = value;
          });
          // Fetch on the page target, where CDP interception is reliable. Some remote
          // Chromium versions emit Worker imports without an inherited Fetch pause.
          // Only pinned local bytes cross into the Worker; no upstream fetch is needed.
          phase = "assets";
          const result = await page.evaluate(async ({ source, code, stdin, limits, revision, assets }) => {
            const files = Object.fromEntries(await Promise.all(Object.entries(assets).map(async ([name, contentType]) => {
              const response = await fetch("https://python.zyx.invalid/" + name);
              if (!response.ok) throw new Error("CODING_RUNTIME_ASSET_UNAVAILABLE");
              return [name, { body: await response.arrayBuffer(), contentType }] as const;
            })));
            const moduleUrl = (name: string) => URL.createObjectURL(new Blob([files[name].body], { type: "text/javascript" }));
            const preloaded = { files, loaderUrl: moduleUrl("pyodide.mjs"), moduleUrl: moduleUrl("pyodide.asm.mjs") };
            return new Promise((resolve) => {
              const report = (value: string) => {
                void (globalThis as unknown as { __codingRuntimePhase(value: string): Promise<void> }).__codingRuntimePhase(value).catch(() => {});
              };
              const worker = new Worker(URL.createObjectURL(new Blob([source], { type: "text/javascript" })), { type: "module" });
              let executionTimer: ReturnType<typeof setTimeout> | undefined;
              worker.onmessage = ({ data }) => {
                if (data.type === "phase") report(data.phase);
                if (data.type === "ready") {
                  report("execution");
                  executionTimer = setTimeout(() => { worker.terminate(); resolve({ status: "timeout", stdout: "", stderr: "Eksekusi melewati batas waktu.", truncated: false }); }, limits.timeoutMs);
                  worker.postMessage({ type: "execute" });
                }
                if (data.type === "result") { clearTimeout(executionTimer); worker.terminate(); resolve(data.result); }
              };
              worker.onerror = () => { clearTimeout(executionTimer); worker.terminate(); resolve({ status: "unavailable", stdout: "", stderr: "", truncated: false }); };
              worker.postMessage({ type: "run", code, stdin, ...limits, assetBase: "https://python.zyx.invalid/", revision, preloaded }, Object.values(files).map((file) => file.body));
            });
          }, { source: workerSource, code, stdin, limits, revision: PYTHON_RUNTIME_REVISION, assets: PYTHON_RUNTIME_ASSETS });
          const execution = executionResultSchema.parse(result);
          if (execution.status === "unavailable") console.warn("CODING_RUNTIME_EXECUTION_UNAVAILABLE", phase);
          return execution;
        };
        return await Promise.race([run(), cancelled]);
      } catch {
        console.warn("CODING_RUNTIME_EXECUTION_UNAVAILABLE", phase);
        return { status: aborted ? "stopped" : "unavailable", stdout: "", stderr: "", truncated: false };
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", stop);
        await closeContext().catch(() => {});
      }
    },
  };
}
