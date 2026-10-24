import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { resend } from "@/lib/resend";
import { isEmailCategoryEnabled, type EmailNotificationCategory } from "./contracts";
import { appendEmailUnsubscribeFooter, buildEmailUnsubscribeUrls, optionalEmailHeaders } from "./delivery-contract";
import { getEmailNotificationPreferences } from "./repository";
import { getUserLocalePreference } from "@/lib/i18n/preferences";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locale";

interface SendOptionalEmailInput {
  userId: string;
  category: EmailNotificationCategory;
  subject?: string;
  html?: string;
  render?: (locale: Locale) => { subject: string; html: string };
  /** Pinned locale from a durable job step so retries reuse the original delivery language. */
  locale?: Locale;
  from?: string;
  replyTo?: string | string[];
}

export type SendOptionalEmailResult =
  | { status: "sent"; emailId: string }
  | { status: "suppressed"; reason: "preference_disabled" };

export async function sendOptionalEmail(input: SendOptionalEmailInput): Promise<SendOptionalEmailResult> {
  const [recipient] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, input.userId))
    .limit(1);
  if (!recipient?.email) throw new Error("OPTIONAL_EMAIL_ACCOUNT_EMAIL_NOT_FOUND");

  const preferences = await getEmailNotificationPreferences(input.userId);
  if (!isEmailCategoryEnabled(preferences, input.category)) {
    return { status: "suppressed", reason: "preference_disabled" };
  }

  const locale = input.locale ?? (await getUserLocalePreference(input.userId)) ?? DEFAULT_LOCALE;
  const rendered = input.render?.(locale) ?? { subject: input.subject ?? "", html: input.html ?? "" };
  if (!rendered.subject || !rendered.html) throw new Error("OPTIONAL_EMAIL_TEMPLATE_MISSING");

  const urls = buildEmailUnsubscribeUrls(input.userId, input.category);
  const html = appendEmailUnsubscribeFooter(rendered.html, urls.confirmationUrl, input.category, locale);
  const headers = optionalEmailHeaders(urls.oneClickUrl);

  const { data, error } = await resend.emails.send({
    from: input.from ?? `Zyx Academy <${process.env.NEXT_PUBLIC_BRAND_EMAIL || "contact@zyxacademy.com"}>`,
    to: recipient.email,
    subject: rendered.subject,
    html,
    headers,
    replyTo: input.replyTo,
  });
  if (error || !data?.id) {
    throw new Error(`OPTIONAL_EMAIL_SEND_FAILED:${error?.message ?? "missing_email_id"}`);
  }
  return { status: "sent", emailId: data.id };
}
