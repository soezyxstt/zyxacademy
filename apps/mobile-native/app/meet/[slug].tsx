import { useLocalSearchParams, useRouter, useSitemap, type Href } from "expo-router";
import { fetch } from "expo/fetch";
import { openBrowserAsync } from "expo-web-browser";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, useColorScheme } from "react-native";

import { nativeColors } from "../../../../packages/design-tokens/native-colors";
import { resolveNativeLoginReturn } from "../../auth/login-intent";
import { useNativeAccountContext, useNativeUiLocale } from "../../auth/use-account-context";
import { Button } from "../../components/Button";
import { loadPublicMeeting, type PublicMeeting } from "../../features/meet/client";
import { NativeCompactShell, NativeStatusPanel } from "../../features/shared-ui/layout";
import { browserDestination } from "../../routing/browser-destination";
import { nativeTypography } from "../../typography";

const copy = {
  id: {
    back: "Kembali", home: "Kembali ke beranda", loading: "Memeriksa tautan meeting", join: "Gabung Google Meet",
    unavailable: "Tautan meeting tidak ditemukan", checkLink: "Periksa kembali tautan yang dikirim atau hubungi admin.",
    error: "Tautan meeting gagal diperiksa", openError: "Browser gagal dibuka", retry: "Coba lagi", browser: "Buka di browser",
  },
  en: {
    back: "Back", home: "Back to home", loading: "Checking the meeting link", join: "Join Google Meet",
    unavailable: "Meeting link not found", checkLink: "Check the link you received or contact an administrator.",
    error: "Could not check the meeting link", openError: "Could not open the browser", retry: "Try again", browser: "Open in browser",
  },
};

function Meeting({ slug }: { slug: string | undefined }) {
  const router = useRouter();
  const sitemap = useSitemap();
  const { context } = useNativeAccountContext();
  const strings = copy[useNativeUiLocale()];
  const colors = nativeColors[useColorScheme() === "dark" ? "dark" : "light"];
  const url = browserDestination("meet", { slug });
  const [attempt, setAttempt] = useState(0);
  const [meeting, setMeeting] = useState<PublicMeeting | null>(null);
  const opening = useRef(false);
  const [openStatus, setOpenStatus] = useState<"idle" | "opening" | "failed">("idle");

  useEffect(() => {
    if (!slug || !url) return;
    const request = new AbortController();
    void loadPublicMeeting(slug, request.signal, fetch).then(value => {
      if (!request.signal.aborted) setMeeting(value);
    });
    return () => request.abort();
  }, [slug, url, attempt]);

  const home = () => {
    const dashboard = context ? resolveNativeLoginReturn(undefined, context, sitemap).dashboard : null;
    router.replace((dashboard ?? "/") as Href);
  };
  const open = async () => {
    if (!url || opening.current) return;
    opening.current = true;
    setOpenStatus("opening");
    try {
      // The canonical web route rechecks the link before redirecting to Google.
      await openBrowserAsync(url);
      setOpenStatus("idle");
    } catch {
      setOpenStatus("failed");
    } finally {
      opening.current = false;
    }
  };

  return <NativeCompactShell navigationTitle="Google Meet" back={{
    label: strings.back, onPress: () => router.canGoBack() ? router.back() : home(),
  }}>
    <ScrollView contentContainerStyle={styles.content}>
      {!url || meeting?.status === "unavailable" ? (
        <NativeStatusPanel title={strings.unavailable} message={strings.checkLink}
          action={{ id: "home", label: strings.home }} onAction={home} />
      ) : !meeting ? (
        <ActivityIndicator accessible accessibilityRole="progressbar" accessibilityLabel={strings.loading} color={colors.primary} />
      ) : meeting.status === "error" ? (
        <NativeStatusPanel title={strings.error} tone="error" action={{ id: "retry", label: strings.retry }}
          onAction={() => { setMeeting(null); setAttempt(value => value + 1); }} />
      ) : (
        <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>{meeting.title}</Text>
      )}
      {openStatus === "failed" && <NativeStatusPanel title={strings.openError} tone="error" />}
      {url && meeting && meeting.status !== "unavailable" && (
        <Button variant={meeting.status === "error" ? "outline" : "default"} isLoading={openStatus === "opening"} onPress={() => void open()}>
          {meeting.status === "available" ? strings.join : strings.browser}
        </Button>
      )}
    </ScrollView>
  </NativeCompactShell>;
}

export default function MeetRoute() {
  const { slug } = useLocalSearchParams();
  const identifier = typeof slug === "string" ? slug : undefined;
  return <Meeting key={identifier} slug={identifier} />;
}

const styles = StyleSheet.create({
  content: { alignItems: "flex-start", flexGrow: 1, justifyContent: "center", gap: 12, paddingVertical: 16 },
  title: { ...nativeTypography.headingBold, fontSize: 24, lineHeight: 30 },
});
