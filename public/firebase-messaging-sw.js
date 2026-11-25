/**
 * public/firebase-messaging-sw.js
 *
 * Firebase Cloud Messaging Service Worker.
 * Handles BACKGROUND push notifications (when the browser tab is not focused).
 * Foreground notifications are handled by onMessage() in the client.
 *
 * IMPORTANT: This file uses the Firebase Compat CDN build via // Install custom click handling before importing FCM. Leave Firebase's own
// automatically displayed notifications to its own click handler.
self.addEventListener("notificationclick", (event) => {
  const data = event.notification.data;
  if (!data?.zyx) return;
  event.stopImmediatePropagation();
  event.notification.close();

  const rawUrl = data.url;
  const target = typeof rawUrl === "string" && rawUrl.startsWith("/") &&
    !rawUrl.startsWith("//") && !rawUrl.startsWith("/\\")
    ? new URL(rawUrl, self.location.origin).href
    : new URL("/dashboard", self.location.origin).href;

  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
    for (const client of windows) {
      if (client.url === target && "focus" in client) return client.focus();
    }
    if (clients.openWindow) return clients.openWindow(target);
  }));
});

importScripts().
 * Service workers run outside the webpack bundle and cannot use ES module imports.
 * The compat scripts are loaded from Google's CDN for reliability and caching.
 *
 * Public Firebase configuration is loaded from this deployment at worker startup.
 */

importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

importScripts("/firebase-config.js");
firebase.initializeApp(self.__FIREBASE_CONFIG__);
const messaging = firebase.messaging();

/**
 * Called when a push notification arrives while the browser tab is in the
 * background or closed entirely.
 *
 * FCM payload structure expected:
 * {
 * notification: { title, body, icon? },
 * data: { url?, type?, ... }
 * }
 */
messaging.onBackgroundMessage((payload) => {

 const { notification = {}, data = {} } = payload;

 const notificationTitle = notification.title || "Zyx Academy";
 const notificationOptions = {
 body: notification.body || "",
 icon: notification.icon || "/brand/zyx-app-192.png",
 badge: "/brand/zyx-logo-symbol-black@2x.png",
 // Store data so the notificationclick handler can use it
 data: {
 zyx: true,
 url: data.url || "/dashboard",
 type: data.type || "admin_broadcast",
 },
 // Collapse notifications of the same type to avoid spam
 tag: data.notificationId ? `zyx:${data.notificationId}` : undefined,
 renotify: false,
 };

 return self.registration.showNotification(notificationTitle, notificationOptions);
});
