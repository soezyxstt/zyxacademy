import { Redirect } from "expo-router";
import { useNetworkState } from "expo-network";
import { deviceIsOffline } from "../offline/reading-access";
import { ActivityIndicator } from "react-native";
import { AuthContinuation } from "../auth/auth-continuation";
import { authLocale } from "../auth/auth-copy";
import { useNativeSession } from "../auth/session-provider";

export default function InternalAppEntry() {
  const { state, loginIntent } = useNativeSession();
  const network = useNetworkState();
  if (state.status === "unavailable" && state.offlineIdentity) {
    if (!network.type) return <ActivityIndicator />;
    if (deviceIsOffline(network)) return <Redirect href="/offline" />;
  }
  if (state.status === "loading") return <ActivityIndicator />;
  if (state.status === "signed-in" && loginIntent) return <AuthContinuation fallbackLocale={authLocale()} />;
  return <Redirect href="/gallery/separator" />;
}
