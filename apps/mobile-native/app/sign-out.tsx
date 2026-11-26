import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View, useColorScheme } from "react-native";

import { nativeColors } from "../../../packages/design-tokens/native-colors";
import { authCopy, authLocale } from "../auth/auth-copy";
import { AuthPage, AuthStatus } from "../auth/auth-page";
import { useNativeBrowserLogin } from "../auth/browser-login";
import { clearAndroidGoogleCredentialState } from "../auth/google-credential-login";
import { authEntryHref } from "../auth/login-intent";
import { useNativeSession } from "../auth/session-provider";
import { useNativeAccountContext } from "../auth/use-account-context";
import { Button } from "../components/Button";

export default function SignOutRoute() {
  const params = useLocalSearchParams<{ locale?: string | string[] }>();
  const router = useRouter();
  const { state, logout } = useNativeSession();
  const { context } = useNativeAccountContext();
  const { cancel } = useNativeBrowserLogin();
  const started = useRef(false);
  const [locale] = useState(() => authLocale(params.locale ?? context?.locale));
  const copy = authCopy[locale].signOut;
  const colors = nativeColors[useColorScheme() === "dark" ? "dark" : "light"];
  const done = state.status === "signed-out";
  const error = state.status === "logout-pending" && state.retry;

  useEffect(() => {
    if (started.current || state.status === "loading") return;
    started.current = true;
    cancel();
    clearAndroidGoogleCredentialState();
    if (state.status !== "signed-out" && (state.status !== "logout-pending" || state.retry)) void logout();
  }, [cancel, logout, state]);

  return <AuthPage title={copy.title} compact>
    <AuthStatus error={error} body>{done ? copy.done : error ? copy.error : copy.pending}</AuthStatus>
    {error && <Button style={styles.retry} onPress={() => void logout()}>{copy.retry}</Button>}
    <View style={[styles.actions, { borderTopColor: colors.border }]}>
      <Button accessibilityRole="link" variant="ghost" style={styles.link} onPress={() => router.replace("/")}>{copy.home}</Button>
      <Button
        accessibilityRole="link"
        variant="outline"
        disabled={!done}
        style={styles.link}
        onPress={() => router.replace(authEntryHref({ entry: "sign-in", locale }))}
      >{copy.signIn}</Button>
    </View>
  </AuthPage>;
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, borderTopWidth: 1, paddingTop: 8 },
  retry: { alignSelf: "flex-start", height: 44 },
  link: { height: 44 },
});
