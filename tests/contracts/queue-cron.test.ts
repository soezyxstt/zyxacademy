import { expect, test } from "bun:test";
import { cronWindow, isCronJobName } from "../../lib/queue/cron";
import { classifyUpcomingSessionWindow } from "../../lib/notifications/interval-policy";

test("authenticated Scheduler accepts its job ID and both pinned resource names", () => {
  for (const environment of ["staging", "production"] as const) {
    const job = `zyx-${environment}-dispatcher`;
    for (const name of [job, `projects/zyx-academy/locations/asia-southeast1/jobs/${job}`, `projects/307641710075/locations/asia-southeast1/jobs/${job}`]) {
      expect(isCronJobName(name, environment)).toBe(true);
    }
    for (const name of [undefined, "", `${job}-other`, "zyx-other-dispatcher", `projects/other/locations/asia-southeast1/jobs/${job}`, `projects/zyx-academy/locations/asia-southeast3/jobs/${job}`]) {
      expect(isCronJobName(name, environment)).toBe(false);
    }
  }
  expect(isCronJobName("zyx-production-dispatcher", "staging")).toBe(false);
  expect(isCronJobName("zyx-staging-dispatcher", "production")).toBe(false);
});

test("staging schedules one UTC day and includes Monday reflection exactly once", () => {
  const monday = new Date("2026-11-23T00:00:00Z");
  const window = cronWindow("staging", monday);
  expect(window).toHaveLength(65 + 288 + 2);
  expect(window.find(item => item.job === "gamification-missions-cron")?.scheduledAt).toBe(Date.parse("2026-11-23T17:05:00Z"));
  expect(cronWindow("staging", new Date("2026-11-24T00:00:00Z"))).toHaveLength(64 + 288 + 2);
  expect(cronWindow("staging", monday)).toEqual(window);
});

test("model catalogs refresh twice daily without duplicate queue windows", () => {
  const day = "2026-11-23";
  const staging = cronWindow("staging", new Date(`${day}T00:00:00Z`));
  const production = [0, 6, 12, 18].flatMap(hour => cronWindow("production", new Date(`${day}T${String(hour).padStart(2, "0")}:00:00Z`)));
  for (const jobs of [staging, production]) expect(jobs.filter(item => item.job === "ai-model-catalog-cron").map(item => item.scheduledAt)).toEqual([Date.parse(`${day}T00:00:00Z`), Date.parse(`${day}T12:00:00Z`)]);
});

test("each environment schedules 24 distinct hourly session reminders including the H-1 window", () => {
  const midnight = Date.parse("2026-11-23T00:00:00Z");
  const startAt = Date.parse("2026-11-24T09:00:00Z");
  for (const environment of ["staging", "production"] as const) {
    const starts = environment === "staging" ? [0] : [0, 6, 12, 18];
    const reminders = starts.flatMap(hour => cronWindow(environment, new Date(midnight + hour * 3_600_000)))
      .filter(item => item.job === "upcoming-session-reminder-cron").map(item => item.scheduledAt);
    expect(reminders).toEqual(Array.from({ length: 24 }, (_, hour) => midnight + hour * 3_600_000));
    const dayBefore = reminders.filter(tick => classifyUpcomingSessionWindow(startAt - tick) === "24h");
    expect(dayBefore).toEqual([Date.parse("2026-11-23T09:00:00Z")]);
    const dayOf = reminders.map(tick => tick + 24 * 3_600_000)
      .filter(tick => classifyUpcomingSessionWindow(startAt - tick) === "1h");
    expect(dayOf).toEqual([Date.parse("2026-11-24T08:00:00Z")]);
  }
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

test("offline change retention runs once daily at 01:30 WIB in both queue environments", () => {
  const day = "2026-11-23";
  const staging = cronWindow("staging", new Date(`${day}T00:00:00Z`));
  const production = [0, 6, 12, 18].flatMap(hour => cronWindow("production", new Date(`${day}T${String(hour).padStart(2, "0")}:00:00Z`)));
  for (const jobs of [staging, production]) {
    expect(jobs.filter(item => item.job === "offline-change-retention")).toEqual([{ job: "offline-change-retention", scheduledAt: Date.parse(`${day}T18:30:00Z`) }]);
  }
});

test("quiet-hour recovery is scheduled once per UTC hour, without boundary duplicates", () => {
  const midnight = Date.parse("2026-11-23T00:00:00Z");
  for (const environment of ["staging", "production"] as const) {
    const starts = environment === "staging" ? [0] : [0, 6, 12, 18];
    const recovery = starts.flatMap(hour => cronWindow(environment, new Date(midnight + hour * 3_600_000)))
      .filter(item => item.job === "notification-quiet-recovery").map(item => item.scheduledAt);
    expect(recovery).toEqual(Array.from({ length: 24 }, (_, hour) => midnight + hour * 3_600_000));
  }
});
