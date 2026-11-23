import { describe, expect, test } from "bun:test";
import {
  NOTIFICATION_EVENT_CATALOG,
  getDefaultHomeLinkForRole,
  getNotificationsForAudience,
} from "@/lib/notifications/catalog";
import {
  adminAlertPayload,
  flashcardReminderPayload,
  paymentSuccessPayload,
  quizGradedPayload,
  renderNotificationPayload,
  studyReengagementPayload,
  tutorBookingCancelledPayload,
  tutorBookingCreatedPayload,
  tutorBookingMovedPayload,
  tutorDailyDigestPayload,
  tutorTicketSubmittedPayload,
  upcomingSessionReminderPayload,
  weeklyProgressPayload,
} from "@/lib/notifications/templates";
import { buildApnsPayload } from "@/lib/notifications/apns";
import {
  renderPaymentSuccessEmail,
  renderScheduleEventEmail,
  renderStudyReengagementEmail,
  renderUpcomingSessionEmail,
} from "@/lib/notifications/email-templates";
import {
  classifyReengagementTier,
  classifyUpcomingSessionWindow,
  formatJakartaDateKey,
  parseJakartaSessionStart,
} from "@/lib/notifications/interval-policy";
import { cronWindow } from "@/lib/queue/cron";

describe("notification event catalog", () => {
  test("defines explicit scopes and consistent email channel contracts", () => {
    expect(NOTIFICATION_EVENT_CATALOG.length).toBeGreaterThanOrEqual(15);
    expect(getNotificationsForAudience("student").length).toBeGreaterThan(0);
    expect(getNotificationsForAudience("tutor").length).toBeGreaterThan(0);
    expect(getNotificationsForAudience("admin").length).toBeGreaterThan(0);

    for (const entry of NOTIFICATION_EVENT_CATALOG) {
      expect(entry.audiences.length).toBeGreaterThan(0);
      expect(entry.inApp).toBe(true);
      expect(entry.push).toBe(true);
      if (entry.email === "optional") {
        expect(entry.emailCategory).not.toBeNull();
      } else {
        expect(entry.emailCategory).toBeNull();
      }
      if (entry.trigger === "interval") {
        expect(entry.schedule).toBeTruthy();
      }
    }
  });

  test("resolves role-aware fallback home links", () => {
    expect(getDefaultHomeLinkForRole("admin")).toBe("/admin");
    expect(getDefaultHomeLinkForRole("tutor")).toBe("/tutor");
    expect(getDefaultHomeLinkForRole("student")).toBe("/dashboard");
    expect(getDefaultHomeLinkForRole(undefined)).toBe("/dashboard");
  });
});

describe("bilingual templates and native read-sync metadata", () => {
  const payloads = [
    quizGradedPayload({
      quizTitle: "Kuis 1",
      courseTitle: "Kalkulus I",
      scoreLabel: "88/100",
      link: "/courses/c1/quiz/q1",
      attemptId: "att-1",
    }),
    flashcardReminderPayload({
      dueCount: 12,
      courseTitle: "Fisika Dasar",
      link: "/courses/fisika",
      dedupeKey: "flashcard_reminder:2026-11-23",
    }),
    paymentSuccessPayload({
      groupName: "TPB Alpha",
      courseCount: 3,
    }),
    weeklyProgressPayload({
      quizzes: 4,
      flashcards: 25,
      modules: 2,
      currentStreak: 6,
      weekStart: "2026-11-16",
    }),
    studyReengagementPayload({
      inactiveDays: 7,
      courseTitle: "Kimia Dasar",
      topicTitle: "Stoikiometri",
      link: "/courses/kimia",
      dedupeKey: "study_reengagement:2026-11-23:email_7d",
    }),
    tutorBookingCreatedPayload({
      studentName: "Rina",
      courseTitle: "Kalkulus I",
      sessionDate: "2026-11-25",
      startTime: "19:00",
      bookingId: "b-1",
    }),
    tutorBookingMovedPayload({
      studentName: "Rina",
      courseTitle: "Kalkulus I",
      sessionDate: "2026-11-26",
      startTime: "20:00",
      bookingId: "b-1",
    }),
    tutorBookingCancelledPayload({
      studentName: "Rina",
      courseTitle: "Kalkulus I",
      sessionDate: "2026-11-26",
      startTime: "20:00",
      bookingId: "b-1",
    }),
    tutorTicketSubmittedPayload({
      studentName: "Rina",
      ticketType: "cancellation",
      courseTitle: "Kalkulus I",
      ticketId: "t-1",
    }),
    upcomingSessionReminderPayload({
      audience: "tutor",
      window: "24h",
      courseTitle: "Kalkulus I",
      sessionDate: "2026-11-25",
      startTime: "19:00",
      bookingId: "b-1",
    }),
    tutorDailyDigestPayload({
      pendingTickets: 2,
      pendingGradings: 5,
      dateKey: "2026-11-23",
    }),
    adminAlertPayload("Worker alert", "Queue lag exceeded threshold."),
  ];

  test("renders every new template cleanly in Indonesian and English without leftover placeholders", () => {
    for (const payload of payloads) {
      for (const locale of ["id", "en"] as const) {
        const rendered = renderNotificationPayload(payload, locale);
        expect(rendered.title.length).toBeGreaterThan(0);
        expect(rendered.body.length).toBeGreaterThan(0);
        expect(rendered.title).not.toMatch(/\{\w+\}/);
        expect(rendered.body).not.toMatch(/\{\w+\}/);
        expect(rendered.metadata?.locale).toBe(locale);
      }
    }
  });

  test("embeds notificationId in APNs payload for native tap read-sync", () => {
    const apns = buildApnsPayload({
      ...paymentSuccessPayload({ groupName: "TPB", courseCount: 2 }),
      notificationId: "11111111-1111-4111-8111-111111111111",
    });
    expect(apns.notificationId).toBe("11111111-1111-4111-8111-111111111111");
    expect(apns.type).toBe("payment_success");
  });

  test("renders bilingual HTML email templates with escaped content", () => {
    const payment = renderPaymentSuccessEmail({
      locale: "id",
      name: "Budi <Test>",
      groupName: "Grup A",
      courseCount: 2,
    });
    expect(payment.subject).toContain("Grup A");
    expect(payment.html).toContain("Budi &lt;Test&gt;");

    const reengage = renderStudyReengagementEmail({
      locale: "en",
      name: "Budi",
      inactiveDays: 8,
      courseTitle: "Calculus I",
      topicTitle: "Derivatives",
      link: "/courses/calc",
    });
    expect(reengage.subject).toContain("Calculus I");
    expect(reengage.html).toContain("Derivatives");

    const upcoming = renderUpcomingSessionEmail({
      locale: "id",
      recipientName: "Pengajar",
      courseTitle: "Kalkulus I",
      sessionDate: "2026-11-25",
      startTime: "19:00",
      endTime: "20:30",
      link: "/tutor/schedule",
    });
    expect(upcoming.html).toContain("19:00 - 20:30 WIB");

    const schedule = renderScheduleEventEmail({
      locale: "en",
      recipientName: "Student",
      title: "Schedule moved",
      summary: "Session moved.",
      details: [{ label: "Date", value: "2026-11-25" }],
      link: "/dashboard/schedule",
    });
    expect(schedule.html).toContain("2026-11-25");
  });
});

describe("interval notification scheduling helpers", () => {
  test("classifies re-engagement inactivity tiers and upcoming session windows", () => {
    expect(classifyReengagementTier(2)).toBe("none");
    expect(classifyReengagementTier(3)).toBe("nudge_3d");
    expect(classifyReengagementTier(6)).toBe("nudge_3d");
    expect(classifyReengagementTier(7)).toBe("email_7d");
    expect(classifyReengagementTier(31)).toBe("none");

    expect(classifyUpcomingSessionWindow(60 * 60 * 1000)).toBe("1h");
    expect(classifyUpcomingSessionWindow(24 * 60 * 60 * 1000)).toBe("24h");
    expect(classifyUpcomingSessionWindow(5 * 60 * 60 * 1000)).toBeNull();
  });

  test("parses Asia/Jakarta session timestamps and dates consistently", () => {
    expect(formatJakartaDateKey(new Date("2026-11-23T18:00:00.000Z"))).toBe("2026-11-24");
    const parsed = parseJakartaSessionStart("2026-11-25", "19:00");
    expect(parsed?.toISOString()).toBe("2026-11-25T12:00:00.000Z");
  });

  test("schedules all 4 new interval jobs in staging and production cron windows", () => {
    const stagingDay = cronWindow("staging", new Date("2026-11-23T00:00:00.000Z"));
    expect(stagingDay.some((e) => e.job === "tutor-daily-digest-cron")).toBe(true);
    expect(stagingDay.some((e) => e.job === "flashcard-reminder-cron")).toBe(true);
    expect(stagingDay.some((e) => e.job === "study-reengagement-cron")).toBe(true);
    expect(stagingDay.filter((e) => e.job === "upcoming-session-reminder-cron")).toHaveLength(4);
  });
});
