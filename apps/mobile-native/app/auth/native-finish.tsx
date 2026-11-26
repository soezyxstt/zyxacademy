import { useRouter } from "expo-router";
import { useEffect, useState } from "react";

import { AuthContinuation, AuthSessionStatus } from "../../auth/auth-continuation";
import { authCopy, authLocale } from "../../auth/auth-copy";
import { AuthPage, AuthStatus } from "../../auth/auth-page";
import { useNativeBrowserLogin } from "../../auth/browser-login";
import { authEntryHref, type NativeLoginIntent } from "../../auth/login-intent";
import { useNativeSession } from "../../auth/session-provider";
import { Button } from "../../components/Button";

export default function NativeLoginCallback() {
  const router = useRouter();
  const { state } = useNativeSession();
  const { completePending, getRecoveryIntent } = useNativeBrowserLogin();
  const [failed, setFailed] = useState<{ intent: NativeLoginIntent | undefined } | null>(null);

  useEffect(() => {
    if (state.status !== "signed-out") return;
    let mounted = true;
    void completePending().then(accepted => {
      if (!accepted && mounted) setFailed({ intent: getRecoveryIntent() });
    });
    return () => { mounted = false; };
  }, [completePending, getRecoveryIntent, state.status]);

  const locale = failed?.intent?.locale ?? authLocale();
  if (state.status === "signed-in") return <AuthContinuation fallbackLocale={locale} />;
  if (state.status !== "signed-out") return <AuthSessionStatus locale={locale} />;
  const copy = authCopy[locale];

  if (!failed) {
    return <AuthPage title={copy.native.finishing}><AuthStatus busy center>{copy.native.preparing}</AuthStatus></AuthPage>;
  }
  return <AuthPage title={copy.native.failed}>
    <AuthStatus error>{copy.native.expired}</AuthStatus>
    <Button onPress={() => router.replace(authEntryHref(failed.intent ?? { entry: "sign-in", locale }))}>
      {copy.native.retry}
    </Button>
  </AuthPage>;
}
