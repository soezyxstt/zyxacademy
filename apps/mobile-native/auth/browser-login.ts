import { isRunningInExpoGo } from "expo";
import * as Crypto from "expo-crypto";
import { fetch } from "expo/fetch";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useState, useSyncExternalStore } from "react";
import { Platform } from "react-native";
import { createNativeBrowserLogin, type AcceptNativeBrowserLogin, type AdditionalLoginScope } from "./browser-flow";
import { takeNativeBrowserCallback } from "./browser-intent";
import type { NativeLoginIntent } from "./login-intent";
import { allowsSavedAccountLogin } from "./saved-account-model";
import { googleCredentialLogin } from "./google-credential-login";
import { useNativeSession } from "./session-provider";

const attemptKey = "zyx-native.staging.browser-login.v1";
const storeOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const isNativeBuild = (Platform.OS === "ios" || Platform.OS === "android")
  && !isRunningInExpoGo();

const browserLogin = createNativeBrowserLogin({
  randomBytes: Crypto.getRandomBytesAsync,
  sha256Base64: value => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value, {
    encoding: Crypto.CryptoEncoding.BASE64,
  }),
  readAttempt: () => SecureStore.getItemAsync(attemptKey, storeOptions),
  saveAttempt: value => SecureStore.setItemAsync(attemptKey, value, storeOptions),
  deleteAttempt: () => SecureStore.deleteItemAsync(attemptKey, storeOptions),
  openBrowser: (url, redirect) => WebBrowser.openAuthSessionAsync(url, redirect),
  dismissBrowser: () => {
    if (Platform.OS !== "ios") return;
    try { WebBrowser.dismissAuthSession(); } catch { /* The browser may already be closing. */ }
  },
  preserveAttemptOnDismiss: Platform.OS === "android",
  takeCallback: takeNativeBrowserCallback,
  fetcher: fetch,
});

export function useNativeBrowserLogin() {
  const { state: { status: sessionStatus }, acceptLogin, acceptAdditionalLogin, getSnapshot, getPendingRefresh } = useNativeSession();
  const browserStatus = useSyncExternalStore(browserLogin.subscribe, browserLogin.getStatus, browserLogin.getStatus);
  const credentialStatus = useSyncExternalStore(googleCredentialLogin.subscribe, googleCredentialLogin.getStatus, googleCredentialLogin.getStatus);
  const isCredentialAvailable = isNativeBuild && googleCredentialLogin.isConfigured();
  const [useBrowserStatus, setUseBrowserStatus] = useState(false);
  const authorizeAttempt = useCallback(async (scope: AdditionalLoginScope | undefined, signal: AbortSignal) => {
    await getPendingRefresh();
    if (signal.aborted) return false;
    return allowsSavedAccountLogin(getSnapshot(), scope);
  }, [getPendingRefresh, getSnapshot]);
  const acceptBrowser = useCallback<AcceptNativeBrowserLogin>(async (headers, accountId, signal, intent, scope) => {
    if (scope) return acceptAdditionalLogin(headers, accountId, scope.fromSessionId, signal);
    if (!await authorizeAttempt(undefined, signal)) throw new Error("SESSION_EXPIRED");
    await acceptLogin(headers, accountId, signal, intent);
  }, [acceptAdditionalLogin, acceptLogin, authorizeAttempt]);
  const signIn = useCallback(async (intent?: NativeLoginIntent, preferBrowser = false) => {
    if (!isNativeBuild || sessionStatus !== "signed-out" || googleCredentialLogin.isRunning()) return;
    if (preferBrowser || !googleCredentialLogin.isConfigured()) {
      setUseBrowserStatus(true);
      return browserLogin.signIn(acceptBrowser, intent, { authorize: authorizeAttempt });
    }
    setUseBrowserStatus(false);
    return googleCredentialLogin.signIn(acceptLogin, intent, browserLogin.retirePending);
  }, [acceptBrowser, acceptLogin, authorizeAttempt, sessionStatus]);
  const addAccount = useCallback(async (fromSessionId: string, preferBrowser = false) => {
    const scope: AdditionalLoginScope = { kind: "additional", fromSessionId };
    if (!isNativeBuild || googleCredentialLogin.isRunning()) return "unavailable" as const;
    if (!await authorizeAttempt(scope, new AbortController().signal)) return "stale" as const;
    if (preferBrowser || !googleCredentialLogin.isConfigured()) {
      setUseBrowserStatus(true);
      return browserLogin.signIn(acceptBrowser, undefined, { scope, authorize: authorizeAttempt });
    }
    setUseBrowserStatus(false);
    return googleCredentialLogin.signIn(acceptBrowser, undefined, browserLogin.retirePending, scope);
  }, [acceptBrowser, authorizeAttempt]);
  const completePending = useCallback(async () => {
    if (!isNativeBuild || (sessionStatus !== "signed-out" && sessionStatus !== "signed-in") || googleCredentialLogin.isRunning()) return false;
    return browserLogin.completePending(acceptBrowser, authorizeAttempt);
  }, [acceptBrowser, authorizeAttempt, sessionStatus]);
  const cancel = useCallback(() => {
    if (googleCredentialLogin.isRunning()) googleCredentialLogin.cancel();
    else browserLogin.cancel();
  }, []);
  return {
    status: useBrowserStatus || !isCredentialAvailable ? browserStatus : credentialStatus,
    signIn, addAccount, cancel, completePending, isAvailable: isNativeBuild, isCredentialAvailable,
    getAddStatus: (preferBrowser: boolean) => (preferBrowser || !isCredentialAvailable ? browserLogin : googleCredentialLogin).getStatus(),
    getAddFailure: (preferBrowser: boolean) => (preferBrowser || !isCredentialAvailable ? browserLogin : googleCredentialLogin).getFailure(),
    getBrowserFailure: browserLogin.getFailure,
    getRecoveryIntent: browserLogin.getRecoveryIntent,
    getRecoveryScope: browserLogin.getRecoveryScope,
  };
}
