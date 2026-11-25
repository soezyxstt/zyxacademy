/**
 * lib/native/notifications.ts
 *
 * Unified notification bridge for WebPush/FCM, Capacitor PushNotifications
 * (Android FCM / iOS APNs), Capacitor LocalNotifications, and Tauri v2 OS
 * notifications (Windows/macOS/Linux) via an authenticated desktop inbox bridge.
 */

import {
  canUseBrowserPush,
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
const DESKTOP_POLL_INTERVAL_MS = 15_000;
const DESKTOP_PAGE_SIZE = 100;
const DESKTOP_REQUEST_TIMEOUT_MS = 10_000;
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
    return Boolean(getTauri()?.notification || getTauri()?.core?.invoke || typeof window.Notification === "function");
  }
  return canUseBrowserPush() && "Notification" in window && "serviceWorker" in navigator;
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
      // On desktop the plugin's native permission state is authoritative.
      // Its injected Web Notification shim may report denied/default during
      // initialization, notably on Windows. The OS still controls actual display.
      const granted = await invokeTauri<boolean>("plugin:notification|is_permission_granted");
      if (granted === true) return "granted";
      if (granted === false) return "denied";
      if (typeof window.Notification === "function" && window.Notification.permission === "denied") {
        return "denied";
      }
      if (notif?.isPermissionGranted && await notif.isPermissionGranted()) return "granted";
      if (typeof window.Notification === "function") return window.Notification.permission;
      return notif?.isPermissionGranted ? "default" : "unsupported";
    } catch {
      return "unsupported";
    }
  }

  if (!canUseBrowserPush() || !("Notification" in window) || !("serviceWorker" in navigator)) {
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
      const result = await invokeTauri<string>("plugin:notification|request_permission");
      if (result === "granted" || result === "denied") return result;
      if (notif?.requestPermission) return await notif.requestPermission();
      if (typeof window.Notification === "function") return await window.Notification.requestPermission();
      return "default";
    } catch {
      return "denied";
    }
  }

  if (!canUseBrowserPush()) return "unsupported";
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

  if (!canUseBrowserPush()) return false;
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

/** Native handoff only; true does not prove that the OS displayed a banner. */
export async function sendDesktopNativeNotification(
  title: string,
  body?: string,
  isCurrent: () => boolean = () => true,
): Promise<boolean> {
  if (getNativeRuntime() !== "tauri" || !isCurrent()) return false;
  const permission = await getUnifiedNotificationPermission();
  if (permission !== "granted" || !isCurrent()) return false;

  const tauri = getTauri();
  const unavailable = (error: unknown) => /not found|unknown command|not allowed|not registered|command .* denied/i.test(String(error));
  try {
    const invoke = tauri?.core?.invoke;
    if (invoke) {
      try {
        const accepted = await invoke<boolean>("show_desktop_notification", { title, body: body ?? null });
        return accepted === true;
      } catch (error) {
        // An old wrapper has no custom command. Do not retry a real OS
        // delivery error through another sender (that can duplicate alerts).
        if (!unavailable(error)) throw error;
      }
      if (!isCurrent()) return false;
      try {
        await invoke("plugin:notification|notify", { options: { title, body } });
        return true;
      } catch (error) {
        if (!unavailable(error)) throw error;
      }
    }
    if (!isCurrent()) return false;
    if (tauri?.notification?.sendNotification) {
      await tauri.notification.sendNotification({ title, body });
      return true;
    }
    if (typeof window.Notification === "function") {
      new window.Notification(title, { body });
      return true;
    }
  } catch {
    console.warn("[notifications] Desktop system notification failed");
  }
  return false;
}

interface DesktopInboxRow {
  id: string;
  userId?: string;
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
    sendNative?: (title: string, body?: string) => Promise<void | boolean>;
    isCurrent?: () => boolean;
    requestTimeoutMs?: number;
    userId?: string;
  },
): () => void {
  const pollIntervalMs = options?.pollIntervalMs ?? DESKTOP_POLL_INTERVAL_MS;
  const fetchFn = options?.fetchImpl ?? fetch;
  const isCurrent = options?.isCurrent ?? (() => true);
  let disposed = false;
  const sendNative = options?.sendNative ?? ((title: string, body?: string) => sendDesktopNativeNotification(title, body, () => !disposed && isCurrent()));
  let initialized = false;
  let inFlight = false;
  let lastCursorIso: string | null = null;
  // Since the server query is inclusive, only IDs at the cursor timestamp
  // need to be retained across polls. This also handles same-timestamp bursts.
  const seenIds = new Set<string>();

  const rememberRow = (row: DesktopInboxRow) => {
    if (!row.createdAt) return;
    if (!lastCursorIso || row.createdAt > lastCursorIso) {
      lastCursorIso = row.createdAt;
      seenIds.clear();
    }
    if (row.createdAt === lastCursorIso) seenIds.add(row.id);
  };

  let intervalId: ReturnType<typeof setInterval> | null = null;
  let activeRequest: AbortController | null = null;
  const onFocus = () => { void pollOnce(); };
  const onVisibility = () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") void pollOnce();
  };

  const stopBridge = () => {
    if (disposed) return;
    disposed = true;
    activeRequest?.abort();
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
    }
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
  };

  const pollOnce = async () => {
    if (disposed || inFlight || !isCurrent()) return;
    inFlight = true;
    try {
      // Read state belongs to the account, not to a particular device. Reading
      // on Android must not suppress an already queued desktop notification.
      const query = new URLSearchParams({ limit: String(DESKTOP_PAGE_SIZE) });
      if (initialized && lastCursorIso) query.set("since", lastCursorIso);

      const rows: DesktopInboxRow[] = [];
      // Keep the cursor unchanged until all pages have been fetched. Startup
      // seeds only the newest page, so old notifications are not replayed.
      for (let page = 1; ; page += 1) {
        query.set("page", String(page));
        const controller = new AbortController();
        activeRequest = controller;
        const timeout = setTimeout(() => controller.abort(), options?.requestTimeoutMs ?? DESKTOP_REQUEST_TIMEOUT_MS);
        let data: { notifications?: DesktopInboxRow[] };
        try {
          const res = await fetchFn(`/api/notifications/history?${query.toString()}`, {
            credentials: "include",
            cache: "no-store",
            signal: controller.signal,
          });
          // A transient expired session or failed network request must not
          // permanently disable delivery; the account runtime disposes on logout.
          if (disposed || !isCurrent() || !res.ok) return;
          data = await res.json() as { notifications?: DesktopInboxRow[] };
        } finally {
          clearTimeout(timeout);
          if (activeRequest === controller) activeRequest = null;
        }
        if (disposed || !isCurrent()) return;
        const batch = Array.isArray(data.notifications) ? data.notifications : [];
        // The session cookie can change before the client auth observer settles.
        // Never display a row from another account after a reconnect or switch.
        if (options?.userId && batch.some(row => row.userId !== options.userId)) return;
        rows.push(...batch);
        if (!initialized || batch.length < DESKTOP_PAGE_SIZE) break;
      }

      if (!initialized) {
        // Seed existing history on startup without replaying old notifications.
        for (const row of rows) rememberRow(row);
        // Empty inbox: do not seed a cursor from the local device clock.
        // A fast or misconfigured clock can otherwise suppress real arrivals.
        initialized = true;
        return;
      }

      // Process oldest-first so OS notifications appear in chronological order.
      const freshRows = rows
        .filter((row) => row.createdAt && (!lastCursorIso || row.createdAt >= lastCursorIso) && !seenIds.has(row.id))
        .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));

      for (const row of freshRows) {
        if (disposed || !isCurrent()) break;
        if (!row.createdAt || (lastCursorIso && row.createdAt < lastCursorIso) || seenIds.has(row.id)) continue;
        rememberRow(row);
        const url = typeof row.metadata?.url === "string" ? row.metadata.url : undefined;
        try {
          handlers.onForeground({ notificationId: row.id, title: row.title, body: row.body, url });
        } catch {
          // A failing UI consumer must not prevent native delivery.
        }
        if (row.title && isCurrent()) {
          try { await sendNative(row.title, row.body); } catch {
            console.warn("[notifications] Desktop notification handoff failed");
          }
          if (disposed || !isCurrent()) break;
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
    window.addEventListener("online", onFocus);
  }
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);

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
  isCurrent?: () => boolean;
  userId?: string;
}): Promise<() => void> {
  const runtime = getNativeRuntime();
  const fallbackUrl = sanitizeNotificationUrl(handlers.defaultUrl, "/dashboard");
  const isCurrent = handlers.isCurrent ?? (() => true);

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
    return startDesktopNotificationBridge(handlers, { isCurrent, userId: handlers.userId });
  }

  if (!canUseBrowserPush()) return () => {};
  const { onForegroundMessage, showForegroundWebNotification } = await import("@/lib/firebase/messaging");
  return onForegroundMessage((payload) => {
    if (!isCurrent()) return;
    const title = payload.notification?.title ?? payload.data?.title;
    const body = payload.notification?.body ?? payload.data?.body;
    const url = typeof payload.data?.url === "string" ? payload.data.url : undefined;
    const notificationId = typeof payload.data?.notificationId === "string" ? payload.data.notificationId : undefined;
    handlers.onForeground({ notificationId, title, body, url });
    if (title) {
      void showForegroundWebNotification({
        title, body, notificationId, url: sanitizeNotificationUrl(url, fallbackUrl),
      }, isCurrent);
    }
  });
}
