import { expect, test } from "bun:test";
import { getAvailabilityReminderWeek, getDeferredAvailabilityReminderWeek, getTutorialEmailDispatchTimes, isTutorialEmailDue, safeReminderLink } from "@/lib/notifications/tutorial-reminder-policy";
import { renderTutorialSessionReminderEmail } from "@/lib/notifications/tutorial-reminder-emails";
import { DEFAULT_TUTORIAL_EMAIL_SCHEDULE, isTutorialEmailSchedule, tutorialEmailOffsets } from "@/lib/notifications/tutorial-email-schedule";
import { DEFAULT_ACTIVITY_NOTIFICATION_PREFERENCES } from "@/lib/notifications/types";
import { cronWindow } from "@/lib/queue/cron";

test("Saturday targets the upcoming Sunday-Saturday; daily followups keep that same range", () => {
  for (let day = 14; day <= 20; day++) {
    const result = getAvailabilityReminderWeek(new Date(`2026-11-${day}T01:00:00Z`));
    expect(result.start).toBe("2026-11-15");
    expect(result.end).toBe("2026-11-21");
    expect(result.saturday).toBe(day === 14);
  }
  expect(getAvailabilityReminderWeek(new Date("2026-11-21T01:00:00Z")).start).toBe("2026-11-22");
});
test("midnight and month boundary use WIB", () => {
  const result = getAvailabilityReminderWeek(new Date("2026-12-31T18:00:00Z"));
  expect(result.dateKey).toBe("2027-01-01");
  expect(result.start).toBe("2026-12-27");
  expect(result.end).toBe("2027-01-02");
});
test("deferred availability uses the original Saturday week and expires at the next WIB Sunday", () => {
  const key = "tutor_availability:2026-11-14";
  const original = getDeferredAvailabilityReminderWeek(key, new Date("2026-11-14T15:59:00Z"));
  const afterMidnight = getDeferredAvailabilityReminderWeek(key, new Date("2026-11-14T17:00:00Z"));
  expect(original?.start).toBe("2026-11-15");
  expect(original?.end).toBe("2026-11-21");
  expect(afterMidnight).toEqual(original);
  expect(getDeferredAvailabilityReminderWeek(key, new Date("2026-11-21T16:59:59Z"))).toEqual(original);
  expect(getDeferredAvailabilityReminderWeek(key, new Date("2026-11-21T17:00:00Z"))).toBeNull();
  expect(getDeferredAvailabilityReminderWeek(key, new Date("2026-11-13T16:59:59Z"))).toBeNull();
  expect(getDeferredAvailabilityReminderWeek("tutor_availability:2026-11-15", new Date("2026-11-15T01:00:00Z"))).toBeNull();
  expect(getDeferredAvailabilityReminderWeek("tutor_availability:2026-02-30", new Date("2026-03-01T01:00:00Z"))).toBeNull();
  expect(getDeferredAvailabilityReminderWeek("upcoming_session:booking", new Date("2026-11-14T01:00:00Z"))).toBeNull();
});
test("default reminder is exactly once 60 minutes before start, including non-five-minute starts", () => {
  const date = "2026-11-29";
  const schedule = DEFAULT_TUTORIAL_EMAIL_SCHEDULE;
  expect(tutorialEmailOffsets(schedule)).toEqual([60]);
  expect(getTutorialEmailDispatchTimes(date, "08:03", schedule, new Date("2026-11-29T00:00:00Z"))).toEqual([Date.parse("2026-11-29T00:03:00Z")]);
  expect(getTutorialEmailDispatchTimes(date, "08:03", schedule, new Date("2026-11-29T00:05:00Z"))).toEqual([Date.parse("2026-11-29T00:03:00Z")]);
  expect(getTutorialEmailDispatchTimes(date, "08:03", schedule, new Date("2026-11-29T00:10:00Z"))).toEqual([]);
  expect(getTutorialEmailDispatchTimes(date, "08:03", schedule, new Date("2026-11-29T00:00:00Z"), new Date("2026-11-29T01:03:00Z"))).toEqual([]);
});
test("repeat offsets stop before session and are bounded; preferences are rechecked at delivery", () => {
  const repeat = { mode: "repeat", leadMinutes: 95, intervalMinutes: 30 } as const;
  expect(tutorialEmailOffsets(repeat)).toEqual([95,65,35,5]);
  expect(isTutorialEmailSchedule({mode: "repeat", leadMinutes: 60, intervalMinutes: 5})).toBe(true);
  expect(isTutorialEmailSchedule({mode: "repeat", leadMinutes: 65, intervalMinutes: 5})).toBe(false);
  expect(isTutorialEmailSchedule({mode: "repeat", leadMinutes: 30, intervalMinutes: 30})).toBe(false);
  expect(isTutorialEmailSchedule({mode: "once", leadMinutes: 1441, intervalMinutes: 30})).toBe(false);
  expect(isTutorialEmailSchedule({mode: "repeat", leadMinutes: 60, intervalMinutes: 1})).toBe(false);
  const start = new Date("2026-11-29T01:00:00Z");
  const due = start.getTime() - 35 * 60_000;
  expect(isTutorialEmailDue(repeat, start, due, new Date(due))).toBe(true);
  expect(isTutorialEmailDue(DEFAULT_TUTORIAL_EMAIL_SCHEDULE, start, due, new Date(due))).toBe(false);
  expect(isTutorialEmailDue(repeat, start, due, new Date(due - 1))).toBe(false);
  expect(isTutorialEmailDue(repeat, start, due, new Date(due + 300_000))).toBe(false);
  expect(isTutorialEmailDue(repeat, start, due, start)).toBe(false);
});
test("both reminders default on and cloud dispatch schedules all ticks", () => {
  expect(DEFAULT_ACTIVITY_NOTIFICATION_PREFERENCES.tutorAvailabilityEnabled).toBe(true);
  expect(DEFAULT_ACTIVITY_NOTIFICATION_PREFERENCES.tutorialSessionEmailEnabled).toBe(true);
  for (const env of ["staging", "production"] as const) {
    const starts = env === "staging" ? [0] : [0,6,12,18];
    const jobs = starts.flatMap(hour => cronWindow(env, new Date(Date.UTC(2026,10,28,hour))));
    expect(jobs.filter(job => job.job === "tutorial-session-email-cron")).toHaveLength(288);
    expect(jobs.filter(job => job.job === "tutor-availability-reminder-cron").map(job => job.scheduledAt)).toEqual([Date.UTC(2026,10,28,1)]);
  }
});
test("email includes safe meeting and both attachment directions", () => {
  for (const locale of ["id", "en"] as const) {
    const result = renderTutorialSessionReminderEmail({ locale, name: "<Name>", courseTitle: "Math", groupName: "A", tutorName: "Tutor",
      date: "2026-11-29", startTime: "08:00", endTime: "09:30", mode: "online", location: null,
      meetUrl: "https://meet.google.com/abc-defg-hij", topic: "Calculus", audience: "student", minutesBefore: 95,
      resources: [{ label: "<Tutor file>", url: "/api/storage/file/schedules/b/post_session/a.pdf", fromTutor: true },
        { label: "Student file", url: "https://example.com/file", fromTutor: false },
        { label: "Unsafe", url: "javascript:alert(1)", fromTutor: false }] });
    expect(result.html).toContain("https://meet.google.com/abc-defg-hij");
    expect(result.html).toContain(locale === "en" ? "1 hour 35 minutes" : "1 jam 35 menit");
    expect(result.html).toContain("&lt;Tutor file&gt;");
    expect(result.html).toContain("Student file");
    expect(result.html).not.toContain("javascript:");
    expect(result.html).toContain("/api/storage/file/schedules/b/post_session/a.pdf");
  }
  expect(safeReminderLink("//example.com/x", "https://staging.zyxacademy.com")).toBeNull();
  expect(safeReminderLink("https://user:pass@example.com/x", "https://staging.zyxacademy.com")).toBeNull();
});
