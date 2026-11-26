import { expect, test } from "bun:test";
import { getAvailabilityReminderWeek, getTutorialEmailDispatchAt, safeReminderLink } from "@/lib/notifications/tutorial-reminder-policy";
import { renderTutorialSession30mEmail } from "@/lib/notifications/tutorial-reminder-emails";
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
test("H-30 queues the exact minute, including non-five-minute starts, and never sends after start", () => {
  const date = "2026-11-29";
  expect(getTutorialEmailDispatchAt(date, "08:00", new Date("2026-11-29T00:30:00Z"))).toBe(Date.parse("2026-11-29T00:30:00Z"));
  expect(getTutorialEmailDispatchAt(date, "08:00", new Date("2026-11-29T00:35:00Z"))).toBeNull();
  expect(getTutorialEmailDispatchAt(date, "08:03", new Date("2026-11-29T00:30:00Z"))).toBe(Date.parse("2026-11-29T00:33:00Z"));
  expect(getTutorialEmailDispatchAt(date, "08:03", new Date("2026-11-29T00:35:00Z"))).toBe(Date.parse("2026-11-29T00:33:00Z"));
  expect(getTutorialEmailDispatchAt(date, "08:00", new Date("2026-11-29T00:30:00Z"), new Date("2026-11-29T01:00:00Z"))).toBeNull();
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
    const result = renderTutorialSession30mEmail({ locale, name: "<Name>", courseTitle: "Math", groupName: "A", tutorName: "Tutor",
      date: "2026-11-29", startTime: "08:00", endTime: "09:30", mode: "online", location: null,
      meetUrl: "https://meet.google.com/abc-defg-hij", topic: "Calculus", audience: "student",
      resources: [{ label: "<Tutor file>", url: "/api/storage/file/schedules/b/post_session/a.pdf", fromTutor: true },
        { label: "Student file", url: "https://example.com/file", fromTutor: false },
        { label: "Unsafe", url: "javascript:alert(1)", fromTutor: false }] });
    expect(result.html).toContain("https://meet.google.com/abc-defg-hij");
    expect(result.html).toContain("&lt;Tutor file&gt;");
    expect(result.html).toContain("Student file");
    expect(result.html).not.toContain("javascript:");
    expect(result.html).toContain("/api/storage/file/schedules/b/post_session/a.pdf");
  }
  expect(safeReminderLink("//example.com/x", "https://staging.zyxacademy.com")).toBeNull();
  expect(safeReminderLink("https://user:pass@example.com/x", "https://staging.zyxacademy.com")).toBeNull();
});
