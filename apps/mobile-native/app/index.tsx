import { Redirect } from "expo-router";
import { productRoute } from "../routing/ProductRoute";

const PublicLanding = productRoute("/", "public");
import { useNetworkState } from "expo-network";
import { deviceIsOffline } from "../offline/reading-access";
import { ActivityIndicator } from "react-native";
import { AuthContinuation } from "../auth/auth-continuation";
import { authLocale } from "../auth/auth-copy";
import { useNativeSession } from "../auth/session-provider";

export default function InternalAppEntry() {
  const { state } = useNativeSession();
  const network = useNetworkState();
  if (process.env.EXPO_PUBLIC_PARITY_WEBVIEW === "1" || process.env.EXPO_PUBLIC_PARITY_CAPTURE_NAVIGATION === "1") {
    return <Redirect href="/gallery/separator" />;
  }
  if (state.status === "unavailable" && state.offlineIdentity) {
    if (!network.type) return <ActivityIndicator />;
    if (deviceIsOffline(network)) return <Redirect href="/offline" />;
  }
  if (state.status === "loading") return <ActivityIndicator />;
  if (state.status === "signed-in") return <AuthContinuation fallbackLocale={authLocale()} />;
  return <PublicLanding />;
}
