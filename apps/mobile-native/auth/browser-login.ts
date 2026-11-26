import { isRunningInExpoGo } from "expo";
import * as Crypto from "expo-crypto";
import { fetch } from "expo/fetch";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useState, useSyncExternalStore } from "react";
import { Platform } from "react-native";
import { createNativeBrowserLogin } from "./browser-flow";
import { takeNativeBrowserCallback } from "./browser-intent";
import type { NativeLoginIntent } from "./login-intent";
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
  const { state: { status: sessionStatus }, acceptLogin } = useNativeSession();
  const browserStatus = useSyncExternalStore(browserLogin.subscribe, browserLogin.getStatus, browserLogin.getStatus);
  const credentialStatus = useSyncExternalStore(googleCredentialLogin.subscribe, googleCredentialLogin.getStatus, googleCredentialLogin.getStatus);
  const isCredentialAvailable = isNativeBuild && googleCredentialLogin.isConfigured();
  const [useBrowserStatus, setUseBrowserStatus] = useState(false);
  const signIn = useCallback(async (intent?: NativeLoginIntent, preferBrowser = false) => {
    if (!isNativeBuild || sessionStatus !== "signed-out" || googleCredentialLogin.isRunning()) return;
    if (preferBrowser || !googleCredentialLogin.isConfigured()) {
      setUseBrowserStatus(true);
      return browserLogin.signIn(acceptLogin, intent);
    }
    setUseBrowserStatus(false);
    return googleCredentialLogin.signIn(acceptLogin, intent, browserLogin.retirePending);
  }, [acceptLogin, sessionStatus]);
  const completePending = useCallback(async () => {
    if (!isNativeBuild || sessionStatus !== "signed-out" || googleCredentialLogin.isRunning()) return false;
    return browserLogin.completePending(acceptLogin);
  }, [acceptLogin, sessionStatus]);
  const cancel = useCallback(() => {
    if (googleCredentialLogin.isRunning()) googleCredentialLogin.cancel();
    else browserLogin.cancel();
  }, []);
  return {
    status: useBrowserStatus || !isCredentialAvailable ? browserStatus : credentialStatus,
    signIn, cancel, completePending, isAvailable: isNativeBuild, isCredentialAvailable,
    getRecoveryIntent: browserLogin.getRecoveryIntent,
  };
}
