"use client";

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import {
  saveCourseVideoAction,
  fetchYouTubeMetadataAction,
  type VideoItem,
  type VideoPlaylistItem,
} from "@/app/actions/video-actions";
import { uploadCourseVideoThumbnail } from "@/lib/storage/video-upload-client";
import {
  extractYouTubeVideoId,
  getCanonicalYouTubeUrl,
  getYouTubeThumbnailUrl,
} from "@/lib/video/youtube";
import { FaYoutube } from "react-icons/fa6";
import {
  Image as ImageIcon,
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ChapterOption = {
  id: string;
  title: string;
  orderIndex: number;
};

type AdminVideoDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  playlists: VideoPlaylistItem[];
  chapters: ChapterOption[];
  video?: VideoItem | null;
  defaultPlaylistId?: string;
  onOpenCreatePlaylist?: () => void;
  onSuccess?: () => void;
};

/**
 * Modal dialog for adding and editing course YouTube videos with automatic metadata retrieval.
 */
export function AdminVideoDialog({
  open,
  onOpenChange,
  courseId,
  playlists,
  chapters,
  video,
  defaultPlaylistId,
  onOpenCreatePlaylist,
  onSuccess,
}: AdminVideoDialogProps) {
  const isEditing = Boolean(video);

  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [title, setTitle] = useState("");
  const [playlistId, setPlaylistId] = useState("");
  const [chapterId, setChapterId] = useState<string>("none");
  const [description, setDescription] = useState("");

  // Thumbnail states
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [customThumbnailFile, setCustomThumbnailFile] = useState<File | null>(null);
  const [customThumbnailPreview, setCustomThumbnailPreview] = useState<string | null>(null);

  // Loading & metadata states
  const [fetchingMeta, setFetchingMeta] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detectedVideoId, setDetectedVideoId] = useState<string | null>(null);
  const [metaAuthor, setMetaAuthor] = useState<string | null>(null);

  const customThumbInputRef = useRef<HTMLInputElement | null>(null);

  // Initialize or reset form
  useEffect(() => {
    if (video) {
      setYoutubeUrl(video.videoUrl);
      setTitle(video.title);
      setPlaylistId(video.playlistId);
      setChapterId(video.chapterId || "none");
      setDescription(video.description || "");
      setThumbnailUrl(video.thumbnailUrl || null);
      const vidId = extractYouTubeVideoId(video.videoUrl);
      setDetectedVideoId(vidId);
    } else {
      setYoutubeUrl("");
      setTitle("");
      setPlaylistId(defaultPlaylistId || (playlists[0]?.id ?? ""));
      setChapterId("none");
      setDescription("");
      setThumbnailUrl(null);
      setDetectedVideoId(null);
    }
    setCustomThumbnailFile(null);
    setCustomThumbnailPreview(null);
    setMetaAuthor(null);
  }, [video, open, defaultPlaylistId, playlists]);

  // Handle URL change and auto-detect YouTube ID
  async function handleUrlChange(rawInput: string) {
    setYoutubeUrl(rawInput);
    const videoId = extractYouTubeVideoId(rawInput);
    setDetectedVideoId(videoId);

    if (videoId) {
      const defaultThumb = getYouTubeThumbnailUrl(videoId, "hq");
      if (!customThumbnailFile) {
        setThumbnailUrl(defaultThumb);
      }
    }
  }

  // Fetch YouTube Metadata (Title, Author, Thumbnail)
  async function handleFetchMetadata(overrideUrl?: string) {
    const targetUrl = overrideUrl || youtubeUrl;
    const videoId = extractYouTubeVideoId(targetUrl);
    if (!videoId) {
      toast.error("Masukkan tautan YouTube yang valid terlebih dahulu.");
      return;
    }

    setFetchingMeta(true);
    try {
      const res = await fetchYouTubeMetadataAction(targetUrl);
      if (res.success) {
        if (res.title && (!title.trim() || !isEditing)) {
          setTitle(res.title);
        }
        if (res.authorName) {
          setMetaAuthor(res.authorName);
        }
        if (res.thumbnailUrl && !customThumbnailFile) {
          setThumbnailUrl(res.thumbnailUrl);
        }
        toast.success("Informasi video YouTube berhasil dimuat.");
      } else {
        toast.error(res.error || "Gagal mengambil data video dari YouTube.");
      }
    } catch {
      toast.error("Terjadi kendala saat menghubungi layanan YouTube.");
    } finally {
      setFetchingMeta(false);
    }
  }

  // Handle custom image thumbnail selection
  function handleCustomThumbnailSelect(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Ukuran berkas thumbnail maksimal 5 MB.");
      return;
    }
    setCustomThumbnailFile(file);
    const previewUrl = URL.createObjectURL(file);
    setCustomThumbnailPreview(previewUrl);
    setThumbnailUrl(previewUrl);
  }

  // Reset back to YouTube auto-generated thumbnail
  function handleResetToYouTubeThumb() {
    if (detectedVideoId) {
      const defaultThumb = getYouTubeThumbnailUrl(detectedVideoId, "hq");
      setCustomThumbnailFile(null);
      setCustomThumbnailPreview(null);
      setThumbnailUrl(defaultThumb);
      toast.success("Thumbnail dikembalikan ke gambar bawaan YouTube.");
    }
  }

  // Submit Handler
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const videoId = extractYouTubeVideoId(youtubeUrl);
    if (!videoId) {
      toast.error("Tautan YouTube tidak valid. Pastikan tautan lengkap dimasukkan.");
      return;
    }

    if (!title.trim()) {
      toast.error("Judul video wajib diisi.");
      return;
    }

    if (!playlistId) {
      toast.error("Silakan pilih playlist terlebih dahulu.");
      return;
    }

    setSaving(true);
    try {
      let finalThumb = thumbnailUrl;

      // Upload custom thumbnail to R2 if provided
      if (customThumbnailFile) {
        const uploadRes = await uploadCourseVideoThumbnail(customThumbnailFile, {
          courseId,
          filename: customThumbnailFile.name,
        });
        finalThumb = uploadRes.key;
      } else if (!finalThumb && videoId) {
        finalThumb = getYouTubeThumbnailUrl(videoId, "hq");
      }

      const canonicalVideoUrl = getCanonicalYouTubeUrl(videoId);

      const res = await saveCourseVideoAction({
        id: video ? video.id : null,
        courseId,
        playlistId,
        chapterId: chapterId === "none" ? null : chapterId,
        title: title.trim(),
        description: description.trim() || null,
        videoUrl: canonicalVideoUrl,
        thumbnailUrl: finalThumb,
      });

      if (res.success) {
        toast.success(isEditing ? "Video berhasil diperbarui." : "Video YouTube berhasil ditambahkan.");
        onOpenChange(false);
        onSuccess?.();
      } else {
        toast.error(res.error || "Gagal menyimpan video.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Terjadi kesalahan saat menyimpan video.");
    } finally {
      setSaving(false);
    }
  }

  const effectiveThumbnail = customThumbnailPreview || thumbnailUrl || (detectedVideoId ? getYouTubeThumbnailUrl(detectedVideoId, "hq") : null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-body-base font-bold flex items-center gap-2">
            <FaYoutube className="size-5 text-red-600" />
            <span>{isEditing ? "Edit Video YouTube" : "Tambah Video YouTube"}</span>
          </DialogTitle>
          <DialogDescription className="text-body-xs text-muted-foreground">
            Masukkan tautan video YouTube. Siswa akan menonton video langsung di dalam pemutar interaktif Zyx tanpa diunggah ke penyimpanan file.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-1">
          {/* Tautan YouTube */}
          <div className="space-y-1.5">
            <Label htmlFor="youtube-url" className="text-body-sm font-semibold">
              Tautan Video YouTube <span className="text-destructive">*</span>
            </Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <FaYoutube className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  id="youtube-url"
                  placeholder="https://www.youtube.com/watch?v=... atau https://youtu.be/..."
                  value={youtubeUrl}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  className="pl-9 text-body-sm font-mono"
                  required
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleFetchMetadata()}
                disabled={fetchingMeta || !detectedVideoId}
                className="h-9 shrink-0 gap-1.5 text-body-xs rounded-lg"
              >
                {fetchingMeta ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                <span>Ambil Data</span>
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Mendukung format youtube.com/watch?v=..., youtu.be/..., shorts/..., atau ID video 11 karakter.
            </p>
          </div>

          {/* YouTube Preview Card */}
          {detectedVideoId && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 rounded-xl border border-border/70 bg-muted/20 p-2.5">
              <div className="relative aspect-video w-full sm:w-40 shrink-0 overflow-hidden rounded-lg bg-black/10 border border-border/50">
                {effectiveThumbnail ? (
                  <img
                    src={effectiveThumbnail}
                    alt="Pratinjau YouTube"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <FaYoutube className="size-6 text-red-500 opacity-60" />
                  </div>
                )}
                <div className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.5 text-[10px] font-mono text-white">
                  ID: {detectedVideoId}
                </div>
              </div>

              <div className="min-w-0 flex-1 space-y-1 text-body-xs">
                <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                  <CheckCircle2 className="size-3.5" />
                  <span>Tautan valid terdeteksi</span>
                </div>
                {metaAuthor && (
                  <p className="text-muted-foreground truncate">
                    Kanal: <span className="font-medium text-foreground">{metaAuthor}</span>
                  </p>
                )}
                <a
                  href={getCanonicalYouTubeUrl(detectedVideoId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-brand-primary hover:underline"
                >
                  <span>Buka di tab YouTube</span>
                  <ExternalLink className="size-3" />
                </a>
              </div>
            </div>
          )}

          {/* Judul Video */}
          <div className="space-y-1.5">
            <Label htmlFor="video-title" className="text-body-sm font-semibold">
              Judul Video <span className="text-destructive">*</span>
            </Label>
            <Input
              id="video-title"
              placeholder="Contoh: Pembahasan Soal Limit Fungsi Aljabar"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-body-sm"
              required
            />
          </div>

          {/* Playlist & Bab (Row) */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="video-playlist" className="text-body-sm font-semibold">
                  Playlist <span className="text-destructive">*</span>
                </Label>
                {onOpenCreatePlaylist && (
                  <button
                    type="button"
                    onClick={onOpenCreatePlaylist}
                    className="text-body-xs text-brand-primary hover:underline font-medium inline-flex items-center gap-0.5"
                  >
                    <Plus className="size-3" />
                    <span>Playlist Baru</span>
                  </button>
                )}
              </div>
              <Select value={playlistId} onValueChange={setPlaylistId}>
                <SelectTrigger id="video-playlist" className="text-body-sm">
                  <SelectValue placeholder="Pilih playlist..." />
                </SelectTrigger>
                <SelectContent>
                  {playlists.map((pl) => (
                    <SelectItem key={pl.id} value={pl.id} className="text-body-sm">
                      {pl.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="video-chapter" className="text-body-sm font-semibold">
                Kaitkan dengan Bab <span className="text-body-xs text-muted-foreground font-normal">(opsional)</span>
              </Label>
              <Select value={chapterId} onValueChange={setChapterId}>
                <SelectTrigger id="video-chapter" className="text-body-sm">
                  <SelectValue placeholder="Pilih bab..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-body-sm text-muted-foreground">
                    Tanpa kaitan bab (Umum)
                  </SelectItem>
                  {chapters.map((ch) => (
                    <SelectItem key={ch.id} value={ch.id} className="text-body-sm">
                      Bab {ch.orderIndex}: {ch.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Deskripsi */}
          <div className="space-y-1.5">
            <Label htmlFor="video-desc" className="text-body-sm font-semibold">
              Deskripsi <span className="text-body-xs text-muted-foreground font-normal">(opsional)</span>
            </Label>
            <Textarea
              id="video-desc"
              placeholder="Catatan atau poin materi yang dibahas dalam video..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="text-body-sm min-h-[70px]"
            />
          </div>

          {/* Thumbnail Section */}
          <div className="space-y-2 border-t border-border/40 pt-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-body-sm font-semibold">Thumbnail Video</Label>
                <p className="text-body-xs text-muted-foreground">
                  Secara default memakai thumbnail dari YouTube. Anda juga dapat mengunggah thumbnail kustom jika diinginkan.
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                {customThumbnailFile && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleResetToYouTubeThumb}
                    className="h-7 text-body-xs text-muted-foreground hover:text-foreground"
                  >
                    Pakai Bawaan YouTube
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => customThumbInputRef.current?.click()}
                  className="h-7 text-body-xs gap-1.5 rounded-lg"
                >
                  <ImageIcon className="size-3.5" />
                  <span>Unggah Gambar</span>
                </Button>
                <input
                  ref={customThumbInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleCustomThumbnailSelect(f);
                  }}
                  className="hidden"
                />
              </div>
            </div>

            {effectiveThumbnail && (
              <div className="flex items-center gap-3 rounded-lg border border-border/60 p-2 bg-muted/10">
                <img
                  src={effectiveThumbnail}
                  alt="Thumbnail"
                  className="h-14 w-24 rounded border border-border/70 object-cover"
                />
                <div className="text-body-xs">
                  <p className="font-medium text-foreground">
                    {customThumbnailFile ? "Thumbnail kustom" : "Thumbnail bawaan YouTube"}
                  </p>
                  <p className="text-muted-foreground text-[11px]">
                    {customThumbnailFile ? customThumbnailFile.name : "Otomatis disinkronkan dari YouTube"}
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="text-body-sm"
            >
              Batal
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={saving || !detectedVideoId}
              className="text-body-sm bg-brand-primary text-white hover:bg-brand-primary/90 gap-1.5"
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : isEditing ? (
                "Simpan Perubahan"
              ) : (
                "Tambahkan Video"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
