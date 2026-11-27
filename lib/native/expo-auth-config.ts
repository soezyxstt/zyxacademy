import { calendarLinkState } from "@/packages/student-community/calendar-link";
import { normalizeNativeAuthScheme } from "./auth-handoff";

export const EXPO_STAGING_SCHEME = "zyx-native-parity";
export const EXPO_STAGING_ORIGIN = "https://staging.zyxacademy.com";

export const EXPO_ANDROID_BROWSER_RETURN_HEADER = "X-Zyx-Native-Handoff";
export const EXPO_ANDROID_BROWSER_RETURN = "android-browser";

export function normalizeBrowserHandoffScheme(rawScheme: string | null) {
  return rawScheme === EXPO_STAGING_SCHEME ? EXPO_STAGING_SCHEME : normalizeNativeAuthScheme(rawScheme);
}

/** Calendar links never mint login credentials. This allowlist is limited to callback presentation. */
export function normalizeCalendarLinkScheme(raw: string | null | undefined, linkState: string | null | undefined, origin: string) {
  if (raw === EXPO_STAGING_SCHEME) {
    return origin === EXPO_STAGING_ORIGIN && calendarLinkState(linkState) ? EXPO_STAGING_SCHEME : null;
  }
  return normalizeNativeAuthScheme(raw);
}

export function prefersExpoAndroidReturnPage(headers: Headers) {
  if (!/\bAndroid\b/i.test(headers.get("user-agent") ?? "")) return false;
  return headers.get("accept")?.split(",").some(entry => {
    const [type, ...parameters] = entry.toLowerCase().split(";").map(part => part.trim());
    const quality = parameters.find(parameter => parameter.startsWith("q="));
    return type === "text/html" && (!quality || Number(quality.slice(2)) > 0);
  }) ?? false;
}
