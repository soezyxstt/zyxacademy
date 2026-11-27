import type { NativeAccountContext } from "../../../packages/native-session/context";
import type { NativeAuthLocale } from "./login-intent";
import type { NativeSessionState } from "./session-controller";

export function nativeUiLocale(
  state: NativeSessionState, context: NativeAccountContext | null, fallback: NativeAuthLocale,
): NativeAuthLocale {
  if (state.status === "signed-in" && context?.accountId === state.accountId && context.sessionId === state.sessionId) {
    return context.locale;
  }
  return state.status === "unavailable" ? state.offlineIdentity?.locale ?? fallback : fallback;
}
