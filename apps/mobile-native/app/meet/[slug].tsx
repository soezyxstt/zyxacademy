import { useLocalSearchParams, useRouter, useSitemap, type Href } from "expo-router";
import { fetch } from "expo/fetch";
import { openBrowserAsync } from "expo-web-browser";
import { resolveNativeLoginReturn } from "../../auth/login-intent";
import { useNativeAccountContext, useNativeUiLocale } from "../../auth/use-account-context";
import { loadPublicMeeting } from "../../features/meet/client";
import { PublicMeetingScreen } from "../../features/meet/screen";

const lookup = (slug: string, signal: AbortSignal) => loadPublicMeeting(slug, signal, fetch);

export default function MeetRoute() {
  const { slug } = useLocalSearchParams();
  const identifier = typeof slug === "string" ? slug : undefined;
  const router = useRouter();
  const sitemap = useSitemap();
  const { context } = useNativeAccountContext();
  const locale = useNativeUiLocale();
  const home = () => {
    const dashboard = context ? resolveNativeLoginReturn(undefined, context, sitemap).dashboard : null;
    router.replace((dashboard ?? "/") as Href);
  };
  return <PublicMeetingScreen key={identifier} slug={identifier} locale={locale} lookup={lookup} openBrowser={openBrowserAsync}
    home={home} back={() => router.canGoBack() ? router.back() : home()} />;
}
