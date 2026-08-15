import { env } from "@/lib/env";
import { unsubscribeEmailCategory } from "./repository";
import { verifyEmailUnsubscribeToken } from "./token";

export async function unsubscribeWithEmailToken(token: string) {
  if (env.FEATURE_NOTIFICATION_PREFERENCES !== "1") {
    throw new Error("EMAIL_NOTIFICATION_PREFERENCES_DISABLED");
  }
  const payload = verifyEmailUnsubscribeToken(token);
  await unsubscribeEmailCategory(payload.userId, payload.category);
  return payload;
}
