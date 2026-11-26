import { useRouter } from "expo-router";
import { useEffect, useState } from "react";

import { AuthContinuation, AuthSessionStatus } from "../../auth/auth-continuation";
import { authCopy, authLocale } from "../../auth/auth-copy";
import { AuthPage, AuthStatus } from "../../auth/auth-page";
import { useNativeBrowserLogin } from "../../auth/browser-login";
import { authEntryHref, type NativeLoginIntent } from "../../auth/login-intent";
import { savedAccountError } from "../../auth/saved-account-model";
import { useNativeSession } from "../../auth/session-provider";
import { useNativeUiLocale } from "../../auth/use-account-context";
import { Button } from "../../components/Button";

export default function NativeLoginCallback() {
  const router = useRouter();
  const { state } = useNativeSession();
  const uiLocale = useNativeUiLocale();
  const { completePending, getRecoveryIntent, getRecoveryScope, getBrowserFailure } = useNativeBrowserLogin();
  const [result, setResult] = useState<{ accepted: boolean; intent?: NativeLoginIntent; additional: boolean; failure?: string }>();

  useEffect(() => {
    if (state.status !== "signed-out" && state.status !== "signed-in") return;
    let mounted = true;
    void completePending().then(accepted => {
      if (mounted) setResult({
        accepted, intent: getRecoveryIntent(), additional: Boolean(getRecoveryScope()), failure: getBrowserFailure(),
      });
    });
    return () => { mounted = false; };
  }, [completePending, getBrowserFailure, getRecoveryIntent, getRecoveryScope, state.status]);

  const locale = state.status === "signed-in" ? uiLocale : result?.intent?.locale ?? authLocale();
  if (state.status !== "signed-out" && state.status !== "signed-in") return <AuthSessionStatus locale={locale} />;
  const copy = authCopy[locale];

  if (!result || (state.status === "signed-out" && result.accepted)) {
    return <AuthPage title={copy.native.finishing}><AuthStatus busy center>{copy.native.preparing}</AuthStatus></AuthPage>;
  }
  if (state.status === "signed-in") {
    if (result.accepted || !result.additional) return <AuthContinuation fallbackLocale={locale} />;
    const error = savedAccountError(locale, result.failure, "add");
    if (!error) return <AuthContinuation fallbackLocale={locale} />;
    return <AuthPage title={copy.native.failed}>
      <AuthStatus error>{error}</AuthStatus>
      <Button onPress={() => router.replace("/")}>{copy.native.dashboard}</Button>
    </AuthPage>;
  }
  return <AuthPage title={copy.native.failed}>
    <AuthStatus error>{copy.native.expired}</AuthStatus>
    <Button onPress={() => router.replace(authEntryHref(result.intent ?? { entry: "sign-in", locale }))}>
      {copy.native.retry}
    </Button>
  </AuthPage>;
}
