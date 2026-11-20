import { expect, test } from "bun:test";
import { cronWindow } from "../../lib/queue/cron";

test("staging schedules one UTC day and includes Monday reflection exactly once", () => {
  const monday = new Date("2026-11-23T00:00:00Z");
  const window = cronWindow("staging", monday);
  expect(window).toHaveLength(12);
  expect(window.find(item => item.job === "gamification-missions-cron")?.scheduledAt).toBe(Date.parse("2026-11-23T17:05:00Z"));
  expect(cronWindow("staging", new Date("2026-11-24T00:00:00Z"))).toHaveLength(11);
  expect(cronWindow("staging", monday)).toEqual(window);
});

test("production windows share neither boundary jobs nor a shifted retry time", () => {
  const midnight = cronWindow("production", new Date("2026-11-23T00:00:00Z"));
  const six = cronWindow("production", new Date("2026-11-23T06:00:00Z"));
  expect(midnight.filter(item => item.job === "public-page-analytics-cron")).toEqual([
    { job: "public-page-analytics-cron", scheduledAt: Date.parse("2026-11-23T00:00:00Z") },
  ]);
  expect(six.some(item => item.job === "public-page-analytics-cron")).toBe(false);
  expect(midnight.some(item => item.job === "weekly-reflection-cron")).toBe(false);
  expect(six.some(item => item.job === "weekly-reflection-cron")).toBe(true);
  expect(() => cronWindow("production", new Date("2026-11-23T06:01:00Z"))).toThrow();
});
