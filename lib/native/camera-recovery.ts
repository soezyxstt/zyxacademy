/**
 * lib/native/camera-recovery.ts
 *
 * Persists pending camera capture context before launching the native Android/iOS
 * camera and routes Capacitor's `appRestoredResult` back to the exact originating
 * composer (Discussion new/reply or Zyra) if Android kills the WebView while the
 * camera activity is open.
 */

import { getSafeRedirectPath } from "@/lib/auth-redirect";
import {
  getCapacitor,
  type CapacitorPluginListenerHandle,
  type CapacitorRestoredResultEvent,
} from "./runtime";

export const PENDING_CAMERA_CAPTURE_KEY = "zyx_pending_camera_capture_v1";
export const RESTORED_CAMERA_PAYLOAD_KEY = "zyx_restored_camera_payload_v1";
export const ZYX_CAMERA_RESTORED_EVENT = "zyx:camera-restored";

const CAPTURE_TTL_MS = 15 * 60 * 1000;

export interface CameraReplyTarget {
  id: string;
  authorName: string;
  excerpt: string;
  imageOnly?: boolean;
}

export type CameraRecoveryTarget =
  | {
      surface: "discussion";
      mode: "new";
      channelId: string;
      viewerId: string;
      draftBody: string;
      pathname: string;
      search: string;
      createdAt: number;
    }
  | {
      surface: "discussion";
      mode: "reply";
      channelId: string;
      questionId: string;
      viewerId: string;
      draftBody: string;
      replyTo?: CameraReplyTarget;
      pathname: string;
      search: string;
      createdAt: number;
    }
  | {
      surface: "zyra";
      courseId: string;
      sessionId?: string | null;
      draftBody: string;
      pathname: string;
      search: string;
      createdAt: number;
    };

export type CameraRecoveryTargetInput =
  | Omit<Extract<CameraRecoveryTarget, { surface: "discussion"; mode: "new" }>, "createdAt">
  | Omit<Extract<CameraRecoveryTarget, { surface: "discussion"; mode: "reply" }>, "createdAt">
  | Omit<Extract<CameraRecoveryTarget, { surface: "zyra" }>, "createdAt">;

export interface RestoredCameraPayload {
  id: string;
  target: CameraRecoveryTarget;
  base64String: string;
  format: string;
  restoredAt: number;
}

export interface CameraStorageAdapter {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

let memoryRestoredPayload: RestoredCameraPayload | null = null;

function getLocalStorage(): CameraStorageAdapter | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function getSessionStorage(): CameraStorageAdapter | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function isFresh(timestamp: unknown, now: number): boolean {
  return typeof timestamp === "number" && Number.isFinite(timestamp) && now - timestamp <= CAPTURE_TTL_MS && now - timestamp >= -60_000;
}

function isValidTarget(raw: unknown, now: number): raw is CameraRecoveryTarget {
  if (!raw || typeof raw !== "object") return false;
  const candidate = raw as Record<string, unknown>;
  if (!isFresh(candidate.createdAt, now)) return false;
  if (typeof candidate.draftBody !== "string") return false;
  if (typeof candidate.pathname !== "string" || !candidate.pathname.startsWith("/")) return false;
  if (typeof candidate.search !== "string") return false;

  if (candidate.surface === "zyra") {
    return typeof candidate.courseId === "string" && candidate.courseId.length > 0;
  }

  if (candidate.surface === "discussion") {
    if (typeof candidate.channelId !== "string" || candidate.channelId.length === 0) return false;
    if (typeof candidate.viewerId !== "string" || candidate.viewerId.length === 0) return false;
    if (candidate.mode === "new") return true;
    if (candidate.mode === "reply") {
      return typeof candidate.questionId === "string" && candidate.questionId.length > 0;
    }
  }

  return false;
}

function isValidRestoredPayload(raw: unknown, now: number): raw is RestoredCameraPayload {
  if (!raw || typeof raw !== "object") return false;
  const candidate = raw as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    typeof candidate.base64String === "string" &&
    candidate.base64String.length > 0 &&
    typeof candidate.format === "string" &&
    candidate.format.length > 0 &&
    isFresh(candidate.restoredAt, now) &&
    isValidTarget(candidate.target, now)
  );
}

export function savePendingCameraCapture(
  input: CameraRecoveryTargetInput,
  options?: { now?: number; storage?: CameraStorageAdapter | null },
): CameraRecoveryTarget {
  const target: CameraRecoveryTarget = {
    ...input,
    createdAt: options?.now ?? Date.now(),
  };
  const storage = options?.storage !== undefined ? options.storage : getLocalStorage();
  if (storage) {
    try {
      storage.setItem(PENDING_CAMERA_CAPTURE_KEY, JSON.stringify(target));
    } catch {
      // Ignore storage quota or privacy-mode errors.
    }
  }
  return target;
}

export function clearPendingCameraCapture(options?: { storage?: CameraStorageAdapter | null }): void {
  const storage = options?.storage !== undefined ? options.storage : getLocalStorage();
  if (!storage) return;
  try {
    storage.removeItem(PENDING_CAMERA_CAPTURE_KEY);
  } catch {
    // Ignore storage errors.
  }
}

export function readPendingCameraCapture(options?: {
  now?: number;
  storage?: CameraStorageAdapter | null;
}): CameraRecoveryTarget | null {
  const now = options?.now ?? Date.now();
  const storage = options?.storage !== undefined ? options.storage : getLocalStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(PENDING_CAMERA_CAPTURE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidTarget(parsed, now)) {
      storage.removeItem(PENDING_CAMERA_CAPTURE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function extractRestoredPhotoData(
  event: CapacitorRestoredResultEvent | null | undefined,
): { base64String: string; format: string } | null {
  if (!event || event.success === false) return null;
  const pluginId = typeof event.pluginId === "string" ? event.pluginId.trim().toLowerCase() : "";
  const methodName = typeof event.methodName === "string" ? event.methodName.trim().toLowerCase() : "";
  if (pluginId !== "camera" || methodName !== "getphoto") return null;

  const data = event.data;
  if (!data || typeof data !== "object") return null;

  const directBase64 = typeof data.base64String === "string" ? data.base64String.trim() : "";
  if (directBase64) {
    const format = typeof data.format === "string" && data.format.trim() ? data.format.trim().toLowerCase() : "jpeg";
    return { base64String: directBase64, format };
  }

  const dataUrl = typeof data.dataUrl === "string" ? data.dataUrl.trim() : "";
  const dataUrlMatch = /^data:image\/([a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl);
  if (dataUrlMatch) {
    return {
      format: dataUrlMatch[1].toLowerCase(),
      base64String: dataUrlMatch[2],
    };
  }

  return null;
}

export function decodeBase64ToImageFile(base64: string, format: string, now = Date.now()): File {
  const normalized = format.toLowerCase();
  const mime =
    normalized === "png"
      ? "image/png"
      : normalized === "webp"
        ? "image/webp"
        : "image/jpeg";
  const ext = normalized === "png" ? "png" : normalized === "webp" ? "webp" : "jpg";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const timestamp = new Date(now).toISOString().replace(/[:.]/g, "-");
  return new File([bytes], `foto-soal-${timestamp}.${ext}`, {
    type: mime,
    lastModified: now,
  });
}

function readStoredRestoredPayload(
  now: number,
  storages: Array<CameraStorageAdapter | null>,
): RestoredCameraPayload | null {
  if (memoryRestoredPayload) {
    if (isValidRestoredPayload(memoryRestoredPayload, now)) {
      return memoryRestoredPayload;
    }
    memoryRestoredPayload = null;
  }

  for (const storage of storages) {
    if (!storage) continue;
    try {
      const raw = storage.getItem(RESTORED_CAMERA_PAYLOAD_KEY);
      if (!raw) continue;
      const parsed: unknown = JSON.parse(raw);
      if (isValidRestoredPayload(parsed, now)) {
        memoryRestoredPayload = parsed;
        return parsed;
      }
      storage.removeItem(RESTORED_CAMERA_PAYLOAD_KEY);
    } catch {
      // Ignore malformed storage entries.
    }
  }
  return null;
}

export function clearRestoredCameraPayload(options?: {
  sessionStorage?: CameraStorageAdapter | null;
  localStorage?: CameraStorageAdapter | null;
}): void {
  memoryRestoredPayload = null;
  const storages = [
    options?.sessionStorage !== undefined ? options.sessionStorage : getSessionStorage(),
    options?.localStorage !== undefined ? options.localStorage : getLocalStorage(),
  ];
  for (const storage of storages) {
    if (!storage) continue;
    try {
      storage.removeItem(RESTORED_CAMERA_PAYLOAD_KEY);
    } catch {
      // Ignore storage errors.
    }
  }
}

export function storeRestoredCameraPayload(
  payload: RestoredCameraPayload,
  options?: {
    sessionStorage?: CameraStorageAdapter | null;
    localStorage?: CameraStorageAdapter | null;
    dispatchEvent?: boolean;
  },
): void {
  memoryRestoredPayload = payload;
  const serialized = JSON.stringify(payload);
  const session = options?.sessionStorage !== undefined ? options.sessionStorage : getSessionStorage();
  const local = options?.localStorage !== undefined ? options.localStorage : getLocalStorage();

  // Prefer sessionStorage (fast, lives across reloads in the restored WebView)
  // and mirror to localStorage as fallback if space allows.
  for (const storage of [session, local]) {
    if (!storage) continue;
    try {
      storage.setItem(RESTORED_CAMERA_PAYLOAD_KEY, serialized);
    } catch {
      // QuotaExceededError is non-fatal because memoryRestoredPayload remains available.
    }
  }

  if (options?.dispatchEvent !== false && typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    try {
      window.dispatchEvent(new CustomEvent<RestoredCameraPayload>(ZYX_CAMERA_RESTORED_EVENT, { detail: payload }));
    } catch {
      // Ignore environments without CustomEvent.
    }
  }
}

export function peekRestoredCameraPayload(
  matcher: (target: CameraRecoveryTarget) => boolean,
  options?: {
    now?: number;
    sessionStorage?: CameraStorageAdapter | null;
    localStorage?: CameraStorageAdapter | null;
  },
): RestoredCameraPayload | null {
  const now = options?.now ?? Date.now();
  const payload = readStoredRestoredPayload(now, [
    options?.sessionStorage !== undefined ? options.sessionStorage : getSessionStorage(),
    options?.localStorage !== undefined ? options.localStorage : getLocalStorage(),
  ]);
  if (!payload || !matcher(payload.target)) return null;
  return payload;
}

export function consumeRestoredCameraPayload(
  matcher: (target: CameraRecoveryTarget) => boolean,
  options?: {
    now?: number;
    sessionStorage?: CameraStorageAdapter | null;
    localStorage?: CameraStorageAdapter | null;
  },
): { payload: RestoredCameraPayload; file: File } | null {
  const payload = peekRestoredCameraPayload(matcher, options);
  if (!payload) return null;
  clearRestoredCameraPayload(options);
  try {
    const file = decodeBase64ToImageFile(payload.base64String, payload.format, payload.restoredAt);
    return { payload, file };
  } catch {
    return null;
  }
}

export function buildCameraRecoveryRoute(target: CameraRecoveryTarget): string {
  const raw = `${target.pathname}${target.search}`;
  return getSafeRedirectPath(raw);
}

export function handleAppRestoredCameraResult(
  event: CapacitorRestoredResultEvent,
  options?: {
    now?: number;
    currentPath?: string;
    localStorage?: CameraStorageAdapter | null;
    sessionStorage?: CameraStorageAdapter | null;
    dispatchEvent?: boolean;
  },
): { handled: boolean; navigateTo?: string; payload?: RestoredCameraPayload } {
  const now = options?.now ?? Date.now();
  const photo = extractRestoredPhotoData(event);
  const local = options?.localStorage !== undefined ? options.localStorage : getLocalStorage();
  const target = readPendingCameraCapture({ now, storage: local });

  if (event?.pluginId?.toLowerCase() === "camera" && event?.methodName?.toLowerCase() === "getphoto") {
    clearPendingCameraCapture({ storage: local });
  }

  if (!photo || !target) {
    return { handled: false };
  }

  const payload: RestoredCameraPayload = {
    id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `restored-${now}`,
    target,
    base64String: photo.base64String,
    format: photo.format,
    restoredAt: now,
  };

  storeRestoredCameraPayload(payload, {
    localStorage: local,
    sessionStorage: options?.sessionStorage,
    dispatchEvent: options?.dispatchEvent,
  });

  const targetRoute = buildCameraRecoveryRoute(target);
  const currentPath =
    options?.currentPath ??
    (typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : targetRoute);

  return {
    handled: true,
    payload,
    navigateTo: currentPath !== targetRoute ? targetRoute : undefined,
  };
}

export async function subscribeNativeCameraRestore(
  onNavigate?: (path: string) => void,
): Promise<() => void> {
  const appPlugin = getCapacitor()?.Plugins?.App;
  if (!appPlugin?.addListener) return () => {};

  let handle: CapacitorPluginListenerHandle | null = null;
  let disposed = false;

  try {
    handle = await appPlugin.addListener("appRestoredResult", (event) => {
      const result = handleAppRestoredCameraResult(event);
      if (result.handled && result.navigateTo) {
        onNavigate?.(result.navigateTo);
      }
    });

    if (disposed && handle) {
      void handle.remove().catch(() => {});
      return () => {};
    }
  } catch {
    return () => {};
  }

  return () => {
    disposed = true;
    if (handle) {
      void handle.remove().catch(() => {});
      handle = null;
    }
  };
}
