import { describe, expect, test } from "bun:test";
import { awaitOwnedReadiness, type ReadinessDependencies } from "../../scripts/performance/server-process";

function fixture() {
  let time = 0;
  let cleaned = 0;
  const events: string[] = [];
  const deps: ReadinessDependencies = {
    now: () => time,
    sleep: async (ms, signal) => { signal.throwIfAborted(); time += ms; },
    inspect: async () => { events.push("inspect"); return true; },
    probe: async () => { events.push("probe"); return true; },
    banner: () => true,
    isAlive: () => true,
    cleanup: async () => { cleaned++; },
  };
  return { deps, events, cleaned: () => cleaned, time: () => time };
}

function untilAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}

describe("owned startup readiness", () => {
  test("never ready reaches its configured deadline and cleans up", async () => {
    const f = fixture();
    f.deps.banner = () => false;
    await expect(awaitOwnedReadiness(f.deps, 1200)).rejects.toThrow("OWNED_SERVER_START_TIMEOUT");
    expect(f.time()).toBe(1200);
    expect(f.cleaned()).toBe(1);
  });

  test.each(["sleep", "probe"] as const)("abort during %s settles and cleans up", async (phase) => {
    const f = fixture();
    const controller = new AbortController();
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    if (phase === "sleep") {
      f.deps.banner = () => false;
      f.deps.sleep = async (_, signal) => { entered(); await untilAbort(signal); };
    } else f.deps.probe = async (signal) => { entered(); return untilAbort(signal); };
    const result = awaitOwnedReadiness(f.deps, 1000, controller.signal);
    await started;
    controller.abort(new Error("CANCELLED"));
    await expect(result).rejects.toThrow("CANCELLED");
    expect(f.cleaned()).toBe(1);
  });

  test("foreign listener after banner rejects and cleans up owned process", async () => {
    const f = fixture();
    let calls = 0;
    f.deps.inspect = async () => { if (++calls === 2) throw new Error("FOREIGN_LISTENER"); return true; };
    await expect(awaitOwnedReadiness(f.deps, 1000)).rejects.toThrow("FOREIGN_LISTENER");
    expect(f.cleaned()).toBe(1);
  });

  test("leader exit before readiness rejects", async () => {
    const f = fixture();
    f.deps.isAlive = () => false;
    await expect(awaitOwnedReadiness(f.deps, 1000)).rejects.toThrow("OWNED_SERVER_EXITED_EARLY");
    expect(f.cleaned()).toBe(1);
  });

  test.each(["inspect", "probe"] as const)("slow %s is aborted by deadline", async (phase) => {
    const f = fixture();
    let aborted = false;
    f.deps[phase] = async (signal) => {
      try { return await untilAbort(signal); } finally { aborted = true; }
    };
    await expect(awaitOwnedReadiness(f.deps, 20)).rejects.toThrow("OWNED_SERVER_START_TIMEOUT");
    expect(aborted).toBe(true);
    expect(f.cleaned()).toBe(1);
  });

  test("success requires banner, live leader and ownership around HTTP", async () => {
    const f = fixture();
    let banner = false;
    f.deps.banner = () => banner;
    f.deps.sleep = async () => { banner = true; };
    await awaitOwnedReadiness(f.deps, 1000);
    expect(f.events).toEqual(["inspect", "inspect", "probe", "inspect"]);
    expect(f.cleaned()).toBe(0);
  });
});
