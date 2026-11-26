import { MAX_SAVED_ACCOUNTS, type AccountSwitchErrorCode } from "../../../lib/auth/account-switch-contract";
import commonEn from "../../../messages/en/common.json";
import commonId from "../../../messages/id/common.json";
import type { AdditionalLoginScope } from "./browser-flow";
import type { NativeSessionState } from "./session-controller";

export type SavedNativeAccount = { accountId: string; name?: string; email?: string };
export type SavedAccountLocale = "en" | "id";

export function savedAccountCopy(locale: SavedAccountLocale) {
  return (locale === "en" ? commonEn : commonId).accounts;
}

export function allowsSavedAccountLogin(snapshot: {
  state: NativeSessionState; revalidating: boolean; transport: { isCurrent(): boolean } | null;
}, scope?: AdditionalLoginScope, now = Date.now()) {
  const { state, revalidating, transport } = snapshot;
  if (revalidating) return false;
  if (!scope) return state.status === "signed-out";
  return state.status === "signed-in" && state.sessionId === scope.fromSessionId &&
    state.expiresAt > now && transport?.isCurrent() === true;
}

export function describeSavedAccount(account: SavedNativeAccount, index: number, locale: SavedAccountLocale) {
  const copy = savedAccountCopy(locale);
  const name = account.name?.trim();
  const email = account.email?.trim();
  const title = name || email || copy.numbered.replace("{count}", String(index + 1));
  const identity = email || title;
  return { title, subtitle: name && email && name !== email ? email : undefined, identity, switchLabel: copy.switchNamed.replace("{email}", identity) };
}

export function savedAccountError(locale: SavedAccountLocale, failure: unknown, action: "add" | "switch" | "remove") {
  const copy = savedAccountCopy(locale);
  const code: string | undefined = typeof failure === "object" && failure !== null && "code" in failure
    ? String(failure.code) : typeof failure === "string" ? failure : failure instanceof Error ? failure.message : undefined;
  switch (code as AccountSwitchErrorCode | undefined) {
    case "CANCELLED": return null;
    case "ACTIVE_ACCOUNT": return copy.alreadySaved;
    case "ACCOUNT_UNAVAILABLE": return action === "add" ? copy.googleAccountUnavailable : copy.unavailable;
    case "SESSION_EXPIRED": return action === "add" ? copy.addExpired : copy.expired;
    case "SESSION_LIMIT": return copy.limit.replace("{count}", String(MAX_SAVED_ACCOUNTS));
    case "BUSY": return copy.busy;
    case "PENDING_CHANGES": return copy.pendingChanges;
    case "OFFLINE": return copy.offline;
    default: return action === "add" ? copy.addFailed : action === "remove" ? copy.removeFailed : copy.switchFailed;
  }
}
