import { useFocusEffect, useLocalSearchParams, useNavigation, useRoute, useRouter } from "expo-router";
import { openBrowserAsync } from "expo-web-browser";
import { useCallback, useRef, useState } from "react";
import { useNativeUiLocale } from "../auth/use-account-context";
import { AuthPage, AuthStatus } from "../auth/auth-page";
import { Button } from "../components/Button";
import { productLocation } from "./product-location";
import { publicWebsiteUrl, websiteIntake } from "./public-website";

function WebsiteHandoff({ url, link }: { url: string | null; link?: string }) {
  const router = useRouter();
  const navigation = useNavigation();
  const locale = useNativeUiLocale();
  const opening = useRef(false);
  const attempted = useRef(false);
  const completed = useRef(false);
  const [failed, setFailed] = useState(false);
  const leave = useCallback(() => {
    websiteIntake.release(link);
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [link, router]);
  const open = useCallback(async () => {
    if (opening.current || !url || !navigation.isFocused()) return;
    opening.current = true;
    setFailed(false);
    try {
      await openBrowserAsync(url);
      completed.current = true;
      if (navigation.isFocused()) leave();
    } catch {
      if (navigation.isFocused()) setFailed(true);
    } finally {
      opening.current = false;
    }
  }, [leave, navigation, url]);
  useFocusEffect(useCallback(() => {
    if (completed.current) { leave(); return; }
    if (attempted.current) return;
    attempted.current = true;
    void open();
  }, [leave, open]));
  const en = locale === "en";
  return <AuthPage title={en ? "Zyx Academy website" : "Situs Zyx Academy"}>
    {!url ? <AuthStatus error>{en ? "Reopen the original link." : "Buka kembali tautan asal."}</AuthStatus>
      : failed ? <AuthStatus error>{en ? "Could not open the browser." : "Browser tidak dapat dibuka."}</AuthStatus>
      : <AuthStatus busy>{en ? "Opening browser…" : "Membuka browser…"}</AuthStatus>}
    {failed && url && <Button onPress={() => void open()}>{en ? "Try again" : "Coba lagi"}</Button>}
    <Button variant="outline" onPress={leave}>{en ? "Back" : "Kembali"}</Button>
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
