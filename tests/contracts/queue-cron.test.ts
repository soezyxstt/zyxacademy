import { expect, test } from "bun:test";
import { cronWindow } from "../../lib/queue/cron";

test("staging schedules one UTC day and includes Monday reflection exactly once", () => {
  const monday = new Date("2026-11-23T00:00:00Z");
  const window = cronWindow("staging", monday);
  expect(window).toHaveLength(14);
  expect(window.find(item => item.job === "gamification-missions-cron")?.scheduledAt).toBe(Date.parse("2026-11-23T17:05:00Z"));
  expect(cronWindow("staging", new Date("2026-11-24T00:00:00Z"))).toHaveLength(13);
  expect(cronWindow("staging", monday)).toEqual(window);
});

test("model catalogs refresh twice daily without duplicate queue windows", () => {
  const day = "2026-11-23";
  const staging = cronWindow("staging", new Date(`${day}T00:00:00Z`));
  const production = [0, 6, 12, 18].flatMap(hour => cronWindow("production", new Date(`${day}T${String(hour).padStart(2, "0")}:00:00Z`)));
  for (const jobs of [staging, production]) expect(jobs.filter(item => item.job === "ai-model-catalog-cron").map(item => item.scheduledAt)).toEqual([Date.parse(`${day}T00:00:00Z`), Date.parse(`${day}T12:00:00Z`)]);
});

test("production windows share neither boundary jobs nor a shifted retry time", () => {
  const midnight = cronWindow("production", new Date("2026-11-23T00:00:00Z"));
  const six = cronWindow("production", new Date("2026-11-23T06:00:00Z"));
  expect(midnight.some(item => item.job === "weekly-reflection-cron")).toBe(false);
  expect(six.some(item => item.job === "weekly-reflection-cron")).toBe(true);
  expect(() => cronWindow("production", new Date("2026-11-23T06:01:00Z"))).toThrow();
});

test("calendar sync is due once daily at 03:00 WIB in both queue environments", () => {
  const day = "2026-11-23";
  const staging = cronWindow("staging", new Date(`${day}T00:00:00Z`));
  const production = [0, 6, 12, 18].flatMap(hour => cronWindow("production", new Date(`${day}T${String(hour).padStart(2, "0")}:00:00Z`)));
  for (const jobs of [staging, production]) {
    expect(jobs.filter(item => item.job === "google-calendar-sync-cron")).toEqual([{ job: "google-calendar-sync-cron", scheduledAt: Date.parse(`${day}T20:00:00Z`) }]);
  }
});
