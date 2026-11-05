import { expect, test } from "bun:test";
import { fictionalDemoSnapshot } from "@/lib/demo/fictional-snapshot";
import { demoWeeklyActivity } from "@/lib/demo/progress-overlay";
import { emptyOverlay } from "@/lib/demo/session-overlay";

test("weekly activity follows the selected course history and local actions", () => {
  const thinking = fictionalDemoSnapshot("thinking", "Berpikir Komputasional");
  const mathematics = fictionalDemoSnapshot("math", "Matematika I");
  expect(demoWeeklyActivity(thinking, emptyOverlay(), "2026-11-05")).toEqual([false, false, false, true, false, false, false]);
  expect(demoWeeklyActivity(mathematics, emptyOverlay(), "2026-11-05")).toEqual([true, true, true, true, false, false, false]);
  const overlay = { version: 1 as const, events: [{ kind: "article" as const, id: "local", date: "2026-11-04" }] };
  expect(demoWeeklyActivity(thinking, overlay, "2026-11-05")).toEqual([false, false, true, true, false, false, false]);
});
