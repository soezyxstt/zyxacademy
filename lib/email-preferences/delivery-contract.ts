import { getPublicAppUrl } from "@/lib/public-app-url";
import type { EmailNotificationCategory } from "./contracts";
import { createEmailUnsubscribeToken } from "./token";
import type { Locale } from "@/lib/i18n/locale";
import idMessages from "../../messages/id/notifications.json" with { type: "json" };
import enMessages from "../../messages/en/notifications.json" with { type: "json" };

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
    <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; text-align: center;">
      <p style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 12px; line-height: 1.5; color: #64748b; margin: 0;">
        ${text.footer.replace("{category}", label)}
        <a href="${confirmationUrl}" style="color: #2563eb; text-decoration: underline;">${text.manage}</a>
      </p>
    </div>`;

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${footer}\n</body>`);
  }
  return `${html}${footer}`;
}
