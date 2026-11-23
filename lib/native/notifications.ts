/**
 * lib/native/notifications.ts
 *
 * Unified notification bridge for WebPush/FCM, Capacitor PushNotifications
 * (Android FCM / iOS APNs), Capacitor LocalNotifications, and Tauri v2 OS
 * notifications (Windows/macOS/Linux) via an authenticated desktop inbox bridge.
 */

import {
  getCapacitor,
  getNativeDeviceLabel,
  getNativeRuntime,
  getTauri,
  type CapacitorPluginListenerHandle,
} from "./runtime";
import {
  clearRegisteredPushTokenIdentity,
  evaluateDeliveryReadiness,
  getPersistedRegisteredPushToken,
  markPushTokenRegistered,
  normalizeOsPermissionStatus,
  shouldRegisterPushToken,
} from "@/lib/notifications/transport";
import type {
  PushDeliveryReadiness,
  PushOsPermissionStatus,
  PushPlatform,
  PushStatusSummary,
  PushTransport,
} from "@/lib/notifications/types";

export type UnifiedNotificationPermission = "granted" | "denied" | "default" | "unsupported";

export interface ForegroundNotificationEvent {
  notificationId?: string;
  title?: string;
  body?: string;
  url?: string;
}

export interface UnifiedNotificationDeliveryStatus {
  osPermission: PushOsPermissionStatus;
  deliveryReadiness: PushDeliveryReadiness;
  platform: PushPlatform;
  transport: PushTransport;
  registered: boolean;
  transportActive: boolean;
}

const DESKTOP_TOKEN_STORAGE_KEY = "zyx_desktop_push_token_v1";
const DESKTOP_POLL_INTERVAL_MS = 30_000;
const DESKTOP_SEEN_IDS_LIMIT = 500;
let _memoryDesktopToken: string | null = null;

async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  const tauri = getTauri();
  const invoke = tauri?.core?.invoke;
  if (!invoke) return null;
  try {
    return await invoke<T>(cmd, args);
  } catch {
    return null;
  }
}

export function getClientPushRegistrationMeta(): {
  platform: PushPlatform;
  transport: PushTransport;
  device: string;
} {
  const runtime = getNativeRuntime();
  const device = getNativeDeviceLabel();

  if (runtime === "capacitor") {
    const capPlatform = getCapacitor()?.getPlatform?.();
    if (capPlatform === "ios") {
      return { platform: "ios", transport: "apns", device };
    }
    return { platform: "android", transport: "fcm", device };
  }

  if (runtime === "tauri") {
    return { platform: "desktop", transport: "desktop", device };
  }

  return { platform: "web", transport: "webpush", device };
}

function generateDesktopTokenRandomPart(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}${Math.random().toString(36).slice(2, 10)}`;
}

function getOrCreateDesktopPushToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.localStorage?.getItem(DESKTOP_TOKEN_STORAGE_KEY);
    if (existing && existing.startsWith("desktop:") && existing.length >= 20) {
      return existing;
    }
    const token = `desktop:${generateDesktopTokenRandomPart()}`;
    window.localStorage?.setItem(DESKTOP_TOKEN_STORAGE_KEY, token);
    return token;
  } catch {
    if (!_memoryDesktopToken) {
      _memoryDesktopToken = `desktop:${generateDesktopTokenRandomPart()}`;
    }
    return _memoryDesktopToken;
  }
}

export async function unregisterCurrentPushToken(fetchImpl: typeof fetch = fetch): Promise<void> {
  if (typeof window === "undefined") return;
  let token = getPersistedRegisteredPushToken();
  if (!token && getNativeRuntime() === "tauri") {
    try {
      token = window.localStorage?.getItem(DESKTOP_TOKEN_STORAGE_KEY) ?? _memoryDesktopToken;
    } catch {
      token = _memoryDesktopToken;
    }
  }
  clearRegisteredPushTokenIdentity();
  if (!token || token.length < 16) return;
  try {
    await fetchImpl("/api/notifications/register-token", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token }),
    });
  } catch {
    // Non-fatal; logout should proceed even if network is offline.
  }
}

async function isCapacitorPushConfigured(): Promise<boolean> {
  const cap = getCapacitor();
  if (!cap) return false;
  // iOS uses native APNs registration (no Firebase google-services.json needed on device).
  if (cap.getPlatform?.() === "ios") return true;
  const updater = cap.Plugins?.ZyxAppUpdater;
  if (!updater?.getAppCapabilities) {
    // Older Android builds without google-services.json will crash inside
    // FirebaseMessaging.getInstance() if PushNotifications.register() is called.
    return false;
  }
  try {
    const caps = await updater.getAppCapabilities();
    return caps?.fcmConfigured === true;
  } catch {
    return false;
  }
}

export function isNotificationBridgeSupported(): boolean {
  if (typeof window === "undefined") return false;
  const runtime = getNativeRuntime();
  if (runtime === "capacitor") {
    const plugins = getCapacitor()?.Plugins;
    return Boolean(plugins?.LocalNotifications || plugins?.PushNotifications);
  }
  if (runtime === "tauri") {
    return Boolean(getTauri()?.notification || getTauri()?.core?.invoke);
  }
  return "Notification" in window && "serviceWorker" in navigator;
}

export async function getUnifiedNotificationPermission(): Promise<UnifiedNotificationPermission> {
  if (typeof window === "undefined") return "unsupported";
  const runtime = getNativeRuntime();

  if (runtime === "capacitor") {
    const plugins = getCapacitor()?.Plugins;
    if (plugins?.LocalNotifications) {
      try {
        const status = await plugins.LocalNotifications.checkPermissions();
        if (status.display === "granted") return "granted";
        if (status.display === "denied") return "denied";
        return "default";
      } catch {
        // Fall through to PushNotifications checkPermissions
      }
    }
    const plugin = plugins?.PushNotifications;
    if (!plugin) return "unsupported";
    try {
      const status = await plugin.checkPermissions();
      if (status.receive === "granted") return "granted";
      if (status.receive === "denied") return "denied";
      return "default";
    } catch {
      return "unsupported";
    }
  }

  if (runtime === "tauri") {
    const notif = getTauri()?.notification;
    try {
      if (notif?.isPermissionGranted) {
        const granted = await notif.isPermissionGranted();
        return granted ? "granted" : "default";
      }
      const granted = await invokeTauri<boolean>("plugin:notification|is_permission_granted");
      if (granted === true) return "granted";
      if (granted === false) return "default";
      return "unsupported";
    } catch {
      return "unsupported";
    }
  }

  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    return "unsupported";
  }
  return Notification.permission;
}

export async function requestUnifiedNotificationPermission(): Promise<UnifiedNotificationPermission> {
  if (typeof window === "undefined") return "unsupported";
  const runtime = getNativeRuntime();

  if (runtime === "capacitor") {
    const plugins = getCapacitor()?.Plugins;
    if (plugins?.LocalNotifications) {
      try {
        const status = await plugins.LocalNotifications.requestPermissions();
        if (status.display === "granted") return "granted";
        if (status.display === "denied") return "denied";
        return "default";
      } catch {
        // Fall through to PushNotifications requestPermissions
      }
    }
    const plugin = plugins?.PushNotifications;
    if (!plugin) return "unsupported";
    try {
      const status = await plugin.requestPermissions();
      if (status.receive === "granted") return "granted";
      if (status.receive === "denied") return "denied";
      return "default";
    } catch {
      return "denied";
    }
  }

  if (runtime === "tauri") {
    const notif = getTauri()?.notification;
    try {
      if (notif?.requestPermission) {
        return await notif.requestPermission();
      }
      const result = await invokeTauri<string>("plugin:notification|request_permission");
      if (result === "granted") return "granted";
      if (result === "denied") return "denied";
      return "default";
    } catch {
      return "denied";
    }
  }

  const { requestNotificationPermission } = await import("@/lib/firebase/messaging");
  return requestNotificationPermission();
}

async function waitForCapacitorPushToken(timeoutMs = 10_000): Promise<string | null> {
  const plugin = getCapacitor()?.Plugins?.PushNotifications;
  if (!plugin) return null;

  return new Promise<string | null>((resolve) => {
    let settled = false;
    const handles: CapacitorPluginListenerHandle[] = [];

    const finish = (token: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      for (const handle of handles) {
        void handle.remove().catch(() => {});
      }
      resolve(token);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);

    void Promise.all([
      plugin.addListener("registration", (event) => {
        const value = typeof event?.value === "string" ? event.value : null;
        finish(value);
      }),
      plugin.addListener("registrationError", () => {
        finish(null);
      }),
    ])
      .then((registeredHandles) => {
        if (settled) {
          for (const handle of registeredHandles) {
            void handle.remove().catch(() => {});
          }
          return;
        }
        handles.push(...registeredHandles);
        return plugin.register();
      })
      .catch(() => finish(null));
  });
}

export interface RegisterTokenServerResponse {
  success: boolean;
  registered?: boolean;
  platform?: PushPlatform;
  transport?: PushTransport;
  transportActive?: boolean;
  readiness?: "ready" | "transport_inactive";
}

async function postPushTokenToServer(input: {
  token: string;
  device: string;
  platform: PushPlatform;
  transport: PushTransport;
}): Promise<RegisterTokenServerResponse | null> {
  try {
    const res = await fetch("/api/notifications/register-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    return (await res.json()) as RegisterTokenServerResponse;
  } catch {
    return null;
  }
}

export async function registerUnifiedPushToken(
  userId: string,
  isCurrent: () => boolean,
): Promise<boolean> {
  const runtime = getNativeRuntime();
  const meta = getClientPushRegistrationMeta();

  if (runtime === "capacitor") {
    if (!(await isCapacitorPushConfigured())) {
      return false;
    }
    const token = await waitForCapacitorPushToken();
    if (!token || !isCurrent()) return false;
    if (!shouldRegisterPushToken({ userId, token })) {
      return true;
    }
    const result = await postPushTokenToServer({
      token,
      device: meta.device,
      platform: meta.platform,
      transport: meta.transport,
    });
    const ok = Boolean(result?.success);
    if (ok && isCurrent()) {
      markPushTokenRegistered(userId, token);
    }
    return ok;
  }

  if (runtime === "tauri") {
    const permission = await getUnifiedNotificationPermission();
    if (permission !== "granted" || !isCurrent()) return false;
    const token = getOrCreateDesktopPushToken();
    if (!token || !isCurrent()) return false;
    if (!shouldRegisterPushToken({ userId, token })) {
      return true;
    }
    const result = await postPushTokenToServer({
      token,
      device: meta.device,
      platform: "desktop",
      transport: "desktop",
    });
    const ok = Boolean(result?.success);
    if (ok && isCurrent()) {
      markPushTokenRegistered(userId, token);
    }
    return ok;
  }

  const { getFCMToken, registerTokenToServer } = await import(
    "@/lib/firebase/messaging"
  );
  const token = await getFCMToken();
  if (!token || !isCurrent()) return false;
  if (!shouldRegisterPushToken({ userId, token })) return true;
  return registerTokenToServer(token, userId, isCurrent);
}

export async function getUnifiedNotificationDeliveryStatus(): Promise<UnifiedNotificationDeliveryStatus> {
  const rawPermission = await getUnifiedNotificationPermission();
  const osPermission = normalizeOsPermissionStatus(rawPermission);
  const { platform, transport } = getClientPushRegistrationMeta();

  if (osPermission === "unsupported") {
    return {
      osPermission,
      deliveryReadiness: "unsupported",
      platform,
      transport,
      registered: false,
      transportActive: false,
    };
  }

  let registered = false;
  let transportActive = false;

  try {
    const res = await fetch("/api/notifications/status", {
      credentials: "include",
    });
    if (res.ok) {
      const summary = (await res.json()) as PushStatusSummary;
      const transportState = summary.transports?.[transport];
      if (transportState) {
        registered = transportState.registeredCount > 0;
        transportActive = transportState.configured;
      }
    }
  } catch {
    // Keep honest fallback (registered = false, transportActive = false)
  }

  const deliveryReadiness = evaluateDeliveryReadiness({
    osPermission,
    registered,
    transportActive,
  });

  return {
    osPermission,
    deliveryReadiness,
    platform,
    transport,
    registered,
    transportActive,
  };
}

export async function sendDesktopNativeNotification(title: string, body?: string): Promise<void> {
  if (getNativeRuntime() !== "tauri") return;
  const permission = await getUnifiedNotificationPermission();
  if (permission !== "granted") return;

  const notif = getTauri()?.notification;
  try {
    if (notif?.sendNotification) {
      await notif.sendNotification({ title, body });
      return;
    }
    await invokeTauri("plugin:notification|notify", {
      options: { title, body },
    });
  } catch {
    // Non-fatal; in-app toast remains visible.
  }
}

interface DesktopInboxRow {
  id: string;
  title: string;
  body?: string;
  read?: boolean;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

export function startDesktopNotificationBridge(
  handlers: {
    onForeground: (event: ForegroundNotificationEvent) => void;
    onNavigate?: (url: string) => void;
  },
  options?: {
    pollIntervalMs?: number;
    fetchImpl?: typeof fetch;
    sendNative?: (title: string, body?: string) => Promise<void>;
  },
): () => void {
  const pollIntervalMs = options?.pollIntervalMs ?? DESKTOP_POLL_INTERVAL_MS;
  const fetchFn = options?.fetchImpl ?? fetch;
  const sendNative = options?.sendNative ?? sendDesktopNativeNotification;

  let disposed = false;
  let initialized = false;
  let inFlight = false;
  let lastCursorIso: string | null = null;
  const seenIds = new Set<string>();

  const rememberSeenId = (id: string) => {
    seenIds.add(id);
    if (seenIds.size > DESKTOP_SEEN_IDS_LIMIT) {
      for (const oldest of seenIds) {
        seenIds.delete(oldest);
        if (seenIds.size <= DESKTOP_SEEN_IDS_LIMIT) break;
      }
    }
  };

  let intervalId: ReturnType<typeof setInterval> | null = null;
  const onFocus = () => {
    void pollOnce();
  };

  const stopBridge = () => {
    if (disposed) return;
    disposed = true;
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
      window.removeEventListener("focus", onFocus);
    }
  };

  const pollOnce = async () => {
    if (disposed || inFlight) return;
    inFlight = true;
    try {
      const query = new URLSearchParams({
        limit: "20",
        unreadOnly: "true",
      });
      if (initialized && lastCursorIso) {
        query.set("since", lastCursorIso);
      }

      const res = await fetchFn(`/api/notifications/history?${query.toString()}`, {
        credentials: "include",
      });
      if (res.status === 401) {
        stopBridge();
        return;
      }
      if (!res.ok || disposed) return;
      const data = (await res.json()) as { notifications?: DesktopInboxRow[] };
      const rows = Array.isArray(data.notifications) ? data.notifications : [];

      if (!initialized) {
        // Seed existing unread IDs on startup so we only dispatch OS notifications for new arrivals.
        for (const row of rows) {
          rememberSeenId(row.id);
          if (row.createdAt && (!lastCursorIso || row.createdAt > lastCursorIso)) {
            lastCursorIso = row.createdAt;
          }
        }
        if (!lastCursorIso) {
          lastCursorIso = new Date().toISOString();
        }
        initialized = true;
        return;
      }

      // Process oldest-first so OS notifications appear in chronological order.
      const freshRows = rows
        .filter((row) => !seenIds.has(row.id))
        .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));

      for (const row of freshRows) {
        if (disposed) break;
        rememberSeenId(row.id);
        if (row.createdAt && (!lastCursorIso || row.createdAt > lastCursorIso)) {
          lastCursorIso = row.createdAt;
        }
        const url = typeof row.metadata?.url === "string" ? row.metadata.url : undefined;
        handlers.onForeground({ notificationId: row.id, title: row.title, body: row.body, url });
        if (row.title) {
          await sendNative(row.title, row.body);
          if (disposed) break;
        }
      }
    } catch {
      // Non-fatal; retry on next poll interval.
    } finally {
      inFlight = false;
    }
  };

  void pollOnce();
  intervalId = setInterval(() => {
    void pollOnce();
  }, pollIntervalMs);

  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("focus", onFocus);
  }

  return stopBridge;
}

function sanitizeNotificationUrl(rawUrl: unknown, fallbackUrl = "/dashboard"): string {
  if (typeof rawUrl !== "string") return fallbackUrl;
  if (rawUrl.startsWith("/") && !rawUrl.startsWith("//") && !rawUrl.startsWith("/\\")) {
    return rawUrl;
  }
  return fallbackUrl;
}

export async function subscribeNativeNotifications(handlers: {
  onForeground: (event: ForegroundNotificationEvent) => void;
  onNavigate?: (url: string, notificationId?: string) => void;
  defaultUrl?: string;
}): Promise<() => void> {
  const runtime = getNativeRuntime();
  const fallbackUrl = sanitizeNotificationUrl(handlers.defaultUrl, "/dashboard");

  if (runtime === "capacitor") {
    const handles: CapacitorPluginListenerHandle[] = [];
    let disposed = false;

    const localPlugin = getCapacitor()?.Plugins?.LocalNotifications;
    if (localPlugin?.addListener) {
      try {
        const localActionHandle = await localPlugin.addListener(
          "localNotificationActionPerformed",
          (event) => {
            const notification = (event?.notification as Record<string, unknown> | undefined) ?? {};
            const extra = (notification.extra as Record<string, unknown> | undefined) ?? {};
            const notificationId = typeof extra.notificationId === "string" ? extra.notificationId : undefined;
            handlers.onNavigate?.(sanitizeNotificationUrl(extra.url, fallbackUrl), notificationId);
          },
        );
        if (disposed) {
          void localActionHandle.remove().catch(() => {});
        } else {
          handles.push(localActionHandle);
        }
      } catch {
        // Non-fatal
      }
    }

    if (await isCapacitorPushConfigured()) {
      const plugin = getCapacitor()?.Plugins?.PushNotifications;
      if (plugin) {
        let receivedHandle: CapacitorPluginListenerHandle | null = null;
        try {
          receivedHandle = await plugin.addListener("pushNotificationReceived", (event) => {
            const data = (event?.data as Record<string, unknown> | undefined) ?? {};
            handlers.onForeground({
              notificationId: typeof data.notificationId === "string" ? data.notificationId : undefined,
              title: typeof event?.title === "string" ? event.title : undefined,
              body: typeof event?.body === "string" ? event.body : undefined,
              url: typeof data.url === "string" ? data.url : undefined,
            });
          });

          const actionHandle = await plugin.addListener("pushNotificationActionPerformed", (event) => {
            const notification = (event?.notification as Record<string, unknown> | undefined) ?? {};
            const data = (notification.data as Record<string, unknown> | undefined) ?? {};
            const notificationId = typeof data.notificationId === "string" ? data.notificationId : undefined;
            handlers.onNavigate?.(sanitizeNotificationUrl(data.url, fallbackUrl), notificationId);
          });

          if (disposed) {
            void receivedHandle.remove().catch(() => {});
            void actionHandle.remove().catch(() => {});
          } else {
            handles.push(receivedHandle, actionHandle);
          }
        } catch {
          if (receivedHandle) {
            void receivedHandle.remove().catch(() => {});
          }
        }
      }
    }

    return () => {
      disposed = true;
      for (const handle of handles) {
        void handle.remove().catch(() => {});
      }
    };
  }

  if (runtime === "tauri") {
    return startDesktopNotificationBridge(handlers);
  }

  const { onForegroundMessage } = await import("@/lib/firebase/messaging");
  return onForegroundMessage((payload) => {
    const title = payload.notification?.title;
    const body = payload.notification?.body;
    const url = typeof payload.data?.url === "string" ? payload.data.url : undefined;
    const notificationId = typeof payload.data?.notificationId === "string" ? payload.data.notificationId : undefined;
    handlers.onForeground({ notificationId, title, body, url });
  });
}
