import authEn from "../../../messages/en/auth.json";
import authId from "../../../messages/id/auth.json";
import marketingEn from "../../../messages/en/marketing.json";
import marketingId from "../../../messages/id/marketing.json";
import type { NativeAuthLocale } from "./login-intent";

export const authCopy = {
  id: { ...authId, signOut: marketingId.signOut },
  en: { ...authEn, signOut: marketingEn.signOut },
};

export function authLocale(requested?: string | string[]): NativeAuthLocale {
  if (requested === "en" || requested === "id") return requested;
  return Intl.DateTimeFormat().resolvedOptions().locale.startsWith("en") ? "en" : "id";
}
