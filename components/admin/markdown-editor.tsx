"use client";

import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ImagePlus, Link as LinkIcon, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { saveArticle } from "@/app/(admin)/admin/blog/actions";

interface MarkdownEditorProps {
  initialData?: any;
}

export function MarkdownEditor({ initialData }: MarkdownEditorProps) {
  const router = useRouter();
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

  // Media Dialog State
  const [isMediaDialogOpen, setIsMediaDialogOpen] = useState(false);
  const [mediaType, setMediaType] = useState<"upload" | "youtube">("upload");
  const [isUploading, setIsUploading] = useState(false);
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaCaption, setMediaCaption] = useState("");
  const [mediaSourceLabel, setMediaSourceLabel] = useState("");
  const [mediaSourceUrl, setMediaSourceUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      
      setMediaUrl(data.url);
      toast.success("Berkas berhasil diunggah");
    } catch (err: any) {
      toast.error(err.message || "Gagal mengunggah berkas");
    } finally {
      setIsUploading(false);
    }
  };

  const handleInsertMedia = () => {
    if (!mediaUrl) {
      toast.error("URL Media tidak boleh kosong");
      return;
    }

    const mediaBlock = `\n:::media src="${mediaUrl}"${mediaCaption ? ` caption="${mediaCaption}"` : ""}${mediaSourceLabel ? ` sourceLabel="${mediaSourceLabel}"` : ""}${mediaSourceUrl ? ` sourceUrl="${mediaSourceUrl}"` : ""} \n:::\n`;
    
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
      toast.success("Artikel berhasil disimpan");
      router.push("/admin/blog");
      router.refresh();
    } else {
      toast.error(res.error || "Terjadi kesalahan saat menyimpan artikel");
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
    <form onSubmit={handleSubmit} className="space-y-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-h2 font-heading">{formData.id ? "Sunting Artikel" : "Tulis Artikel Baru"}</h1>
        <div className="flex gap-4">
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
            <Label htmlFor="title">Judul Artikel</Label>
            <Input
              id="title"
              name="title"
              value={formData.title}
              onChange={handleInputChange}
              placeholder="Contoh: 5 Tips Lulus Cumlaude dari ITB"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="summary">Ringkasan (Summary)</Label>
            <Textarea
              id="summary"
              name="summary"
              value={formData.summary}
              onChange={handleInputChange}
              placeholder="Ringkasan singkat yang akan muncul di kartu artikel..."
              rows={3}
              required
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="content">Konten (Markdown)</Label>
              <Dialog open={isMediaDialogOpen} onOpenChange={setIsMediaDialogOpen}>
                <DialogTrigger asChild>
                  <Button type="button" variant="outline" size="sm">
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
                        className="flex-1"
                      >
                        Unggah Berkas
                      </Button>
                      <Button 
                        type="button" 
                        variant={mediaType === "youtube" ? "default" : "outline"}
                        onClick={() => setMediaType("youtube")}
                        className="flex-1"
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
                        {isUploading && <p className="text-sm text-muted-foreground flex items-center"><Loader2 className="w-4 h-4 mr-2 animate-spin"/> Mengunggah...</p>}
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

                    <Button type="button" onClick={handleInsertMedia} className="w-full">
                      Sisipkan ke Editor
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            
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
          </div>
        </div>

        <div className="space-y-6">
          <div className="p-5 border border-border rounded-xl bg-card space-y-4 shadow-sm">
            <h3 className="font-heading font-semibold text-h6">Pengaturan Publikasi</h3>
            
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
              <Label>URL Thumbnail Utama</Label>
              <Input
                name="thumbnailUrl"
                value={formData.thumbnailUrl}
                onChange={handleInputChange}
                placeholder="https://..."
              />
              {formData.thumbnailUrl && (
                <div className="mt-3 aspect-video rounded-md border border-border overflow-hidden bg-muted">
                  <img src={formData.thumbnailUrl} alt="Thumbnail preview" className="w-full h-full object-cover" />
                </div>
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
