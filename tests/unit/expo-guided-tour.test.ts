import { expect, test } from "bun:test";
import { applyTourAction, parseTourMutation, type TourState } from "../../lib/onboarding/tour-state";
import { nativeTourState } from "../../apps/mobile-native/features/onboarding/tour-client";
import type { NativeSessionTransport } from "../../apps/mobile-native/network/transport";

test("the native tour binds the account, role and observed generation on read, progress and replay", async () => {
  let saved: TourState | null = null;
  const seen: string[] = [];
  const signal = new AbortController().signal;
  const transport = { scope: { accountId: "learner" }, assertCurrent() {},
    request: async (path: string, init: RequestInit & { requiredRole: string }) => {
      expect(new Headers(init.headers).get("x-user-id")).toBe("learner");
      expect(init.requiredRole).toBe("murid");
      let applied = false;
      if (init.method === "PUT") {
        const action = parseTourMutation(JSON.parse(String(init.body)));
        expect(action?.role).toBe("student");
        if (!action) throw new Error();
        const next = applyTourAction(saved, action, new Date().toISOString());
        applied = next !== saved;
        saved = next;
      }
      seen.push(path);
      return { ok: true, json: async () => ({ state: saved, applied }), dispose() {} };
    },
  } as unknown as NativeSessionTransport;
  expect(await nativeTourState(transport, "student", signal)).toBeNull();
  expect((await nativeTourState(transport, "student", signal, { action: { action: "start" }, generation: 0 }))?.generation).toBe(1);
  expect((await nativeTourState(transport, "student", signal, { action: { action: "progress", stepIndex: 1 }, generation: 1 }))?.stepIndex).toBe(1);
  expect((await nativeTourState(transport, "student", signal, { action: { action: "restart" }, generation: 1 }))?.generation).toBe(2);
  expect((await nativeTourState(transport, "student", signal, { action: { action: "skip" }, generation: 1 }))?.status).toBe("in_progress");
  expect(seen[0]).toBe("/api/onboarding/tour?role=student");
});
test("a broken reply or retired session cannot publish tour progress", async () => {
  const signal = new AbortController().signal;
  let closed = 0;
  const transport = { scope: { accountId: "tutor" }, assertCurrent() {},
    request: async () => ({ ok: true, json: async () => ({ state: { generation: -1 } }), dispose() { closed++; } }),
  } as unknown as NativeSessionTransport;
  await expect(nativeTourState(transport, "tutor", signal)).rejects.toThrow("Invalid tour state");
  await expect(nativeTourState({ ...transport, assertCurrent() { throw Error("retired"); } }, "tutor", signal)).rejects.toThrow("retired");
  expect(closed).toBe(2);
});
