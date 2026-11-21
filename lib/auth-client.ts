"use client";

import { createAuthClient } from "better-auth/react";
import { getQueryClient, syncQueryAccount } from "@/lib/query/client";

export const authClient = createAuthClient({
  // Dynamically use the current browser origin in the client to ensure requests to /api/auth/*
  // are always same-origin (avoiding CORS issues on localhost, preview URLs, or staging).
  // Fall back to NEXT_PUBLIC_APP_URL only on SSR.
  baseURL: typeof window !== "undefined" ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL || undefined),
});

export const { signIn, useSession } = authClient;

export async function signOut(...args: Parameters<typeof authClient.signOut>) {
  const result = await authClient.signOut(...args);
  if (!result.error) {
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

