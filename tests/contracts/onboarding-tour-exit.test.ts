import { describe, expect, test } from "bun:test";
import { resolveTourExitGeneration } from "@/lib/onboarding/tour-exit";
import { applyTourAction, type TourState } from "@/lib/onboarding/tour-state";

const now = "2026-11-25T12:00:00.000Z";
const running: TourState = { version: 1, generation: 4, status: "in_progress", stepIndex: 3, courseId: null, updatedAt: now };

describe("queued tour exit generation", () => {
  test("a delayed progress response cannot retarget Exit to another tab's new run", () => {
    const otherRun = { ...running, generation: 5, stepIndex: 0 };
    const generation = resolveTourExitGeneration(4, { action: "progress", generation: 4 }, { state: otherRun, applied: false });
    expect(generation).toBe(4);
    expect(applyTourAction(otherRun, { action: "skip", generation }, now)).toBe(otherRun);
  });

  test("Exit cancels its own first start and restart using their applied receipts", () => {
    for (const [previous, pending] of [
      [null, { action: "start", generation: 0 }],
      [running, { action: "restart", generation: 4 }],
    ] as const) {
      const created = applyTourAction(previous, pending, now)!;
      const generation = resolveTourExitGeneration(pending.generation, pending, { state: created, applied: true });
      expect(generation).toBe(created.generation);
      expect(applyTourAction(created, { action: "skip", generation }, now)?.status).toBe("skipped");
    }
  });

  test("same predicted generation belongs to another tab when the receipt did not apply", () => {
    for (const [previous, pending] of [
      [null, { action: "start", generation: 0 }],
      [running, { action: "restart", generation: 4 }],
    ] as const) {
      const otherRun = applyTourAction(previous, pending, now)!;
      const generation = resolveTourExitGeneration(pending.generation, pending, { state: otherRun, applied: false });
      expect(generation).toBe(pending.generation);
      expect(applyTourAction(otherRun, { action: "skip", generation }, now)).toBe(otherRun);
    }
  });

  test("resume keeps its generation and completed runs already honor Exit", () => {
    const generation = resolveTourExitGeneration(4, { action: "start", generation: 4 }, { state: running, applied: false });
    expect(applyTourAction(running, { action: "skip", generation }, now)?.status).toBe("skipped");
    const completed = { ...running, status: "completed" as const, stepIndex: 9 };
    const completedGeneration = resolveTourExitGeneration(4, { action: "complete", generation: 4 }, { state: completed, applied: true });
    expect(applyTourAction(completed, { action: "skip", generation: completedGeneration }, now)).toBe(completed);
  });

  test("failed, unknown and mismatched receipts never guess a newer generation", () => {
    const pending = { action: "restart", generation: 4 } as const;
    expect(resolveTourExitGeneration(4, pending, undefined)).toBe(4);
    expect(resolveTourExitGeneration(4, pending, { state: { ...running, generation: 6 }, applied: true })).toBe(4);
    expect(resolveTourExitGeneration(4, pending, { state: null, applied: true })).toBe(4);
    expect(resolveTourExitGeneration(0, null, undefined)).toBe(0);
    expect(applyTourAction(null, { action: "skip", generation: 0 }, now)).toMatchObject({ generation: 1, status: "skipped" });
  });
});
