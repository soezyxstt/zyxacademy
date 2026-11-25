import { describe, expect, test } from "bun:test";
import {
  quizPublishedPayload,
  discussionPayload,
  renderNotificationPayload,
  tutorTicketDecisionPayload,
  tutorTicketMessagePayload,
} from "@/lib/notifications/templates";
import { renderReflectionEmail } from "@/lib/reflection-email-template";
import { pkaAnnouncementEmailHtml, pkaScheduleEmailSubject, scheduleEmailHtml } from "@/lib/pka-email-template";

describe("recipient-localized notification templates", () => {
  test("uses generic discussion copy and links that survive role changes", () => {
    for (const role of ["student", "tutor", "admin"] as const) {
      const payload = discussionPayload({ role, channelId: "channel", threadId: "thread/private", seq: 2 });
      expect(payload.link).toBe("/discussions?thread=thread%2Fprivate");
      expect(payload.metadata?.url).toBe(payload.link);
      expect(renderNotificationPayload(payload, "en").body).toBe("There is new activity in a discussion.");
      expect(renderNotificationPayload(payload, "id").body).toBe("Ada aktivitas baru di diskusi.");
    }
    const report = discussionPayload({ role: "admin", channelId: "channel", threadId: "thread", seq: 2, report: true });
    expect(report.link).toBe("/discussions?discussionTab=reports");
    const targeted = discussionPayload({ role: "student", channelId: "channel", threadId: "long-thread", messageId: "message/450", seq: 450 });
    expect(targeted.link).toBe("/discussions?thread=long-thread&message=message%2F450");
    expect(targeted.metadata?.messageId).toBe("message/450");
    expect(discussionPayload({ role: "admin", channelId: "channel", threadId: "thread", messageId: "private", seq: 2, report: true }).metadata).not.toHaveProperty("messageId");
    expect(renderNotificationPayload(report, "en").body).toBe("There is new activity in a discussion.");
  });
  test("renders quiz publication copy per recipient and records its locale", () => {
    const payload = quizPublishedPayload("$& {courseTitle}", "Kalkulus I", "/courses/c1/quiz/q1");

    const english = renderNotificationPayload(payload, "en");
    expect(english.title).toBe("New quiz: expect(english.title).toBe("📝 New quiz available"); {courseTitle}");
    expect(english.body).toContain("Kalkulus I");
    expect(english.metadata?.locale).toBe("en");

    const indonesian = renderNotificationPayload(payload, "id");
    expect(indonesian.title).toBe("Kuis baru: expect(indonesian.title).toBe("📝 Kuis Baru Tersedia"); {courseTitle}");
    expect(indonesian.body).toContain("Kalkulus I");
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

test("contextual discussion notification uses the title, bounded plain preview and locale-specific fallback", () => {
  const payload = discussionPayload({role: "student", channelId: "c", threadId: "t", seq: 2, threadTitle: "Integral parsial", preview: "[Baca](https://example.test)\n" + "a".repeat(300)});
  const id = renderNotificationPayload(payload, "id");
  expect(id.title).toBe("Diskusi: Integral parsial");
  expect(id.body.startsWith("Baca ")).toBe(true);
  expect(Array.from(id.body).length).toBe(180);
  expect(id.body).not.toContain("https://");
  const deleted = renderNotificationPayload(discussionPayload({role: "student", channelId: "c", threadId: "t", seq: 2, threadTitle: "Integral", eventKind: "delete"}), "en");
  expect(deleted.body).toBe("A message was deleted.");
  const report = renderNotificationPayload(discussionPayload({role: "admin", channelId: "c", threadId: "t", seq: 2, report: true, threadTitle: "Private", preview: "Secret"}), "en");
  expect(report.title).toBe("Discussion update");
  expect(report.body).not.toContain("Secret");
});
