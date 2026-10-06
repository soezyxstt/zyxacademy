"use client";

import { useEffect, useState, useRef } from "react";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";
import { MediaPlayer, MediaProvider, type MediaPlayerInstance } from "@vidstack/react";
import { DefaultVideoLayout, defaultLayoutIcons } from "@vidstack/react/player/layouts/default";
import { extractYouTubeVideoId, getCanonicalYouTubeUrl } from "@/lib/video/youtube";
import { Play, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ZyxVideoPlayerProps = {
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
  src,
  title,
  poster,
  autoPlay = true,
  onEnded,
  className,
}: ZyxVideoPlayerProps) {
  const [mounted, setMounted] = useState(false);
  const playerRef = useRef<MediaPlayerInstance | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

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
          <img
            src={poster}
            alt={title}
            className="absolute inset-0 h-full w-full object-cover opacity-60"
          />
        )}
        <div className="relative flex flex-col items-center gap-2 text-white">
          <div className="flex size-12 items-center justify-center rounded-full bg-brand-primary/90 shadow-md">
            <Play className="size-6 fill-white ml-0.5" />
          </div>
          <span className="text-body-xs font-medium">Memuat pemutar video...</span>
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
        onEnded={onEnded}
        className="h-full w-full object-contain"
      >
        <MediaProvider />
        <DefaultVideoLayout icons={defaultLayoutIcons} />
      </MediaPlayer>
    </div>
  );
}
