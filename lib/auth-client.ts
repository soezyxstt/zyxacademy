"use client";

import { createAuthClient } from "better-auth/react";
import { multiSessionClient } from "better-auth/client/plugins";
import { useEffect } from "react";
import { getQueryClient, syncQueryAccount } from "@/lib/query/client";
import { finishBrowserAccountRedirect, isAccountTransitionPending, subscribeAccountTransition } from "@/lib/auth/account-transition-state";
import { createAccountSessionFetch } from "@/lib/auth/account-session-fetch";

export const authClient = createAuthClient({
  plugins: [multiSessionClient()],
  fetchOptions: {
    customFetchImpl: createAccountSessionFetch({
      fetch: (input, init) => fetch(input, init),
      isPending: isAccountTransitionPending,
      subscribe: subscribeAccountTransition,
    }),
  },
  // Dynamically use the current browser origin in the client to ensure requests to /api/auth/*
  // are always same-origin (avoiding CORS issues on localhost, preview URLs, or staging).
  // Fall back to NEXT_PUBLIC_APP_URL only on SSR.
  baseURL: typeof window !== "undefined" ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL || undefined),
});

export const { signIn } = authClient;

export function useSession(...args: Parameters<typeof authClient.useSession>) {
  const result = authClient.useSession(...args);
  useEffect(() => {
    if (!result.isPending && !result.error) finishBrowserAccountRedirect(result.data?.user.id ?? null);
  }, [result.isPending, result.error, result.data?.user.id]);
  return result;
}

export async function signOut(...args: Parameters<typeof authClient.signOut>) {
  if (typeof window !== "undefined") {
    // Unregister the current device push token while the session cookie is still valid.
    await import("@/lib/native/notifications")
      .then(({ unregisterCurrentPushToken }) => unregisterCurrentPushToken())
      .catch(() => {});
  }
  const result = await authClient.signOut(...args);
  if (!result.error) {
    if (typeof window !== "undefined") {
      await import("@/lib/native/auth")
        .then(({ clearNativeGoogleCredentialState }) => clearNativeGoogleCredentialState())
        .catch(() => {});
    }
    syncQueryAccount(getQueryClient(), null);
    if (typeof window !== "undefined") {
      const [{ clearAllOfflineReadings }, { clearAllLocalRemindersOnLogout }] = await Promise.all([
        import("@/lib/offline/reading-cache"),
        import("@/lib/native/local-reminders"),
      ]);
      await Promise.all([
        clearAllOfflineReadings().catch(() => {}),
        clearAllLocalRemindersOnLogout().catch(() => {}),
      ]);
    }
  }
  return result;
}

