"use client";

import { useSyncExternalStore } from "react";

export const DESKTOP_BREAKPOINT_PX = 768;
export const DESKTOP_MEDIA_QUERY = `(min-width: ${DESKTOP_BREAKPOINT_PX}px)`;

export type ViewportMode = "mobile" | "desktop" | "unknown";
export type ResolvedViewportMode = Exclude<ViewportMode, "unknown">;

export function getViewportModeSnapshot(): ViewportMode {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "unknown";
  }
  return window.matchMedia(DESKTOP_MEDIA_QUERY).matches ? "desktop" : "mobile";
}

export function getViewportModeServerSnapshot(
  initialHint?: ResolvedViewportMode
): ViewportMode {
  return initialHint ?? "unknown";
}

export function subscribeViewportMode(listener: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }

  const mediaQuery = window.matchMedia(DESKTOP_MEDIA_QUERY);
  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  }

  // Fallback for older browsers implementing deprecated MediaQueryList listeners.
  mediaQuery.addListener(listener);
  return () => mediaQuery.removeListener(listener);
}

/**
 * SSR-safe viewport mode detector anchored to the canonical 768px (md:) breakpoint.
 * Returns "unknown" on the server unless an explicit initialHint is supplied.
 */
export function useViewportMode(initialHint?: ResolvedViewportMode): ViewportMode {
  return useSyncExternalStore(
    subscribeViewportMode,
    getViewportModeSnapshot,
    () => getViewportModeServerSnapshot(initialHint)
  );
}
