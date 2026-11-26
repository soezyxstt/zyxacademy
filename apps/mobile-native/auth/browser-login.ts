import { isRunningInExpoGo } from "expo";
import * as Crypto from "expo-crypto";
import { fetch } from "expo/fetch";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useSyncExternalStore } from "react";
import { Platform } from "react-native";
import { createNativeBrowserLogin } from "./browser-flow";
import { takeNativeBrowserCallback } from "./browser-intent";
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
  takeCallback: takeNativeBrowserCallback,
  fetcher: fetch,
});

export function useNativeBrowserLogin() {
  const { state: { status: sessionStatus }, acceptLogin } = useNativeSession();
  const status = useSyncExternalStore(browserLogin.subscribe, browserLogin.getStatus, browserLogin.getStatus);
  const signIn = useCallback(async () => {
    if (isNativeBuild && sessionStatus === "signed-out") await browserLogin.signIn(acceptLogin);
  }, [acceptLogin, sessionStatus]);
  const completePending = useCallback(async () => {
    if (!isNativeBuild || sessionStatus !== "signed-out") return false;
    return browserLogin.completePending(acceptLogin);
  }, [acceptLogin, sessionStatus]);
  return { status, signIn, cancel: browserLogin.cancel, completePending, isAvailable: isNativeBuild };
}
