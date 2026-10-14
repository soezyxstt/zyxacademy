"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Video as VideoIcon,
  Plus,
  Search,
  ChevronDown,
  Play,
  Lock,
  MoreVertical,
  Pencil,
  Trash2,
  Layers,
  Filter,
} from "lucide-react";
import { FaYoutube } from "react-icons/fa6";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { PlaylistDialog } from "./playlist-dialog";
import { AdminVideoDialog } from "./admin-video-dialog";
import { VideoPlayerModal } from "./video-player-modal";
import { getYouTubeThumbnailUrl } from "@/lib/video/youtube";
import { cn } from "@/lib/utils";

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
  isEnrolled?: boolean;
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
  isEnrolled = true,
}: CourseVideosClientProps) {
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
        toast.success("Playlist berhasil dihapus.");
        setPlaylistToDelete(null);
        router.refresh();
      } else {
        toast.error(res.error || "Gagal menghapus playlist.");
      }
    } catch {
      toast.error("Terjadi kesalahan saat menghapus playlist.");
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
        toast.success("Video berhasil dihapus.");
        setVideoToDelete(null);
        router.refresh();
      } else {
        toast.error(res.error || "Gagal menghapus video.");
      }
    } catch {
      toast.error("Terjadi kesalahan saat menghapus video.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handlePlayVideo = (video: VideoItem, playlist: VideoPlaylistItem) => {
    const isLocked = !canManage && !isEnrolled && (video.locked ?? true);
    if (isLocked) {
      setLockedVideo(video);
      return;
    }
    setPlayingVideo(video);
    setActivePlaylistForPlayer(playlist);
  };

  return (
    <div className="space-y-4 font-sans">
      {/* Responsive Inline Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-1 flex-wrap items-center gap-2 min-w-[240px]">
          {/* Search Bar */}
          <div className="relative min-w-[140px] flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder="Cari video atau bab..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pl-9 text-body-sm rounded-lg"
            />
          </div>

          {/* Chapter Filter */}
          {chapters.length > 0 && (
            <div className="shrink-0 w-44">
              <Select value={selectedChapterId} onValueChange={setSelectedChapterId}>
                <SelectTrigger className="h-9 text-body-sm rounded-lg">
                  <Filter className="mr-1.5 size-3.5 text-muted-foreground" />
                  <SelectValue placeholder="Semua Bab" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-body-sm font-medium">
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
        </div>

        {/* Action Buttons for Admin or Tutor */}
        {canManage && (
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenCreatePlaylist}
              className="h-9 text-body-sm rounded-lg gap-1.5"
            >
              <Plus className="size-4" />
              <span>Playlist Baru</span>
            </Button>
            <Button
              size="sm"
              onClick={() => handleOpenAddVideo()}
              disabled={initialPlaylists.length === 0}
              className="h-9 text-body-sm rounded-lg gap-1.5 bg-brand-primary text-white hover:bg-brand-primary/90"
            >
              <Plus className="size-4" />
              <span>Tambah Video</span>
            </Button>
          </div>
        )}
      </div>

      {/* Playlists Container - Formatted like Collapsible Bab di Dokumen */}
      {initialPlaylists.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/80 p-8 text-center bg-card/50">
          <VideoIcon className="mx-auto size-10 text-muted-foreground/60 mb-2" />
          <h3 className="font-heading text-body-base font-bold text-foreground">
            Belum ada playlist video
          </h3>
          <p className="mt-1 text-body-xs text-muted-foreground max-w-sm mx-auto">
            {canManage
              ? "Buat playlist terlebih dahulu (contoh: 'Pembahasan Soal UTS 2022'), lalu tambahkan video YouTube ke dalamnya."
              : "Video pembelajaran untuk mata kuliah ini belum tersedia."}
          </p>
          {canManage && (
            <Button
              size="sm"
              onClick={handleOpenCreatePlaylist}
              className="mt-4 text-body-sm rounded-lg gap-1.5 bg-brand-primary text-white hover:bg-brand-primary/90"
            >
              <Plus className="size-4" />
              <span>Buat Playlist Pertama</span>
            </Button>
          )}
        </div>
      ) : filteredPlaylists.length === 0 ? (
        <div className="rounded-xl border border-border/60 p-8 text-center bg-card">
          <p className="font-heading text-body-sm font-semibold text-foreground">
            Video tidak ditemukan
          </p>
          <p className="mt-1 text-body-xs text-muted-foreground">
            Coba sesuaikan kata kunci pencarian atau filter bab.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60 bg-card divide-y divide-border/45">
          {filteredPlaylists.map((playlist, index) => {
            const isOpen = Boolean(openPlaylists[playlist.id]);
            const hasVideos = playlist.videos.length > 0;

            return (
              <Collapsible
                key={playlist.id}
                open={isOpen}
                onOpenChange={() => togglePlaylist(playlist.id)}
                className="w-full"
              >
                {/* Collapsible Header - Matches CollapsibleDocumentSection appearance */}
                <div className="group flex w-full items-center justify-between gap-3 px-3.5 py-3 hover:bg-muted/30 transition-colors">
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex flex-1 items-center gap-3 text-left focus:outline-hidden"
                    >
                      <span className="w-16 shrink-0 text-body-xs font-semibold text-brand-primary">
                        Playlist {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-heading text-body-sm font-semibold text-foreground">
                        {playlist.title}
                      </span>
                      <span className="shrink-0 text-body-xs text-muted-foreground">
                        {playlist.videos.length} video
                      </span>
                      <ChevronDown
                        className={cn(
                          "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                          isOpen && "rotate-180"
                        )}
                        aria-hidden
                      />
                    </button>
                  </CollapsibleTrigger>

                  {/* Actions for playlist header */}
                  {canManage && (
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenAddVideo(playlist.id);
                        }}
                        className="h-7 px-2 text-body-xs rounded-md gap-1 text-brand-primary hover:text-brand-primary"
                      >
                        <Plus className="size-3" />
                        <span className="hidden sm:inline">Tambah Video</span>
                      </Button>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="size-7 p-0 rounded-md text-muted-foreground hover:text-foreground"
                          >
                            <MoreVertical className="size-3.5" />
                            <span className="sr-only">Menu Playlist</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="text-body-sm">
                          <DropdownMenuItem onClick={() => handleOpenEditPlaylist(playlist)}>
                            <Pencil className="mr-2 size-3.5" />
                            <span>Edit Playlist</span>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setPlaylistToDelete(playlist)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 size-3.5" />
                            <span>Hapus Playlist</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </div>

                {/* Collapsible Content: Grid of Video Cards */}
                <CollapsibleContent>
                  {!hasVideos ? (
                    <div className="border-t border-border/35 bg-muted/10 p-6 text-center text-body-xs text-muted-foreground">
                      <p>Belum ada video dalam playlist ini.</p>
                      {canManage && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenAddVideo(playlist.id)}
                          className="mt-2 h-7 text-body-xs gap-1 rounded-lg"
                        >
                          <Plus className="size-3" />
                          <span>Tambah Video</span>
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="divide-y divide-border/40 border-t border-border/40 bg-card/30">
                      {playlist.videos.map((video) => {
                        const isLocked = !canManage && !isEnrolled && (video.locked ?? true);
                        const thumbnail = video.thumbnailUrl || getYouTubeThumbnailUrl(video.videoUrl);
                        return (
                          <div
                            key={video.id}
                            className={cn(
                              "group flex items-center justify-between gap-3 px-3.5 py-2.5 transition-colors hover:bg-muted/40",
                              isLocked ? "opacity-90 cursor-pointer" : "cursor-pointer"
                            )}
                            onClick={() => handlePlayVideo(video, playlist)}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              {/* Landscape Video Thumbnail */}
                              <div className="relative w-28 sm:w-36 aspect-video shrink-0 overflow-hidden rounded-lg border border-border/60 bg-muted/20">
                                {thumbnail ? (
                                  <img
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
                                      <Lock className="size-3 text-amber-400" />
                                    </div>
                                  ) : (
                                    <div className="rounded-full bg-black/60 p-1.5 backdrop-blur-xs group-hover:scale-110 transition-transform">
                                      <Play className="size-3 fill-white text-white ml-0.5" />
                                    </div>
                                  )}
                                </div>
                                {video.duration && video.duration > 0 ? (
                                  <div className="absolute bottom-1 right-1 rounded bg-black/75 px-1 py-0.5 text-[10px] font-medium text-white tabular-nums leading-none">
                                    {Math.floor(video.duration / 60)}:
                                    {String(video.duration % 60).padStart(2, "0")}
                                  </div>
                                ) : null}
                              </div>

                              {/* Center Title and Combined Sub-line */}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <h4
                                    className={cn(
                                      "text-body-sm font-semibold truncate text-foreground transition-colors",
                                      isLocked
                                        ? "group-hover:text-amber-600 dark:group-hover:text-amber-400"
                                        : "group-hover:text-brand-primary"
                                    )}
                                    title={video.title}
                                  >
                                    {video.title}
                                  </h4>
                                  {isLocked && (
                                    <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-body-2xs font-semibold text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20">
                                      <Lock className="size-2.5" />
                                      Terkunci
                                    </span>
                                  )}
                                </div>
                                <p className="mt-1 flex items-center gap-1.5 text-body-xs text-muted-foreground flex-wrap">
                                  {video.chapterTitle && (
                                    <span className="rounded bg-muted/60 px-1.5 py-0.5 text-body-2xs font-medium text-foreground/80">
                                      {video.chapterTitle}
                                    </span>
                                  )}
                                  {video.chapterTitle && (video.fileSize || video.videoUrl) && (
                                    <span>·</span>
                                  )}
                                  {isLocked ? (
                                    <span className="text-amber-600 dark:text-amber-400 font-medium">Perlu akses kelas</span>
                                  ) : video.videoUrl.includes("youtube") || video.videoUrl.includes("youtu.be") ? (
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
                                      size="sm"
                                      className="size-7 p-0 text-muted-foreground hover:text-foreground rounded-md"
                                    >
                                      <MoreVertical className="size-3.5" />
                                      <span className="sr-only">Menu Video</span>
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="text-body-sm">
                                    <DropdownMenuItem onClick={() => handleOpenEditVideo(video)}>
                                      <Pencil className="mr-2 size-3.5" />
                                      <span>Edit Video</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => setVideoToDelete(video)}
                                      className="text-destructive focus:text-destructive"
                                    >
                                      <Trash2 className="mr-2 size-3.5" />
                                      <span>Hapus Video</span>
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
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
      <PlaylistDialog
        open={playlistDialogOpen}
        onOpenChange={setPlaylistDialogOpen}
        courseId={courseId}
        playlist={editingPlaylist}
        onSuccess={() => router.refresh()}
      />

      {/* Video Upload/Edit Dialog */}
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
      <AdminConfirmDialog
        open={Boolean(playlistToDelete)}
        onOpenChange={(open) => !open && setPlaylistToDelete(null)}
        title="Hapus Playlist"
        description={`Playlist "${playlistToDelete?.title}" beserta seluruh video di dalamnya akan dihapus secara permanen.`}
        confirmLabel="Hapus Playlist"
        loading={deleteLoading}
        onConfirm={handleConfirmDeletePlaylist}
      />

      {/* Delete Video Confirmation */}
      <AdminConfirmDialog
        open={Boolean(videoToDelete)}
        onOpenChange={(open) => !open && setVideoToDelete(null)}
        title="Hapus Video"
        description={`Video "${videoToDelete?.title}" akan dihapus secara permanen.`}
        confirmLabel="Hapus Video"
        loading={deleteLoading}
        onConfirm={handleConfirmDeleteVideo}
      />

      {/* Locked Video Activation Dialog */}
      <Dialog open={Boolean(lockedVideo)} onOpenChange={(open) => !open && setLockedVideo(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-2 flex size-11 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20">
              <Lock className="size-5" />
            </div>
            <DialogTitle className="text-center font-heading text-body-base font-bold">
              Akses Video Terkunci
            </DialogTitle>
            <DialogDescription className="text-center text-body-xs text-muted-foreground">
              {lockedVideo ? `Video "${lockedVideo.title}" hanya dapat diakses oleh siswa terdaftar.` : "Video ini hanya dapat diakses oleh siswa terdaftar."} Masukkan token kelas untuk membuka seluruh video pembelajaran.
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
