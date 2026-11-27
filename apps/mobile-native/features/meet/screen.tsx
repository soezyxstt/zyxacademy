import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, useColorScheme } from "react-native";
import { nativeColors } from "../../../../packages/design-tokens/native-colors";
import en from "../../../../messages/en/marketing.json";
import id from "../../../../messages/id/marketing.json";
import { Button } from "../../components/Button";
import { browserDestination } from "../../routing/browser-destination";
import { nativeTypography } from "../../typography";
import { NativeCompactShell, NativeStatusPanel } from "../shared-ui/layout";
import type { PublicMeeting } from "./client";
import { MeetingUnavailable } from "./unavailable";

const copy = {
  id: {
    back: "Kembali", loading: "Memeriksa tautan meeting", join: "Gabung Google Meet",
    error: "Tautan meeting gagal diperiksa", openError: "Browser gagal dibuka", retry: "Coba lagi", browser: "Buka di browser",
  },
  en: {
    back: "Back", loading: "Checking the meeting link", join: "Join Google Meet",
    error: "Could not check the meeting link", openError: "Could not open the browser", retry: "Try again", browser: "Open in browser",
  },
};

export function PublicMeetingScreen({ slug, locale, home, back, lookup, openBrowser, insideSafeArea }: {
  slug: string | undefined;
  locale: "id" | "en";
  home(): void;
  back(): void;
  lookup(slug: string, signal: AbortSignal): Promise<PublicMeeting>;
  openBrowser(url: string): Promise<unknown>;
  insideSafeArea?: boolean;
}) {
  const strings = copy[locale];
  const marketing = locale === "id" ? id.public : en.public;
  const colors = nativeColors[useColorScheme() === "dark" ? "dark" : "light"];
  const url = browserDestination("meet", { slug });
  const [attempt, setAttempt] = useState(0);
  const [meeting, setMeeting] = useState<PublicMeeting | null>(null);
  const opening = useRef(false);
  const [openStatus, setOpenStatus] = useState<"idle" | "opening" | "failed">("idle");

  useEffect(() => {
    if (!slug || !url) return;
    const request = new AbortController();
    void lookup(slug, request.signal).then(value => {
      if (!request.signal.aborted) setMeeting(value);
    });
    return () => request.abort();
  }, [slug, url, attempt, lookup]);

  const open = async () => {
    if (!url || opening.current) return;
    opening.current = true;
    setOpenStatus("opening");
    try {
      // The canonical web route rechecks the link before redirecting to Google.
      await openBrowser(url);
      setOpenStatus("idle");
    } catch {
      setOpenStatus("failed");
    } finally {
      opening.current = false;
    }
  };

  if (!url || meeting?.status === "unavailable") {
    return <MeetingUnavailable title={marketing.meetNotFound} description={marketing.meetUnavailable}
      home={marketing.home} onHome={home} insideSafeArea={insideSafeArea} />;
  }
  return <NativeCompactShell navigationTitle="Google Meet" back={{ label: strings.back, onPress: back }}
    edges={insideSafeArea ? [] : undefined}>
    <ScrollView contentContainerStyle={styles.content}>
      {!meeting ? (
        <ActivityIndicator accessible accessibilityRole="progressbar" accessibilityLabel={strings.loading} color={colors.primary} />
      ) : meeting.status === "error" ? (
        <NativeStatusPanel title={strings.error} tone="error" action={{ id: "retry", label: strings.retry }}
          onAction={() => { setMeeting(null); setAttempt(value => value + 1); }} />
      ) : (
        <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>{meeting.title}</Text>
      )}
      {openStatus === "failed" && <NativeStatusPanel title={strings.openError} tone="error" />}
      {meeting && (
        <Button variant={meeting.status === "error" ? "outline" : "default"} isLoading={openStatus === "opening"} testID="meeting-open" onPress={() => void open()}>
          {meeting.status === "available" ? strings.join : strings.browser}
        </Button>
      )}
    </ScrollView>
  </NativeCompactShell>;
}

const styles = StyleSheet.create({
  content: { alignItems: "flex-start", flexGrow: 1, justifyContent: "center", gap: 12, paddingVertical: 16 },
  title: { ...nativeTypography.headingBold, fontSize: 24, lineHeight: 30 },
});
