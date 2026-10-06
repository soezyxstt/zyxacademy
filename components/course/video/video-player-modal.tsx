"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import {
  ChevronLeft,
  ChevronRight,
  Layers,
  Play,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { FaYoutube } from "react-icons/fa6";
import type { VideoItem, VideoPlaylistItem } from "@/app/actions/video-actions";
import { ZyxVideoPlayer } from "./zyx-video-player";
import {
  extractYouTubeVideoId,
  getCanonicalYouTubeUrl,
} from "@/lib/video/youtube";
import { cn } from "@/lib/utils";

type VideoPlayerModalProps = {
  video: VideoItem | null;
  playlist?: VideoPlaylistItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectVideo?: (v: VideoItem) => void;
};

/**
 * Modal video player dialog with Vidstack player, playlist queue,
 * auto-advance playback, and YouTube external access.
 */
export function VideoPlayerModal({
  video,
  playlist,
  open,
  onOpenChange,
  onSelectVideo,
}: VideoPlayerModalProps) {
  const [autoAdvance, setAutoAdvance] = useState(true);

  if (!video) return null;

  const playlistVideos = playlist?.videos || [];
  const currentIndex = playlistVideos.findIndex((v) => v.id === video.id);
  const prevVideo = currentIndex > 0 ? playlistVideos[currentIndex - 1] : null;
  const nextVideo =
    currentIndex !== -1 && currentIndex < playlistVideos.length - 1
      ? playlistVideos[currentIndex + 1]
      : null;

  const youtubeId = extractYouTubeVideoId(video.videoUrl);
  const canonicalYoutubeUrl = youtubeId
    ? getCanonicalYouTubeUrl(youtubeId)
    : video.videoUrl;

  const handleVideoEnded = () => {
    if (autoAdvance && nextVideo && onSelectVideo) {
      toast.info(`Memutar otomatis: ${nextVideo.title}`);
      onSelectVideo(nextVideo);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl lg:max-w-5xl p-0 overflow-hidden bg-background border-border/80">
        <DialogTitle className="sr-only">{video.title}</DialogTitle>

        {/* Vidstack Video Player */}
        <div className="relative aspect-video w-full bg-black">
          <ZyxVideoPlayer
            src={video.videoUrl}
            title={video.title}
            poster={video.thumbnailUrl}
            autoPlay={true}
            onEnded={handleVideoEnded}
          />
        </div>

        {/* Video Info and Controls */}
        <div className="p-4 sm:p-5 space-y-3.5 max-h-[40vh] overflow-y-auto">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1.5 min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {playlist && (
                  <Badge variant="secondary" className="rounded-md text-body-xs font-normal">
                    {playlist.title}
                  </Badge>
                )}
                {video.chapterTitle && (
                  <Badge variant="outline" className="rounded-md text-body-xs">
                    {video.chapterTitle}
                  </Badge>
                )}
                {youtubeId && (
                  <Badge
                    variant="outline"
                    className="rounded-md text-[10px] text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/50 gap-1"
                  >
                    <FaYoutube className="size-3" />
                    <span>YouTube</span>
                  </Badge>
                )}
              </div>

              <h2 className="font-heading text-body-base font-bold text-foreground sm:text-h5 leading-snug">
                {video.title}
              </h2>
            </div>

            {/* Navigation and Actions */}
            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              {youtubeId && (
                <a
                  href={canonicalYoutubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 items-center gap-1 px-2.5 rounded-lg border border-border/60 bg-muted/30 text-body-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                >
                  <FaYoutube className="size-3.5 text-red-600" />
                  <span className="hidden sm:inline">YouTube</span>
                  <ExternalLink className="size-3 ml-0.5" />
                </a>
              )}

              <Button
                variant="outline"
                size="sm"
                disabled={!prevVideo}
                onClick={() => prevVideo && onSelectVideo?.(prevVideo)}
                className="h-8 gap-1 text-body-xs rounded-lg"
              >
                <ChevronLeft className="size-3.5" />
                <span className="hidden sm:inline">Sebelumnya</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!nextVideo}
                onClick={() => nextVideo && onSelectVideo?.(nextVideo)}
                className="h-8 gap-1 text-body-xs rounded-lg"
              >
                <span className="hidden sm:inline">Berikutnya</span>
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>

          {video.description && (
            <p className="text-body-sm text-muted-foreground whitespace-pre-line border-t border-border/40 pt-2.5">
              {video.description}
            </p>
          )}

          {/* Playlist Queue */}
          {playlistVideos.length > 1 && (
            <div className="border-t border-border/40 pt-2.5 space-y-2">
              <div className="flex items-center justify-between text-body-xs">
                <div className="flex items-center gap-1.5 font-semibold text-muted-foreground">
                  <Layers className="size-3.5" />
                  <span>Daftar Video ({playlistVideos.length})</span>
                </div>

                <button
                  type="button"
                  onClick={() => setAutoAdvance(!autoAdvance)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
                    autoAdvance
                      ? "bg-brand-primary/10 text-brand-primary"
                      : "bg-muted text-muted-foreground"
                  )}
                  title="Otomatis putar video berikutnya saat video selesai"
                >
                  <Sparkles className="size-3" />
                  <span>Putar otomatis: {autoAdvance ? "Aktif" : "Nonaktif"}</span>
                </button>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
                {playlistVideos.map((item, idx) => {
                  const isActive = item.id === video.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => onSelectVideo?.(item)}
                      className={cn(
                        "flex w-44 shrink-0 flex-col gap-1 rounded-lg border p-1.5 text-left transition-all",
                        isActive
                          ? "border-brand-primary bg-brand-primary/10 ring-1 ring-brand-primary/30"
                          : "border-border/60 hover:bg-muted/40 hover:border-border"
                      )}
                    >
                      <div className="relative aspect-video w-full overflow-hidden rounded bg-black/10">
                        {item.thumbnailUrl ? (
                          <img
                            src={item.thumbnailUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                            <Play className="size-5 opacity-40" />
                          </div>
                        )}
                        {isActive && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                            <Play className="size-5 fill-white text-white" />
                          </div>
                        )}
                      </div>
                      <p
                        className={cn(
                          "line-clamp-1 text-body-xs font-medium",
                          isActive ? "text-brand-primary font-semibold" : "text-foreground"
                        )}
                      >
                        {idx + 1}. {item.title}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
