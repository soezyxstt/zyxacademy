/**
 * public/sw.js
 *
 * Standalone offline shell service worker for Zyx Academy.
 * Registered independently at app startup so offline reading works even when
 * push notification permission is denied, ignored, or unsupported.
 */

const OFFLINE_SHELL_CACHE = "zyx-offline-shell-v2";
const OFFLINE_PAGE_URL = "/offline";

function extractStaticAssetUrls(text) {
  const matches = text.match(/\/_next\/static\/[^"'\s<>)]+/g) || [];
  return Array.from(new Set(matches));
}

function extractCssStaticAssetUrls(cssText, cssAssetUrl) {
  const urls = new Set(extractStaticAssetUrls(cssText));
  let baseUrl;
  try {
    baseUrl = new URL(cssAssetUrl, self.location.origin);
  } catch {
    return Array.from(urls);
  }
  const urlPattern = /url\(\s*(?:(["'])([^"']+)\1|([^)\s"']+))\s*\)/gi;
  let match;
  while ((match = urlPattern.exec(cssText)) !== null) {
    const rawRef = (match[2] || match[3] || "").trim();
    if (!rawRef || rawRef.startsWith("data:")) continue;
    try {
      const resolved = new URL(rawRef, baseUrl);
      if (
        resolved.origin === self.location.origin &&
        resolved.pathname.startsWith("/_next/static/")
      ) {
        urls.add(resolved.pathname + resolved.search);
      }
    } catch {
      // Ignore malformed CSS url() references
    }
  }
  return Array.from(urls);
}

function isCssAssetUrl(assetUrl) {
  try {
    return new URL(assetUrl, self.location.origin).pathname.endsWith(".css");
  } catch {
    return false;
  }
}

async function precacheOfflineShell() {
  const cache = await caches.open(OFFLINE_SHELL_CACHE);
  const response = await fetch(new Request(OFFLINE_PAGE_URL, { cache: "reload" }));
  if (!response || !response.ok) return;

  await cache.put(OFFLINE_PAGE_URL, response.clone());
  const html = await response.text();
  const initialAssets = extractStaticAssetUrls(html).slice(0, 80);

  const nestedAssets = new Set();
  await Promise.all(
    initialAssets.map(async (assetUrl) => {
      try {
        const assetResponse = await fetch(assetUrl);
        if (!assetResponse || !assetResponse.ok) return;
        await cache.put(assetUrl, assetResponse.clone());
        // Pre-cache KaTeX and webfont assets referenced inside cached CSS bundles.
        if (isCssAssetUrl(assetUrl)) {
          const cssText = await assetResponse.text();
          for (const url of extractCssStaticAssetUrls(cssText, assetUrl)) {
            nestedAssets.add(url);
          }
        }
      } catch {
        // Best-effort precache
      }
    })
  );

  if (nestedAssets.size > 0) {
    const fontAndMediaAssets = Array.from(nestedAssets).slice(0, 80);
    await Promise.all(
      fontAndMediaAssets.map((assetUrl) => cache.add(assetUrl).catch(() => undefined))
    );
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    precacheOfflineShell()
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("zyx-offline-shell-") && key !== OFFLINE_SHELL_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .catch(() => undefined)
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never cache API routes or auth endpoints.
  if (url.pathname.startsWith("/api/")) return;

  // Cache immutable Next.js static bundles and fonts so /offline renders cleanly without network.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(OFFLINE_SHELL_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((response) => {
            if (response && response.ok) {
              cache.put(request, response.clone()).catch(() => undefined);
            }
            return response;
          });
        })
      )
    );
    return;
  }

  // For page navigations: network first, fallback to /offline when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (url.pathname === OFFLINE_PAGE_URL && response && response.ok) {
            const copy = response.clone();
            caches
              .open(OFFLINE_SHELL_CACHE)
              .then((cache) => cache.put(OFFLINE_PAGE_URL, copy))
              .catch(() => undefined);
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(OFFLINE_SHELL_CACHE);
          const offlinePage = await cache.match(OFFLINE_PAGE_URL);
          if (offlinePage) return offlinePage;
          return new Response("Offline", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        })
    );
  }
});
