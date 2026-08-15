import { describe, expect, test } from "bun:test";
import {
  applyCategoryUnsubscribe,
  DEFAULT_EMAIL_NOTIFICATION_PREFERENCES,
  isEmailCategoryEnabled,
} from "@/lib/email-preferences/contracts";
import { appendEmailUnsubscribeFooter, optionalEmailHeaders } from "@/lib/email-preferences/delivery-contract";
import { createEmailUnsubscribeToken, verifyEmailUnsubscribeToken } from "@/lib/email-preferences/token";

const TEST_SECRET = "notification-preferences-contract-test-secret";
const NOW = Date.UTC(2026, 7, 15, 0, 0, 0);

describe("email notification preferences", () => {
  test("defaults enable service categories but require explicit marketing consent", () => {
    expect(DEFAULT_EMAIL_NOTIFICATION_PREFERENCES).toEqual({
      emailEnabled: true,
      courseUpdates: true,
      eventsAndSchedules: true,
      learningReminders: true,
      newsAndOffers: false,
    });
  });

  test("master preference suppresses every optional category without erasing choices", () => {
    const disabled = { ...DEFAULT_EMAIL_NOTIFICATION_PREFERENCES, emailEnabled: false };
    expect(isEmailCategoryEnabled(disabled, "course_updates")).toBe(false);
    expect(disabled.courseUpdates).toBe(true);
  });

  test("category unsubscribe changes only the requested category", () => {
    const updated = applyCategoryUnsubscribe(DEFAULT_EMAIL_NOTIFICATION_PREFERENCES, "events_and_schedules");
    expect(updated.eventsAndSchedules).toBe(false);
    expect(updated.courseUpdates).toBe(true);
    expect(updated.learningReminders).toBe(true);
  });
});

describe("email unsubscribe token", () => {
  test("round-trips a signed category capability", () => {
    const token = createEmailUnsubscribeToken({
      userId: "user-123",
      category: "course_updates",
      nowMs: NOW,
      secret: TEST_SECRET,
    });
    expect(verifyEmailUnsubscribeToken(token, { nowMs: NOW, secret: TEST_SECRET })).toMatchObject({
      version: 1,
      userId: "user-123",
      category: "course_updates",
    });
  });

  test("rejects tampering and expiry", () => {
    const token = createEmailUnsubscribeToken({
      userId: "user-123",
      category: "learning_reminders",
      nowMs: NOW,
      secret: TEST_SECRET,
    });
    expect(() => verifyEmailUnsubscribeToken(`${token}x`, { nowMs: NOW, secret: TEST_SECRET })).toThrow(
      "INVALID_EMAIL_UNSUBSCRIBE_TOKEN",
    );
    expect(() =>
      verifyEmailUnsubscribeToken(token, { nowMs: NOW + 31 * 24 * 60 * 60 * 1000, secret: TEST_SECRET }),
    ).toThrow("EXPIRED_EMAIL_UNSUBSCRIBE_TOKEN");
  });
});

describe("optional email unsubscribe contract", () => {
  test("adds the visible footer before a closing body tag", () => {
    const html = appendEmailUnsubscribeFooter(
      "<html><body><p>Hello</p></body></html>",
      "https://zyx.example/unsubscribe?token=signed",
      "course_updates",
    );
    expect(html).toContain("Unsubscribe or manage preferences");
    expect(html.indexOf("Unsubscribe or manage preferences")).toBeLessThan(html.indexOf("</body>"));
  });

  test("emits RFC 8058 one-click headers", () => {
    expect(optionalEmailHeaders("https://zyx.example/api/email/unsubscribe?token=signed")).toEqual({
      "List-Unsubscribe": "<https://zyx.example/api/email/unsubscribe?token=signed>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });
});
