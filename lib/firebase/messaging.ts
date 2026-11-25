/**
 * lib/firebase/messaging.ts
 *
 * Client-only FCM helpers.
 * These functions interact with the browser's Notification API and FCM.
 * They must NEVER be imported in Server Components or API routes.
 *
 * Usage pattern ; always inside a useEffect or client component:
 * const perm = await requestNotificationPermission();
 * if (perm === "granted") {
 * const token = await getFCMToken();
 * if (token) await registerTokenToServer(token);
 * }
 */

import { getMessaging, getToken, onMessage, type Messaging } from "firebase/messaging";
import { getFirebaseApp } from "@/lib/firebase/client";
import { canUseBrowserPush } from "@/lib/native/runtime";
import {
 clearRegisteredPushTokenIdentity,
 markPushTokenRegistered,
 shouldRegisterPushToken,
} from "@/lib/notifications/transport";

export {
 clearRegisteredPushTokenIdentity,
 markPushTokenRegistered,
 shouldRegisterPushToken,
};

// Internal helpers

/** Lazy singleton ; only initialise Messaging once per page load. */
let _messaging: Messaging | null = null;

function hasRequiredFirebaseMessagingConfig(env: Record<string, string | undefined>): boolean {
 return Boolean(
  env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() &&
  env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() &&
  env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim() &&
  env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim()
 );
}

export function isFirebaseMessagingConfigured(): boolean {
 return hasRequiredFirebaseMessagingConfig({
  NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
 });
}

function getMessagingInstance(): Messaging | null {
 // Messaging is only available in browser environments with service worker support
 if (!canUseBrowserPush() || !("serviceWorker" in navigator)) {
  return null;
 }
 if (!isFirebaseMessagingConfigured()) {
  return null;
 }
 if (!_messaging) {
  try {
   const app = getFirebaseApp();
   _messaging = getMessaging(app);
  } catch (err) {
   console.warn("[FCM] Messaging unavailable:", err);
   return null;
  }
 }
 return _messaging;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Requests browser push notification permission.
 * Returns the resulting permission state.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
 if (!canUseBrowserPush() || !("Notification" in window)) {
 console.warn("[FCM] Notifications not supported in this environment.");
 return "denied";
 }

 if (Notification.permission !== "default") {
 return Notification.permission;
 }

 return await Notification.requestPermission();
}

/**
 * Retrieves the current FCM registration token for this device/browser.
 * Returns `null` if permission is not granted or if FCM is unavailable.
 *
 * The VAPID key authenticates the push subscription with the FCM backend.
 * Generate it at: Firebase Console → Project Settings → Cloud Messaging → Web Push certificates.
 */
export async function getFCMToken(): Promise<string | null> {
 const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY?.trim();
 if (!vapidKey || !isFirebaseMessagingConfigured()) {
 return null;
 }

 const messaging = getMessagingInstance();
 if (!messaging) return null;

 const permission = Notification.permission;
 if (permission !== "granted") {
 console.warn("[FCM] Cannot get token ; permission not granted:", permission);
 return null;
 }

 try {
 // Register (or reuse) the Firebase service worker under its dedicated push scope
 // so it never replaces the standalone offline shell service worker at "/".
 const registration = await navigator.serviceWorker.register(
 "/firebase-messaging-sw.js",
 { scope: "/firebase-cloud-messaging-push-scope" }
 );

 const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });

 if (token) {
 return token;
 } else {
 console.warn("[FCM] No registration token available.");
 return null;
 }
 } catch (err) {
 console.error("[FCM] Failed to retrieve token:", err);
 return null;
 }
}

/**
 * POSTs an FCM token to the server so it can be stored in `user_push_tokens`.
 * The server derives the userId from the Better Auth session cookie.
 *
 * Uses the browser's userAgent as a human-readable device label.
 */
export async function registerTokenToServer(
 token: string,
 userId?: string,
 isCurrent: () => boolean = () => true
): Promise<boolean> {
 if (!canUseBrowserPush() || !isCurrent()) return false;
 if (userId && !shouldRegisterPushToken({ userId, token })) {
 return true;
 }

 try {
 const device = navigator.userAgent.slice(0, 200); // cap to 200 chars
 const res = await fetch("/api/notifications/register-token", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 credentials: "include", // send auth session cookie
 body: JSON.stringify({
  token,
  device,
  platform: "web",
  transport: "webpush",
 }),
 });

 if (!res.ok) {
 console.error("[FCM] Token registration failed:", await res.text());
 return false;
 }

 if (userId && isCurrent()) {
 markPushTokenRegistered(userId, token);
 }
 return true;
 } catch (err) {
 console.error("[FCM] Token registration error:", err);
 return false;
 }
}

/**
 * Sets up a foreground message listener.
 * Fires when the app is in the foreground and a push arrives.
 * Returns an unsubscribe function.
 */
export function onForegroundMessage(
 handler: (payload: { notification?: { title?: string; body?: string }; data?: Record<string, string> }) => void
): () => void {
 const messaging = getMessagingInstance();
 if (!messaging) return () => {};

 try {
 // `onMessage` returns an unsubscribe function
 return onMessage(messaging, handler);
 } catch (err) {
 console.warn("[FCM] Foreground listener unavailable:", err);
 return () => {};
 }
}

/** Show a system notification for a foreground Web FCM message, using its
 * dedicated worker (never the offline root worker). The inbox toast is kept. */
export async function showForegroundWebNotification(
  input: { title: string; body?: string; url: string; notificationId?: string },
  isCurrent: () => boolean = () => true,
): Promise<void> {
  if (!canUseBrowserPush() || !isCurrent() ||
      typeof window.Notification !== "function" || window.Notification.permission !== "granted" ||
      !("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration("/firebase-cloud-messaging-push-scope");
    if (!registration || new URL(registration.scope).pathname.replace(/\/$/, "") !== "/firebase-cloud-messaging-push-scope" ||
        !isCurrent() || window.Notification.permission !== "granted") return;
    await registration.showNotification(input.title, {
      body: input.body,
      icon: "/brand/zyx-app-192.png",
      badge: "/brand/zyx-logo-symbol-black@2x.png",
      tag: input.notificationId ? `zyx:${input.notificationId}` : undefined,
      data: { zyx: true, url: input.url, notificationId: input.notificationId },
    });
  } catch {
    console.warn("[notifications] Browser system notification failed");
  }
}
