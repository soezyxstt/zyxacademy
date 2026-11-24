"use client";

import Image from "next/image";

import { useCallback, useEffect, useState, useRef } from "react";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";
import { MediaPlayer, MediaProvider, type MediaPlayerInstance } from "@vidstack/react";
import { DefaultVideoLayout, defaultLayoutIcons } from "@vidstack/react/player/layouts/default";
import { extractYouTubeVideoId } from "@/lib/video/youtube";
import {
  clearVideoPlaybackTime,
  readVideoPlaybackTime,
  saveVideoPlaybackTime,
} from "@/lib/video/playback-persistence";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/lib/i18n/client";

export type ZyxVideoPlayerProps = {
  videoId?: string;
  src: string;
  title: string;
  poster?: string | null;
  autoPlay?: boolean;
  onEnded?: () => void;
  className?: string;
};

/**
 * Modern video player component powered by Vidstack.
 * Supports YouTube streaming with sleek controls, playback speed selector,
 * keyboard shortcuts, responsive layout, and dark mode adaptation.
 */
export function ZyxVideoPlayer({
  videoId,
  src,
  title,
  poster,
  autoPlay = true,
  onEnded,
  className,
}: ZyxVideoPlayerProps) {
  const t = useTranslations("studentCourse");
  const [mounted, setMounted] = useState(false);
  const playerRef = useRef<MediaPlayerInstance | null>(null);
  const restoredForVideoRef = useRef<string | null>(null);
  const lastSavedAtRef = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  const persistCurrentTime = useCallback(() => {
    if (!videoId || !playerRef.current) return;
    const { currentTime, duration } = playerRef.current.state;
    if (typeof currentTime === "number" && Number.isFinite(currentTime)) {
      saveVideoPlaybackTime(
        videoId,
        currentTime,
        typeof duration === "number" && Number.isFinite(duration) ? duration : undefined,
      );
    }
  }, [videoId]);

  useEffect(() => {
    if (!videoId) return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") persistCurrentTime();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", persistCurrentTime);
    return () => {
      persistCurrentTime();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", persistCurrentTime);
    };
  }, [persistCurrentTime, videoId]);

  const handleCanPlay = useCallback(() => {
    if (!videoId || !playerRef.current) return;
    if (restoredForVideoRef.current === videoId) return;
    restoredForVideoRef.current = videoId;
    const savedSeconds = readVideoPlaybackTime(videoId);
    if (savedSeconds > 0) {
      playerRef.current.currentTime = savedSeconds;
    }
  }, [videoId]);

  const handleTimeUpdate = useCallback(() => {
    if (!videoId) return;
    const now = Date.now();
    if (now - lastSavedAtRef.current < 3_000) return;
    lastSavedAtRef.current = now;
    persistCurrentTime();
  }, [persistCurrentTime, videoId]);

  const handleEnded = useCallback(() => {
    clearVideoPlaybackTime(videoId);
    onEnded?.();
  }, [onEnded, videoId]);

  const youtubeId = extractYouTubeVideoId(src);
  const effectiveSrc = youtubeId ? `youtube/${youtubeId}` : src;

  if (!mounted) {
    return (
      <div
        className={cn(
          "relative aspect-video w-full overflow-hidden bg-black flex items-center justify-center",
          className
        )}
      >
        {poster && (
          <Image unoptimized loading="eager" width={160} height={90}
            src={poster}
            alt={title}
            className="absolute inset-0 h-full w-full object-cover opacity-60"
          />
        )}
        <div className="relative flex flex-col items-center gap-2 text-white">
          <div className="flex size-12 items-center justify-center rounded-full bg-brand-primary/90 shadow-md">
            <Play className="size-6 fill-white ml-0.5" />
          </div>
          <span className="text-body-xs font-medium">{t("courseVideos.loadingPlayer")}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative aspect-video w-full overflow-hidden bg-black group select-none",
        "[--media-brand:var(--brand-primary,#0284c7)]",
        className
      )}
    >
      <MediaPlayer
        ref={playerRef}
        title={title}
        src={effectiveSrc}
        poster={poster || undefined}
        aspectRatio="16/9"
        load="eager"
        autoPlay={autoPlay}
        playsInline
        crossOrigin
        onCanPlay={handleCanPlay}
        onTimeUpdate={handleTimeUpdate}
        onPause={persistCurrentTime}
        onEnded={handleEnded}
        className="h-full w-full object-contain"
      >
        <MediaProvider />
        <DefaultVideoLayout icons={defaultLayoutIcons} />
      </MediaPlayer>
    </div>
  );
}
