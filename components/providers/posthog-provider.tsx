"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { env } from "@/lib/env";

const isDev = process.env.NODE_ENV === "development";
const enableInDev = process.env.NEXT_PUBLIC_POSTHOG_DEV === "true";
let initialized = false;

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const verification = ["/authoring-verification", "/v4"].includes(usePathname() ?? "");
  useEffect(() => {
    const posthogKey = env.NEXT_PUBLIC_POSTHOG_KEY;
    const posthogHost = env.NEXT_PUBLIC_POSTHOG_HOST;

    if (initialized || verification || !posthogKey || (isDev && !enableInDev)) {
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
    initialized = true;
  }, [verification]);

  if (verification || !env.NEXT_PUBLIC_POSTHOG_KEY || (isDev && !enableInDev)) {
    return <>{children}</>;
  }

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
