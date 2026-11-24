"use client";

import Image from "next/image";
import dynamic from "next/dynamic";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  readActiveCourseVideoId,
  saveActiveCourseVideoId,
} from "@/lib/video/playback-persistence";
import {
  Video as VideoIcon,
  Plus,
  ListPlus,
  ChevronDown,
  Play,
  Lock,
  MoreVertical,
  Pencil,
  Trash2,
  Filter,
} from "lucide-react";
import { FaYoutube } from "react-icons/fa6";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/ui/search-bar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EnrollmentForm } from "@/components/enrollment-form";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import {
  deleteVideoPlaylistAction,
  deleteCourseVideoAction,
  type VideoItem,
  type VideoPlaylistItem,
} from "@/app/actions/video-actions";
import { VideoPlayerModal } from "./video-player-modal";
import { getYouTubeThumbnailUrl } from "@/lib/video/youtube";
import { cn } from "@/lib/utils";
import { courseListRowClass } from "@/components/course/course-surfaces";
import { useTranslations } from "@/lib/i18n/client";

const PlaylistDialog = dynamic(() =>
  import("./playlist-dialog").then((mod) => mod.PlaylistDialog)
);
const AdminVideoDialog = dynamic(() =>
  import("./admin-video-dialog").then((mod) => mod.AdminVideoDialog)
);

type ChapterOption = {
  id: string;
  title: string;
  orderIndex: number;
};

type CourseVideosClientProps = {
  courseId: string;
  courseSlug?: string;
  courseTitle?: string;
  initialPlaylists: VideoPlaylistItem[];
  chapters: ChapterOption[];
  canManage?: boolean;
  hasFullContentAccess?: boolean;
};

/**
 * Client component presenting course video playlists as collapsible accordion sections.
 */
export function CourseVideosClient({
  courseId,
  courseSlug: _courseSlug,
  courseTitle: _courseTitle,
  initialPlaylists,
  chapters,
  canManage = false,
  hasFullContentAccess = true,
}: CourseVideosClientProps) {
  const t = useTranslations("studentCourse");
  const router = useRouter();

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedChapterId, setSelectedChapterId] = useState<string>("all");

  // Accordion open/close state per playlist
  const [openPlaylists, setOpenPlaylists] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const p of initialPlaylists) {
      initial[p.id] = true; // default open
    }
    return initial;
  });

  // Modal states
  const [playlistDialogOpen, setPlaylistDialogOpen] = useState(false);
  const [editingPlaylist, setEditingPlaylist] = useState<VideoPlaylistItem | null>(null);

  const [videoDialogOpen, setVideoDialogOpen] = useState(false);
  const [playlistDialogMounted, setPlaylistDialogMounted] = useState(false);
  const [videoDialogMounted, setVideoDialogMounted] = useState(false);
  useEffect(() => {
    if (playlistDialogOpen) setPlaylistDialogMounted(true);
    if (videoDialogOpen) setVideoDialogMounted(true);
  }, [playlistDialogOpen, videoDialogOpen]);
  const [editingVideo, setEditingVideo] = useState<VideoItem | null>(null);
  const [defaultPlaylistForVideo, setDefaultPlaylistForVideo] = useState<string | undefined>(undefined);

  // Delete confirmations
  const [playlistToDelete, setPlaylistToDelete] = useState<VideoPlaylistItem | null>(null);
  const [videoToDelete, setVideoToDelete] = useState<VideoItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Player modal state
  const [playingVideo, setPlayingVideo] = useState<VideoItem | null>(null);
  const [activePlaylistForPlayer, setActivePlaylistForPlayer] = useState<VideoPlaylistItem | null>(null);
  const [lockedVideo, setLockedVideo] = useState<VideoItem | null>(null);
  const [hydratedCourseId, setHydratedCourseId] = useState<string | null>(null);

  useEffect(() => {
    if (hydratedCourseId === courseId) return;
    const urlVideoId =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("video")
        : null;
    const candidateVideoId = urlVideoId || readActiveCourseVideoId(courseId);
    if (candidateVideoId) {
      for (const pl of initialPlaylists) {
        const matched = pl.videos.find((v) => v.id === candidateVideoId);
        if (matched) {
          const isLocked = !canManage && !hasFullContentAccess && (matched.locked ?? true);
          if (!isLocked) {
            setPlayingVideo(matched);
            setActivePlaylistForPlayer(pl);
          }
          break;
        }
      }
    }
    setHydratedCourseId(courseId);
  }, [canManage, courseId, hasFullContentAccess, hydratedCourseId, initialPlaylists]);

  useEffect(() => {
    if (hydratedCourseId !== courseId) return;
    const nextVideoId = playingVideo?.id ?? null;
    saveActiveCourseVideoId(courseId, nextVideoId);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (nextVideoId) {
        url.searchParams.set("video", nextVideoId);
      } else {
        url.searchParams.delete("video");
      }
      const nextHref = `${url.pathname}${url.search}${url.hash}`;
      const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (nextHref !== currentHref) {
        window.history.replaceState(window.history.state, "", nextHref);
      }
    }
  }, [courseId, hydratedCourseId, playingVideo]);

  const togglePlaylist = (id: string) => {
    setOpenPlaylists((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Filtered Playlists & Videos
  const filteredPlaylists = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return initialPlaylists
      .map((pl) => {
        const matchesPlaylistTitle = !q || pl.title.toLowerCase().includes(q);

        const filteredVideos = pl.videos.filter((v) => {
          const matchesChapter =
            selectedChapterId === "all" || v.chapterId === selectedChapterId;
          if (!matchesChapter) return false;

          if (!q) return true;
          return (
            matchesPlaylistTitle ||
            v.title.toLowerCase().includes(q) ||
            (v.chapterTitle && v.chapterTitle.toLowerCase().includes(q)) ||
            (v.description && v.description.toLowerCase().includes(q))
          );
        });

        return {
          ...pl,
          videos: filteredVideos,
        };
      })
      .filter((pl) => {
        if (!searchQuery && selectedChapterId === "all") return true;
        return pl.videos.length > 0 || (!searchQuery && pl.title.toLowerCase().includes(searchQuery.toLowerCase()));
      });
  }, [initialPlaylists, searchQuery, selectedChapterId]);

  // Playlist handlers
  const handleOpenCreatePlaylist = () => {
    setEditingPlaylist(null);
    setPlaylistDialogOpen(true);
  };

  const handleOpenEditPlaylist = (pl: VideoPlaylistItem) => {
    setEditingPlaylist(pl);
    setPlaylistDialogOpen(true);
  };

  const handleConfirmDeletePlaylist = async () => {
    if (!playlistToDelete) return;
    setDeleteLoading(true);
    try {
      const res = await deleteVideoPlaylistAction(playlistToDelete.id);
      if (res.success) {
        toast.success(t("courseVideos.playlistDeleted"));
        setPlaylistToDelete(null);
        router.refresh();
      } else {
        toast.error(t("courseVideos.playlistDeleteFailed"));
      }
    } catch {
      toast.error(t("courseVideos.deletePlaylistError"));
    } finally {
      setDeleteLoading(false);
    }
  };

  // Video handlers
  const handleOpenAddVideo = (plId?: string) => {
    setEditingVideo(null);
    setDefaultPlaylistForVideo(plId || initialPlaylists[0]?.id);
    setVideoDialogOpen(true);
  };

  const handleOpenEditVideo = (v: VideoItem) => {
    setEditingVideo(v);
    setVideoDialogOpen(true);
  };

  const handleConfirmDeleteVideo = async () => {
    if (!videoToDelete) return;
    setDeleteLoading(true);
    try {
      const res = await deleteCourseVideoAction(videoToDelete.id);
      if (res.success) {
        toast.success(t("courseVideos.videoDeleted"));
        setVideoToDelete(null);
        router.refresh();
      } else {
        toast.error(t("courseVideos.videoDeleteFailed"));
      }
    } catch {
      toast.error(t("courseVideos.deleteVideoError"));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handlePlayVideo = (video: VideoItem, playlist: VideoPlaylistItem) => {
    const isLocked = !canManage && !hasFullContentAccess && (video.locked ?? true);
    if (isLocked) {
      setLockedVideo(video);
      return;
    }
    setPlayingVideo(video);
    setActivePlaylistForPlayer(playlist);
  };

  return (
    <div className={cn("font-sans", canManage ? "space-y-(--related-gap)" : "space-y-6")}>
      {/* Responsive Inline Filter Toolbar */}
      <div className="group/video-toolbar flex flex-wrap items-center gap-1 border-b border-border/40 pb-2">
        <SearchBar
          collapsible
          size="sm"
          aria-label={t("courseVideos.search")}
          placeholder={t("courseVideos.search")}
          value={searchQuery}
          onSearch={setSearchQuery}
          containerClassName="min-w-[140px] max-w-sm"
        />

          {/* Chapter Filter */}
          {chapters.length > 0 && (
            <div className={cn(
              "min-w-0 max-w-60",
              selectedChapterId === "all" && "group-has-[[data-search-expanded=true]]/video-toolbar:hidden sm:group-has-[[data-search-expanded=true]]/video-toolbar:block"
            )}>
              <Select value={selectedChapterId} onValueChange={setSelectedChapterId}>
                <SelectTrigger variant="inline" aria-label={t("courseVideos.allChapters")}>
                  <Filter className="mr-1.5 size-3.5 text-muted-foreground" />
                  <SelectValue placeholder={t("courseVideos.allChapters")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-body-sm">
                    Semua Bab
                  </SelectItem>
                  {chapters.map((ch) => (
                    <SelectItem key={ch.id} value={ch.id} className="text-body-sm">
                      Bab {ch.orderIndex}: {ch.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        {/* Action Buttons for Admin or Tutor */}
        {canManage && (
          <TooltipProvider>
            <div className="ml-auto flex shrink-0 items-center gap-1 group-has-[[data-search-expanded=true]]/video-toolbar:hidden sm:group-has-[[data-search-expanded=true]]/video-toolbar:flex">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon-lg" aria-label={t("courseVideos.newPlaylist")} onClick={handleOpenCreatePlaylist}>
                    <ListPlus aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("courseVideos.newPlaylist")}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" size="icon-lg" aria-label={t("courseVideos.addVideo")} onClick={() => handleOpenAddVideo()} disabled={initialPlaylists.length === 0}>
                    <Plus aria-hidden />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("courseVideos.addVideo")}</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        )}
      </div>

      {/* Playlists Container - Formatted like Collapsible Bab di Dokumen */}
      {initialPlaylists.length === 0 ? (
        <div className={cn(
            "flex flex-col items-center justify-center text-center",
            canManage ? "py-(--section-gap)" : "min-h-[45vh] px-4 py-12",
          )}>
          <div className="mx-auto flex max-w-md flex-col items-center">
            <VideoIcon className="size-10 text-muted-foreground/40 mb-3" aria-hidden />
            <h3 className="font-heading text-body-base font-bold text-foreground">
              Belum ada playlist video
            </h3>
            <p className="mt-1 text-body-xs text-muted-foreground leading-relaxed">
              {canManage
                ? t("courseVideos.createPlaylistFirst")
                : t("courseVideos.noVideos")}
            </p>
            {canManage && (
              <Button
                size="sm"
                onClick={handleOpenCreatePlaylist}
                className="mt-5 text-body-sm rounded-lg gap-1.5 bg-brand-primary text-primary-foreground hover:bg-brand-primary/90"
              >
                <Plus className="size-4" />
                <span>{t("courseVideos.createFirstPlaylist")}</span>
              </Button>
            )}
          </div>
        </div>
      ) : filteredPlaylists.length === 0 ? (
        <div className="py-10 text-center">
          <p className="font-heading text-body-sm font-semibold text-foreground">
            Video tidak ditemukan
          </p>
          <p className="mt-1 text-body-xs text-muted-foreground">
            Coba sesuaikan kata kunci pencarian atau filter bab.
          </p>
        </div>
      ) : (
        <div className={canManage ? "space-y-(--section-gap)" : "space-y-8"}>
          {filteredPlaylists.map((playlist) => {
            const isOpen = Boolean(openPlaylists[playlist.id]);
            const hasVideos = playlist.videos.length > 0;

            return (
              <Collapsible
                key={playlist.id}
                open={isOpen}
                onOpenChange={() => togglePlaylist(playlist.id)}
                className="w-full"
              >
                {/* Collapsible Header */}
                <div className={cn(
                  "group flex w-full items-center justify-between border-b border-border/40",
                  canManage ? "gap-1.5 pb-1" : "gap-3 pb-2",
                )}>
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "group/trigger flex flex-1 items-center gap-2.5 rounded-lg py-1 text-left transition-colors hover:bg-muted/40 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                        canManage ? "min-h-10 min-w-0" : "-mx-2 px-2",
                      )}
                    >
                      <span className="min-w-0 flex-1 wrap-break-word font-heading text-body-base font-semibold text-foreground">
                        {playlist.title}
                      </span>
                      <span className="shrink-0 text-body-xs tabular-nums text-muted-foreground">
                        {playlist.videos.length} video
                      </span>
                      <ChevronDown
                        className={cn(
                          "size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover/trigger:text-foreground",
                          isOpen && "rotate-180"
                        )}
                        aria-hidden
                      />
                    </button>
                  </CollapsibleTrigger>

                  {/* Actions for playlist header */}
                  {canManage && (
                    <div className="flex shrink-0 items-center gap-1">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-lg"
                              aria-label={t("courseVideos.addVideo")}
                              aria-description={playlist.title}
                              onClick={() => handleOpenAddVideo(playlist.id)}
                            >
                              <Plus aria-hidden />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t("courseVideos.addVideo")}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-lg"
                            aria-label={t("courseVideos.playlistMenu")}
                            aria-description={playlist.title}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <MoreVertical aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="text-body-sm">
                          <DropdownMenuItem onClick={() => handleOpenEditPlaylist(playlist)}>
                            <Pencil className="mr-2 size-3.5" />
                            <span>{t("courseVideos.editPlaylist")}</span>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setPlaylistToDelete(playlist)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 size-3.5" />
                            <span>{t("courseVideos.deletePlaylist")}</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </div>

                {/* Collapsible Content: Video Rows */}
                <CollapsibleContent>
                  {!hasVideos ? (
                    <div className={cn("text-body-xs text-muted-foreground", canManage ? "py-(--related-gap)" : "py-6 text-center")}>
                      <p className={canManage ? "text-body-xs" : undefined}>{t("courseVideos.emptyPlaylist")}</p>
                    </div>
                  ) : (
                    <div className={cn("divide-y", canManage ? "divide-border/30" : "divide-border/20")}>
                      {playlist.videos.map((video) => {
                        const isLocked = !canManage && !hasFullContentAccess && (video.locked ?? true);
                        const isYouTube = video.videoUrl.includes("youtube") || video.videoUrl.includes("youtu.be");
                        const thumbnail = video.thumbnailUrl || getYouTubeThumbnailUrl(video.videoUrl);
                        return (
                          <div key={video.id}>
                          <div
                            className={canManage
                              ? "group -mx-2.5 flex cursor-pointer items-center justify-between gap-(--compact-gap) rounded-lg px-2.5 py-(--row-padding) transition-colors hover:bg-muted/40"
                              : courseListRowClass("-mx-2.5 cursor-pointer items-center px-2.5")}
                            onClick={() => handlePlayVideo(video, playlist)}
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                              {/* Landscape Video Thumbnail */}
                              <div className="relative w-28 sm:w-36 aspect-video shrink-0 overflow-hidden rounded-lg border border-border/60 bg-muted/20 shadow-2xs">
                                {thumbnail ? (
                                  <Image unoptimized loading="lazy" width={160} height={90}
                                    src={thumbnail}
                                    alt={video.title}
                                    className="size-full object-cover transition-transform group-hover:scale-105 duration-200"
                                  />
                                ) : (
                                  <div className="flex size-full flex-col items-center justify-center bg-gradient-to-br from-muted/50 to-muted/20">
                                    <VideoIcon className="size-5 text-muted-foreground/60" />
                                  </div>
                                )}
                                <div className="absolute inset-0 flex items-center justify-center bg-black/25 group-hover:bg-black/40 transition-colors">
                                  {isLocked ? (
                                    <div className="rounded-full bg-black/60 p-1.5 backdrop-blur-xs">
                                      <Lock className="size-3 text-white" aria-hidden />
                                    </div>
                                  ) : (
                                    <div className="rounded-full bg-black/60 p-1.5 backdrop-blur-xs group-hover:scale-110 transition-transform">
                                      <Play className="size-3 fill-white text-white ml-0.5" />
                                    </div>
                                  )}
                                </div>
                                {video.duration && video.duration > 0 ? (
                                  <div className="absolute bottom-1 right-1 rounded bg-black/75 px-1 py-0.5 text-body-xs font-medium text-white tabular-nums leading-none">
                                    {Math.floor(video.duration / 60)}:
                                    {String(video.duration % 60).padStart(2, "0")}
                                  </div>
                                ) : null}
                              </div>

                              {/* Center Title and Combined Sub-line */}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <h4
                                    className="wrap-break-word text-body-sm font-semibold text-foreground"
                                    title={video.title}
                                  >
                                    {video.title}
                                  </h4>
                                </div>
                                <p className="mt-1 flex items-center gap-1.5 text-body-xs text-muted-foreground flex-wrap">
                                  {video.chapterTitle && (
                                    <span className="rounded bg-muted/60 px-1.5 py-0.5 text-body-2xs font-medium text-foreground/80">
                                      {video.chapterTitle}
                                    </span>
                                  )}
                                  {video.chapterTitle && (isLocked || isYouTube || video.fileSize) && (
                                    <span>·</span>
                                  )}
                                  {isLocked ? (
                                    <span>{t("courseVideos.classAccessRequired")}</span>
                                  ) : isYouTube ? (
                                    <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-medium">
                                      <FaYoutube className="size-3" />
                                      YouTube
                                    </span>
                                  ) : video.fileSize ? (
                                    <span>{(video.fileSize / (1024 * 1024)).toFixed(1)} MB</span>
                                  ) : null}
                                </p>
                              </div>
                            </div>

                            {/* Right Action / Dropdown */}
                            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                              {canManage && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon-lg"
                                      aria-label={t("courseVideos.videoMenu")}
                                      aria-description={video.title}
                                      className="text-muted-foreground hover:text-foreground"
                                    >
                                      <MoreVertical aria-hidden />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="text-body-sm">
                                    <DropdownMenuItem onClick={() => handleOpenEditVideo(video)}>
                                      <Pencil className="mr-2 size-3.5" />
                                      <span>{t("courseVideos.editVideo")}</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => setVideoToDelete(video)}
                                      className="text-destructive focus:text-destructive"
                                    >
                                      <Trash2 className="mr-2 size-3.5" />
                                      <span>{t("courseVideos.deleteVideo")}</span>
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                          </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      )}

      {/* Playlist Create/Edit Dialog */}
      {canManage && (playlistDialogOpen || playlistDialogMounted) && (
        <PlaylistDialog
          open={playlistDialogOpen}
          onOpenChange={setPlaylistDialogOpen}
          courseId={courseId}
          playlist={editingPlaylist}
          onSuccess={() => router.refresh()}
        />
      )}

      {/* Video Upload/Edit Dialog */}
      {canManage && (videoDialogOpen || videoDialogMounted) && (
        <AdminVideoDialog
          open={videoDialogOpen}
          onOpenChange={setVideoDialogOpen}
          courseId={courseId}
          playlists={initialPlaylists}
          chapters={chapters}
          video={editingVideo}
          defaultPlaylistId={defaultPlaylistForVideo}
          onOpenCreatePlaylist={handleOpenCreatePlaylist}
          onSuccess={() => router.refresh()}
        />
      )}

      {/* Video Player Modal */}
      <VideoPlayerModal
        video={playingVideo}
        playlist={activePlaylistForPlayer}
        open={Boolean(playingVideo)}
        onOpenChange={(open) => {
          if (!open) {
            setPlayingVideo(null);
            setActivePlaylistForPlayer(null);
          }
        }}
        onSelectVideo={(v) => setPlayingVideo(v)}
      />

      {/* Delete Playlist Confirmation */}
      {canManage && playlistToDelete && (
        <AdminConfirmDialog
          open={Boolean(playlistToDelete)}
          onOpenChange={(open) => !open && setPlaylistToDelete(null)}
          title={t("courseVideos.deletePlaylist")}
          description={t("courseVideos.deletePlaylistConfirm", { title: playlistToDelete.title })}
          confirmLabel={t("courseVideos.deletePlaylist")}
          loading={deleteLoading}
          onConfirm={handleConfirmDeletePlaylist}
        />
      )}

      {/* Delete Video Confirmation */}
      {canManage && videoToDelete && (
        <AdminConfirmDialog
          open={Boolean(videoToDelete)}
          onOpenChange={(open) => !open && setVideoToDelete(null)}
          title={t("courseVideos.deleteVideo")}
          description={t("courseVideos.deleteVideoConfirm", { title: videoToDelete.title })}
          confirmLabel={t("courseVideos.deleteVideo")}
          loading={deleteLoading}
          onConfirm={handleConfirmDeleteVideo}
        />
      )}

      {/* Locked Video Activation Dialog */}
      <Dialog open={Boolean(lockedVideo)} onOpenChange={(open) => !open && setLockedVideo(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-2 flex size-11 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20">
              <Lock className="size-5" />
            </div>
            <DialogTitle className="text-center font-heading text-body-base font-bold">
              {t("courseVideos.lockedTitle")}
            </DialogTitle>
            <DialogDescription className="text-center text-body-xs text-muted-foreground">
              {t("courseVideos.lockedDescription", { title: lockedVideo?.title ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <div className="pt-2">
            <EnrollmentForm
              className="w-full"
              onSuccess={() => {
                setLockedVideo(null);
                router.refresh();
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
