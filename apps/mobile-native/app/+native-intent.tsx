import { rewriteNativeBrowserIntent } from "../auth/browser-intent";
import { rewriteNativeAuthEntry } from "../auth/login-intent";
import { consentIntake } from "../routing/consent-intent";

function newConsentId() {
  const { randomUUID }: { randomUUID(): string } = require("expo-crypto");
  return randomUUID();
}

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return consentIntake.capture(path, newConsentId) ?? rewriteNativeAuthEntry(path) ?? rewriteNativeBrowserIntent(path);
}
