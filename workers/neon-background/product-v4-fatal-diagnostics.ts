import { AsyncLocalStorage } from "node:async_hooks";

const scopes = new AsyncLocalStorage<{ active: boolean }>();
const activeTasks = new Map<object, string>();
const errorNames = new Set(["Error", "TypeError", "RangeError", "ReferenceError", "SyntaxError", "AbortError", "TimeoutError", "ZodError", "RetryAfterError", "NonRetriableError", "DatabaseError"]);
let installed = false;

function snapshot() {
  const tasks = [...new Set(activeTasks.values())];
  return { activeTasks: tasks.slice(0, 3), activeTaskCount: tasks.length, ...(tasks.length > 3 ? { activeTasksTruncated: true } : {}) };
}

function describe(error: unknown) {
  const value = error && typeof error === "object" ? error as { name?: unknown; stack?: unknown } : {};
  const name = value.name, stack = value.stack;
  const errorType = typeof name === "string" && errorNames.has(name) ? name : "UnknownError";
  const frames: { file: string; line: number; column: number }[] = [];
  if (typeof stack === "string") for (const line of stack.slice(0, 32_768).split("\n")) {
    if (!/^\s+at\s/.test(line)) continue;
    const match = line.match(/(?:[/\\]node_modules[/\\]playwright-core[/\\]lib[/\\](coreBundle\.js|utilsBundle\.js)|[/\\](index\.mjs)):(\d{1,7}):(\d{1,9})\)?\s*$/);
    if (match) frames.push({ file: match[1] ?? match[2], line: Number(match[3]), column: Number(match[4]) });
    if (frames.length === 3) break;
  }
  return { errorType, ...(frames.length ? { frames } : {}) };
}

function onFatal(error: unknown, origin: unknown) {
  try {
    if (!activeTasks.size) return;
    console.error(JSON.stringify({ event: "product_v4.process_fatal", job: "product-v4-verification",
      origin: origin === "uncaughtException" || origin === "unhandledRejection" ? origin : "unknown",
      ...snapshot(), ...describe(error) }));
  } catch { /* Observation must not affect Node's normal fatal-error behavior. */ }
}

function onExit(code: number) {
  try {
    if (!activeTasks.size) return;
    console.error(JSON.stringify({ event: "product_v4.process_exit", job: "product-v4-verification", ...snapshot(),
      ...(Number.isInteger(code) && code >= 0 && code <= 255 ? { exitCode: code } : {}) }));
  } catch { /* Never replace the process exit. */ }
}

/** Only the Neon entrypoint installs observers. No fatal/rejection or signal handler is added. */
export function installProductV4FatalDiagnostics() {
  if (installed || process.env.ZYX_COMPUTE_RUNTIME !== "neon") return;
  try {
    process.on("uncaughtExceptionMonitor", onFatal);
    process.on("exit", onExit);
    installed = true;
  } catch {
    try { process.off("uncaughtExceptionMonitor", onFatal); process.off("exit", onExit); } catch { /* Best-effort observation only. */ }
  }
}

/** Eligibility is not authorization. The queue's existing auth boundary activates this scope. */
export async function withProductV4FatalDiagnosticScope<T>(eligible: boolean, execute: () => Promise<T>): Promise<T> {
  if (!eligible || process.env.ZYX_COMPUTE_RUNTIME !== "neon") return execute();
  const scope = { active: true };
  return scopes.run(scope, async () => {
    try { return await execute(); }
    finally { scope.active = false; activeTasks.delete(scope); }
  });
}

/** Called only after OIDC and delivery validation; never retains mutable request inputs. */
export function activateProductV4FatalDiagnostics(task: string) {
  try {
    const scope = scopes.getStore();
    if (process.env.ZYX_COMPUTE_RUNTIME === "neon" && scope?.active && typeof task === "string" && /^[a-f0-9]{64}$/.test(task)) activeTasks.set(scope, task);
  } catch { /* Diagnostics cannot change the authorized delivery. */ }
}
