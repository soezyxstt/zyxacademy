import { describe, expect, test } from "bun:test";
import {
  quizPublishedPayload,
  renderNotificationPayload,
  tutorTicketDecisionPayload,
  tutorTicketMessagePayload,
} from "@/lib/notifications/templates";
import { renderReflectionEmail } from "@/lib/reflection-email-template";
import { pkaAnnouncementEmailHtml, pkaScheduleEmailSubject, scheduleEmailHtml } from "@/lib/pka-email-template";

describe("recipient-localized notification templates", () => {
  test("renders quiz publication copy per recipient and records its locale", () => {
    const payload = quizPublishedPayload("$& {courseTitle}", "Kalkulus I", "/courses/c1/quiz/q1");

    const english = renderNotificationPayload(payload, "en");
    expect(english.title).toBe("📝 New quiz available");
    expect(english.body).toContain("$& {courseTitle} for Kalkulus I");
    expect(english.metadata?.locale).toBe("en");

    const indonesian = renderNotificationPayload(payload, "id");
    expect(indonesian.title).toBe("📝 Kuis Baru Tersedia");
    expect(indonesian.body).toContain("$& {courseTitle} untuk Kalkulus I");
    expect(indonesian.metadata?.locale).toBe("id");
  });

  test("leaves authored notification content unchanged", () => {
    const payload = {
      title: "Workshop minggu depan",
      body: "Baca pengumuman lengkap.",
      type: "admin_broadcast" as const,
      metadata: { url: "/dashboard" },
    };
    expect(renderNotificationPayload(payload, "en")).toEqual(payload);
  });

  test("localizes tutor notification wrappers while preserving authored notes and replies", () => {
    const decision = renderNotificationPayload(tutorTicketDecisionPayload({
      ticketType: "reschedule",
      decision: "approved",
      notes: "Please use the north entrance.",
    }), "en");
    expect(decision.title).toBe("Reschedule request approved");
    expect(decision.body).toBe("Please use the north entrance.");
    expect(decision.metadata?.locale).toBe("en");

    const reply = renderNotificationPayload(tutorTicketMessagePayload("See you next week."), "id");
    expect(reply.title).toBe("Balasan baru pada diskusi jadwal");
    expect(reply.body).toBe("See you next week.");
    expect(reply.metadata?.locale).toBe("id");
  });

  test("renders reflection and PKA system email wrappers in the recipient language", () => {
    const reflection = renderReflectionEmail({
      locale: "en",
      name: "Ari <Learner>",
      weekStart: "2026-10-19",
      completed: { quizzes: 2, flashcards: 4, modules: 1 },
      masteryGrowth: 8,
      mostImproved: "Limits",
      currentStreak: 3,
      longestStreak: 7,
    });
    expect(reflection.subject).toContain("Weekly Learning Reflection");
    expect(reflection.html).toContain("Hello Ari &lt;Learner&gt;");
    expect(reflection.html).toContain("Recorded activity:");

    expect(pkaScheduleEmailSubject("$& {title}", "en")).toBe("PKA Review Session - $& {title}");
    expect(scheduleEmailHtml("Review 1", new Date("2026-10-24T10:00:00Z"), null, "en"))
      .toContain("A new PKA live tutorial session has been scheduled.");
    expect(pkaAnnouncementEmailHtml("Admin title", "Admin-authored body", "en"))
      .toContain("Admin-authored body");
  });
});
