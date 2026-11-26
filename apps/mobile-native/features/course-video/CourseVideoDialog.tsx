import Constants from "expo-constants";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCallback, useEffect, useState, type ComponentRef, type RefObject } from "react";
import { ActivityIndicator, Linking, Platform, StyleSheet, Text, View, useColorScheme } from "react-native";
import { WebView } from "react-native-webview";
import { courseVideoSource, type CourseVideoSource } from "../../../../packages/course-video/source";
import { nativeColors } from "../../../../packages/design-tokens/native-colors";
import { useNativeSession } from "../../auth/session-provider";
import { Button } from "../../components/Button";
import { scopedFiles } from "../../device/files";
import { nativeTypography } from "../../typography";
import { SharedDialog } from "../shared-ui/overlays";

type Props = {
  title: string;
  locale: string;
  theme?: "light" | "dark";
  origin: string;
  load(signal: AbortSignal): Promise<{ url: unknown; fallbackUrl?: unknown }>;
  close(): void;
  returnFocusRef?: RefObject<ComponentRef<typeof View> | null>;
};

function VideoSurface({ uri, title, fail }: { uri: string; title: string; fail(): void }) {
  const [rendered, setRendered] = useState(false);
  const player = useVideoPlayer({ uri, useCaching: false }, p => {
    p.staysActiveInBackground = false;
    if (Platform.OS === "ios") p.allowsExternalPlayback = false;
    p.play();
  });
  const { status } = useEvent(player, "statusChange", { status: player.status });
  useEffect(() => { if (status === "error") fail(); }, [fail, status]);
  return <VideoView testID={rendered ? "course-video-frame" : "course-video-buffering"}
    onFirstFrameRender={() => setRendered(true)} accessibilityLabel={title} style={styles.video} contentFit="contain" player={player} nativeControls />;
}

function YouTubeSurface({ id, title, fail }: { id: string; title: string; fail(): void }) {
  const appId = Platform.OS === "ios" ? Constants.expoConfig?.ios?.bundleIdentifier : Constants.expoConfig?.android?.package;
  const uri = `https://www.youtube.com/embed/${id}?playsinline=1`;
  return <WebView accessibilityLabel={title} style={styles.video} containerStyle={styles.embed}
    source={{ uri, headers: appId ? { Referer: `https://${appId}/` } : undefined }}
    originWhitelist={["*"]} onShouldStartLoadWithRequest={request => {
      if (request.isTopFrame === false) return true;
      return request.url === "about:blank" || request.url.split(/[?#]/, 1)[0] === uri.split("?", 1)[0];
    }} setSupportMultipleWindows={false} sharedCookiesEnabled={false} thirdPartyCookiesEnabled={false} incognito
    allowFileAccess={false} mixedContentMode="never" allowsInlineMediaPlayback allowsFullscreenVideo
    onError={fail} onHttpError={event => { if (event.nativeEvent.url.split("?", 1)[0] === uri.split("?", 1)[0]) fail(); }} />;
}

type ActiveSource = Exclude<CourseVideoSource, { kind: "storage" }>;

export function CourseVideoDialog({ title, locale, theme, origin, load, close, returnFocusRef }: Props) {
  const { transport } = useNativeSession();
  const systemTheme = useColorScheme();
  const colors = nativeColors[theme ?? systemTheme ?? "light"];
  const en = /^en(?:-|$)/i.test(locale);
  const [attempt, setAttempt] = useState(0);
  const [preferFallback, setPreferFallback] = useState(false);
  const [canFallback, setCanFallback] = useState(false);
  const [source, setSource] = useState<ActiveSource | null>(null);
  const [failed, setFailed] = useState(false);
  const fail = useCallback(() => setFailed(true), []);
  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    setSource(null);
    setCanFallback(false);
    void (async () => {
      const result = await load(controller.signal);
      if (controller.signal.aborted) return;
      const primary = courseVideoSource(result.url, origin);
      const fallback = courseVideoSource(result.fallbackUrl, origin);
      setCanFallback(Boolean(fallback && result.url !== result.fallbackUrl && !preferFallback));
      const next = (preferFallback ? fallback : primary) ?? fallback ?? primary;
      if (!next) throw new Error();
      if (next.kind === "storage") {
        if (!transport?.isCurrent() || transport.scope.origin !== origin) throw new Error();
        const uri = await scopedFiles.prepareCourseVideo(transport, next.path, controller.signal);
        if (!controller.signal.aborted) setSource({ kind: "stream", uri });
      } else setSource(next);
    })().catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [attempt, load, origin, preferFallback, transport]);

  return <SharedDialog open title={title} onDismiss={close} closeLabel={en ? "Close" : "Tutup"}
    theme={theme} returnFocusRef={returnFocusRef} testID="course-video-player">
    {failed ? <View style={styles.error}>
      <Text accessibilityRole="alert" style={[nativeTypography.bodyRegular, { color: colors.foreground }]}>
        {en ? "Could not play this video." : "Video tidak dapat diputar."}
      </Text>
      <Button variant="outline" theme={theme} onPress={() => setAttempt(n => n + 1)}>{en ? "Try again" : "Coba lagi"}</Button>
      {canFallback && <Button variant="outline" theme={theme} onPress={() => setPreferFallback(true)}>
        {en ? "Use alternate source" : "Gunakan sumber cadangan"}
      </Button>}
    </View> : !source ? <ActivityIndicator accessibilityLabel={en ? "Loading video" : "Memuat video"} color={colors.primary} /> :
      source.kind === "youtube" ?
        <YouTubeSurface id={source.id} title={title} fail={fail} /> :
      <VideoSurface uri={source.uri} title={title} fail={fail} />}
    {source?.kind === "youtube" && <Button variant="outline" theme={theme}
          onPress={() => void Linking.openURL(`https://www.youtube.com/watch?v=${source.id}`).catch(fail)}>
          {en ? "Watch on YouTube" : "Tonton di YouTube"}
        </Button>}
  </SharedDialog>;
}

const styles = StyleSheet.create({
  video: { width: "100%", aspectRatio: 16 / 9, minHeight: 200, backgroundColor: "black" },
  embed: { flex: 0, width: "100%", aspectRatio: 16 / 9, minHeight: 200 },
  error: { gap: 8 },
});
