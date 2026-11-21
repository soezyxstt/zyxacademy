/**
 * lib/native/runtime.ts
 *
 * Lightweight runtime detection for Zyx Academy web, Capacitor mobile,
 * and Tauri desktop shells without adding native SDKs to the Next.js bundle.
 */

export type NativeRuntime = "capacitor" | "tauri" | "web";

export interface CapacitorCameraPhoto {
  base64String?: string;
  dataUrl?: string;
  format?: string;
  webPath?: string;
  path?: string;
}

export interface CapacitorRestoredResultEvent {
  pluginId?: string;
  methodName?: string;
  data?: Record<string, unknown>;
  success?: boolean;
  error?: { message?: string };
}

export interface CapacitorAppStateEvent {
  isActive: boolean;
}

export interface CapacitorNetworkStatus {
  connected: boolean;
  connectionType?: string;
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

export interface CapacitorAppPlugin {
  getLaunchUrl?: () => Promise<{ url?: string } | null | undefined>;
  addListener: {
    (
      eventName: "appUrlOpen",
      listenerFunc: (event: { url?: string }) => void,
    ): Promise<CapacitorPluginListenerHandle>;
    (
      eventName: "appRestoredResult",
      listenerFunc: (event: CapacitorRestoredResultEvent) => void,
    ): Promise<CapacitorPluginListenerHandle>;
    (
      eventName: "appStateChange",
      listenerFunc: (event: CapacitorAppStateEvent) => void,
    ): Promise<CapacitorPluginListenerHandle>;
    (
      eventName: string,
      listenerFunc: (event: Record<string, unknown>) => void,
    ): Promise<CapacitorPluginListenerHandle>;
  };
}

export interface CapacitorNetworkPlugin {
  getStatus: () => Promise<CapacitorNetworkStatus>;
  addListener: (
    eventName: "networkStatusChange",
    listenerFunc: (status: CapacitorNetworkStatus) => void,
  ) => Promise<CapacitorPluginListenerHandle>;
}

export interface CapacitorBrowserPlugin {
  open: (options: {
    url: string;
    windowName?: string;
    toolbarColor?: string;
    presentationStyle?: "fullscreen" | "popover";
  }) => Promise<void>;
  close?: () => Promise<void>;
  addListener?: (
    eventName: string,
    listenerFunc: () => void,
  ) => Promise<CapacitorPluginListenerHandle>;
}

export interface CapacitorLocalNotificationSchedule {
  at?: Date;
  repeats?: boolean;
  every?: "year" | "month" | "two-weeks" | "week" | "day" | "hour" | "minute" | "second";
  on?: {
    year?: number;
    month?: number;
    day?: number;
    weekday?: number;
    hour?: number;
    minute?: number;
    second?: number;
  };
  allowWhileIdle?: boolean;
}

export interface CapacitorLocalNotificationSchema {
  id: number;
  title: string;
  body: string;
  schedule?: CapacitorLocalNotificationSchedule;
  extra?: Record<string, unknown>;
}

export interface CapacitorLocalNotificationsPlugin {
  checkPermissions: () => Promise<{ display: "prompt" | "prompt-with-rationale" | "granted" | "denied" }>;
  requestPermissions: () => Promise<{ display: "prompt" | "prompt-with-rationale" | "granted" | "denied" }>;
  schedule?: (options: {
    notifications: CapacitorLocalNotificationSchema[];
  }) => Promise<{ notifications: Array<{ id: number }> }>;
  cancel?: (options: {
    notifications: Array<{ id: number }>;
  }) => Promise<void>;
  getPending?: () => Promise<{
    notifications: Array<{ id: number; extra?: Record<string, unknown> }>;
  }>;
  addListener?: (
    eventName: "localNotificationReceived" | "localNotificationActionPerformed",
    listenerFunc: (event: Record<string, unknown>) => void,
  ) => Promise<CapacitorPluginListenerHandle>;
}

export interface CapacitorUpdaterPlugin {
  downloadAndInstall: (options: { url: string }) => Promise<{ started?: boolean }>;
  getAppCapabilities?: () => Promise<{ fcmConfigured?: boolean }>;
  addListener?: (
    eventName: "downloadProgress",
    listenerFunc: (event: { percent?: number }) => void,
  ) => Promise<CapacitorPluginListenerHandle>;
}

export interface CapacitorOfflineStorePlugin {
  saveReading: (options: { key: string; payloadJson: string }) => Promise<{ saved?: boolean }>;
  saveReadingPosition?: (options: { key: string; positionJson: string }) => Promise<{ saved?: boolean }>;
  listReadings: () => Promise<{
    items?: Array<Record<string, unknown>>;
    count?: number;
    totalBytes?: number;
  }>;
  getReading: (options: { key: string }) => Promise<{ reading?: Record<string, unknown> | null }>;
  removeReading: (options: { key: string }) => Promise<void>;
  clearOtherUsers: (options: { userId: string }) => Promise<void>;
}

export interface CapacitorHapticsPlugin {
  impact?: (options: { style: "HEAVY" | "MEDIUM" | "LIGHT" }) => Promise<void>;
  notification?: (options: { type: "SUCCESS" | "WARNING" | "ERROR" }) => Promise<void>;
  vibrate?: (options?: { duration?: number }) => Promise<void>;
  selectionStart?: () => Promise<void>;
  selectionChanged?: () => Promise<void>;
  selectionEnd?: () => Promise<void>;
}

export interface CapacitorSharePlugin {
  share: (options: {
    title?: string;
    text?: string;
    url?: string;
    files?: string[];
    dialogTitle?: string;
  }) => Promise<{ activityType?: string } | void>;
  canShare?: () => Promise<{ value: boolean }>;
}

export interface CapacitorFilesystemPlugin {
  writeFile: (options: {
    path: string;
    data: string;
    directory?: "DOCUMENTS" | "DATA" | "LIBRARY" | "CACHE" | "EXTERNAL" | "EXTERNAL_STORAGE";
    recursive?: boolean;
  }) => Promise<{ uri: string }>;
  getUri?: (options: {
    path: string;
    directory?: "DOCUMENTS" | "DATA" | "LIBRARY" | "CACHE" | "EXTERNAL" | "EXTERNAL_STORAGE";
  }) => Promise<{ uri: string }>;
}

export interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: {
    App?: CapacitorAppPlugin;
    Browser?: CapacitorBrowserPlugin;
    Filesystem?: CapacitorFilesystemPlugin;
    Haptics?: CapacitorHapticsPlugin;
    LocalNotifications?: CapacitorLocalNotificationsPlugin;
    Network?: CapacitorNetworkPlugin;
    PushNotifications?: CapacitorPushNotificationsPlugin;
    Camera?: CapacitorCameraPlugin;
    Share?: CapacitorSharePlugin;
    ZyxAppUpdater?: CapacitorUpdaterPlugin;
    ZyxOfflineStore?: CapacitorOfflineStorePlugin;
  };
}

export interface TauriNotificationGlobal {
  isPermissionGranted?: () => Promise<boolean>;
  requestPermission?: () => Promise<"granted" | "denied" | "default">;
  sendNotification?: (options: { title: string; body?: string }) => void | Promise<void>;
}

export interface TauriOpenerGlobal {
  openUrl?: (url: string, openWith?: string) => Promise<void>;
  openPath?: (path: string, openWith?: string) => Promise<void>;
}

export interface TauriEventGlobal {
  listen?: <T = unknown>(
    event: string,
    handler: (event: { payload: T }) => void,
  ) => Promise<() => void>;
}

export interface TauriGlobal {
  core?: {
    invoke?: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
  };
  event?: TauriEventGlobal;
  notification?: TauriNotificationGlobal;
  opener?: TauriOpenerGlobal;
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
