/**
 * lib/native/share.ts
 *
 * Unified OS share integration for Zyx Academy:
 * 1. Capacitor Share plugin on Android/iOS
 * 2. Web Share API (navigator.share) on supported mobile/desktop browsers
 * 3. Clipboard fallback (navigator.clipboard.writeText)
 */

import { getCapacitor } from "./runtime";

export interface ShareLinkInput {
  title: string;
  text?: string;
  url: string;
  dialogTitle?: string;
}

export type ShareLinkResult =
  | { ok: true; method: "capacitor" | "web-share" | "clipboard" }
  | { ok: false; cancelled?: boolean; error?: string };

const ALLOWED_SHARE_PROTOCOLS = new Set(["http:", "https:"]);

export function resolveShareUrl(urlOrPath: string, origin?: string): string | null {
  const trimmed = urlOrPath.trim();
  if (!trimmed) return null;

  const baseOrigin =
    origin ?? (typeof window !== "undefined" && window.location?.origin ? window.location.origin : "");

  try {
    const parsed = trimmed.startsWith("/")
      ? baseOrigin
        ? new URL(trimmed, baseOrigin)
        : null
      : new URL(trimmed);
    if (!parsed || !ALLOWED_SHARE_PROTOCOLS.has(parsed.protocol)) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function isUserCancelError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  const message = "message" in error ? String(error.message) : "";
  return (
    name === "AbortError" ||
    /cancel|canceled|cancelled|dismiss/i.test(message)
  );
}

export function canUseNativeShare(): boolean {
  if (getCapacitor()?.Plugins?.Share?.share) return true;
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") return true;
  return false;
}

export async function shareLink(input: ShareLinkInput): Promise<ShareLinkResult> {
  const resolvedUrl = resolveShareUrl(input.url);
  if (!resolvedUrl) {
    return { ok: false, error: "invalid_url" };
  }

  const title = input.title.trim() || "Zyx Academy";
  const text = input.text?.trim() || undefined;
  const dialogTitle = input.dialogTitle?.trim() || title;

  // 1. Capacitor native share sheet (Android / iOS)
  const capShare = getCapacitor()?.Plugins?.Share;
  if (capShare?.share) {
    try {
      let allowed = true;
      if (typeof capShare.canShare === "function") {
        const check = await capShare.canShare();
        allowed = check?.value !== false;
      }
      if (allowed) {
        await capShare.share({
          title,
          text,
          url: resolvedUrl,
          dialogTitle,
        });
        return { ok: true, method: "capacitor" };
      }
    } catch (error) {
      if (isUserCancelError(error)) {
        return { ok: false, cancelled: true };
      }
      // Fall through to Web Share / clipboard fallback.
    }
  }

  // 2. Web Share API
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({
        title,
        text: text ?? title,
        url: resolvedUrl,
      });
      return { ok: true, method: "web-share" };
    } catch (error) {
      if (isUserCancelError(error)) {
        return { ok: false, cancelled: true };
      }
      // Fall through to clipboard fallback.
    }
  }

  // 3. Clipboard fallback
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(resolvedUrl);
      return { ok: true, method: "clipboard" };
    } catch {
      return { ok: false, error: "clipboard_failed" };
    }
  }

  return { ok: false, error: "share_unavailable" };
}
