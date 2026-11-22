/**
 * public/firebase-messaging-sw.js
 *
 * Firebase Cloud Messaging Service Worker.
 * Handles BACKGROUND push notifications (when the browser tab is not focused).
 * Foreground notifications are handled by onMessage() in the client.
 *
 * IMPORTANT: This file uses the Firebase Compat CDN build via importScripts().
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
 url: data.url || "/dashboard",
 type: data.type || "admin_broadcast",
 },
 // Collapse notifications of the same type to avoid spam
 tag: data.type || "general",
 renotify: false,
 };

 return self.registration.showNotification(notificationTitle, notificationOptions);
});

/**
 * Opens the target page when a user clicks a notification.
 * Falls back to /dashboard if no URL is specified in the payload.
 */
self.addEventListener("notificationclick", (event) => {
 event.notification.close();

 const targetUrl = event.notification.data?.url || "/dashboard";

 event.waitUntil(
 clients
 .matchAll({ type: "window", includeUncontrolled: true })
 .then((clientList) => {
 // If a window with the target URL is already open, focus it
 for (const client of clientList) {
 if (client.url === targetUrl && "focus" in client) {
 return client.focus();
 }
 }
 // Otherwise open a new window
 if (clients.openWindow) {
 return clients.openWindow(targetUrl);
 }
 })
 );
});
