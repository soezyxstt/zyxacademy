"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { env } from "@/lib/env";

const isDev = process.env.NODE_ENV === "development";
const enableInDev = process.env.NEXT_PUBLIC_POSTHOG_DEV === "true";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const posthogKey = env.NEXT_PUBLIC_POSTHOG_KEY;
    const posthogHost = env.NEXT_PUBLIC_POSTHOG_HOST;

    if (!posthogKey || (isDev && !enableInDev)) {
      return;
    }

    posthog.init(posthogKey, {
      api_host: posthogHost || "https://us.i.posthog.com",
      person_profiles: "identified_only",
      capture_pageview: false, // Next.js handles routing
      loaded: (ph) => {
        if (isDev) {
          ph.debug();
        }
      },
    });
  }, []);

  if (!env.NEXT_PUBLIC_POSTHOG_KEY || (isDev && !enableInDev)) {
    return <>{children}</>;
  }

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
