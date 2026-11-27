import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { randomUUID } from "expo-crypto";
import { File, Paths } from "expo-file-system";
import { Platform } from "react-native";

import { createLocalAudioController, type LocalAudioPlayer } from "./audio-controller";
import { createAudioCheckWave, type AudioCheckSource } from "./audio-source";

export const localAudioAvailable = Platform.OS === "android" || Platform.OS === "ios";

function openLocalFile(source: AudioCheckSource): LocalAudioPlayer {
  const bytes = createAudioCheckWave(source);
  const file = new File(Paths.cache, `zyx-audio-check-${randomUUID()}.wav`);
  let created = false;
  let player: ReturnType<typeof createAudioPlayer> | undefined;

  const discard = () => {
    try {
      player?.pause();
    } catch { /* The native instance may already have closed. */ }
    try {
      player?.release();
    } catch { /* Still clear the generated file. */ }
    try {
      if (created && file.exists) file.delete();
    } catch { /* A reclaimed cache file needs no further cleanup. */ }
  };

  try {
    file.create();
    created = true;
    file.writeSync(bytes);
    if (!file.uri.startsWith("file:///") || !file.exists || file.size !== bytes.byteLength) {
      throw new Error("Berkas audio lokal belum siap.");
    }
    // The playback API receives only an app-generated file URI.
    const audio = createAudioPlayer({ uri: file.uri }, { updateInterval: 250, allowsExternalPlayback: false });
    player = audio;
    return {
      status: () => audio.currentStatus,
      subscribe(listener) {
        const subscription = audio.addListener("playbackStatusUpdate", listener);
        return () => subscription.remove();
      },
      play: () => audio.play(),
      seek: seconds => audio.seekTo(seconds, 0, 0),
      release: discard,
    };
  } catch (error) {
    discard();
    throw error;
  }
}

export function createExpoAudioPlayback() {
  return createLocalAudioController({
    configure: () => setAudioModeAsync({
      interruptionMode: "doNotMix",
      playsInSilentMode: true,
      allowsRecording: false,
      allowsBackgroundRecording: false,
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    }),
    open: openLocalFile,
  });
}
