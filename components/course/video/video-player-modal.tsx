"use client";

import { useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Layers, Play } from "lucide-react";
import type { VideoItem, VideoPlaylistItem } from "@/app/actions/video-actions";

type VideoPlayerModalProps = {
  video: VideoItem | null;
  playlist?: VideoPlaylistItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectVideo?: (v: VideoItem) => void;
};

/**
 * Modal video player dialog with playlist queue navigation and video metadata.
 */
export function VideoPlayerModal({
  video,
  playlist,
  open,
  onOpenChange,
  onSelectVideo,
}: VideoPlayerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (open && videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
  }, [video, open]);

  if (!video) return null;

  const playlistVideos = playlist?.videos || [];
  const currentIndex = playlistVideos.findIndex((v) => v.id === video.id);
  const prevVideo = currentIndex > 0 ? playlistVideos[currentIndex - 1] : null;
  const nextVideo =
    currentIndex !== -1 && currentIndex < playlistVideos.length - 1
      ? playlistVideos[currentIndex + 1]
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden bg-background">
        {/* Video Player */}
        <div className="relative aspect-video w-full bg-black">
          <video
            ref={videoRef}
            src={video.videoUrl}
            poster={video.thumbnailUrl || undefined}
            controls
            playsInline
            className="h-full w-full object-contain"
          >
            Browser Anda tidak mendukung pemutar video HTML5.
          </video>
        </div>

        {/* Video Info and Controls */}
        <div className="p-4 sm:p-6 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1 min-w-0 flex-1">
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
              </div>
              <h2 className="font-heading text-body-base font-bold text-foreground sm:text-h5">
                {video.title}
              </h2>
            </div>

            {/* Navigation buttons in playlist */}
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                variant="outline"
                size="sm"
                disabled={!prevVideo}
                onClick={() => prevVideo && onSelectVideo?.(prevVideo)}
                className="h-8 gap-1 text-body-xs rounded-lg"
              >
                <ChevronLeft className="size-3.5" />
                <span>Sebelumnya</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!nextVideo}
                onClick={() => nextVideo && onSelectVideo?.(nextVideo)}
                className="h-8 gap-1 text-body-xs rounded-lg"
              >
                <span>Berikutnya</span>
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>

          {video.description && (
            <p className="text-body-sm text-muted-foreground whitespace-pre-line border-t border-border/40 pt-3">
              {video.description}
            </p>
          )}

          {/* Playlist Queue */}
          {playlistVideos.length > 1 && (
            <div className="border-t border-border/40 pt-3">
              <div className="flex items-center gap-1.5 mb-2 text-body-xs font-semibold text-muted-foreground">
                <Layers className="size-3.5" />
                <span>Daftar Video ({playlistVideos.length})</span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {playlistVideos.map((item, idx) => {
                  const isActive = item.id === video.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => onSelectVideo?.(item)}
                      className={`flex w-44 shrink-0 flex-col gap-1 rounded-lg border p-1.5 text-left transition-colors ${
                        isActive
                          ? "border-brand-primary bg-brand-primary/10"
                          : "border-border/60 hover:bg-muted/40"
                      }`}
                    >
                      <div className="relative aspect-video w-full overflow-hidden rounded bg-muted">
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
                      <p className="line-clamp-1 text-body-xs font-medium text-foreground">
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
