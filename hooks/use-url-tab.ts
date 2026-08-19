"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Hook for tab or filter state synchronized with URL search params.
 *
 * Why: Standard Next.js `router.replace('?tab=...')` triggers a full React transition
 * and Server Component evaluation, causing noticeable lag when switching tabs.
 * This hook maintains instant local React state (0ms) while keeping `window.location` query params
 * cleanly in sync via `window.history.replaceState` without server roundtrips.
 */
export function useUrlTab(
  paramKey: string = "tab",
  defaultTab: string = "default"
): [string, (newTab: string) => void] {
  const searchParams = useSearchParams();

  // Initialize from searchParams
  const [tab, setTabState] = useState<string>(() => {
    return searchParams.get(paramKey) || defaultTab;
  });

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

  // Sync state on browser back/forward (popstate)
  useEffect(() => {
    const handlePopState = () => {
      const currentParam = new URLSearchParams(window.location.search).get(paramKey);
      setTabState(currentParam || defaultTab);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [paramKey, defaultTab]);

  return [tab, setTab];
}
