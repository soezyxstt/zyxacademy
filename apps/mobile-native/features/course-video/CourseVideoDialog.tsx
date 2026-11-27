import Constants from "expo-constants";
import { randomUUID } from "expo-crypto";
import { useIsFocused } from "expo-router";
import { useEvent, useEventListener } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCallback, useEffect, useRef, useState, type ComponentRef, type ReactNode, type RefObject } from "react";
import { ActivityIndicator, Linking, Platform, StyleSheet, Text, View, useColorScheme } from "react-native";
import { WebView } from "react-native-webview";
import { playbackCheckpoint } from "../../../../lib/video/playback-progress";
import { courseVideoSource, type CourseVideoSource } from "../../../../packages/course-video/source";
import { nativeColors } from "../../../../packages/design-tokens/native-colors";
import { useNativeSession } from "../../auth/session-provider";
import { Button } from "../../components/Button";
import { useProtectedInteraction } from "../../routing/protected-interaction";
import { scopedFiles } from "../../device/files";
import { nativeTypography } from "../../typography";
import { SharedDialog } from "../shared-ui/overlays";
import { buildYouTubePlaybackFrame, youtubePlaybackEvent } from "./youtube-playback";

type VideoPlayback = {
  startTime: number;
  checkpoint(time: number, duration?: number): void;
  ended(): void;
};

type Props = {
  title: string;
  locale: string;
  theme?: "light" | "dark";
  origin: string;
  load(signal: AbortSignal): Promise<{ url: unknown; fallbackUrl?: unknown }>;
  close(): void;
  playback?: VideoPlayback;
  controls?: ReactNode;
  returnFocusRef?: RefObject<ComponentRef<typeof View> | null>;
};

export function VideoSurface({ uri, title, fail, playback }: {
  uri: string; title: string; fail(): void; playback?: VideoPlayback;
}) {
  const [rendered, setRendered] = useState(false);
  const [coursePlayback, setCoursePlayback] = useState<"checkpoint" | "resumed">();
  const pendingSeek = useRef<{ time: number; expiresAt: number } | undefined>(undefined);
  const progress = useRef(playback);
  progress.current = playback;
  const ready = useRef(false);
  const done = useRef(false);
  const lastSave = useRef(0);
  const lastTime = useRef<{ time: number; duration?: number } | undefined>(undefined);
  const player = useVideoPlayer({ uri, useCaching: false }, p => {
    p.staysActiveInBackground = false;
    if (Platform.OS === "ios") p.allowsExternalPlayback = false;
    if (progress.current) p.timeUpdateEventInterval = 1;
    p.play();
  });
  const { status } = useEvent(player, "statusChange", { status: player.status });
  const checkpoint = useCallback((time?: number) => {
    if (!progress.current || !ready.current || done.current) return;
    if (typeof time === "number" && Number.isFinite(time)) {
      let duration: number | undefined;
      try { duration = player.duration; } catch { duration = lastTime.current?.duration; }
      lastTime.current = { time, duration };
    }
    if (lastTime.current) progress.current.checkpoint(lastTime.current.time, lastTime.current.duration);
  }, [player]);
  useEffect(() => {
    if (status === "error") { checkpoint(); fail(); return; }
    if (status !== "readyToPlay" || ready.current || !progress.current) return;
    ready.current = true;
    const start = progress.current.startTime;
    if (start > 0 && (player.duration <= 0 || start < player.duration)) {
      pendingSeek.current = { time: start, expiresAt: Date.now() + 3000 };
      player.currentTime = start;
      lastTime.current = { time: start, duration: player.duration };
    }
  }, [checkpoint, fail, player, status]);
  useEventListener(player, "timeUpdate", event => {
    if (!ready.current || done.current || !Number.isFinite(event.currentTime)) return;
    const now = Date.now();
    const seeking = pendingSeek.current;
    if (seeking) {
      if (event.currentTime >= seeking.time - 0.5) setCoursePlayback("resumed");
      else if (now < seeking.expiresAt) return;
      pendingSeek.current = undefined;
    }
    lastTime.current = { time: event.currentTime, duration: player.duration };
    if (now - lastSave.current >= 3_000) {
      lastSave.current = now;
      if (playbackCheckpoint(event.currentTime, player.duration, now)) setCoursePlayback(value => value ?? "checkpoint");
      checkpoint();
    }
  });
  useEventListener(player, "playingChange", event => {
    if (!event.isPlaying && ready.current) checkpoint(pendingSeek.current ? undefined : player.currentTime);
  });
  useEventListener(player, "playToEnd", () => {
    if (done.current) return;
    done.current = true;
    progress.current?.ended();
  });
  useEffect(() => () => checkpoint(), [checkpoint]);
  return <View collapsable={false} testID={coursePlayback ? `course-video-${coursePlayback}` : undefined}>
    <VideoView testID={rendered ? "course-video-frame" : "course-video-buffering"}
      onFirstFrameRender={() => setRendered(true)} accessibilityLabel={title} style={styles.video} contentFit="contain" player={player} nativeControls />
  </View>;
}

function YouTubeSurface({ id, title, fail, start = 0 }: { id: string; title: string; fail(): void; start?: number }) {
  const appId = Platform.OS === "ios" ? Constants.expoConfig?.ios?.bundleIdentifier : Constants.expoConfig?.android?.package;
  const uri = `https://www.youtube.com/embed/${id}?playsinline=1${start > 0 ? "&start=" + start : ""}`;
  return <WebView accessibilityLabel={title} style={styles.video} containerStyle={styles.embed}
    source={{ uri, headers: appId ? { Referer: `https://${appId}/` } : undefined }}
    originWhitelist={["*"]} onShouldStartLoadWithRequest={request => {
      if (request.isTopFrame === false) return true;
      return request.url === "about:blank" || request.url.split(/[?#]/, 1)[0] === uri.split("?", 1)[0];
    }} setSupportMultipleWindows={false} sharedCookiesEnabled={false} thirdPartyCookiesEnabled={false} incognito
    allowFileAccess={false} mixedContentMode="never" allowsInlineMediaPlayback allowsFullscreenVideo
    onError={fail} onHttpError={event => { if (event.nativeEvent.url.split("?", 1)[0] === uri.split("?", 1)[0]) fail(); }} />;
}

function TrackedYouTubeSurface({ id, title, fail, playback }: { id: string; title: string; fail(): void; playback: VideoPlayback }) {
  const appId = Platform.OS === "ios" ? Constants.expoConfig?.ios?.bundleIdentifier : Constants.expoConfig?.android?.package;
  const [nonce] = useState(randomUUID);
  const [frame] = useState(() => buildYouTubePlaybackFrame(id, `https://${appId ?? "com.zyx.academy.nativeparity"}`, playback.startTime, nonce));
  const [plain, setPlain] = useState(false);
  const lastTime = useRef(frame?.start ?? 0);
  const completed = useRef(false);
  if (!frame || plain) return <YouTubeSurface id={id} title={title} fail={fail} start={Math.max(0, Math.floor(lastTime.current))} />;
  return <WebView testID="course-youtube-playback" accessibilityLabel={title} style={styles.video} containerStyle={styles.embed}
    source={{ html: frame.html, baseUrl: frame.baseUrl }} originWhitelist={["*"]}
    onShouldStartLoadWithRequest={request => request.url === "about:blank" || request.url === frame.baseUrl ||
      (request.isTopFrame !== true && request.url.split(/[?#]/, 1)[0] === frame.embedUrl)}
    onMessage={event => {
      if (completed.current || event.nativeEvent.url !== frame.baseUrl) return;
      const message = youtubePlaybackEvent(event.nativeEvent.data, nonce);
      if (message?.type === "checkpoint") {
        lastTime.current = message.time;
        playback.checkpoint(message.time, message.duration);
      }
      if (message?.type === "failed") setPlain(true);
      if (message?.type === "ended") { completed.current = true; playback.ended(); }
    }}
    onError={() => setPlain(true)} mediaPlaybackRequiresUserAction={false} setSupportMultipleWindows={false}
    sharedCookiesEnabled={false} thirdPartyCookiesEnabled={false} allowFileAccess={false} allowFileAccessFromFileURLs={false}
    allowUniversalAccessFromFileURLs={false} domStorageEnabled={false} mixedContentMode="never" incognito
    allowsInlineMediaPlayback allowsFullscreenVideo />;
}

type ActiveSource = Exclude<CourseVideoSource, { kind: "storage" }>;

export function CourseVideoDialog({ title, locale, theme, origin, load, close, returnFocusRef, controls, playback }: Props) {
  const { transport } = useNativeSession();
  const focused = useIsFocused();
  const { suspended } = useProtectedInteraction();
  const [open, setOpen] = useState(true);
  const active = open && focused && !suspended;
  const systemTheme = useColorScheme();
  const colors = nativeColors[theme ?? systemTheme ?? "light"];
  const en = /^en(?:-|$)/i.test(locale);
  const [attempt, setAttempt] = useState(0);
  const [preferFallback, setPreferFallback] = useState(false);
  const [canFallback, setCanFallback] = useState(false);
  const [source, setSource] = useState<ActiveSource | null>(null);
  const [failed, setFailed] = useState(false);
  const lastPosition = useRef(playback?.startTime ?? 0);
  const tracker = playback ? {
    startTime: lastPosition.current,
    checkpoint(time: number, duration?: number) { lastPosition.current = time; playback.checkpoint(time, duration); },
    ended() { lastPosition.current = 0; playback.ended(); },
  } : undefined;
  const fail = useCallback(() => setFailed(true), []);
  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    setSource(null);
    setCanFallback(false);
    if (!active) return;
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
  }, [active, attempt, load, origin, preferFallback, transport]);

  return <SharedDialog open={open && focused} title={title} onDismiss={() => setOpen(false)} onAfterDismiss={close} closeLabel={en ? "Close" : "Tutup"}
    theme={theme} returnFocusRef={returnFocusRef} testID="course-video-player">
    {!active ? null : failed ? <View style={styles.error}>
      <Text accessibilityRole="alert" style={[nativeTypography.bodyRegular, { color: colors.foreground }]}>
        {en ? "Could not play this video." : "Video tidak dapat diputar."}
      </Text>
      <Button variant="outline" theme={theme} onPress={() => setAttempt(n => n + 1)}>{en ? "Try again" : "Coba lagi"}</Button>
      {canFallback && <Button variant="outline" theme={theme} onPress={() => setPreferFallback(true)}>
        {en ? "Use alternate source" : "Gunakan sumber cadangan"}
      </Button>}
    </View> : !source ? <ActivityIndicator accessibilityLabel={en ? "Loading video" : "Memuat video"} color={colors.primary} /> :
      source.kind === "youtube" ?
        tracker ? <TrackedYouTubeSurface id={source.id} title={title} fail={fail} playback={tracker} />
          : <YouTubeSurface id={source.id} title={title} fail={fail} /> :
      <VideoSurface key={source.uri} uri={source.uri} title={title} fail={fail} playback={tracker} />}
    {active && source?.kind === "youtube" && <Button variant="outline" theme={theme}
          onPress={() => void Linking.openURL(`https://www.youtube.com/watch?v=${source.id}`).catch(fail)}>
          {en ? "Watch on YouTube" : "Tonton di YouTube"}
        </Button>}
    {active ? controls : null}
  </SharedDialog>;
}

const styles = StyleSheet.create({
  video: { width: "100%", aspectRatio: 16 / 9, minHeight: 200, backgroundColor: "black" },
  embed: { flex: 0, width: "100%", aspectRatio: 16 / 9, minHeight: 200 },
  error: { gap: 8 },
});
