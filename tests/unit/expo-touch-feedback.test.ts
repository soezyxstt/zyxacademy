import { expect, test } from "bun:test";
import { createTouchFeedback, type TouchFeedback } from "../../apps/mobile-native/device/touch-feedback";

test("coalesces duplicate taps while preserving distinct feedback for the confirmed outcome", async () => {
  const calls: TouchFeedback[] = [];
  let now = 0;
  const emit = createTouchFeedback(() => true, async kind => { calls.push(kind); }, () => now);
  expect(await Promise.all([emit("light"), emit("light")])).toEqual([true, false]);
  expect(await emit("success")).toBe(true);
  now = 79;
  expect(await emit("light")).toBe(false);
  now = 80;
  expect(await emit("light")).toBe(true);
  expect(calls).toEqual(["light", "success", "light"]);
});

test("honors a changed preference immediately and absorbs unavailable actuator errors", async () => {
  let enabled = false;
  let attempts = 0;
  const emit = createTouchFeedback(() => enabled, async () => { attempts++; throw new Error("unavailable"); });
  expect(await emit("error")).toBe(false);
  expect(attempts).toBe(0);
  enabled = true;
  expect(await emit("error")).toBe(false);
  expect(attempts).toBe(1);
});
