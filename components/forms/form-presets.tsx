"use client";

import { useCallback, useEffect, useState } from "react";
import { Bookmark, FolderOpen, Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";

export type FormPresetRecord = {
  id: string;
  name: string;
  description?: string | null;
  category: "survey" | "quiz" | "feedback" | "registration" | string;
  questions: any[];
  settings?: Record<string, any> | null;
  createdAt?: string;
};

type FormCategory = "survey" | "quiz" | "feedback" | "registration";

const CATEGORY_LABELS: Record<string, string> = {
  survey: "Survei & Riset",
  feedback: "Umpan Balik",
  quiz: "Kuis & Ujian",
  registration: "Pendaftaran",
};

async function fetchPresets(): Promise<FormPresetRecord[]> {
  try {
    const res = await fetch("/api/admin/form-presets");
    const data = await res.json();
    return data.success && Array.isArray(data.presets) ? data.presets : [];
  } catch {
    return [];
  }
}

export function FormPresetsPanel({
  category,
  questions,
  settings,
  onApplyQuestions,
  onApplySettings,
}: {
  category: FormCategory;
  questions: any[];
  settings: Record<string, any>;
  onApplyQuestions: (questions: any[]) => void;
  onApplySettings: (settings: Record<string, any>) => void;
}) {
  const [presets, setPresets] = useState<FormPresetRecord[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [presetName, setPresetName] = useState("");
  const [presetDescription, setPresetDescription] = useState("");
  const [presetCategory, setPresetCategory] = useState<FormCategory>(category);
  const [includeSettings, setIncludeSettings] = useState(true);

  const refresh = useCallback(async () => {
    setPresets(await fetchPresets());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSave = async () => {
    if (!presetName.trim()) {
      toast.error("Nama preset wajib diisi.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/form-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: presetName.trim(),
          description: presetDescription.trim() || undefined,
          category: presetCategory,
          questions,
          settings: includeSettings ? settings : undefined,
        }),
      });
      const data = await res.json();
      if (data.success && data.preset) {
        toast.success("Preset berhasil disimpan.");
        setSaveOpen(false);
        setPresetName("");
        setPresetDescription("");
        setPresetCategory(category);
        setIncludeSettings(true);
        refresh();
      } else {
        toast.error(data.error || "Gagal menyimpan preset.");
      }
    } catch (err: any) {
      toast.error(err.message || "Terjadi kesalahan jaringan.");
    } finally {
      setSaving(false);
    }
  };

  const handleApply = (preset: FormPresetRecord) => {
    onApplyQuestions(preset.questions || []);
    if (preset.settings && Object.keys(preset.settings).length > 0) {
      onApplySettings(preset.settings);
    }
    setLoadOpen(false);
    toast.success(`Preset "${preset.name}" dimuat.`);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/form-presets/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setPresets((prev) => prev.filter((p) => p.id !== id));
        toast.success("Preset dihapus.");
      } else {
        toast.error(data.error || "Gagal menghapus preset.");
      }
    } catch (err: any) {
      toast.error(err.message || "Terjadi kesalahan jaringan.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-body-xs font-bold text-foreground uppercase tracking-wider">
        Preset Formulir
      </p>

      <Button
        variant="outline"
        size="sm"
        className="w-full justify-start text-body-xs font-semibold"
        onClick={() => setSaveOpen(true)}
      >
        <Bookmark className="size-3.5 text-brand-primary" />
        Simpan Sebagai Preset
      </Button>

      <Button
        variant="outline"
        size="sm"
        className="w-full justify-start text-body-xs font-semibold"
        onClick={() => {
          refresh();
          setLoadOpen(true);
        }}
      >
        <FolderOpen className="size-3.5 text-brand-primary" />
        Muat Preset
      </Button>

      {/* Save Preset Dialog */}
      <Dialog open={saveOpen} onOpenChange={(open) => !open && setSaveOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Simpan Sebagai Preset</DialogTitle>
            <DialogDescription>
              Preset menyimpan susunan pertanyaan saat ini agar bisa dipakai ulang di formulir lain.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="preset-name" className="text-body-sm font-semibold">
                Nama Preset
              </Label>
              <Input
                id="preset-name"
                type="text"
                placeholder="Mis. Formulir Evaluasi Perkuliahan"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                className="text-body-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="preset-description" className="text-body-sm font-semibold">
                Deskripsi (Opsional)
              </Label>
              <Textarea
                id="preset-description"
                rows={2}
                placeholder="Penjelasan singkat tentang preset ini"
                value={presetDescription}
                onChange={(e) => setPresetDescription(e.target.value)}
                className="text-body-sm resize-y"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-body-sm font-semibold">Kategori</Label>
              <Select
                value={presetCategory}
                onValueChange={(val: any) => setPresetCategory(val)}
              >
                <SelectTrigger className="w-full text-body-sm">
                  <SelectValue placeholder="Pilih Kategori" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="survey">Survei & Riset</SelectItem>
                  <SelectItem value="feedback">Umpan Balik</SelectItem>
                  <SelectItem value="quiz">Kuis & Ujian</SelectItem>
                  <SelectItem value="registration">Pendaftaran</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <label className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 p-3 cursor-pointer">
              <Checkbox
                checked={includeSettings}
                onCheckedChange={(checked) => setIncludeSettings(Boolean(checked))}
              />
              <span className="text-body-sm font-medium text-foreground">
                Sertakan pengaturan (jadwal, email, batasan)
              </span>
            </label>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setSaveOpen(false)} disabled={saving}>
              Batal
            </Button>
            <Button onClick={handleSave} disabled={saving} isLoading={saving}>
              Simpan Preset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Load Preset Dialog */}
      <Dialog open={loadOpen} onOpenChange={(open) => !open && setLoadOpen(false)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Muat Preset</DialogTitle>
            <DialogDescription>
              Pilih preset untuk mengganti susunan pertanyaan saat ini.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
            {presets.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-6 text-center text-body-sm text-muted-foreground">
                Belum ada preset tersimpan. Simpan susunan pertanyaan ini sebagai preset terlebih dahulu.
              </p>
            ) : (
              presets.map((preset) => (
                <div
                  key={preset.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 shadow-sm"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-body-sm font-semibold text-foreground">{preset.name}</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary" className="bg-brand-primary/10 text-brand-primary text-[10px] font-semibold uppercase tracking-wider">
                        {CATEGORY_LABELS[preset.category] || preset.category}
                      </Badge>
                      <span className="text-body-xs text-muted-foreground">
                        {(preset.questions || []).filter((q: any) => q && q.type !== "SECTION").length} pertanyaan
                      </span>
                      {preset.settings && Object.keys(preset.settings).length > 0 && (
                        <span className="text-body-xs text-muted-foreground">dengan pengaturan</span>
                      )}
                    </div>
                    {preset.description && (
                      <p className="truncate text-body-xs text-muted-foreground">{preset.description}</p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      size="sm"
                      onClick={() => handleApply(preset)}
                      className="text-body-xs font-semibold"
                    >
                      Muat
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={deletingId === preset.id}
                      isLoading={deletingId === preset.id}
                      onClick={() => handleDelete(preset.id)}
                      title="Hapus preset"
                      className="text-status-error hover:text-status-error"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function PresetSettingsLoader({
  onApplySettings,
}: {
  onApplySettings: (settings: Record<string, any>) => void;
}) {
  const [presets, setPresets] = useState<FormPresetRecord[]>([]);

  const refresh = useCallback(async () => {
    setPresets(await fetchPresets());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (presets.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <Label className="text-body-sm font-semibold">Muat pengaturan dari preset</Label>
      <Select
        value=""
        onValueChange={(id) => {
          const preset = presets.find((p) => p.id === id);
          if (preset?.settings && Object.keys(preset.settings).length > 0) {
            onApplySettings(preset.settings);
            toast.success(`Pengaturan dari "${preset.name}" diterapkan.`);
          } else {
            toast.error("Preset ini tidak menyertakan pengaturan.");
          }
        }}
      >
        <SelectTrigger className="w-full text-body-sm">
          <SelectValue placeholder="Pilih preset pengaturan..." />
        </SelectTrigger>
        <SelectContent>
          {presets.map((preset) => (
            <SelectItem key={preset.id} value={preset.id}>
              {preset.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-body-xs text-muted-foreground">
        Menerapkan jadwal, email, dan batasan dari preset yang dipilih.
      </p>
    </div>
  );
}
