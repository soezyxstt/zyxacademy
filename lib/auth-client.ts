"use client";

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  // Dynamically use the current browser origin in the client to ensure requests to /api/auth/*
  // are always same-origin (avoiding CORS issues on localhost, preview URLs, or staging).
  // Fall back to NEXT_PUBLIC_APP_URL only on SSR.
  baseURL: typeof window !== "undefined" ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL || undefined),
});

export const { signIn, signOut, useSession } = authClient;

