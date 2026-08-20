import { unsubscribeEmailCategory } from "./repository";
import { verifyEmailUnsubscribeToken } from "./token";

export async function unsubscribeWithEmailToken(token: string) {
  const payload = verifyEmailUnsubscribeToken(token);
  await unsubscribeEmailCategory(payload.userId, payload.category);
  return payload;
}
