import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator } from "react-native";
import { useNativeBrowserLogin } from "../../auth/browser-login";
import { useNativeSession } from "../../auth/session-provider";

export default function NativeLoginCallback() {
  const { state } = useNativeSession();
  const { completePending } = useNativeBrowserLogin();
  const [finished, setFinished] = useState(false);
  useEffect(() => {
    if (state.status !== "signed-out") return;
    let active = true;
    const finish = () => { if (active) setFinished(true); };
    void completePending().then(finish, finish);
    return () => { active = false; };
  }, [completePending, state.status]);
  if (finished || (state.status !== "signed-out" && state.status !== "loading")) {
    return <Redirect href="/internal/session" />;
  }
  return <ActivityIndicator accessibilityLabel="Menyelesaikan masuk" />;
}
