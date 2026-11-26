import { useFocusEffect, useLocalSearchParams, useNavigation, useRoute, useRouter } from "expo-router";
import { openBrowserAsync } from "expo-web-browser";
import { useCallback, useState } from "react";
import { useNativeUiLocale } from "../auth/use-account-context";
import { AuthPage, AuthStatus } from "../auth/auth-page";
import { Button } from "../components/Button";
import { productLocation } from "./product-location";
import { publicWebsiteUrl, websiteIntake } from "./public-website";
import { createWebsiteHandoff, type WebsiteHandoffStatus } from "./website-handoff";

function WebsiteHandoff({ url, link }: { url: string | null; link?: string }) {
  const router = useRouter();
  const navigation = useNavigation();
  const locale = useNativeUiLocale();
  const [status, setStatus] = useState<WebsiteHandoffStatus>(url ? "opening" : "expired");
  const [handoff] = useState(() => createWebsiteHandoff({
    resolve: () => link === undefined ? url : websiteIntake.resolve(link),
    open: openBrowserAsync,
    isFocused: () => navigation.isFocused(),
    release: () => websiteIntake.release(link),
    leave: () => { if (router.canGoBack()) router.back(); else router.replace("/"); },
    setStatus,
  }));
  useFocusEffect(useCallback(() => { void handoff.focus(); }, [handoff]));
  const en = locale === "en";
  return <AuthPage title={en ? "Zyx Academy website" : "Situs Zyx Academy"}>
    {status === "expired" ? <AuthStatus error>{en ? "Reopen the original link." : "Buka kembali tautan asal."}</AuthStatus>
      : status === "failed" ? <AuthStatus error>{en ? "Could not open the browser." : "Browser tidak dapat dibuka."}</AuthStatus>
      : <AuthStatus busy>{en ? "Opening browser…" : "Membuka browser…"}</AuthStatus>}
    {status === "failed" && <Button testID="website-handoff-retry" onPress={() => void handoff.retry()}>{en ? "Try again" : "Coba lagi"}</Button>}
    <Button testID="website-handoff-back" variant="outline" onPress={handoff.back}>{en ? "Back" : "Kembali"}</Button>
  </AuthPage>;
}

export function WebsiteIntentRoute() {
  const { link } = useLocalSearchParams<{ link?: string }>();
  return <WebsiteHandoff key={link} url={websiteIntake.resolve(link)} link={link} />;
}

export function publicWebRoute(pattern: string) {
  return function PublicWebRoute() {
    const local = useLocalSearchParams();
    const route = useRoute();
    const path = productLocation(pattern, { ...local, ...route.params, "#": local["#"] });
    const url = path && publicWebsiteUrl(path);
    return <WebsiteHandoff key={url} url={url} />;
  };
}
