import { getPublicAppUrl } from "@/lib/public-app-url";
import { EMAIL_NOTIFICATION_CATEGORY_DETAILS, type EmailNotificationCategory } from "./contracts";
import { createEmailUnsubscribeToken } from "./token";

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
): string {
  const label = EMAIL_NOTIFICATION_CATEGORY_DETAILS[category].label;
  const footer = `
    <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; text-align: center;">
      <p style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 12px; line-height: 1.5; color: #64748b; margin: 0;">
        You received this email because the ${label} category is enabled for your Zyx account.
        <a href="${confirmationUrl}" style="color: #2563eb; text-decoration: underline;">Unsubscribe or manage preferences</a>
      </p>
    </div>`;

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${footer}\n</body>`);
  }
  return `${html}${footer}`;
}
