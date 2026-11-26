import { getPublicAppUrl } from "@/lib/public-app-url";
import type { EmailNotificationCategory } from "./contracts";
import { createEmailUnsubscribeToken } from "./token";
import type { Locale } from "@/lib/i18n/locale";
import idMessages from "../../messages/id/notifications.json" with { type: "json" };
import enMessages from "../../messages/en/notifications.json" with { type: "json" };

import { EMAIL_OPTIONAL_FOOTER_MARKER, emailStyles, escapeEmailHtml } from "@/lib/notifications/email-layout";

const emailMessages = { id: idMessages.email, en: enMessages.email } as const;

export function buildEmailUnsubscribeUrls(
  userId: string,
  category: EmailNotificationCategory,
  appUrl = getPublicAppUrl(),
): { confirmationUrl: string; oneClickUrl: string } {
  const token = createEmailUnsubscribeToken({ userId, category });
  const base = appUrl.replace(/\/$/, "");
  const encodedToken = encodeURIComponent(token);
  return {
    confirmationUrl: `${base}/unsubscribe?token=${encodedToken}`,
    oneClickUrl: `${base}/api/email/unsubscribe?token=${encodedToken}`,
  };
}

export function optionalEmailHeaders(oneClickUrl: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${oneClickUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

export function appendEmailUnsubscribeFooter(
  html: string,
  confirmationUrl: string,
  category: EmailNotificationCategory,
  locale: Locale = "en",
): string {
  const categoryKey = {
    course_updates: "courseUpdates",
    events_and_schedules: "eventsAndSchedules",
    learning_reminders: "learningReminders",
    news_and_offers: "newsAndOffers",
  }[category] as keyof typeof emailMessages.id.categories;
  const text = emailMessages[locale];
  const label = text.categories[categoryKey].label;
  const footer = `
    <div style="padding:12px 0 0;text-align:left;">
      <p style="${emailStyles.muted}">
        ${escapeEmailHtml(text.footer.replace("{category}", () => label))}
        <a href="${escapeEmailHtml(confirmationUrl)}" style="${emailStyles.link}">${escapeEmailHtml(text.manage)}</a>
      </p>
    </div>`;

  if (html.includes(EMAIL_OPTIONAL_FOOTER_MARKER)) {
    return html.replace(EMAIL_OPTIONAL_FOOTER_MARKER, () => footer);
  }
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, () => `${footer}\n</body>`);
  }
  return `${html}${footer}`;
}
