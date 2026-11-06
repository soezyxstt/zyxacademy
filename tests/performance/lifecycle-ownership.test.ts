import { describe, expect, test } from "bun:test";
import { stopProcessGroup, verifyListenerOwnership, type ProcessInspector, type StopDependencies } from "../../scripts/performance/server-process";

const inspector = (pids: number[], groups: Record<number, number>): ProcessInspector => ({
  listeners: async () => pids,
  group: async (pid) => groups[pid]!,
});

describe("owned listener", () => {
  test("rejects a foreign listener before or during startup", async () => {
    expect(await verifyListenerOwnership(3100, 100, inspector([], {}))).toBe(false);
    await expect(verifyListenerOwnership(3100, 100, inspector([200], { 200: 200 }))).rejects.toThrow("FOREIGN_LISTENER");
    await expect(verifyListenerOwnership(3100, 100, inspector([101, 200], { 101: 100, 200: 200 }))).rejects.toThrow("FOREIGN_LISTENER");
  });
  test("accepts a descendant in the owned group even if the leader has exited", async () => {
    expect(await verifyListenerOwnership(3100, 100, inspector([101], { 101: 100 }))).toBe(true);
  });
  test("fails closed when inspection fails", async () => {
    await expect(verifyListenerOwnership(3100, 100, { listeners: async () => { throw new Error("LISTENER_PID_HIDDEN"); }, group: async () => 100 })).rejects.toThrow("LISTENER_PID_HIDDEN");
  });
});

describe("owned group cleanup", () => {
  test("escalates after bounded grace and never signals another group", async () => {
    let time = 0;
    let alive = true;
    const signals: Array<[number, string | number]> = [];
    const deps: StopDependencies = {
      now: () => time,
      sleep: async (ms) => { time += ms; },
      signal: (group, signal) => {
        signals.push([group, signal]);
        if (!alive) throw Object.assign(new Error(), { code: "ESRCH" });
        if (signal === "SIGKILL") alive = false;
      },
    };
    await stopProcessGroup(100, deps);
    expect(signals.every(([group]) => group === 100)).toBe(true);
    expect(signals.some(([, signal]) => signal === "SIGTERM")).toBe(true);
    expect(signals.some(([, signal]) => signal === "SIGKILL")).toBe(true);
    expect(time).toBe(2000);
  });
  test("surfaces an unkillable group", async () => {
    let time = 0;
    await expect(stopProcessGroup(100, { now: () => time, sleep: async (ms) => { time += ms; }, signal: () => {} })).rejects.toThrow("OWNED_GROUP_STILL_ALIVE");
    expect(time).toBe(5000);
  });
});
