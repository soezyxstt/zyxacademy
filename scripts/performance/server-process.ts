import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";

export interface ProcessInspector {
  listeners(port: number, signal?: AbortSignal): Promise<number[]>;
  group(pid: number, signal?: AbortSignal): Promise<number>;
}

export const linuxInspector: ProcessInspector = {
  async listeners(port, signal) {
    if (process.platform !== "linux") throw new Error("LISTENER_INSPECTION_UNSUPPORTED: Linux is required");
    const output = await new Promise<string>((resolve, reject) => {
      execFile("ss", ["-H", "-ltnp", "sport = :" + port], { signal, timeout: 1500, maxBuffer: 1024 * 1024 }, (error, stdout) => {
        if (error) reject(new Error("LISTENER_INSPECTION_UNAVAILABLE: ss failed or timed out"));
        else resolve(stdout);
      });
    });
    const pids: number[] = [];
    for (const line of output.trim().split("\n").filter(Boolean)) {
      const matches = [...line.matchAll(/pid=(\d+)/g)];
      if (!matches.length) throw new Error("LISTENER_PID_HIDDEN: Cannot verify listener ownership");
      pids.push(...matches.map((match) => Number(match[1])));
    }
    return [...new Set(pids)];
  },
  async group(pid, signal) {
    try {
      const stat = await readFile(`/proc/${pid}/stat`, { encoding: "utf8", signal });
      const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      const group = Number(fields[2]);
      if (!Number.isSafeInteger(group) || group <= 0) throw new Error();
      return group;
    } catch { throw new Error("LISTENER_PROCESS_UNAVAILABLE: Cannot verify listener process group"); }
  },
};

export async function verifyListenerOwnership(port: number, group: number, inspector: ProcessInspector = linuxInspector, signal?: AbortSignal): Promise<boolean> {
  const pids = await inspector.listeners(port, signal);
  if (!pids.length) return false;
  for (const pid of pids) {
    if (await inspector.group(pid, signal) !== group) throw new Error("FOREIGN_LISTENER: Port listener does not belong to the owned process group");
  }
  return true;
}

export interface StopDependencies {
  signal(group: number, signal: NodeJS.Signals | 0): void;
  now(): number;
  sleep(ms: number): Promise<void>;
}
const stopDefaults: StopDependencies = {
  signal: (group, signal) => { process.kill(-group, signal); },
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};
export async function stopProcessGroup(group: number, deps: StopDependencies = stopDefaults): Promise<void> {
  const alive = () => {
    try { deps.signal(group, 0); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return false; throw new Error("OWNED_GROUP_INSPECTION_FAILED"); }
  };
  const send = (signal: NodeJS.Signals) => {
    try { deps.signal(group, signal); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw new Error(`OWNED_GROUP_SIGNAL_FAILED: ${signal}`); }
  };
  const wait = async (ms: number) => {
    const end = deps.now() + ms;
    while (alive() && deps.now() < end) await deps.sleep(Math.min(100, end - deps.now()));
    return !alive();
  };
  if (!alive()) return;
  send("SIGTERM");
  if (await wait(2000)) return;
  send("SIGKILL");
  if (!(await wait(3000))) throw new Error("OWNED_GROUP_STILL_ALIVE: Cleanup failed after SIGKILL");
}

export interface ReadinessDependencies {
  now(): number;
  sleep(ms: number, signal: AbortSignal): Promise<void>;
  inspect(signal: AbortSignal): Promise<boolean>;
  probe(signal: AbortSignal): Promise<boolean>;
  banner(): boolean;
  isAlive(): boolean;
  cleanup(): Promise<void>;
}

// Async dependencies must honor the signal and settle when aborted.
export async function awaitOwnedReadiness(deps: ReadinessDependencies, timeoutMs: number, externalSignal?: AbortSignal): Promise<void> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("INVALID_START_TIMEOUT");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("OWNED_SERVER_START_TIMEOUT")), timeoutMs);
  const onAbort = () => controller.abort(externalSignal?.reason);
  externalSignal?.addEventListener("abort", onAbort, { once: true });
  if (externalSignal?.aborted) onAbort();
  const signal = controller.signal;
  const deadline = deps.now() + timeoutMs;
  const check = () => {
    signal.throwIfAborted();
    if (deps.now() >= deadline) throw new Error("OWNED_SERVER_START_TIMEOUT");
    if (!deps.isAlive()) throw new Error("OWNED_SERVER_EXITED_EARLY");
  };
  try {
    while (true) {
      check();
      // Inspect even before the banner so a foreign listener fails immediately.
      const owned = await deps.inspect(signal);
      check();
      if (deps.banner() && owned && await deps.probe(signal)) {
        check();
        const stillOwned = await deps.inspect(signal);
        check();
        if (stillOwned && deps.banner()) return;
      }
      await deps.sleep(Math.min(500, Math.max(0, deadline - deps.now())), signal);
    }
  } catch (error) {
    await deps.cleanup();
    if (signal.aborted) throw signal.reason;
    throw error;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", onAbort);
  }
}
