"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * Hook for tab or filter state synchronized with URL search params.
 *
 * Uses the browser History API directly so tab changes stay instant and do not
 * trigger a Server Component roundtrip. Reading the initial URL after mount also
 * avoids requiring a Next.js Suspense boundary during prerendering.
 */
export function useUrlTab(
  paramKey: string = "tab",
  defaultTab: string = "default"
): [string, (newTab: string) => void] {
  const [tab, setTabState] = useState<string>(defaultTab);

  const readCurrentTab = useCallback(() => {
    if (typeof window === "undefined") return defaultTab;
    return new URLSearchParams(window.location.search).get(paramKey) || defaultTab;
  }, [paramKey, defaultTab]);

  const setTab = useCallback(
    (newTab: string) => {
      setTabState(newTab);

      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        if (newTab === defaultTab) {
          url.searchParams.delete(paramKey);
        } else {
          url.searchParams.set(paramKey, newTab);
        }
        window.history.replaceState(null, "", url.toString());
      }
    },
    [paramKey, defaultTab]
  );

  useEffect(() => {
    setTabState(readCurrentTab());

    const handlePopState = () => {
      setTabState(readCurrentTab());
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [readCurrentTab]);

  return [tab, setTab];
}
