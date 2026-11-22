/**
 * lib/native/auth.ts
 *
 * Prefers Android Credential Manager, with the existing system-browser flow for
 * older APKs, iOS and desktop. Google tokens stay in memory until server verification.
 */

import { getSafeRedirectPath } from "@/lib/auth-redirect";
import { AccountSwitchError } from "@/lib/auth/account-switch-contract";
import { isAccountTransitionPending } from "@/lib/auth/account-transition-state";
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

export class NativeGoogleSignInError extends Error {
  constructor(public readonly code: "GOOGLE_NOT_CONFIGURED" | "NATIVE_GOOGLE_FAILED" | "CHALLENGE_EXPIRED") {
    super(code);
    this.name = "NativeGoogleSignInError";
  }
}

export type NativeGoogleSignInOptions = {
  onBrowserClosed?: () => void;
  /** An explicit recovery action, never an automatic response to cancellation. */
  preferBrowser?: boolean;
};

function nativeErrorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code : undefined;
}

async function nativeGoogleRequest(body: Record<string, unknown>) {
  const response = await fetch("/api/auth/native/google", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    const code = nativeErrorCode(data);
    if (code === "SESSION_LIMIT" || code === "ACCOUNT_UNAVAILABLE") throw new AccountSwitchError(code);
    throw new NativeGoogleSignInError(code === "GOOGLE_NOT_CONFIGURED" || code === "CHALLENGE_EXPIRED"
      ? code : "NATIVE_GOOGLE_FAILED");
  }
  return data as Record<string, unknown>;
}

async function tryAndroidGoogleSignIn(callbackURL: string, options?: NativeGoogleSignInOptions): Promise<boolean> {
  const cap = getCapacitor();
  const plugin = cap?.Plugins?.ZyxGoogleAuth;
  if (options?.preferBrowser || cap?.getPlatform?.() !== "android" || !plugin?.signIn) return false;

  const { withAccountTransition } = await import("@/lib/auth/account-switch");
  const challenge = await nativeGoogleRequest({ action: "challenge" });
  if (typeof challenge.clientId !== "string" || typeof challenge.nonce !== "string") {
    throw new NativeGoogleSignInError("NATIVE_GOOGLE_FAILED");
  }
  let token: string;
  const bridgeLogging = cap.isLoggingEnabled;
  // Capacitor's debug bridge logs plugin payloads before resolving their promises.
  // Suppress it while the Google token crosses the bridge, including debug APKs.
  cap.isLoggingEnabled = false;
  try {
    const result = await plugin.signIn({ serverClientId: challenge.clientId, nonce: challenge.nonce });
    if (typeof result.idToken !== "string" || !result.idToken) throw new NativeGoogleSignInError("NATIVE_GOOGLE_FAILED");
    token = result.idToken;
  } catch (error) {
    await nativeGoogleRequest({ action: "cancel" }).catch(() => {});
    const code = nativeErrorCode(error);
    if (code === "CANCELLED") {
      options?.onBrowserClosed?.();
      return true;
    }
    if (code === "UNAVAILABLE" || code === "UNIMPLEMENTED" || code === "NOT_IMPLEMENTED") return false;
    if (code === "BUSY") throw new AccountSwitchError("BUSY");
    throw new NativeGoogleSignInError("NATIVE_GOOGLE_FAILED");
  } finally {
    cap.isLoggingEnabled = bridgeLogging;
  }
  let verificationFailure: NativeGoogleSignInError | undefined;
  try {
    await withAccountTransition(async () => {
      try {
        const result = await nativeGoogleRequest({ action: "verify", idToken: token });
        if (typeof result.userId !== "string" || !result.userId) throw new NativeGoogleSignInError("NATIVE_GOOGLE_FAILED");
        return result.userId;
      } catch (error) {
        if (error instanceof NativeGoogleSignInError) verificationFailure = error;
        throw error;
      }
    });
  } catch (error) {
    // Offer browser recovery only after the guard confirms the previous account
    // is still active. An uncertain response keeps writers paused and reloads.
    if (verificationFailure && error instanceof AccountSwitchError
      && error.code === "SWITCH_FAILED" && !isAccountTransitionPending()) throw verificationFailure;
    throw error;
  }
  window.location.replace(getSafeRedirectPath(callbackURL));
  return true;
}

export async function clearNativeGoogleCredentialState(): Promise<void> {
  await getCapacitor()?.Plugins?.ZyxGoogleAuth?.clearCredentialState?.();
}

function generateRandomState(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function getNativeAuthScheme(): ReturnType<typeof resolveNativeAuthScheme> {
  if (typeof window === "undefined") return null;
  return resolveNativeAuthScheme({
    runtime: getNativeRuntime(),
    userAgent: navigator.userAgent,
    hostname: window.location.hostname,
  });
}

export function isNativeSystemBrowserSupported(): boolean {
  const runtime = getNativeRuntime();
  if (runtime === "capacitor") {
    return Boolean(getCapacitor()?.Plugins?.Browser?.open);
  }
  if (runtime === "tauri") {
    return Boolean(getTauri()?.opener?.openUrl || getTauri()?.core?.invoke);
  }
  return false;
}

export async function openNativeSystemBrowser(
  url: string,
  options?: { onBrowserClosed?: () => void },
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const runtime = getNativeRuntime();

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
        url,
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
        await tauri.opener.openUrl(url);
        return true;
      }
      if (tauri?.core?.invoke) {
        attachFocusReset();
        await tauri.core.invoke("plugin:opener|open_url", { url });
        return true;
      }
    } catch {
      return false;
    }
  }

  return false;
}

export function isNativeBrowserSignInSupported(): boolean {
  const runtime = getNativeRuntime();
  if (runtime === "capacitor") {
    const cap = getCapacitor();
    return Boolean(cap?.Plugins?.Browser?.open
      || (cap?.getPlatform?.() === "android" && cap.Plugins?.ZyxGoogleAuth?.signIn));
  }
  if (runtime === "tauri") {
    return Boolean(getTauri()?.opener?.openUrl || getTauri()?.core?.invoke);
  }
  return false;
}

export async function startNativeGoogleSignIn(
  callbackURL = "/dashboard",
  options?: NativeGoogleSignInOptions,
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const runtime = getNativeRuntime();
  const scheme = resolveNativeAuthScheme({
    runtime,
    userAgent: navigator.userAgent,
    hostname: window.location.hostname,
  });
  if (!scheme) return false;
  const { assertCanAddAccount } = await import("@/lib/auth/account-switch");
  await assertCanAddAccount();
  if (await tryAndroidGoogleSignIn(callbackURL, options)) return true;

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
