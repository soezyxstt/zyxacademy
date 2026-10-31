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
  SkipForward,
  X,
} from "lucide-react";
import { FaYoutube } from "react-icons/fa6";
import type { VideoItem, VideoPlaylistItem } from "@/app/actions/video-actions";
import { ZyxVideoPlayer } from "./zyx-video-player";
import {
  extractYouTubeVideoId,
  getCanonicalYouTubeUrl,
} from "@/lib/video/youtube";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/lib/i18n/client";

type VideoPlayerModalProps = {
  video: VideoItem | null;
  playlist?: VideoPlaylistItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectVideo?: (v: VideoItem) => void;
};

/**
 * Modal video player dialog with Netflix-inspired layout:
 * - Strictly bounded within viewport (max 94dvh, no outer overflow)
 * - Proportional 16:9 video player with responsive height bounds
 * - Slide-in episode/playlist drawer from the right on demand
 * - Clean metadata and action toolbar with auto-advance support
 */
export function VideoPlayerModal({
  video,
  playlist,
  open,
  onOpenChange,
  onSelectVideo,
}: VideoPlayerModalProps) {
  const t = useTranslations("studentCourse");
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [isPlaylistOpen, setIsPlaylistOpen] = useState(false);

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
      toast.info(t("courseVideos.autoPlaying", { title: nextVideo.title }));
      onSelectVideo(nextVideo);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && isPlaylistOpen) {
      e.stopPropagation();
      setIsPlaylistOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        onKeyDown={handleKeyDown}
        className={cn(
          "!flex flex-col p-0 gap-0 w-full max-w-4xl lg:max-w-5xl xl:max-w-6xl",
          "h-auto max-h-[calc(100dvh-2rem)] md:max-h-[calc(100dvh-5rem)]",
          "overflow-hidden bg-background border-border/80 shadow-2xl rounded-2xl relative font-sans"
        )}
      >
        <DialogTitle className="sr-only">{video.title}</DialogTitle>

        {/* Video Player Hero Section */}
        <div className="relative w-full bg-black shrink-0 flex items-center justify-center overflow-hidden max-h-[58dvh] sm:max-h-[64dvh]">
          <div className="w-full aspect-video max-h-[58dvh] sm:max-h-[64dvh] max-w-full">
            <ZyxVideoPlayer
              src={video.videoUrl}
              title={video.title}
              poster={video.thumbnailUrl}
              autoPlay={true}
              onEnded={handleVideoEnded}
              className="h-full w-full"
            />
          </div>

          {/* Floating Controls Overlay on Player (Top Right) */}
          <div className="absolute top-3 right-3 z-30 flex items-center gap-2">
            {playlistVideos.length > 1 && (
              <button
                type="button"
                onClick={() => setIsPlaylistOpen((prev) => !prev)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-body-xs font-semibold backdrop-blur-md transition-all shadow-md cursor-pointer border",
                  isPlaylistOpen
                    ? "bg-brand-primary text-primary-foreground border-brand-primary"
                    : "bg-black/65 hover:bg-black/85 text-white/90 hover:text-white border-white/15"
                )}
                title={t("courseVideos.openVideoList")}
                aria-expanded={isPlaylistOpen}
              >
                <Layers className="size-3.5 text-brand-primary" />
                <span className="hidden sm:inline">{t("courseVideos.videoList")}</span>
                <span className="tabular-nums">({playlistVideos.length})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex size-8 items-center justify-center rounded-lg bg-black/65 hover:bg-black/85 text-white/90 hover:text-white backdrop-blur-md border border-white/15 transition-all shadow-md cursor-pointer"
              aria-label={t("courseVideos.closePlayer")}
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Video Info and Controls Bar (Scrollable internal area) */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-3 font-sans">
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
              {playlistVideos.length > 1 && (
                <Button
                  variant={isPlaylistOpen ? "default" : "outline"}
                  size="sm"
                  onClick={() => setIsPlaylistOpen((prev) => !prev)}
                  className={cn(
                    "h-8 gap-1.5 text-body-xs rounded-lg transition-colors",
                    isPlaylistOpen && "bg-brand-primary text-primary-foreground hover:bg-brand-primary/90"
                  )}
                  aria-expanded={isPlaylistOpen}
                >
                  <Layers className="size-3.5" />
                  <span>{t("courseVideos.videoList")}</span>
                  <span
                    className={cn(
                      "rounded px-1 text-body-2xs font-semibold tabular-nums",
                      isPlaylistOpen
                        ? "bg-white/20 text-white"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {currentIndex >= 0 ? currentIndex + 1 : 1}/{playlistVideos.length}
                  </span>
                </Button>
              )}

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
                className="h-8 gap-1 text-body-sm rounded-lg"
              >
                <ChevronLeft className="size-3.5" />
                <span className="hidden sm:inline">{t("courseVideos.previous")}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!nextVideo}
                onClick={() => nextVideo && onSelectVideo?.(nextVideo)}
                className="h-8 gap-1 text-body-sm rounded-lg"
              >
                <span className="hidden sm:inline">{t("courseVideos.next")}</span>
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>

          {/* Up Next Preview Strip */}
          {nextVideo && (
            <div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-3 py-1.5 text-body-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-muted-foreground shrink-0 font-medium">{t("courseVideos.upNext")}</span>
                <span className="font-semibold text-foreground truncate">{nextVideo.title}</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onSelectVideo?.(nextVideo)}
                className="h-8 px-2 text-body-sm text-brand-primary hover:text-brand-primary gap-1 shrink-0 font-semibold"
              >
                <span>{t("courseVideos.play")}</span>
                <ChevronRight className="size-3" />
              </Button>
            </div>
          )}

          {/* Description */}
          {video.description && (
            <p className="text-body-sm text-muted-foreground whitespace-pre-line border-t border-border/40 pt-2.5">
              {video.description}
            </p>
          )}
        </div>

        {/* Netflix-style Episodes / Available Videos Slide-over Drawer */}
        {playlistVideos.length > 1 && isPlaylistOpen && (
          <>
            {/* Backdrop */}
            <div
              className="absolute inset-0 z-40 bg-black/40 backdrop-blur-2xs transition-opacity"
              onClick={() => setIsPlaylistOpen(false)}
              aria-hidden="true"
            />

            {/* Slide-over Drawer Panel */}
            <aside
              className="absolute inset-y-0 right-0 z-50 w-full sm:w-80 md:w-96 max-w-full bg-background/95 backdrop-blur-md border-l border-border/80 flex flex-col shadow-2xl animate-in slide-in-from-right duration-200 ease-out font-sans"
              aria-label={t("courseVideos.videoList")}
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-border/60 px-4 py-3 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <Layers className="size-4 text-brand-primary shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-heading text-body-sm font-bold text-foreground">
                        {t("courseVideos.videoList")}
                      </h3>
                      <span className="rounded-md bg-muted px-1.5 py-0.2 text-body-2xs font-semibold text-muted-foreground tabular-nums">
                        {playlistVideos.length}
                      </span>
                    </div>
                    {playlist?.title && (
                      <p className="truncate text-body-xs text-muted-foreground">
                        {playlist.title}
                      </p>
                    )}
                  </div>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsPlaylistOpen(false)}
                  className="size-7 p-0 rounded-lg text-muted-foreground hover:text-foreground shrink-0"
                  aria-label={t("courseVideos.closeVideoList")}
                >
                  <X className="size-4" />
                </Button>
              </div>

              {/* Auto-advance Toggle Strip */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-border/40 bg-muted/20 text-body-xs shrink-0">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <SkipForward className="size-3.5 text-brand-primary" />
                  <span>{t("courseVideos.autoplayNext")}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setAutoAdvance(!autoAdvance)}
                  className={cn(
                    "inline-flex items-center rounded-md px-2 py-0.5 text-body-2xs font-semibold transition-colors border",
                    autoAdvance
                      ? "bg-brand-primary/10 text-brand-primary border-brand-primary/30"
                      : "bg-muted text-muted-foreground border-border/60"
                  )}
                  title={t("courseVideos.autoplayNextDescription")}
                >
                  {autoAdvance ? t("courseVideos.enabled") : t("courseVideos.disabled")}
                </button>
              </div>

              {/* Scrollable Playlist Videos List */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {playlistVideos.map((item, idx) => {
                  const isActive = item.id === video.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onSelectVideo?.(item);
                        if (typeof window !== "undefined" && window.innerWidth < 640) {
                          setIsPlaylistOpen(false);
                        }
                      }}
                      className={cn(
                        "group relative flex w-full items-start gap-3 rounded-xl border p-2 text-left transition-all",
                        isActive
                          ? "border-brand-primary bg-brand-primary/10 ring-1 ring-brand-primary/30 shadow-xs"
                          : "border-border/60 hover:bg-muted/40 hover:border-border"
                      )}
                    >
                      {/* Thumbnail with duration */}
                      <div className="relative aspect-video w-24 sm:w-28 shrink-0 overflow-hidden rounded-lg bg-black/20 border border-border/40">
                        {item.thumbnailUrl ? (
                          <img
                            src={item.thumbnailUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                            <Play className="size-4 opacity-40" />
                          </div>
                        )}

                        {/* Active playing overlay */}
                        {isActive ? (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-2xs">
                            <span className="flex items-center gap-1 text-[10px] font-semibold text-white">
                              <Play className="size-3 fill-white text-white" />
                              <span>{t("courseVideos.playing")}</span>
                            </span>
                          </div>
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Play className="size-4 fill-white text-white ml-0.5" />
                          </div>
                        )}

                        {/* Duration Badge */}
                        {item.duration && item.duration > 0 && (
                          <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.2 text-[9px] font-medium text-white tabular-nums">
                            {Math.floor(item.duration / 60)}:
                            {String(item.duration % 60).padStart(2, "0")}
                          </span>
                        )}
                      </div>

                      {/* Video Text Details */}
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              "text-body-xs font-semibold tabular-nums",
                              isActive ? "text-brand-primary" : "text-muted-foreground"
                            )}
                          >
                            #{idx + 1}
                          </span>
                          {item.chapterTitle && (
                            <span className="truncate text-body-2xs text-muted-foreground">
                              {item.chapterTitle}
                            </span>
                          )}
                        </div>
                        <p
                          className={cn(
                            "line-clamp-2 font-heading text-body-xs font-semibold leading-snug",
                            isActive
                              ? "text-brand-primary"
                              : "text-foreground group-hover:text-brand-primary"
                          )}
                        >
                          {item.title}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
