import { Redirect } from "expo-router";
import { ActivityIndicator } from "react-native";
import { AuthContinuation } from "../auth/auth-continuation";
import { authLocale } from "../auth/auth-copy";
import { useNativeSession } from "../auth/session-provider";

export default function InternalAppEntry() {
  const { state, loginIntent } = useNativeSession();
  if (state.status === "loading") return <ActivityIndicator />;
  if (state.status === "signed-in" && loginIntent) return <AuthContinuation fallbackLocale={authLocale()} />;
  return <Redirect href="/gallery/separator" />;
}
