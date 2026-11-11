"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";

const isDev = process.env.NODE_ENV === "development";
const enableInDev = process.env.NEXT_PUBLIC_POSTHOG_DEV === "true";
let initialized = false;

export function PostHogProvider({ children, apiKey, apiHost }: {
  children: React.ReactNode;
  apiKey?: string;
  apiHost: string;
}) {
  const verification = ["/authoring-verification", "/v4"].includes(usePathname() ?? "");
  useEffect(() => {
    if (initialized || verification || !apiKey || (isDev && !enableInDev)) {
      return;
    }

    posthog.init(apiKey, {
      api_host: apiHost || "https://us.i.posthog.com",
      person_profiles: "identified_only",
      capture_pageview: false, // Next.js handles routing
      loaded: (ph) => {
        if (isDev) {
          ph.debug();
        }
      },
    });
    initialized = true;
  }, [verification, apiKey, apiHost]);

  if (verification || !apiKey || (isDev && !enableInDev)) {
    return <>{children}</>;
  }

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
