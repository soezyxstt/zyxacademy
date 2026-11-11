"use client";

import Image from "next/image";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "@/lib/i18n/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import {
  uploadCourseVideoFile,
  uploadCourseVideoThumbnail,
} from "@/lib/storage/video-upload-client";
import {
  extractYouTubeVideoId,
  getCanonicalYouTubeUrl,
  getYouTubeThumbnailUrl,
} from "@/lib/video/youtube";
import { FaYoutube } from "react-icons/fa6";
import {
  Upload,
  Video as VideoIcon,
  Image as ImageIcon,
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  ExternalLink,
  Film,
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

/**
 * Modal dialog for creating and editing course videos.
 * Supports dual modes: pasting a YouTube link or uploading a direct video file to Zyx storage.
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
  const t = useTranslations("adminMedia");
  const isEditing = Boolean(video);

  // Mode: "youtube" or "upload"
  const [sourceType, setSourceType] = useState<"youtube" | "upload">("youtube");

  // Common fields
  const [title, setTitle] = useState("");
  const [playlistId, setPlaylistId] = useState("");
  const [chapterId, setChapterId] = useState<string>("none");
  const [description, setDescription] = useState("");

  // YouTube mode states
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [detectedVideoId, setDetectedVideoId] = useState<string | null>(null);
  const [metaAuthor, setMetaAuthor] = useState<string | null>(null);
  const [fetchingMeta, setFetchingMeta] = useState(false);

  // File Upload mode states
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);

  // Frame candidates & scrubber for uploaded videos
  const [candidates, setCandidates] = useState<FrameCandidate[]>([]);
  const [isGeneratingFrames, setIsGeneratingFrames] = useState(false);
  const [scrubTime, setScrubTime] = useState<number>(0);
  const [scrubPreviewUrl, setScrubPreviewUrl] = useState<string | null>(null);

  // Thumbnail states (both modes)
  const [selectedThumbnailBlob, setSelectedThumbnailBlob] = useState<Blob | null>(null);
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] = useState<string | null>(null);
  const [customThumbnailFile, setCustomThumbnailFile] = useState<File | null>(null);

  // Global loading
  const [saving, setSaving] = useState(false);

  // Refs
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const customThumbInputRef = useRef<HTMLInputElement | null>(null);
  const scrubberVideoRef = useRef<HTMLVideoElement | null>(null);

  // Initialize or reset form
  useEffect(() => {
    if (video) {
      const isYt = Boolean(extractYouTubeVideoId(video.videoUrl));
      setSourceType(isYt ? "youtube" : "upload");

      if (isYt) {
        setYoutubeUrl(video.videoUrl);
        const vidId = extractYouTubeVideoId(video.videoUrl);
        setDetectedVideoId(vidId);
      } else {
        setYoutubeUrl("");
        setDetectedVideoId(null);
      }

      setTitle(video.title);
      setPlaylistId(video.playlistId);
      setChapterId(video.chapterId || "none");
      setDescription(video.description || "");
      setThumbnailPreviewUrl(video.thumbnailUrl || null);
      setVideoDuration(video.duration || null);
    } else {
      setSourceType("youtube");
      setYoutubeUrl("");
      setTitle("");
      setPlaylistId(defaultPlaylistId || (playlists[0]?.id ?? ""));
      setChapterId("none");
      setDescription("");
      setThumbnailPreviewUrl(null);
      setDetectedVideoId(null);
      setVideoDuration(null);
    }

    setVideoFile(null);
    setCandidates([]);
    setSelectedThumbnailBlob(null);
    setCustomThumbnailFile(null);
    setScrubPreviewUrl(null);
    setScrubTime(0);
    setUploadPercent(null);
    setMetaAuthor(null);
  }, [video, open, defaultPlaylistId, playlists]);

  // Captures a frame from HTMLVideoElement at a given timestamp
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

  // Handle Video File selection for Upload mode
  async function handleVideoSelect(file: File) {
    if (file.size > MAX_VIDEO_SIZE_BYTES) {
      toast.error("Ukuran berkas video melebihi batas maksimal 100 MB.");
      return;
    }

    setVideoFile(file);
    if (!title.trim()) {
      const baseName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]+/g, " ");
      setTitle(baseName.charAt(0).toUpperCase() + baseName.slice(1));
    }

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

      const timestamps = [dur * 0.15, dur * 0.5, dur * 0.8];
      const generatedCandidates: FrameCandidate[] = [];

      for (const t of timestamps) {
        try {
          const frame = await captureVideoFrame(vid, t);
          if (frame) generatedCandidates.push(frame);
        } catch {
          // Ignore individual capture failures
        }
      }

      setCandidates(generatedCandidates);
      setIsGeneratingFrames(false);

      if (generatedCandidates[0] && !selectedThumbnailBlob && !customThumbnailFile) {
        setSelectedThumbnailBlob(generatedCandidates[0].blob);
        setThumbnailPreviewUrl(generatedCandidates[0].dataUrl);
      }
    };

    vid.onerror = () => {
      setIsGeneratingFrames(false);
      toast.error("Gagal membaca berkas video. Pastikan format video didukung.");
    };
  }

  // Handle Scrub slider change
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

  // Use scrubbed frame as thumbnail
  function handleUseScrubbedFrame() {
    if (!scrubberVideoRef.current || !videoFile) return;
    captureVideoFrame(scrubberVideoRef.current, scrubTime).then((frame) => {
      if (frame) {
        setSelectedThumbnailBlob(frame.blob);
        setThumbnailPreviewUrl(frame.dataUrl);
        setCustomThumbnailFile(null);
        toast.success("Frame video berhasil dipilih sebagai thumbnail.");
      }
    });
  }

  // Handle YouTube URL change
  function handleUrlChange(rawInput: string) {
    setYoutubeUrl(rawInput);
    const videoId = extractYouTubeVideoId(rawInput);
    setDetectedVideoId(videoId);

    if (videoId && !customThumbnailFile) {
      setThumbnailPreviewUrl(getYouTubeThumbnailUrl(videoId, "hq"));
    }
  }

  // Fetch YouTube Metadata via oEmbed
  async function handleFetchMetadata() {
    const videoId = extractYouTubeVideoId(youtubeUrl);
    if (!videoId) {
      toast.error("Masukkan tautan YouTube yang valid terlebih dahulu.");
      return;
    }

    setFetchingMeta(true);
    try {
      const res = await fetchYouTubeMetadataAction(youtubeUrl);
      if (res.success) {
        if (res.title && (!title.trim() || !isEditing)) {
          setTitle(res.title);
        }
        if (res.authorName) {
          setMetaAuthor(res.authorName);
        }
        if (res.thumbnailUrl && !customThumbnailFile) {
          setThumbnailPreviewUrl(res.thumbnailUrl);
        }
        toast.success("Informasi video YouTube berhasil dimuat.");
      } else {
        toast.error(t("videoDialog.errors.fetchMetadata"));
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
    setSelectedThumbnailBlob(file);
    const previewUrl = URL.createObjectURL(file);
    setThumbnailPreviewUrl(previewUrl);
  }

  // Reset thumbnail back to YouTube default
  function handleResetToYouTubeThumb() {
    if (detectedVideoId) {
      const defaultThumb = getYouTubeThumbnailUrl(detectedVideoId, "hq");
      setCustomThumbnailFile(null);
      setSelectedThumbnailBlob(null);
      setThumbnailPreviewUrl(defaultThumb);
      toast.success("Thumbnail dikembalikan ke gambar bawaan YouTube.");
    }
  }

  // Submit Handler
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      toast.error("Judul video wajib diisi.");
      return;
    }

    if (!playlistId) {
      toast.error("Silakan pilih playlist terlebih dahulu.");
      return;
    }

    setSaving(true);
    try {
      let finalVideoUrl = "";
      let finalThumbnailUrl: string | null = null;
      let finalDuration: number | null = null;
      let finalFileSize: number | null = null;

      if (sourceType === "youtube") {
        // Mode 1: YouTube
        const videoId = extractYouTubeVideoId(youtubeUrl);
        if (!videoId) {
          toast.error("Tautan YouTube tidak valid. Pastikan tautan lengkap dimasukkan.");
          setSaving(false);
          return;
        }

        finalVideoUrl = getCanonicalYouTubeUrl(videoId);

        if (customThumbnailFile) {
          const thumbRes = await uploadCourseVideoThumbnail(customThumbnailFile, {
            courseId,
            filename: customThumbnailFile.name,
          });
          finalThumbnailUrl = thumbRes.key;
        } else {
          finalThumbnailUrl = thumbnailPreviewUrl || getYouTubeThumbnailUrl(videoId, "hq");
        }
      } else {
        // Mode 2: File Upload
        if (!video && !videoFile) {
          toast.error("Silakan pilih berkas video yang ingin diunggah.");
          setSaving(false);
          return;
        }

        // Upload Video File if changed
        if (videoFile) {
          setUploadPercent(0);
          const uploadRes = await uploadCourseVideoFile(videoFile, {
            courseId,
            onProgress: (pct) => setUploadPercent(pct),
          });
          finalVideoUrl = uploadRes.key;
          finalFileSize = videoFile.size;
          finalDuration = videoDuration;
        } else {
          finalVideoUrl = video?.videoKey || video?.videoUrl || "";
          finalFileSize = video?.fileSize || null;
          finalDuration = video?.duration || null;
        }

        // Upload Thumbnail if changed
        if (selectedThumbnailBlob) {
          const thumbRes = await uploadCourseVideoThumbnail(selectedThumbnailBlob, {
            courseId,
            filename: customThumbnailFile
              ? customThumbnailFile.name
              : `thumbnail-${Date.now()}.jpg`,
          });
          finalThumbnailUrl = thumbRes.key;
        } else {
          finalThumbnailUrl = video?.thumbnailKey || video?.thumbnailUrl || null;
        }
      }

      const res = await saveCourseVideoAction({
        id: video ? video.id : null,
        courseId,
        playlistId,
        chapterId: chapterId === "none" ? null : chapterId,
        title: cleanTitle,
        description: description.trim() || null,
        videoUrl: finalVideoUrl,
        thumbnailUrl: finalThumbnailUrl,
        duration: finalDuration,
        fileSize: finalFileSize,
      });

      if (res.success) {
        toast.success(isEditing ? "Video berhasil diperbarui." : "Video berhasil ditambahkan.");
        onOpenChange(false);
        onSuccess?.();
      } else {
        toast.error(t("videoDialog.errors.save"));
      }
    } catch {
      toast.error(t("videoDialog.errors.save"));
    } finally {
      setSaving(false);
      setUploadPercent(null);
    }
  }

  const isExistingUploadedFile = Boolean(
    video && !extractYouTubeVideoId(video.videoUrl)
  );

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (nextOpen || !saving) onOpenChange(nextOpen); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-body-base font-bold flex items-center gap-2">
            <Film className="size-5 text-brand-primary" />
            <span>{isEditing ? "Edit Video Pembelajaran" : "Tambah Video Pembelajaran"}</span>
          </DialogTitle>
          <DialogDescription className="text-body-xs text-muted-foreground">
            Tambahkan materi video dengan menaruh tautan YouTube atau mengunggah berkas video langsung ke penyimpanan Zyx.
          </DialogDescription>
        </DialogHeader>

        {/* Source Mode Tabs */}
        <Tabs
          value={sourceType}
          onValueChange={(val) => setSourceType(val as "youtube" | "upload")}
          syncUrl={false}
          className="w-full pt-1"
        >
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger
              value="youtube"
              className="flex items-center gap-1.5 text-body-sm font-semibold"
            >
              <FaYoutube className="size-4 text-red-600" />
              <span>Tautan YouTube</span>
            </TabsTrigger>
            <TabsTrigger
              value="upload"
              className="flex items-center gap-1.5 text-body-sm font-semibold"
            >
              <Upload className="size-4" />
              <span>Unggah Berkas</span>
            </TabsTrigger>
          </TabsList>

          <form onSubmit={handleSubmit} className="space-y-4 pt-3">
            {/* TAB 1: YOUTUBE */}
            <TabsContent value="youtube" className="space-y-4 m-0">
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
                      required={sourceType === "youtube"}
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
                    {thumbnailPreviewUrl ? (
                      <Image unoptimized loading="eager" width={160} height={90}
                        src={thumbnailPreviewUrl}
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
            </TabsContent>

            {/* TAB 2: UPLOAD BERKAS */}
            <TabsContent value="upload" className="space-y-4 m-0">
              <div className="space-y-1.5">
                <Label className="text-body-sm font-semibold">
                  Berkas Video {!isEditing && <span className="text-destructive">*</span>}
                  <span className="ml-1 text-body-xs font-normal text-muted-foreground">
                    (Maks. 100 MB, format MP4 / WebM / MOV)
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
                        {videoDuration
                          ? ` • ${Math.floor(videoDuration / 60)}:${String(videoDuration % 60).padStart(2, "0")}`
                          : ""}
                      </p>
                    </div>
                  ) : isExistingUploadedFile ? (
                    <div>
                      <p className="text-body-sm font-medium text-foreground">
                        Berkas video sudah tersimpan di penyimpanan Zyx
                      </p>
                      <p className="text-body-xs text-muted-foreground">
                        Klik di sini jika ingin mengganti dengan berkas video baru
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-body-sm font-medium text-foreground">
                        Pilih atau seret berkas video ke sini
                      </p>
                      <p className="text-body-xs text-muted-foreground">
                        MP4, WebM, MOV maksimal 100 MB
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Upload Frame Snapshot Candidates */}
              {isGeneratingFrames ? (
                <div className="flex items-center justify-center py-4 text-body-xs text-muted-foreground gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  <span>Mengambil sampel frame snapshot dari video...</span>
                </div>
              ) : candidates.length > 0 ? (
                <div className="space-y-2.5 border-t border-border/40 pt-2.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-body-xs font-semibold">Pilih Frame Thumbnail</Label>
                    <span className="text-[11px] text-muted-foreground">Snapshot otomatis</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {candidates.map((cand, idx) => {
                      const isSelected =
                        selectedThumbnailBlob === cand.blob ||
                        thumbnailPreviewUrl === cand.dataUrl;

                      return (
                        <div
                          key={idx}
                          onClick={() => {
                            setSelectedThumbnailBlob(cand.blob);
                            setThumbnailPreviewUrl(cand.dataUrl);
                            setCustomThumbnailFile(null);
                          }}
                          className={cn(
                            "group relative aspect-video cursor-pointer overflow-hidden rounded-lg border-2 transition-all",
                            isSelected
                              ? "border-brand-primary shadow-xs ring-2 ring-brand-primary/20"
                              : "border-border/60 hover:border-border"
                          )}
                        >
                          <Image unoptimized loading="eager" width={160} height={90}
                            src={cand.dataUrl}
                            alt={`Frame ${idx + 1}`}
                            className="h-full w-full object-cover"
                          />
                          {isSelected && (
                            <div className="absolute top-1 right-1 rounded-full bg-brand-primary p-0.5 text-primary-foreground">
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

                  {/* Scrubber Range */}
                  {videoDuration && videoDuration > 0 && (
                    <div className="rounded-lg border border-border/50 bg-muted/20 p-2.5 space-y-2">
                      <div className="flex items-center justify-between text-body-xs">
                        <span className="font-medium text-foreground">Geser Detik Tertentu:</span>
                        <span className="font-mono text-muted-foreground">
                          {Math.floor(scrubTime / 60)}:
                          {String(Math.floor(scrubTime % 60)).padStart(2, "0")} /{" "}
                          {Math.floor(videoDuration / 60)}:
                          {String(Math.floor(videoDuration % 60)).padStart(2, "0")}
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
                          <Image unoptimized loading="eager" width={80} height={48}
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
                            Gunakan Frame Ini
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : null}
            </TabsContent>

            {/* COMMON FIELDS: Title, Playlist, Chapter, Description */}
            <div className="space-y-4 border-t border-border/40 pt-3">
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
                  placeholder="Catatan ringkas mengenai konsep yang dibahas dalam video..."
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
                      {sourceType === "youtube"
                        ? "Menggunakan thumbnail bawaan YouTube secara default, atau unggah gambar kustom."
                        : "Pilih frame snapshot video atau unggah gambar sampul kustom."}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {sourceType === "youtube" && customThumbnailFile && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleResetToYouTubeThumb}
                        className="h-7 text-body-xs text-muted-foreground hover:text-foreground"
                      >
                        Bawaan YouTube
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

                {thumbnailPreviewUrl && (
                  <div className="flex items-center gap-3 rounded-lg border border-border/60 p-2 bg-muted/10">
                    <Image unoptimized loading="eager" width={96} height={56}
                      src={thumbnailPreviewUrl}
                      alt="Thumbnail"
                      className="h-14 w-24 rounded border border-border/70 object-cover"
                    />
                    <div className="text-body-xs">
                      <p className="font-medium text-foreground">
                        {customThumbnailFile
                          ? "Thumbnail kustom"
                          : sourceType === "youtube"
                          ? "Thumbnail bawaan YouTube"
                          : "Frame snapshot video"}
                      </p>
                      <p className="text-muted-foreground text-[11px]">
                        {customThumbnailFile
                          ? customThumbnailFile.name
                          : sourceType === "youtube"
                          ? "Disinkronkan otomatis dari YouTube"
                          : "Diambil dari rekaman video"}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Upload Progress Bar */}
              {uploadPercent !== null && (
                <div className="space-y-1 rounded-lg border border-brand-primary/20 bg-brand-primary/5 p-3">
                  <div className="flex justify-between text-body-xs font-semibold text-brand-primary">
                    <span>Mengunggah berkas video ke penyimpanan...</span>
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
                disabled={
                  saving ||
                  (sourceType === "youtube" && !detectedVideoId) ||
                  (sourceType === "upload" && !video && !videoFile)
                }
                className="text-body-sm bg-brand-primary text-primary-foreground hover:bg-brand-primary/90 gap-1.5"
              >
                {saving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    <span>
                      {uploadPercent !== null
                        ? `Mengunggah (${uploadPercent}%)`
                        : "Menyimpan..."}
                    </span>
                  </>
                ) : isEditing ? (
                  "Simpan Perubahan"
                ) : sourceType === "upload" ? (
                  "Unggah Video"
                ) : (
                  "Tambahkan Video"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
