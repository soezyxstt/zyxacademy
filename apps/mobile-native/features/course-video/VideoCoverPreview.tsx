import { useEvent } from "expo";
import { useVideoPlayer, VideoView, type VideoPlayer } from "expo-video";
import { useEffect, type RefObject } from "react";
import { View } from "react-native";
import { Action, Ink, layout } from "../academic/courses/ui";

export function VideoCoverPreview({ uri, handle, locale, disabled, select, selected }: {
  uri: string; handle: RefObject<VideoPlayer | null>; locale: "id" | "en"; disabled: boolean;
  select(seconds: number): void; selected?: number;
}) {
  const en = locale === "en";
  const player = useVideoPlayer({ uri, useCaching: false }, instance => { instance.muted = true; instance.staysActiveInBackground = false; });
  const { status } = useEvent(player, "statusChange", { status: player.status });
  useEffect(() => {
    handle.current = player;
    return () => { if (handle.current === player) handle.current = null; };
  }, [player, handle]);
  const duration = player.duration;
  function choose(time: number) {
    if (disabled || !Number.isFinite(time) || duration <= 0) return;
    player.pause();
    const second = Math.max(0, Math.min(time, duration - 0.05));
    player.currentTime = second;
    select(second);
  }
  if (status === "error") return <Ink kind="meta">{en ? "Video preview unavailable." : "Pratinjau video tidak tersedia."}</Ink>;
  return <View style={layout.group}>
    <VideoView player={player} nativeControls contentFit="contain" style={{ width: "100%", aspectRatio: 16 / 9 }} />
    {duration > 0 && Number.isFinite(duration) && <>
      <Ink kind="meta">{en ? "Duration" : "Durasi"} {Math.round(duration)} {en ? "seconds" : "detik"}</Ink>
      <View style={layout.row}>
        {[0.15, 0.5, 0.8].map(ratio => <Action key={ratio} label={(en ? "Cover at " : "Sampul pada ") + Math.round(duration * ratio) + " s"}
          disabled={disabled} onPress={() => choose(duration * ratio)} />)}
        <Action label={en ? "Use current frame" : "Gunakan cuplikan saat ini"} disabled={disabled} onPress={() => choose(player.currentTime)} />
      </View>
      {selected !== undefined && <Ink kind="meta">{en ? "Cover at " : "Cuplikan sampul pada "}{selected.toFixed(1)} s</Ink>}
    </>}
  </View>;
}
