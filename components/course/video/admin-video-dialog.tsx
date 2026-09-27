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
  type VideoItem,
  type VideoPlaylistItem,
} from "@/app/actions/video-actions";
import {
  uploadCourseVideoFile,
  uploadCourseVideoThumbnail,
} from "@/lib/storage/video-upload-client";
import {
  Video as VideoIcon,
  Upload,
  Image as ImageIcon,
  CheckCircle2,
  Loader2,
  Plus,
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_VIDEO_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

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

type FrameCandidate = {
  time: number;
  dataUrl: string;
  blob: Blob;
};

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

  const [title, setTitle] = useState("");
  const [playlistId, setPlaylistId] = useState("");
  const [chapterId, setChapterId] = useState<string>("none");
  const [description, setDescription] = useState("");

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);

  // Thumbnail states
  const [candidates, setCandidates] = useState<FrameCandidate[]>([]);
  const [isGeneratingFrames, setIsGeneratingFrames] = useState(false);
  const [selectedThumbnailBlob, setSelectedThumbnailBlob] = useState<Blob | null>(null);
  const [selectedThumbnailPreview, setSelectedThumbnailPreview] = useState<string | null>(null);
  const [customThumbnailFile, setCustomThumbnailFile] = useState<File | null>(null);

  // Scrub slider state
  const [scrubTime, setScrubTime] = useState<number>(0);
  const [scrubPreviewUrl, setScrubPreviewUrl] = useState<string | null>(null);

  // Upload & submission progress
  const [loading, setLoading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);

  const hiddenVideoRef = useRef<HTMLVideoElement | null>(null);
  const scrubberVideoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const customThumbInputRef = useRef<HTMLInputElement | null>(null);

  // Initialize or reset form
  useEffect(() => {
    if (video) {
      setTitle(video.title);
      setPlaylistId(video.playlistId);
      setChapterId(video.chapterId || "none");
      setDescription(video.description || "");
      setSelectedThumbnailPreview(video.thumbnailUrl || null);
      setVideoDuration(video.duration || null);
    } else {
      setTitle("");
      setPlaylistId(defaultPlaylistId || (playlists[0]?.id ?? ""));
      setChapterId("none");
      setDescription("");
      setSelectedThumbnailPreview(null);
      setVideoDuration(null);
    }
    setVideoFile(null);
    setCandidates([]);
    setSelectedThumbnailBlob(null);
    setCustomThumbnailFile(null);
    setScrubPreviewUrl(null);
    setScrubTime(0);
    setUploadPercent(null);
  }, [video, open, defaultPlaylistId, playlists]);

  // Handle video file selection and extract thumbnail frames like YouTube
  async function handleVideoSelect(file: File) {
    if (file.size > MAX_VIDEO_SIZE_BYTES) {
      toast.error("Ukuran berkas video melebihi batas maksimal 100 MB.");
      return;
    }

    setVideoFile(file);
    if (!title.trim()) {
      // Auto-populate title from clean filename
      const baseName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]+/g, " ");
      setTitle(baseName.charAt(0).toUpperCase() + baseName.slice(1));
    }

    // Load video to extract frames
    const objectUrl = URL.createObjectURL(file);
    setIsGeneratingFrames(true);
    setCandidates([]);

    const vid = document.createElement("video");
    vid.preload = "metadata";
    vid.src = objectUrl;
    vid.muted = true;
    vid.playsInline = true;

    vid.onloadedmetadata = async () => {
      const dur = vid.duration || 10;
      setVideoDuration(Math.round(dur));

      // Generate 3 sample candidate frame timestamps
      const timestamps = [dur * 0.15, dur * 0.5, dur * 0.8];
      const generatedCandidates: FrameCandidate[] = [];

      for (const t of timestamps) {
        try {
          const frame = await captureVideoFrame(vid, t);
          if (frame) generatedCandidates.push(frame);
        } catch {
          // Ignore individual capture errors
        }
      }

      setCandidates(generatedCandidates);
      setIsGeneratingFrames(false);

      // Default select candidate 0
      if (generatedCandidates[0] && !selectedThumbnailBlob && !customThumbnailFile) {
        setSelectedThumbnailBlob(generatedCandidates[0].blob);
        setSelectedThumbnailPreview(generatedCandidates[0].dataUrl);
      }
    };

    vid.onerror = () => {
      setIsGeneratingFrames(false);
      toast.error("Gagal membaca berkas video. Pastikan format video didukung.");
    };
  }

  // Captures a frame from a HTMLVideoElement at a given timestamp
  function captureVideoFrame(
    videoEl: HTMLVideoElement,
    time: number
  ): Promise<FrameCandidate | null> {
    return new Promise((resolve) => {
      videoEl.currentTime = Math.max(0, Math.min(time, videoEl.duration - 0.1));
      videoEl.onseeked = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = videoEl.videoWidth || 640;
          canvas.height = videoEl.videoHeight || 360;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(null);
          ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (blob) => {
              if (blob) {
                const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
                resolve({ time, dataUrl, blob });
              } else {
                resolve(null);
              }
            },
            "image/jpeg",
            0.85
          );
        } catch {
          resolve(null);
        }
      };
    });
  }

  // Handle Scrub Slider change
  async function handleScrubChange(newTime: number) {
    setScrubTime(newTime);
    if (!videoFile) return;

    if (!scrubberVideoRef.current) {
      const vid = document.createElement("video");
      vid.preload = "auto";
      vid.src = URL.createObjectURL(videoFile);
      vid.muted = true;
      scrubberVideoRef.current = vid;
    }

    const vid = scrubberVideoRef.current;
    const frame = await captureVideoFrame(vid, newTime);
    if (frame) {
      setScrubPreviewUrl(frame.dataUrl);
    }
  }

  // Use the scrubbed frame as the chosen thumbnail
  function handleUseScrubbedFrame() {
    if (!scrubberVideoRef.current || !videoFile) return;
    captureVideoFrame(scrubberVideoRef.current, scrubTime).then((frame) => {
      if (frame) {
        setSelectedThumbnailBlob(frame.blob);
        setSelectedThumbnailPreview(frame.dataUrl);
        setCustomThumbnailFile(null);
        toast.success("Frame video berhasil dipilih sebagai thumbnail.");
      }
    });
  }

  // Handle custom image file upload
  function handleCustomThumbnailSelect(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Ukuran gambar thumbnail melebihi batas 5 MB.");
      return;
    }
    setCustomThumbnailFile(file);
    setSelectedThumbnailBlob(file);
    setSelectedThumbnailPreview(URL.createObjectURL(file));
  }

  // Form Submit
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Judul video wajib diisi.");
      return;
    }
    if (!playlistId) {
      toast.error("Silakan pilih playlist terlebih dahulu.");
      return;
    }
    if (!video && !videoFile) {
      toast.error("Silakan pilih berkas video yang ingin diunggah.");
      return;
    }

    setLoading(true);
    try {
      let finalVideoUrl = video?.videoUrl || "";
      let finalThumbnailUrl = video?.thumbnailUrl || null;
      let finalDuration = videoDuration || video?.duration || null;
      let finalFileSize = videoFile?.size || video?.fileSize || null;

      // 1. Upload Video File if changed
      if (videoFile) {
        setUploadPercent(0);
        const uploadRes = await uploadCourseVideoFile(videoFile, {
          courseId,
          onProgress: (pct) => setUploadPercent(pct),
        });
        finalVideoUrl = uploadRes.key;
      }

      // 2. Upload Thumbnail if changed
      if (selectedThumbnailBlob) {
        const thumbRes = await uploadCourseVideoThumbnail(selectedThumbnailBlob, {
          courseId,
          filename: customThumbnailFile ? customThumbnailFile.name : `thumbnail-${Date.now()}.jpg`,
        });
        finalThumbnailUrl = thumbRes.key;
      }

      // 3. Save Record in Database
      const res = await saveCourseVideoAction({
        id: video ? video.id : null,
        courseId,
        playlistId,
        chapterId: chapterId === "none" ? null : chapterId,
        title: title.trim(),
        description: description.trim() || null,
        videoUrl: finalVideoUrl,
        thumbnailUrl: finalThumbnailUrl,
        duration: finalDuration,
        fileSize: finalFileSize,
      });

      if (res.success) {
        toast.success(isEditing ? "Video berhasil diperbarui." : "Video berhasil diunggah.");
        onOpenChange(false);
        onSuccess?.();
      } else {
        toast.error(res.error || "Gagal menyimpan video.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Terjadi kesalahan saat mengunggah video.");
    } finally {
      setLoading(false);
      setUploadPercent(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-body-base font-bold">
            {isEditing ? "Edit Video" : "Unggah Video Pembelajaran"}
          </DialogTitle>
          <DialogDescription className="text-body-xs text-muted-foreground">
            Unggah video materi atau pembahasan soal (maksimal 100 MB). Video dapat dikaitkan dengan bab kurikulum.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Judul Video */}
          <div className="space-y-1.5">
            <Label htmlFor="video-title" className="text-body-sm font-semibold">
              Judul Video <span className="text-destructive">*</span>
            </Label>
            <Input
              id="video-title"
              placeholder="Contoh: Soal 1: Analisis Limit Tak Hingga"
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
              placeholder="Penjelasan ringkas mengenai konsep yang dibahas dalam video..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="text-body-sm min-h-[70px]"
            />
          </div>

          {/* Video File Picker */}
          <div className="space-y-1.5">
            <Label className="text-body-sm font-semibold">
              Berkas Video {!isEditing && <span className="text-destructive">*</span>}
              <span className="ml-1 text-body-xs font-normal text-muted-foreground">
                (Maks. 100 MB, format MP4 / WebM)
              </span>
            </Label>

            <div
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "cursor-pointer rounded-xl border border-dashed border-border/80 p-4 text-center transition-colors hover:bg-muted/40",
                videoFile && "border-brand-primary/60 bg-brand-primary/5"
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime,video/x-matroska"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleVideoSelect(f);
                }}
                className="hidden"
              />
              <VideoIcon className="mx-auto size-8 text-muted-foreground mb-1" />
              {videoFile ? (
                <div className="space-y-0.5">
                  <p className="text-body-sm font-semibold text-brand-primary truncate max-w-sm mx-auto">
                    {videoFile.name}
                  </p>
                  <p className="text-body-xs text-muted-foreground">
                    {(videoFile.size / (1024 * 1024)).toFixed(1)} MB
                    {videoDuration ? ` • ${Math.floor(videoDuration / 60)}:${String(videoDuration % 60).padStart(2, "0")}` : ""}
                  </p>
                </div>
              ) : isEditing ? (
                <div>
                  <p className="text-body-sm font-medium text-foreground">Video sudah tersimpan</p>
                  <p className="text-body-xs text-muted-foreground">Klik di sini jika ingin mengganti berkas video</p>
                </div>
              ) : (
                <div>
                  <p className="text-body-sm font-medium text-foreground">
                    Pilih atau seret berkas video ke sini
                  </p>
                  <p className="text-body-xs text-muted-foreground">MP4, WebM, MOV maksimal 100 MB</p>
                </div>
              )}
            </div>
          </div>

          {/* YouTube-Style Thumbnail Selector */}
          <div className="space-y-2 border-t border-border/40 pt-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-body-sm font-semibold">Thumbnail Video</Label>
                <p className="text-body-xs text-muted-foreground">
                  Pilih snapshot otomatis dari video, geser frame, atau unggah gambar sendiri.
                </p>
              </div>
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

            {/* Candidate Frame Grid */}
            {isGeneratingFrames ? (
              <div className="flex items-center justify-center py-6 text-body-xs text-muted-foreground gap-2">
                <Loader2 className="size-4 animate-spin" />
                <span>Mengambil sampel frame dari video...</span>
              </div>
            ) : candidates.length > 0 ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  {candidates.map((cand, idx) => {
                    const isSelected =
                      selectedThumbnailBlob === cand.blob ||
                      selectedThumbnailPreview === cand.dataUrl;

                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          setSelectedThumbnailBlob(cand.blob);
                          setSelectedThumbnailPreview(cand.dataUrl);
                          setCustomThumbnailFile(null);
                        }}
                        className={cn(
                          "group relative aspect-video cursor-pointer overflow-hidden rounded-lg border-2 transition-all",
                          isSelected
                            ? "border-brand-primary shadow-xs ring-2 ring-brand-primary/20"
                            : "border-border/60 hover:border-border"
                        )}
                      >
                        <img
                          src={cand.dataUrl}
                          alt={`Frame ${idx + 1}`}
                          className="h-full w-full object-cover"
                        />
                        {isSelected && (
                          <div className="absolute top-1 right-1 rounded-full bg-brand-primary p-0.5 text-white">
                            <CheckCircle2 className="size-3.5" />
                          </div>
                        )}
                        <div className="absolute bottom-1 left-1 rounded bg-black/70 px-1 text-[10px] text-white">
                          Frame {idx + 1}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Frame Scrubber (Like YouTube Studio custom frame picker) */}
                {videoDuration && videoDuration > 0 && (
                  <div className="rounded-lg border border-border/50 bg-muted/20 p-2.5 space-y-2">
                    <div className="flex items-center justify-between text-body-xs">
                      <span className="font-medium text-foreground">Pilih Frame Tertentu:</span>
                      <span className="font-mono text-muted-foreground">
                        {Math.floor(scrubTime / 60)}:{String(Math.floor(scrubTime % 60)).padStart(2, "0")} / {Math.floor(videoDuration / 60)}:{String(Math.floor(videoDuration % 60)).padStart(2, "0")}
                      </span>
                    </div>

                    <input
                      type="range"
                      min={0}
                      max={videoDuration}
                      step={0.5}
                      value={scrubTime}
                      onChange={(e) => handleScrubChange(parseFloat(e.target.value))}
                      className="w-full accent-brand-primary h-1.5 cursor-pointer rounded-lg bg-muted"
                    />

                    {scrubPreviewUrl && (
                      <div className="flex items-center gap-3 pt-1">
                        <img
                          src={scrubPreviewUrl}
                          alt="Scrub preview"
                          className="h-12 w-20 rounded border border-border/60 object-cover"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={handleUseScrubbedFrame}
                          className="h-7 text-body-xs"
                        >
                          Gunakan Frame Ini Sebagai Thumbnail
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : selectedThumbnailPreview ? (
              <div className="flex items-center gap-3 rounded-lg border border-border/50 p-2">
                <img
                  src={selectedThumbnailPreview}
                  alt="Thumbnail"
                  className="h-16 w-28 rounded border border-border object-cover"
                />
                <div className="text-body-xs">
                  <p className="font-semibold text-foreground">Thumbnail Terpilih</p>
                  <p className="text-muted-foreground">
                    {customThumbnailFile ? customThumbnailFile.name : "Frame snapshot video"}
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          {/* Upload Progress Bar */}
          {uploadPercent !== null && (
            <div className="space-y-1 rounded-lg border border-brand-primary/20 bg-brand-primary/5 p-3">
              <div className="flex justify-between text-body-xs font-semibold text-brand-primary">
                <span>Mengunggah video ke penyimpanan...</span>
                <span>{uploadPercent}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-brand-primary transition-all duration-150"
                  style={{ width: `${uploadPercent}%` }}
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="text-body-sm"
            >
              Batal
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={loading}
              className="text-body-sm bg-brand-primary text-white hover:bg-brand-primary/90"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                  <span>{uploadPercent !== null ? `Mengunggah (${uploadPercent}%)` : "Menyimpan..."}</span>
                </>
              ) : isEditing ? (
                "Simpan Perubahan"
              ) : (
                "Unggah Video"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
