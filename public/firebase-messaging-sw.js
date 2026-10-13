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
 * The Firebase config is embedded here directly as it needs to be available
 * before any network request (the SW is registered before the app boots).
 * These are NEXT_PUBLIC values ; safe to ship in the browser.
 */

// ─── Load Firebase compat scripts from CDN ───────────────────────────────────
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

// ─── Firebase configuration (mirrors NEXT_PUBLIC_FIREBASE_* env vars) ─────────
const firebaseConfig = {
 apiKey: "AIzaSyD06vZiIGG-C5hyEcNAUbl9-eTMBHE5r4U",
 authDomain: "zyx-academy.firebaseapp.com",
 projectId: "zyx-academy",
 storageBucket: "zyx-academy.firebasestorage.app",
 messagingSenderId: "307641710075",
 appId: "1:307641710075:web:55d0b1c56a78fd1d6d075e",
 measurementId: "G-ENY8EJ44WD",
};

// ─── Initialise Firebase ──────────────────────────────────────────────────────
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// ─── Background message handler ───────────────────────────────────────────────
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
 console.log("[firebase-messaging-sw.js] Background message received:", payload);

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

 self.registration.showNotification(notificationTitle, notificationOptions);
});

// ─── Notification click handler ───────────────────────────────────────────────
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
