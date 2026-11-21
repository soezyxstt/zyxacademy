/**
 * lib/native/files.ts
 *
 * Native file save and open helpers for attachments and downloadable materials.
 * Always fetches same-origin endpoints with credentials so existing server
 * authorization and signed/scoped access checks are strictly enforced.
 */

import { getCapacitor, getTauri } from "./runtime";
import { hapticSuccess } from "./haptics";

export interface AuthorizedFileOptions {
  url: string;
  fileName?: string;
  title?: string;
}

export type NativeFileActionResult =
  | {
      ok: true;
      method:
        | "capacitor-filesystem"
        | "capacitor-browser"
        | "tauri-opener"
        | "web-download"
        | "web-open";
    }
  | {
      ok: false;
      cancelled?: boolean;
      status?: number;
      error: "invalid_url" | "unauthorized" | "not_found" | "fetch_failed" | "unsupported";
    };

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

export function resolveAuthorizedFileUrl(
  rawUrl: string,
  origin?: string,
): { url: string; sameOrigin: boolean } | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  const baseOrigin =
    origin ?? (typeof window !== "undefined" && window.location?.origin ? window.location.origin : "");

  try {
    const parsed = trimmed.startsWith("/")
      ? baseOrigin
        ? new URL(trimmed, baseOrigin)
        : null
      : new URL(trimmed);
    if (!parsed || !ALLOWED_PROTOCOLS.has(parsed.protocol)) return null;
    const sameOrigin = Boolean(baseOrigin && parsed.origin === baseOrigin);
    return { url: parsed.toString(), sameOrigin };
  } catch {
    return null;
  }
}

export function sanitizeFileName(rawName?: string, fallback = "zyx-file"): string {
  const trimmed = (rawName ?? "").trim();
  if (!trimmed) return fallback;
  const base = trimmed.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/\.\.+/g, ".")
    .replace(/[\x00-\x1f<>:"|?*]/g, "_")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}

function extractFilenameFromDisposition(header: string | null): string | undefined {
  if (!header) return undefined;
  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }
  const plainMatch = header.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1];
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(new Error("blob_read_failed"));
    reader.readAsDataURL(blob);
  });
}

function triggerBrowserBlobDownload(blob: Blob, fileName: string): boolean {
  if (typeof document === "undefined" || typeof URL === "undefined" || !URL.createObjectURL) {
    return false;
  }
  const objectUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName;
    link.rel = "noopener noreferrer";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    return true;
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
  }
}

function triggerBrowserDirectDownload(url: string, fileName: string): boolean {
  if (typeof document !== "undefined" && typeof document.createElement === "function" && document.body) {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    return true;
  }
  if (typeof window !== "undefined" && typeof window.open === "function") {
    window.open(url, "_blank", "noopener,noreferrer");
    return true;
  }
  return false;
}

function mapHttpStatusToError(status: number): "unauthorized" | "not_found" | "fetch_failed" {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 404) return "not_found";
  return "fetch_failed";
}

function isCancelError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  const message = "message" in error ? String(error.message) : "";
  return name === "AbortError" || /cancel|canceled|cancelled|dismiss/i.test(message);
}

/**
 * Saves an authorized attachment or material file.
 * Respects server authorization by fetching same-origin endpoints with session credentials
 * before saving through Capacitor Filesystem + Share, Tauri, or browser download.
 */
export async function saveAuthorizedFile(
  options: AuthorizedFileOptions,
): Promise<NativeFileActionResult> {
  const resolved = resolveAuthorizedFileUrl(options.url);
  if (!resolved) {
    return { ok: false, error: "invalid_url" };
  }

  const cap = getCapacitor();
  const tauri = getTauri();

  // For external signed URLs (already authorized by server when issued), native shells
  // can hand off directly when CORS prevents JS fetch.
  if (!resolved.sameOrigin) {
    if (tauri?.opener?.openUrl) {
      try {
        await tauri.opener.openUrl(resolved.url);
        void hapticSuccess();
        return { ok: true, method: "tauri-opener" };
      } catch {
        // Fall through to web fallback.
      }
    }
    if (cap?.Plugins?.Browser?.open) {
      try {
        await cap.Plugins.Browser.open({ url: resolved.url });
        void hapticSuccess();
        return { ok: true, method: "capacitor-browser" };
      } catch {
        // Fall through to web fallback.
      }
    }
  }

  // Fetch with credentials so server authorization checks are strictly enforced.
  let response: Response;
  try {
    response = await fetch(resolved.url, {
      method: "GET",
      credentials: resolved.sameOrigin ? "same-origin" : "omit",
    });
  } catch {
    if (!resolved.sameOrigin) {
      const fallbackName = sanitizeFileName(options.fileName, "zyx-attachment");
      if (triggerBrowserDirectDownload(resolved.url, fallbackName)) {
        void hapticSuccess();
        return { ok: true, method: "web-download" };
      }
    }
    return { ok: false, error: "fetch_failed" };
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: mapHttpStatusToError(response.status),
    };
  }

  const headerName = extractFilenameFromDisposition(
    response.headers.get("content-disposition"),
  );
  const safeName = sanitizeFileName(options.fileName ?? headerName, "zyx-attachment");
  const blob = await response.blob();

  // Capacitor Filesystem + Share sheet (saves to app cache and opens native save/open sheet)
  const filesystem = cap?.Plugins?.Filesystem;
  const share = cap?.Plugins?.Share;
  if (filesystem?.writeFile && share?.share) {
    try {
      const base64Data = await blobToBase64(blob);
      const written = await filesystem.writeFile({
        path: `zyx-downloads/${Date.now()}-${safeName}`,
        data: base64Data,
        directory: "CACHE",
        recursive: true,
      });
      if (written?.uri) {
        await share.share({
          title: options.title ?? safeName,
          url: written.uri,
          dialogTitle: options.title ?? safeName,
        });
        void hapticSuccess();
        return { ok: true, method: "capacitor-filesystem" };
      }
    } catch (error) {
      if (isCancelError(error)) {
        return { ok: false, cancelled: true, error: "fetch_failed" };
      }
      // Fall through to browser blob download.
    }
  }

  // Web / Tauri / Capacitor WebView blob download fallback
  if (triggerBrowserBlobDownload(blob, safeName)) {
    void hapticSuccess();
    return { ok: true, method: "web-download" };
  }

  return { ok: false, error: "unsupported" };
}

/**
 * Opens an authorized file URL using the native opener when available,
 * or a new browser tab on web.
 */
export async function openAuthorizedFile(
  options: AuthorizedFileOptions,
): Promise<NativeFileActionResult> {
  const resolved = resolveAuthorizedFileUrl(options.url);
  if (!resolved) {
    return { ok: false, error: "invalid_url" };
  }

  const cap = getCapacitor();
  const tauri = getTauri();

  if (tauri?.opener?.openUrl && !resolved.sameOrigin) {
    try {
      await tauri.opener.openUrl(resolved.url);
      return { ok: true, method: "tauri-opener" };
    } catch {
      // Fall through to browser open.
    }
  }

  if (cap?.Plugins?.Browser?.open && !resolved.sameOrigin) {
    try {
      await cap.Plugins.Browser.open({ url: resolved.url });
      return { ok: true, method: "capacitor-browser" };
    } catch {
      // Fall through to browser open.
    }
  }

  // For same-origin authorized endpoints in Capacitor with Filesystem + Share, save and open via native sheet
  if (cap?.Plugins?.Filesystem?.writeFile && cap?.Plugins?.Share?.share && resolved.sameOrigin) {
    return saveAuthorizedFile(options);
  }

  if (typeof window !== "undefined" && typeof window.open === "function") {
    window.open(resolved.url, "_blank", "noopener,noreferrer");
    return { ok: true, method: "web-open" };
  }

  return { ok: false, error: "unsupported" };
}
