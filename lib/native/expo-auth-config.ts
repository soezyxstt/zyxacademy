import { normalizeNativeAuthScheme } from "./auth-handoff";

export const EXPO_STAGING_SCHEME = "zyx-native-parity";
export const EXPO_STAGING_ORIGIN = "https://staging.zyxacademy.com";

export function normalizeBrowserHandoffScheme(rawScheme: string | null) {
  return rawScheme === EXPO_STAGING_SCHEME ? EXPO_STAGING_SCHEME : normalizeNativeAuthScheme(rawScheme);
}
