import { randomUUID } from "expo-crypto";
import { consentIntake } from "../routing/consent-intent";
import { rewriteNativeBrowserIntent } from "../auth/browser-intent";
import { academicIntentPath } from "../routing/academic-intent";

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return consentIntake.capture(path, randomUUID) ?? academicIntentPath(path) ?? rewriteNativeBrowserIntent(path);
}
