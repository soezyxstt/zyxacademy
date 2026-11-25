/**
 * Firebase Cloud Messaging worker, scoped separately from the offline worker.
 * Firebase displays notification payloads automatically in the background.
 * Data-only and foreground notifications use Zyx-owned notification options.
 */

// Custom click handling must be installed before importing the FCM SDK.
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

importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");
importScripts("/firebase-config.js");
firebase.initializeApp(self.__FIREBASE_CONFIG__);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  // FCM already shows notification payloads. A second showNotification call
  // creates duplicates and can suppress distinct messages with a shared tag.
  if (payload.notification) return;
  const data = payload.data || {};
  if (!data.title) return;
  return self.registration.showNotification(data.title, {
    body: data.body || "",
    icon: "/brand/zyx-app-192.png",
    badge: "/brand/zyx-logo-symbol-black@2x.png",
    data: {
      zyx: true,
      url: data.url || "/dashboard",
      type: data.type || "admin_broadcast",
      notificationId: data.notificationId,
    },
    tag: data.notificationId ? `zyx:${data.notificationId}` : undefined,
    renotify: false,
  });
});
