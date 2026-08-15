import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { env } from "@/lib/env";
import { resend } from "@/lib/resend";
import { isEmailCategoryEnabled, type EmailNotificationCategory } from "./contracts";
import { appendEmailUnsubscribeFooter, buildEmailUnsubscribeUrls, optionalEmailHeaders } from "./delivery-contract";
import { getEmailNotificationPreferences } from "./repository";

interface SendOptionalEmailInput {
  userId: string;
  category: EmailNotificationCategory;
  subject: string;
  html: string;
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

  let html = input.html;
  let headers: Record<string, string> | undefined;

  if (env.FEATURE_NOTIFICATION_PREFERENCES === "1") {
    const preferences = await getEmailNotificationPreferences(input.userId);
    if (!isEmailCategoryEnabled(preferences, input.category)) {
      return { status: "suppressed", reason: "preference_disabled" };
    }

    const urls = buildEmailUnsubscribeUrls(input.userId, input.category);
    html = appendEmailUnsubscribeFooter(html, urls.confirmationUrl, input.category);
    headers = optionalEmailHeaders(urls.oneClickUrl);
  }

  const { data, error } = await resend.emails.send({
    from: input.from ?? `Zyx Academy <${env.NEXT_PUBLIC_BRAND_EMAIL || "contact@zyxacademy.com"}>`,
    to: recipient.email,
    subject: input.subject,
    html,
    headers,
    replyTo: input.replyTo,
  });
  if (error || !data?.id) {
    throw new Error(`OPTIONAL_EMAIL_SEND_FAILED:${error?.message ?? "missing_email_id"}`);
  }
  return { status: "sent", emailId: data.id };
}
