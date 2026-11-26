import { rewriteNativeBrowserIntent } from "../auth/browser-intent";
import { consentIntake } from "../routing/consent-intent";

function newConsentId() {
  const { randomUUID } = require("expo-crypto") as typeof import("expo-crypto");
  return randomUUID();
}

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return consentIntake.capture(path, newConsentId) ?? rewriteNativeBrowserIntent(path);
}
