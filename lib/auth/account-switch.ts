"use client";

import { authClient } from "@/lib/auth-client";
import { getSafeRedirectPath } from "@/lib/auth-redirect";
import { getQueryClient, syncQueryAccount } from "@/lib/query/client";
import { isPullToRefreshLocked } from "@/lib/pull-to-refresh-lock";
import {
  clearRegisteredPushTokenIdentity,
  getPersistedRegisteredPushToken,
  markPushTokenRegistered,
} from "@/lib/notifications/transport";
import { AccountSwitchError, MAX_SAVED_ACCOUNTS, accountSwitchError, type SavedAccount } from "./account-switch-contract";
import { isAccountTransitionPending, markBrowserAccountRedirect } from "./account-transition-state";
import { prepareAccountTransition, runAccountTransition, type AccountTransitionDependencies } from "./account-transition";

export { AccountSwitchError, MAX_SAVED_ACCOUNTS } from "./account-switch-contract";
export type { AccountSwitchErrorCode, SavedAccount } from "./account-switch-contract";

async function currentUserId(): Promise<string | null> {
  const result = await authClient.getSession({ query: { disableCookieCache: true, disableRefresh: true } });
  if (result.error) throw accountSwitchError(result.error);
  return result.data?.user.id ?? null;
}

async function rememberCurrent(signal?: AbortSignal): Promise<void> {
  const result = await authClient.$fetch("/account-switch/remember", { method: "POST", signal });
  if (result.error) throw accountSwitchError(result.error);
}

async function clearAccountData(userId: string | null): Promise<void> {
  const client = getQueryClient();
  syncQueryAccount(client, userId);
  client.clear();
  const [{ clearOfflineReadingsForOtherUsers }, { clearAllLocalRemindersOnLogout }] = await Promise.all([
    import("@/lib/offline/reading-cache"),
    import("@/lib/native/local-reminders"),
  ]);
  await Promise.all([
    clearOfflineReadingsForOtherUsers(userId).catch(() => {}),
    clearAllLocalRemindersOnLogout().catch(() => {}),
  ]);
}

async function detachPush(userId: string | null): Promise<() => Promise<void>> {
  if (!userId) return async () => {};
  const token = getPersistedRegisteredPushToken();
  if (!token) return async () => {};
  const { getClientPushRegistrationMeta } = await import("@/lib/native/notifications");
  const metadata = getClientPushRegistrationMeta();
  const response = await fetch("/api/notifications/register-token", {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!response.ok) throw new AccountSwitchError("SWITCH_FAILED");
  clearRegisteredPushTokenIdentity();
  return async () => {
    const restored = await fetch("/api/notifications/register-token", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, ...metadata }),
    });
    if (restored.ok) markPushTokenRegistered(userId, token);
  };
}

function transitionDependencies(): AccountTransitionDependencies {
  const client = getQueryClient();
  return {
    isOnline: () => typeof navigator === "undefined" || navigator.onLine !== false,
    hasPendingChanges: () => client.isMutating() > 0 || isPullToRefreshLocked(),
    currentUserId,
    rememberCurrent,
    cancelRequests: () => client.cancelQueries(),
    detachPush,
    commit: clearAccountData,
    resume: () => { void client.invalidateQueries(); },
    // A fresh document is required to discard the previous account's server UI.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    reload: () => { window.location.assign("/dashboard"); },
  };
}

/** The operation must resolve only after the server verifies the new session. */
export async function withAccountTransition(operation: () => Promise<string>): Promise<string> {
  return runAccountTransition(operation, transitionDependencies());
}

export async function listSavedAccounts(signal?: AbortSignal): Promise<SavedAccount[]> {
  await rememberCurrent(signal);
  const result = await authClient.multiSession.listDeviceSessions({ fetchOptions: { signal } });
  if (result.error) throw accountSwitchError(result.error);
  const seen = new Set<string>();
  return (result.data ?? []).flatMap((item) => {
    const expiresAt = new Date(item.session.expiresAt);
    if (expiresAt.getTime() <= Date.now() || seen.has(item.user.id)) return [];
    seen.add(item.user.id);
    return [{
      user: { id: item.user.id, name: item.user.name, email: item.user.email, image: item.user.image ?? null },
      session: { token: item.session.token, expiresAt: expiresAt.toISOString() },
    }];
  });
}

export async function assertCanAddAccount(): Promise<void> {
  if (isAccountTransitionPending()) throw new AccountSwitchError("BUSY");
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new AccountSwitchError("OFFLINE");
  if (getQueryClient().isMutating() > 0 || isPullToRefreshLocked()) throw new AccountSwitchError("PENDING_CHANGES");
  if ((await listSavedAccounts()).length >= MAX_SAVED_ACCOUNTS) throw new AccountSwitchError("SESSION_LIMIT");
}

export async function switchSavedAccount(account: SavedAccount): Promise<string> {
  return withAccountTransition(async () => {
    const result = await authClient.multiSession.setActive({ sessionToken: account.session.token });
    if (result.error) throw accountSwitchError(result.error);
    const userId = result.data?.user.id;
    if (!userId || userId !== account.user.id) throw new AccountSwitchError("SWITCH_FAILED");
    return userId;
  });
}

export async function removeSavedAccount(account: SavedAccount): Promise<void> {
  if (isAccountTransitionPending()) throw new AccountSwitchError("BUSY");
  if (await currentUserId() === account.user.id) throw new AccountSwitchError("ACTIVE_ACCOUNT");
  const result = await authClient.multiSession.revoke({ sessionToken: account.session.token });
  if (result.error) throw accountSwitchError(result.error);
}

export async function startWebAccountSignIn(callbackURL = "/dashboard"): Promise<void> {
  await assertCanAddAccount();
  const transition = await prepareAccountTransition(transitionDependencies());
  try {
    const safeCallback = getSafeRedirectPath(callbackURL);
    const result = await authClient.signIn.social({
      provider: "google",
      callbackURL: safeCallback,
      errorCallbackURL: safeCallback,
      disableRedirect: true,
    });
    if (result.error) throw accountSwitchError(result.error);
    const url = result.data?.url;
    if (!url || new URL(url).origin !== "https://accounts.google.com") throw new AccountSwitchError("SWITCH_FAILED");
    // A full browser navigation discards the old UI. Stop its reminders before
    // departure; normal startup restores the confirmed account's saved settings.
    markBrowserAccountRedirect(transition.previousUserId);
    await transition.depart();
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) window.location.reload();
    }, { once: true });
    window.location.assign(url);
  } catch (error) {
    await transition.fail(error, false);
  }
}
