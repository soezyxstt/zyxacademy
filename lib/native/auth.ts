/**
 * lib/native/auth.ts
 *
 * Initiates Google sign-in via Chrome Custom Tabs (Android), SFSafariViewController (iOS),
 * or the system browser (Desktop Tauri) with a per-login state nonce stored in sessionStorage.
 */

import { getSafeRedirectPath } from "@/lib/auth-redirect";
import {
  NATIVE_AUTH_STATE_STORAGE_KEY,
  parseNativeAuthDeepLink,
  resolveNativeAuthScheme,
} from "./auth-handoff";
import {
  getCapacitor,
  getNativeRuntime,
  getTauri,
  type CapacitorPluginListenerHandle,
} from "./runtime";

function generateRandomState(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function isNativeBrowserSignInSupported(): boolean {
  const runtime = getNativeRuntime();
  if (runtime === "capacitor") {
    return Boolean(getCapacitor()?.Plugins?.Browser?.open);
  }
  if (runtime === "tauri") {
    return Boolean(getTauri()?.opener?.openUrl || getTauri()?.core?.invoke);
  }
  return false;
}

export async function startNativeGoogleSignIn(
  callbackURL = "/dashboard",
  options?: { onBrowserClosed?: () => void },
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const runtime = getNativeRuntime();
  const scheme = resolveNativeAuthScheme({
    runtime,
    userAgent: navigator.userAgent,
    hostname: window.location.hostname,
  });
  if (!scheme) return false;

  const state = generateRandomState();
  try {
    window.sessionStorage.setItem(
      NATIVE_AUTH_STATE_STORAGE_KEY,
      JSON.stringify({ state, createdAt: Date.now() }),
    );
  } catch {
    return false;
  }

  const safeNext = getSafeRedirectPath(callbackURL);
  const startUrl = new URL("/api/auth/native/start", window.location.origin);
  startUrl.searchParams.set("scheme", scheme);
  startUrl.searchParams.set("state", state);
  startUrl.searchParams.set("next", safeNext);

  if (runtime === "capacitor") {
    const browser = getCapacitor()?.Plugins?.Browser;
    if (!browser?.open) return false;

    let finishedHandle: CapacitorPluginListenerHandle | null = null;
    if (browser.addListener && options?.onBrowserClosed) {
      try {
        finishedHandle = await browser.addListener("browserFinished", () => {
          options.onBrowserClosed?.();
          if (finishedHandle) {
            void finishedHandle.remove().catch(() => {});
            finishedHandle = null;
          }
        });
      } catch {
        finishedHandle = null;
      }
    }

    try {
      await browser.open({
        url: startUrl.toString(),
        presentationStyle: "popover",
      });
      return true;
    } catch {
      if (finishedHandle) {
        void finishedHandle.remove().catch(() => {});
      }
      return false;
    }
  }

  if (runtime === "tauri") {
    const tauri = getTauri();
    const attachFocusReset = () => {
      if (!options?.onBrowserClosed) return;
      const onFocus = () => {
        window.removeEventListener("focus", onFocus);
        options.onBrowserClosed?.();
      };
      window.addEventListener("focus", onFocus);
    };
    try {
      if (tauri?.opener?.openUrl) {
        attachFocusReset();
        await tauri.opener.openUrl(startUrl.toString());
        return true;
      }
      if (tauri?.core?.invoke) {
        attachFocusReset();
        await tauri.core.invoke("plugin:opener|open_url", {
          url: startUrl.toString(),
        });
        return true;
      }
    } catch {
      return false;
    }
  }

  return false;
}

export async function subscribeNativeAuthDeepLinks(
  onFinishPath: (path: string) => void,
): Promise<() => void> {
  const cap = getCapacitor();
  const appPlugin = cap?.Plugins?.App;
  if (!appPlugin?.addListener) return () => {};

  let handle: CapacitorPluginListenerHandle | null = null;
  let disposed = false;

  try {
    handle = await appPlugin.addListener("appUrlOpen", (event) => {
      const finishPath = parseNativeAuthDeepLink(event?.url ?? "");
      if (!finishPath) return;
      void cap?.Plugins?.Browser?.close?.().catch(() => {});
      onFinishPath(finishPath);
    });

    if (disposed && handle) {
      void handle.remove().catch(() => {});
      return () => {};
    }
  } catch {
    return () => {};
  }

  return () => {
    disposed = true;
    if (handle) {
      void handle.remove().catch(() => {});
      handle = null;
    }
  };
}
