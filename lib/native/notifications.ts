/**
 * lib/native/notifications.ts
 *
 * Unified notification bridge for Web FCM, Capacitor PushNotifications
 * (Android/iOS), and Tauri v2 OS notifications (Windows/macOS/Linux).
 */

import {
  getCapacitor,
  getNativeDeviceLabel,
  getNativeRuntime,
  getTauri,
  type CapacitorPluginListenerHandle,
} from "./runtime";

export type UnifiedNotificationPermission = "granted" | "denied" | "default" | "unsupported";

export interface ForegroundNotificationEvent {
  title?: string;
  body?: string;
  url?: string;
}

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

export function isNotificationBridgeSupported(): boolean {
  if (typeof window === "undefined") return false;
  const runtime = getNativeRuntime();
  if (runtime === "capacitor") {
    return Boolean(getCapacitor()?.Plugins?.PushNotifications);
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
    const plugin = getCapacitor()?.Plugins?.PushNotifications;
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
    const plugin = getCapacitor()?.Plugins?.PushNotifications;
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

async function postPushTokenToServer(token: string): Promise<boolean> {
  try {
    const res = await fetch("/api/notifications/register-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        token,
        device: getNativeDeviceLabel(),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function registerUnifiedPushToken(
  userId: string,
  isCurrent: () => boolean,
): Promise<boolean> {
  const runtime = getNativeRuntime();

  if (runtime === "capacitor") {
    const token = await waitForCapacitorPushToken();
    if (!token || !isCurrent()) return false;
    const { shouldRegisterPushToken, markPushTokenRegistered } = await import("@/lib/firebase/messaging");
    if (!shouldRegisterPushToken({ userId, token })) {
      return true;
    }
    const ok = await postPushTokenToServer(token);
    if (ok && isCurrent()) {
      markPushTokenRegistered(userId, token);
    }
    return ok;
  }

  if (runtime === "tauri") {
    // Desktop Tauri uses OS-native local notifications driven by foreground inbox updates.
    return true;
  }

  const { getFCMToken, registerTokenToServer, shouldRegisterPushToken } = await import(
    "@/lib/firebase/messaging"
  );
  const token = await getFCMToken();
  if (!token || !isCurrent()) return false;
  if (!shouldRegisterPushToken({ userId, token })) return true;
  return registerTokenToServer(token, userId, isCurrent);
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

export async function subscribeNativeNotifications(handlers: {
  onForeground: (event: ForegroundNotificationEvent) => void;
  onNavigate?: (url: string) => void;
}): Promise<() => void> {
  const runtime = getNativeRuntime();

  if (runtime === "capacitor") {
    const plugin = getCapacitor()?.Plugins?.PushNotifications;
    if (!plugin) return () => {};
    const handles: CapacitorPluginListenerHandle[] = [];
    let disposed = false;

    try {
      const receivedHandle = await plugin.addListener("pushNotificationReceived", (event) => {
        const data = (event?.data as Record<string, unknown> | undefined) ?? {};
        handlers.onForeground({
          title: typeof event?.title === "string" ? event.title : undefined,
          body: typeof event?.body === "string" ? event.body : undefined,
          url: typeof data.url === "string" ? data.url : undefined,
        });
      });

      const actionHandle = await plugin.addListener("pushNotificationActionPerformed", (event) => {
        const notification = (event?.notification as Record<string, unknown> | undefined) ?? {};
        const data = (notification.data as Record<string, unknown> | undefined) ?? {};
        const url = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/dashboard";
        handlers.onNavigate?.(url);
      });

      if (disposed) {
        void receivedHandle.remove().catch(() => {});
        void actionHandle.remove().catch(() => {});
        return () => {};
      }
      handles.push(receivedHandle, actionHandle);
    } catch {
      return () => {};
    }

    return () => {
      disposed = true;
      for (const handle of handles) {
        void handle.remove().catch(() => {});
      }
    };
  }

  const { onForegroundMessage } = await import("@/lib/firebase/messaging");
  return onForegroundMessage((payload) => {
    const title = payload.notification?.title;
    const body = payload.notification?.body;
    const url = typeof payload.data?.url === "string" ? payload.data.url : undefined;
    handlers.onForeground({ title, body, url });
    if (runtime === "tauri" && title) {
      void sendDesktopNativeNotification(title, body);
    }
  });
}
