import { describe, expect, test } from "bun:test";
import { appendEmailUnsubscribeFooter } from "@/lib/email-preferences/delivery-contract";
import { EMAIL_OPTIONAL_FOOTER_MARKER, emailColors, renderEmailDetails } from "@/lib/notifications/email-layout";
import { renderPaymentSuccessEmail, renderScheduleEventEmail, renderStudyReengagementEmail, renderUpcomingSessionEmail } from "@/lib/notifications/email-templates";
import { pkaAnnouncementEmailHtml, scheduleEmailHtml } from "@/lib/pka-email-template";
import { renderReflectionEmail } from "@/lib/reflection-email-template";

describe("branded notification emails", () => {
  for (const locale of ["id", "en"] as const) {
    test(`uses the same fluid email shell for every renderer (${locale})`, () => {
      const html = [
        renderPaymentSuccessEmail({ locale, name: "Ari <Learner>", groupName: "TPB", courseCount: 2 }).html,
        renderScheduleEventEmail({ locale, recipientName: "Ari", title: "Updated <schedule>", summary: "Moved", details: [{ label: "Date", value: "26 Nov" }], link: "/dashboard/schedule" }).html,
        renderStudyReengagementEmail({ locale, name: "Ari", inactiveDays: 7, courseTitle: "Physics", link: "/courses/physics" }).html,
        renderUpcomingSessionEmail({ locale, recipientName: "Ari", courseTitle: "Physics", sessionDate: "2026-11-26", startTime: "19:00", endTime: "20:00", link: "/dashboard/schedule" }).html,
        scheduleEmailHtml("PKA", new Date("2026-11-26T12:00:00Z"), "https://meet.google.com/abc-defg-hij", locale),
        pkaAnnouncementEmailHtml("PKA", "**Materials**", locale),
        renderReflectionEmail({ locale, name: "Ari", weekStart: "2026-11-23", completed: { quizzes: 1, flashcards: 2, modules: 3 }, masteryGrowth: 4, mostImproved: "Limits", currentStreak: 5, longestStreak: 6 }).html,
      ];
      for (const message of html) {
        expect(message).toContain(`<html lang="${locale}">`);
        expect(message).toContain("Zyx Academy</td>");
        expect(message).toContain("max-width:600px");
        expect(message).toContain("role=\"presentation\"");
        expect(message).toContain(emailColors.primary);
        expect(message).toContain(EMAIL_OPTIONAL_FOOTER_MARKER);
        expect(message).not.toContain("#2563eb");
        expect(message).not.toContain("{{");
        expect(message.match(/<body\b/g)).toHaveLength(1);
      }
      expect(html[0]).toContain("Ari &lt;Learner&gt;");
      expect(html[1]).toContain("Updated &lt;schedule&gt;");
      expect(html[4]).toContain('href="https://meet.google.com/abc-defg-hij"');
      expect(html[5]).toContain("<strong>Materials</strong>");
      expect(html[6]).toContain("+4%");
    });
  }

  test("escapes detail values and omits empty detail tables", () => {
    expect(renderEmailDetails([])).toBe("");
    const html = renderEmailDetails([{ label: "<script>", value: 'A & B "C"' }]);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("A &amp; B &quot;C&quot;");
    expect(html).not.toContain("<script>");
  });

  test("places the optional unsubscribe link within the bounded footer, without changing transactional email", () => {
    const transactional = renderPaymentSuccessEmail({ locale: "id", name: "Ari", groupName: "TPB", courseCount: 2 }).html;
    expect(transactional).not.toContain("Berhenti berlangganan");
    const optional = renderStudyReengagementEmail({ locale: "id", name: "Ari", inactiveDays: 7, courseTitle: "Physics", link: "/courses/physics" }).html;
    const withFooter = appendEmailUnsubscribeFooter(optional, "https://zyx.example/unsubscribe?token=abc&test=1", "learning_reminders", "id");
    expect(withFooter).toContain("Berhenti berlangganan atau atur preferensi");
    expect(withFooter).toContain("token=abc&amp;test=1");
    expect(withFooter).not.toContain(EMAIL_OPTIONAL_FOOTER_MARKER);
    expect(withFooter.indexOf("Berhenti berlangganan")).toBeLessThan(withFooter.lastIndexOf("</td>"));
  });

  test("does not render a Google Meet action until a link is available", () => {
    const pending = scheduleEmailHtml("PKA", new Date("2026-11-26T12:00:00Z"), null, "en");
    expect(pending).toContain("The Google Meet link will be shared before the session starts.");
    expect(pending).not.toContain("Join Google Meet");
  });
});
