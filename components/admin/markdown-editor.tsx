"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";
import { ImagePlus, Loader2, Eye, Code, ImageIcon } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { saveArticle } from "@/app/(admin)/admin/blog/actions";
import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { useTranslations } from "@/lib/i18n/client";

interface MarkdownEditorProps {
  initialData?: any;
}

function BlogThumbnailPreview({
  url,
  alt,
  className,
  onRemove,
}: {
  url: string;
  alt: string;
  className?: string;
  onRemove?: () => void;
}) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [url]);

  return (
    <div className={cn("relative aspect-video rounded-md border border-border overflow-hidden bg-muted flex items-center justify-center group", className)}>
      {hasError ? (
        <div className="flex flex-col items-center justify-center p-4 text-center text-muted-foreground">
          <ImageIcon className="size-6 text-muted-foreground/60 mb-1" />
          <p className="text-body-xs font-medium text-foreground">Thumbnail gagal dimuat</p>
          <p className="text-body-2xs text-muted-foreground">Periksa URL atau unggah berkas baru</p>
        </div>
      ) : (
        <Image
          src={url}
          alt={alt}
          fill
          className="object-cover"
          onError={() => setHasError(true)}
        />
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-md p-1.5 transition-colors text-body-xs font-semibold cursor-pointer z-10"
        >
          Hapus
        </button>
      )}
    </div>
  );
}

export function MarkdownEditor({ initialData }: MarkdownEditorProps) {
  const router = useRouter();
  const t = useTranslations("adminAcademic");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    id: initialData?.id || "",
    title: initialData?.title || "",
    summary: initialData?.summary || "",
    content: initialData?.content || "",
    category: initialData?.category || "tips_kuliah",
    status: initialData?.status || "draft",
    thumbnailUrl: initialData?.thumbnailUrl || "",
    tags: initialData?.tags || [],
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Preview Mode State
  const [activeMode, setActiveMode] = useState<"write" | "preview">("write");

  // Thumbnail Upload State
  const [isUploadingThumbnail, setIsUploadingThumbnail] = useState(false);
  const thumbnailFileInputRef = useRef<HTMLInputElement>(null);

  // Media Dialog State
  const [isMediaDialogOpen, setIsMediaDialogOpen] = useState(false);
  const [mediaType, setMediaType] = useState<"upload" | "youtube">("upload");
  const [isUploading, setIsUploading] = useState(false);
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaCaption, setMediaCaption] = useState("");
  const [mediaSourceLabel, setMediaSourceLabel] = useState("");
  const [mediaSourceUrl, setMediaSourceUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleThumbnailUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingThumbnail(true);
    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/blog/upload", {
        method: "POST",
        body: form,
      });

      const text = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {
        // Not a JSON response
      }

      if (!res.ok) {
        const errorMsg = data?.error || text || `Error ${res.status}: ${res.statusText}`;
        throw new Error(errorMsg);
      }

      if (!data || !data.url) {
        throw new Error("INVALID_UPLOAD_RESPONSE");
      }

      setFormData((prev) => ({ ...prev, thumbnailUrl: data.url }));
      setFormData((prev: any) => ({ ...prev, thumbnailUrl: data.url }));
      toast.success(t("editor.thumbnailUploaded"));
    } catch {
      toast.error(t("editor.thumbnailUploadFailed"));
    } finally {
      setIsUploadingThumbnail(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const insertTextAtCursor = (text: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentContent = formData.content;
    
    const newContent = currentContent.substring(0, start) + text + currentContent.substring(end);
    setFormData({ ...formData, content: newContent });
    
    // Reset cursor position
    setTimeout(() => {
      textarea.selectionStart = start + text.length;
      textarea.selectionEnd = start + text.length;
      textarea.focus();
    }, 0);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/blog/upload", {
        method: "POST",
        body: form,
      });

      const text = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {
        // Not a JSON response
      }

      if (!res.ok) {
        const errorMsg = data?.error || text || `Error ${res.status}: ${res.statusText}`;
        throw new Error(errorMsg);
      }

      if (!data || !data.url) {
        throw new Error("INVALID_UPLOAD_RESPONSE");
      }

      setMediaUrl(data.url);
      toast.success(t("editor.fileUploaded"));
    } catch {
      toast.error(t("editor.fileUploadFailed"));
    } finally {
      setIsUploading(false);
    }
  };

  const handleInsertMedia = () => {
    if (!mediaUrl) {
      toast.error(t("editor.mediaUrlRequired"));
      return;
    }

    const mediaBlock = `\n:::media {src="${mediaUrl}"${mediaCaption ? ` caption="${mediaCaption}"` : ""}${mediaSourceLabel ? ` sourceLabel="${mediaSourceLabel}"` : ""}${mediaSourceUrl ? ` sourceUrl="${mediaSourceUrl}"` : ""}} \n:::\n`;
    
    insertTextAtCursor(mediaBlock);
    setIsMediaDialogOpen(false);
    
    // Reset state
    setMediaUrl("");
    setMediaCaption("");
    setMediaSourceLabel("");
    setMediaSourceUrl("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const res = await saveArticle(formData);
    setIsSubmitting(false);
    
    if (res.success) {
      toast.success(t("editor.articleSaved"));
      router.push("/admin/blog");
      router.refresh();
    } else {
      toast.error(t("editor.articleSaveFailed"));
    }
  };

  const addTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const newTag = e.currentTarget.value.trim();
      if (newTag && !formData.tags.includes(newTag)) {
        setFormData({ ...formData, tags: [...formData.tags, newTag] });
      }
      e.currentTarget.value = "";
    }
  };

  const removeTag = (tagToRemove: string) => {
    setFormData({
      ...formData,
      tags: formData.tags.filter((tag: string) => tag !== tagToRemove)
    });
  };

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-8">
      <div className="flex justify-end">
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" type="button" onClick={() => router.push("/admin/blog")}>
            Batal
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Simpan Artikel
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="title">Judul Artikel (Opsional)</Label>
            <Input
              id="title"
              name="title"
              value={formData.title}
              onChange={handleInputChange}
              placeholder="Dapat dikosongkan jika baris pertama konten menggunakan '# Judul'..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="summary">Ringkasan / Summary (Opsional)</Label>
            <Textarea
              id="summary"
              name="summary"
              value={formData.summary}
              onChange={handleInputChange}
              placeholder="Dapat dikosongkan untuk menghasilkan ringkasan otomatis..."
              rows={3}
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Label htmlFor="content">Konten (Markdown)</Label>
                
                {/* Toggle Group */}
                <div className="inline-flex items-center rounded-lg border border-border bg-muted/40 p-0.5">
                  <button
                    type="button"
                    onClick={() => setActiveMode("write")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-body-xs font-medium transition-all duration-150 cursor-pointer",
                      activeMode === "write"
                        ? "bg-background text-foreground shadow-sm border border-border/30"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Code className="w-3.5 h-3.5" />
                    Tulis
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveMode("preview")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-body-xs font-medium transition-all duration-150 cursor-pointer",
                      activeMode === "preview"
                        ? "bg-background text-foreground shadow-sm border border-border/30"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Pratinjau
                  </button>
                </div>
              </div>

              {activeMode === "write" && (
                <Dialog open={isMediaDialogOpen} onOpenChange={setIsMediaDialogOpen}>
                  <DialogTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="cursor-pointer">
                      <ImagePlus className="w-4 h-4 mr-2" />
                      Sisipkan Media
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Sisipkan Media (Gambar/Video/YouTube)</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="flex gap-4">
                        <Button 
                          type="button" 
                          variant={mediaType === "upload" ? "default" : "outline"}
                          onClick={() => setMediaType("upload")}
                          className="flex-1 cursor-pointer"
                        >
                          Unggah Berkas
                        </Button>
                        <Button 
                          type="button" 
                          variant={mediaType === "youtube" ? "default" : "outline"}
                          onClick={() => setMediaType("youtube")}
                          className="flex-1 cursor-pointer"
                        >
                          YouTube Link
                        </Button>
                      </div>

                      {mediaType === "upload" ? (
                        <div className="space-y-2">
                          <Label>Pilih Berkas</Label>
                          <Input 
                            type="file" 
                            accept="image/*,video/mp4,video/webm" 
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                            disabled={isUploading}
                          />
                          {isUploading && <p className="text-body-sm text-muted-foreground flex items-center"><Loader2 className="w-4 h-4 mr-2 animate-spin"/> Mengunggah...</p>}
                          {mediaUrl && (
                            <div className="mt-2">
                              <Label>URL Berkas (Otomatis)</Label>
                              <Input value={mediaUrl} readOnly />
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Label>Tautan YouTube</Label>
                          <Input 
                            placeholder="https://youtube.com/watch?v=..." 
                            value={mediaUrl}
                            onChange={(e) => setMediaUrl(e.target.value)}
                          />
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label>Keterangan (Caption) - Opsional</Label>
                        <Input 
                          placeholder="Deskripsi media..." 
                          value={mediaCaption}
                          onChange={(e) => setMediaCaption(e.target.value)}
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Label Sumber - Opsional</Label>
                          <Input 
                            placeholder="Contoh: ITB Official" 
                            value={mediaSourceLabel}
                            onChange={(e) => setMediaSourceLabel(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Tautan Sumber - Opsional</Label>
                          <Input 
                            placeholder="https://..." 
                            value={mediaSourceUrl}
                            onChange={(e) => setMediaSourceUrl(e.target.value)}
                          />
                        </div>
                      </div>

                      <Button type="button" onClick={handleInsertMedia} className="w-full cursor-pointer">
                        Sisipkan ke Editor
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
            
            {activeMode === "write" ? (
              <Textarea
                ref={textareaRef}
                id="content"
                name="content"
                value={formData.content}
                onChange={handleInputChange}
                className="font-mono min-h-[500px] resize-y"
                placeholder="Tulis konten artikel di sini. Gunakan Markdown..."
                required
              />
            ) : (
              <div className="border border-border rounded-xl bg-card p-6 md:p-8 space-y-6 shadow-sm min-h-[500px] max-w-none">
                <div className="space-y-4 pb-6 border-b border-border/60">
                  {formData.thumbnailUrl && (
                      <BlogThumbnailPreview
                        url={formData.thumbnailUrl}
                        alt={formData.title || "Preview thumbnail"}
                        className="aspect-[16/9] w-full rounded-xl mt-0"
                      />
                  )}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className="rounded-md capitalize">
                        {formData.category.replace("_", " ")}
                      </Badge>
                      <span className="text-body-sm text-muted-foreground capitalize">
                        Status: {formData.status}
                      </span>
                    </div>
                    <h2 className="text-body-base font-heading font-bold text-foreground">
                      {formData.title || "Judul Artikel (Akan diekstrak dari baris pertama jika kosong)"}
                    </h2>
                    {formData.summary && (
                      <p className="text-body-base text-muted-foreground italic font-sans border-l-2 border-border/80 pl-4 py-1">
                        {formData.summary}
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="font-sans text-foreground leading-relaxed">
                  {formData.content ? (
                    <MarkdownRenderer content={formData.content} />
                  ) : (
                    <p className="text-muted-foreground italic text-body-sm">
                      Konten masih kosong. Tulis sesuatu di tab &quot;Tulis&quot; untuk melihat pratinjaunya di sini.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="p-5 border border-border rounded-xl bg-card space-y-4 shadow-sm">
            <h3 className="font-heading font-semibold text-body-base">Pengaturan Publikasi</h3>
            
            <div className="space-y-2">
              <Label>Status</Label>
              <Select 
                value={formData.status} 
                onValueChange={(val) => setFormData({ ...formData, status: val })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draf</SelectItem>
                  <SelectItem value="published">Terbit</SelectItem>
                  <SelectItem value="scheduled">Terjadwal (Akan Datang)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Kategori</Label>
              <Select 
                value={formData.category} 
                onValueChange={(val) => setFormData({ ...formData, category: val })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih kategori" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tips_kuliah">Tips Kuliah</SelectItem>
                  <SelectItem value="pojok_kampus">Pojok Kampus</SelectItem>
                  <SelectItem value="fakta_seru">Fakta Seru</SelectItem>
                  <SelectItem value="kegiatan_zyx">Kegiatan Zyx</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Thumbnail Utama</Label>
              <div className="flex gap-2">
                <Input
                  name="thumbnailUrl"
                  value={formData.thumbnailUrl}
                  onChange={handleInputChange}
                  placeholder="https://... atau unggah file"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={isUploadingThumbnail}
                  onClick={() => thumbnailFileInputRef.current?.click()}
                  className="cursor-pointer"
                >
                  {isUploadingThumbnail ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ImagePlus className="w-4 h-4 mr-2" />
                  )}
                  Unggah
                </Button>
                <input
                  type="file"
                  ref={thumbnailFileInputRef}
                  onChange={handleThumbnailUpload}
                  accept="image/*"
                  className="hidden"
                />
              </div>
              {formData.thumbnailUrl && (
                <BlogThumbnailPreview
                  url={formData.thumbnailUrl}
                  alt="Thumbnail preview"
                  onRemove={() => setFormData({ ...formData, thumbnailUrl: "" })}
                />
              )}
            </div>

            <div className="space-y-2">
              <Label>Tag (Tekan Enter)</Label>
              <Input
                onKeyDown={addTag}
                placeholder="Tambahkan tag..."
              />
              {formData.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {formData.tags.map((tag: string, idx: number) => (
                    <Badge key={idx} variant="secondary" className="rounded-md">
                      {tag}
                      <button 
                        type="button" 
                        onClick={() => removeTag(tag)}
                        className="ml-2 text-muted-foreground hover:text-foreground"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
