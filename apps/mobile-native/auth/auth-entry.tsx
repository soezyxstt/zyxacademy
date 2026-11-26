import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, View, useColorScheme } from "react-native";
import Svg, { Path } from "react-native-svg";

import { getOAuthCallbackErrorKey } from "../../../packages/native-session/auth-redirect";
import { Button } from "../components/Button";
import { AuthContinuation, AuthSessionStatus } from "./auth-continuation";
import { authCopy, authLocale } from "./auth-copy";
import { AuthPage, AuthStatus } from "./auth-page";
import { useNativeBrowserLogin } from "./browser-login";
import { authEntryHref, readAuthReturnTo, type NativeAuthEntry, type NativeLoginIntent } from "./login-intent";
import { useNativeSession } from "./session-provider";
import { SavedAccounts } from "./SavedAccounts";

function GoogleMark() {
  return <Svg accessible={false} width={18} height={18} viewBox="0 0 24 24">
    <Path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <Path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <Path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.23 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
    <Path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
  </Svg>;
}

export function AuthEntry({ entry }: { entry: NativeAuthEntry }) {
  const params = useLocalSearchParams<{ returnTo?: string | string[]; locale?: string | string[]; error?: string | string[] }>();
  const locale = authLocale(params.locale);
  const intent: NativeLoginIntent = { entry, locale, next: readAuthReturnTo(params.returnTo) };
  const { state } = useNativeSession();

  if (state.status === "signed-in") return <AuthContinuation fallbackLocale={locale} next={intent.next} />;
  if (state.status !== "signed-out") return <AuthSessionStatus locale={locale} />;
  return <GoogleEntryForm intent={intent} incomingError={getOAuthCallbackErrorKey(params.error)} />;
}

function GoogleEntryForm({ intent, incomingError }: {
  intent: NativeLoginIntent;
  incomingError: ReturnType<typeof getOAuthCallbackErrorKey>;
}) {
  const router = useRouter();
  const login = useNativeBrowserLogin();
  const theme = useColorScheme() === "dark" ? "dark" : "light";
  const run = useRef(0);
  const [attempted, setAttempted] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [nativeUnavailable, setNativeUnavailable] = useState(false);
  const [savedBusy, setSavedBusy] = useState(false);
  const busy = login.status === "opening" || login.status === "exchanging";
  const isSignUp = intent.entry === "sign-up";
  const copy = authCopy[intent.locale];
  const otherEntry = authEntryHref({ ...intent, entry: isSignUp ? "sign-in" : "sign-up" });
  const error = !login.isAvailable
    ? copy.native.buildRequired
    : busy ? null
    : !attempted && incomingError ? copy.oauthErrors[incomingError]
    : cancelled ? copy.native.pickerCancelled
    : nativeUnavailable ? copy.native.credentialUnavailable
    : attempted && login.status === "error" ? copy.oauthErrors.generic
    : null;

  const start = async (preferBrowser = false) => {
    const current = ++run.current;
    setAttempted(true);
    setCancelled(false);
    setNativeUnavailable(false);
    const outcome = await login.signIn(intent, preferBrowser);
    if (current !== run.current) return;
    if (outcome === "cancelled") setCancelled(true);
    if (outcome === "unavailable") setNativeUnavailable(true);
  };

  return <AuthPage title={isSignUp ? copy.signUpTitle : copy.signIn}>
    <AuthStatus center reference>{isSignUp ? copy.signUpDescription : copy.signInDescription}</AuthStatus>
    <SavedAccounts fromSessionId={null} enabled={!busy} locale={intent.locale} theme={theme} onBusyChange={setSavedBusy} />
    {error && <AuthStatus error>{error}</AuthStatus>}
    <View style={styles.actions}>
      <Button
        testID="native-auth-google"
        disabled={!login.isAvailable || savedBusy}
        isLoading={busy}
        onPress={() => void start()}
        renderIcon={() => <GoogleMark />}
        style={styles.primary}
      >{isSignUp ? copy.signUpWithGoogle : copy.signInWithGoogle}</Button>
      {!busy && login.isCredentialAvailable && (nativeUnavailable || cancelled || login.status === "error") &&
        <Button variant="outline" disabled={savedBusy} onPress={() => void start(true)}>{copy.native.continueInBrowser}</Button>}
      {busy && <>
        <AuthStatus center>{login.status === "exchanging" ? copy.native.finishing : copy.native.connecting}</AuthStatus>
        <Button variant="ghost" onPress={() => { ++run.current; login.cancel(); setCancelled(true); }}>{copy.native.cancel}</Button>
      </>}
    </View>
    {!busy && !savedBusy && <View style={styles.footer}>
      <AuthStatus reference>{isSignUp ? copy.alreadyHaveAccount : copy.noAccount}</AuthStatus>
      <Button accessibilityRole="link" variant="link" style={styles.link} onPress={() => router.replace(otherEntry)}>
        {isSignUp ? copy.signIn : copy.signUp}
      </Button>
    </View>}
  </AuthPage>;
}

const styles = StyleSheet.create({
  actions: { marginTop: 8, gap: 8 },
  primary: { height: 44 },
  footer: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", columnGap: 4 },
  link: { minHeight: 44, paddingHorizontal: 0 },
});
