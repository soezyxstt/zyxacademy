import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState, useSyncExternalStore } from "react";
import { AppState, Platform, ScrollView, StyleSheet, Text, useColorScheme, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { nativeColors } from "../../../../packages/design-tokens/native-colors";
import { useNativeSession } from "../../auth/session-provider";
import { Button } from "../../components/Button";
import { Slider } from "../../components/Slider";
import { createExpoAudioPlayback, localAudioAvailable } from "../../device/audio";
import { audioCheckSources } from "../../device/audio-source";
import { nativeTypography } from "../../typography";

const labels = {
  idle: "Siap diputar",
  starting: "Menyiapkan audio…",
  playing: "Sedang diputar",
  paused: "Dijeda",
  interrupted: "Pemutaran terputus. Tekan Putar untuk lanjut.",
  ended: "Pemutaran selesai",
  error: "Audio belum dapat diputar. Coba lagi.",
};

function formatTime(seconds: number) {
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export default function InternalAudioRoute() {
  const router = useRouter();
  const { state, transport, revalidating, refresh } = useNativeSession();
  const [audio] = useState(createExpoAudioPlayback);
  const playback = useSyncExternalStore(audio.subscribe, audio.getSnapshot, audio.getSnapshot);
  const colors = nativeColors[useColorScheme() === "dark" ? "dark" : "light"];
  const pendingSession = state.status === "loading" || state.status === "logout-pending";
  const canAttach = localAudioAvailable && !pendingSession;

  useFocusEffect(useCallback(() => {
    if (!canAttach) return;
    const detach = audio.attach(transport?.signal);
    let appActive = AppState.currentState === "active";
    let windowFocused = true;
    const updateForeground = () => audio.setForeground(appActive && windowFocused);
    const appState = AppState.addEventListener("change", state => {
      appActive = state === "active";
      updateForeground();
    });
    const blur = Platform.OS === "android" ? AppState.addEventListener("blur", () => {
      windowFocused = false;
      updateForeground();
    }) : null;
    const focus = Platform.OS === "android" ? AppState.addEventListener("focus", () => {
      windowFocused = true;
      updateForeground();
    }) : null;
    updateForeground();
    return () => {
      appState.remove();
      blur?.remove();
      focus?.remove();
      detach();
    };
  }, [audio, canAttach, transport]));

  const disabled = !playback.active || revalidating;
  const stopping = playback.phase === "playing" || playback.phase === "starting";
  const seekDisabled = disabled || playback.phase === "starting" || playback.seeking;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }]}>Pemutaran audio</Text>
        {canAttach ? (
          <>
            <View style={styles.actions}>
              {(["low", "high"] as const).map(source => (
                <Button key={source} variant={playback.source === source ? "secondary" : "outline"}
                  accessibilityState={{ selected: playback.source === source }} disabled={disabled}
                  onPress={() => audio.select(source)}>
                  {audioCheckSources[source].label}
                </Button>
              ))}
            </View>
            <Slider key={playback.source} value={playback.position} max={playback.duration} step={0.1}
              disabled={seekDisabled} accessibilityLabel="Posisi audio" accessibilityValueText={formatTime}
              onValueCommit={position => void audio.seekTo(position)} />
            <Text style={[styles.metadata, { color: colors.mutedForeground }]}>
              {formatTime(playback.position)} / {formatTime(playback.duration)}
            </Text>
            <Text accessibilityLiveRegion="polite" style={[styles.body, { color: colors.foreground }]}>
              {labels[playback.phase]}
            </Text>
            <View style={styles.actions}>
              <Button disabled={disabled} onPress={stopping ? audio.pause : () => void audio.play()}>
                {playback.phase === "starting" ? "Batalkan" : playback.phase === "playing" ? "Jeda" : "Putar"}
              </Button>
              <Button variant="outline" disabled={seekDisabled || playback.position <= 0}
                onPress={() => void audio.seekBy(-3)}>Mundur 3 detik</Button>
              <Button variant="outline" disabled={seekDisabled || playback.position >= playback.duration}
                onPress={() => void audio.seekBy(3)}>Maju 3 detik</Button>
            </View>
          </>
        ) : (
          <>
            <Text accessibilityLiveRegion="polite" style={[styles.body, { color: colors.foreground }]}>
              {!localAudioAvailable ? "Pemutaran tersedia di Android dan iOS."
                : state.status === "loading" ? "Memeriksa sesi…"
                  : state.status === "logout-pending" && !state.retry ? "Sedang keluar…" : "Sesi belum tersedia."}
            </Text>
            {localAudioAvailable && state.status === "logout-pending" && state.retry &&
              <Button variant="outline" onPress={() => void refresh()}>Periksa kembali sesi</Button>}
          </>
        )}
        <Button variant="ghost" onPress={() => router.replace("/")}>Kembali ke galeri</Button>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flexGrow: 1, justifyContent: "center", gap: 12, padding: 20, width: "100%", maxWidth: 672, alignSelf: "center" },
  heading: { ...nativeTypography.headingBold, fontSize: 24 },
  body: { ...nativeTypography.bodyRegular, fontSize: 16, lineHeight: 24 },
  metadata: { ...nativeTypography.bodyRegular, fontSize: 12, fontVariant: ["tabular-nums"] },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
});
