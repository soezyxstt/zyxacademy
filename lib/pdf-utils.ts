/**
 * Utility functions for PDF delivery across devices.
 * Mobile and tablet browsers (e.g. Chrome on Android, Safari on iOS / iPadOS)
 * do not support inline PDF rendering inside iframes reliably.
 */

/**
 * Detects whether the current client is a mobile or tablet viewport or device.
 */
export function isMobileOrTablet(): boolean {
  if (typeof window === "undefined") return false;

  const ua = navigator.userAgent || "";

  // Common mobile and tablet identifiers
  if (/android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua)) {
    return true;
  }

  // iPadOS Safari reports Macintosh in userAgent, but has touch points
  if (/macintosh/i.test(ua) && typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1) {
    return true;
  }

  // Standard responsive width check for mobile and tablet screens (< 1024px)
  if (typeof window.innerWidth === "number" && window.innerWidth < 1024) {
    return true;
  }

  // Touch devices with typical tablet dimensions
  if (typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 0 && window.innerWidth < 1280) {
    return true;
  }

  return false;
}

/**
 * Normalizes a PDF URL for in-browser inline viewing.
 * Strips download query parameters (e.g. `download=1` or `download=true`)
 * so that the server sends `Content-Disposition: inline`, allowing the browser's
 * PDF viewer (e.g. Chrome PDF viewer) to display the file instead of prompting a download.
 */
export function getViewablePdfUrl(url?: string | null): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (!trimmed) return "";

  return trimmed
    .replace(/([?&])download=(?:1|true)(&|$)/i, "$1")
    .replace(/[?&]$/, "");
}

/**
 * Opens a PDF in a new browser tab using its viewable API URL.
 */
export function openPdfInBrowser(url?: string | null): boolean {
  const viewUrl = getViewablePdfUrl(url);
  if (!viewUrl || typeof window === "undefined") return false;
  window.open(viewUrl, "_blank", "noopener,noreferrer");
  return true;
}
