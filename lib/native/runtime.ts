/**
 * lib/native/runtime.ts
 *
 * Lightweight runtime detection for Zyx Academy web, Capacitor mobile,
 * and Tauri desktop shells without adding native SDKs to the Next.js bundle.
 */

export type NativeRuntime = "capacitor" | "tauri" | "web";

export interface CapacitorCameraPhoto {
  base64String?: string;
  format?: string;
}

export interface CapacitorPluginListenerHandle {
  remove: () => Promise<void>;
}

export interface CapacitorPushNotificationsPlugin {
  checkPermissions: () => Promise<{ receive: "prompt" | "prompt-with-rationale" | "granted" | "denied" }>;
  requestPermissions: () => Promise<{ receive: "prompt" | "prompt-with-rationale" | "granted" | "denied" }>;
  register: () => Promise<void>;
  addListener: (
    eventName: string,
    listenerFunc: (event: Record<string, unknown>) => void,
  ) => Promise<CapacitorPluginListenerHandle>;
}

export interface CapacitorCameraPlugin {
  getPhoto: (options: {
    source?: "CAMERA" | "PHOTOS" | "PROMPT";
    resultType?: "base64" | "uri" | "dataUrl";
    quality?: number;
    width?: number;
    height?: number;
    correctOrientation?: boolean;
    saveToGallery?: boolean;
  }) => Promise<CapacitorCameraPhoto>;
}

export interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: {
    PushNotifications?: CapacitorPushNotificationsPlugin;
    Camera?: CapacitorCameraPlugin;
  };
}

export interface TauriNotificationGlobal {
  isPermissionGranted?: () => Promise<boolean>;
  requestPermission?: () => Promise<"granted" | "denied" | "default">;
  sendNotification?: (options: { title: string; body?: string }) => void | Promise<void>;
}

export interface TauriGlobal {
  core?: {
    invoke?: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
  };
  notification?: TauriNotificationGlobal;
}

declare global {
  interface Window {
    Capacitor?: CapacitorGlobal;
    __TAURI__?: TauriGlobal;
    __TAURI_INTERNALS__?: {
      invoke?: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
    };
  }
}

export function getCapacitor(): CapacitorGlobal | null {
  if (typeof window === "undefined") return null;
  const cap = window.Capacitor;
  if (!cap || typeof cap.isNativePlatform !== "function" || !cap.isNativePlatform()) {
    return null;
  }
  return cap;
}

export function getTauri(): TauriGlobal | null {
  if (typeof window === "undefined") return null;
  if (window.__TAURI__) return window.__TAURI__;
  if (window.__TAURI_INTERNALS__) {
    return {
      core: {
        invoke: window.__TAURI_INTERNALS__.invoke,
      },
    };
  }
  return null;
}

export function getNativeRuntime(): NativeRuntime {
  if (getCapacitor()) return "capacitor";
  if (getTauri()) return "tauri";
  return "web";
}

export function isCapacitorApp(): boolean {
  return getCapacitor() !== null;
}

export function isTauriApp(): boolean {
  return getTauri() !== null;
}

export function isNativeApp(): boolean {
  return getNativeRuntime() !== "web";
}

export function getNativeDeviceLabel(): string {
  const cap = getCapacitor();
  if (cap) {
    const platform = typeof cap.getPlatform === "function" ? cap.getPlatform() : "mobile";
    return `capacitor-${platform}`;
  }
  if (isTauriApp()) {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    if (/Mac/i.test(ua)) return "tauri-macos";
    if (/Win/i.test(ua)) return "tauri-windows";
    return "tauri-linux";
  }
  if (typeof navigator !== "undefined") {
    return navigator.userAgent.slice(0, 200);
  }
  return "web";
}
