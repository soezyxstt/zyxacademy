/**
 * lib/offline/register-sw.ts
 *
 * Registers the standalone offline shell service worker (/sw.js) independently
 * of push notification permission or Firebase configuration.
 */

export const OFFLINE_SW_URL = "/sw.js";
export const OFFLINE_SW_SCOPE = "/";

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export function canRegisterOfflineServiceWorker(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  if (!("serviceWorker" in navigator) || !navigator.serviceWorker?.register) {
    return false;
  }
  const isLocalhost =
    window.location?.hostname === "localhost" ||
    window.location?.hostname === "127.0.0.1";
  if (window.isSecureContext === false && !isLocalhost) {
    return false;
  }
  return true;
}

export function resetOfflineServiceWorkerRegistrationForTests(): void {
  registrationPromise = null;
}

/**
 * Registers /sw.js at root scope without requiring Notification permission
 * or Firebase messaging credentials.
 */
export async function registerOfflineServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!canRegisterOfflineServiceWorker()) {
    return null;
  }

  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker
      .register(OFFLINE_SW_URL, {
        scope: OFFLINE_SW_SCOPE,
        updateViaCache: "none",
      })
      .catch(() => {
        registrationPromise = null;
        return null;
      });
  }

  return registrationPromise;
}
