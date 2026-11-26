import { randomUUID } from "expo-crypto";
import { consentIntake } from "../routing/consent-intent";
import { rewriteNativeBrowserIntent } from "../auth/browser-intent";

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return consentIntake.capture(path, randomUUID) ?? rewriteNativeBrowserIntent(path);
}
