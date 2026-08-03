"use client";

import React, { useState, useRef, useEffect } from "react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { importAssessmentBundleAction, type AssessmentImportResult } from "@/app/(admin)/admin/(academic)/courses/import-actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Upload,
  Play,
  AlertCircle,
  Loader2,
  Terminal as TerminalIcon,
  Trash2,
  BookOpen,
  HelpCircle,
  GitBranch,
} from "lucide-react";

export function AssessmentBundleImporterTab() {
  const [bundleText, setBundleText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AssessmentImportResult | null>(null);

  const [mode, setMode] = useState<"create" | "upsert" | "append">("upsert");
  const [postProcess, setPostProcess] = useState(true);
  const [dryRun, setDryRun] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [result?.logs, loading]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file: File) => {
    if (file.type !== "application/json" && !file.name.endsWith(".json")) {
      toast.error("Format file harus berupa JSON");
      return;
    }

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setBundleText(e.target.result as string);
        toast.success(`Berhasil memuat file: ${file.name}`);
      }
    };
    reader.readAsText(file);
  };

  const handleClear = () => {
    setBundleText("");
    setFileName(null);
    setResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleImport = async () => {
    if (!bundleText.trim()) {
      toast.error("Silakan unggah file JSON atau tempel teks bundle asesmen terlebih dahulu");
      return;
    }

    setLoading(true);
    setResult({ success: true, error: null, logs: ["[SYSTEM] Inisialisasi parser dan validasi bundle asesmen..."] });

    try {
      const res = await importAssessmentBundleAction(bundleText, { mode, postProcess, dryRun });
      setResult(res);

      if (res.success) {
        toast.success(dryRun ? "Validasi bundle asesmen berhasil!" : "Import bundle asesmen berhasil diselesaikan!");
      } else {
        toast.error(`Gagal melakukan import: ${res.error}`);
      }
    } catch (err: any) {
      setResult({
        success: false,
        error: err.message || "Terjadi kesalahan yang tidak terduga.",
        logs: [
          "[CRITICAL ERROR] Proses import terhenti karena crash sistem.",
          err.message || String(err),
        ],
      });
      toast.error("Gagal melakukan import bundle asesmen.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="border border-border shadow-sm rounded-xl overflow-hidden bg-card">
            <CardHeader className="border-b border-border bg-muted/20 py-4">
              <CardTitle className="font-heading text-body-lg font-semibold text-foreground flex items-center gap-2">
                <Upload className="size-5 text-brand-primary" />
                Input Assessment Bundle JSON
              </CardTitle>
              <p className="text-body-sm text-muted-foreground">
                Unggah berkas JSON bundel asesmen (soal ujian/kuis) untuk mata kuliah yang sudah ada. Bab direferensikan
                berdasarkan judul (title), bukan $id, karena bundel ini diunggah terpisah dari Learning Bundle.
              </p>
              <p className="text-body-sm text-muted-foreground">
                Mode upsert membuat versi sumber baru saat isi berubah dan mempertahankan versi sebelumnya untuk audit.
              </p>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all duration-150 ${
                  dragActive
                    ? "border-brand-primary bg-brand-primary/5"
                    : "border-border hover:border-brand-primary/50 hover:bg-muted/10"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileInput}
                  className="hidden"
                />

                <div className="p-3 bg-muted rounded-xl text-muted-foreground">
                  <Upload className="size-6 text-foreground" />
                </div>

                <p className="font-heading text-body-base font-semibold text-foreground mt-2">
                  {fileName ? fileName : "Seret & Taruh File JSON di sini"}
                </p>
                <p className="text-body-sm text-muted-foreground">
                  {fileName ? "Klik untuk mengganti file" : "Atau klik untuk menelusuri berkas dari komputer Anda"}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="paste-assessment-json" className="text-body-sm font-semibold text-foreground">
                  Atau Tempel Konten JSON di bawah ini:
                </Label>
                <textarea
                  id="paste-assessment-json"
                  rows={8}
                  value={bundleText}
                  onChange={(e) => setBundleText(e.target.value)}
                  placeholder='{"metadata": {"schemaVersion": "1.0"}, "course": {"title": "..."}, "assessmentSources": [...]}'
                  className="w-full font-mono text-body-sm p-4 bg-muted border border-border rounded-xl focus:outline-hidden focus:ring-1 focus:ring-brand-primary focus:border-brand-primary text-foreground"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border border-border shadow-sm rounded-xl overflow-hidden bg-card">
            <CardHeader className="border-b border-border bg-muted/20 py-4">
              <CardTitle className="font-heading text-body-lg font-semibold text-foreground">
                Pengaturan Importir
              </CardTitle>
              <p className="text-body-sm text-muted-foreground">
                Tentukan perilaku database dan pasca-proses selama import bundel asesmen.
              </p>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-2">
                <Label htmlFor="assessment-import-mode" className="text-body-sm font-semibold text-foreground">
                  Mode Ingesti
                </Label>
                <Select value={mode} onValueChange={(val: any) => setMode(val)}>
                  <SelectTrigger id="assessment-import-mode" className="w-full rounded-lg">
                    <SelectValue placeholder="Pilih mode import" />
                  </SelectTrigger>
                  <SelectContent className="rounded-lg">
                    <SelectItem value="upsert" className="rounded-md">
                      Upsert (Perbarui yang ada / Tambah baru)
                    </SelectItem>
                    <SelectItem value="create" className="rounded-md">
                      Create (Gagal jika sumber ujian sudah terdaftar)
                    </SelectItem>
                    <SelectItem value="append" className="rounded-md">
                      Append (Hanya tambahkan sumber ujian baru)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-4 pt-2">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="assessment-post-process"
                    checked={postProcess}
                    onChange={(e) => setPostProcess(e.target.checked)}
                    className="size-4 mt-0.5 rounded-sm border-border bg-background text-brand-primary focus:ring-brand-primary"
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label htmlFor="assessment-post-process" className="text-body-sm font-semibold text-foreground cursor-pointer">
                      Jalankan Pasca-Proses (Rekomendasi)
                    </Label>
                    <p className="text-body-sm text-muted-foreground">
                      Memetakan soal ke konsep/materi secara heuristik dan mengantrekan sinkronisasi canonical Vectorize.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="assessment-dry-run"
                    checked={dryRun}
                    onChange={(e) => setDryRun(e.target.checked)}
                    className="size-4 mt-0.5 rounded-sm border-border bg-background text-brand-primary focus:ring-brand-primary"
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label htmlFor="assessment-dry-run" className="text-body-sm font-semibold text-foreground cursor-pointer">
                      Dry Run (Hanya Validasi)
                    </Label>
                    <p className="text-body-sm text-muted-foreground">
                      Hanya memvalidasi integritas struktur JSON dan referensi bab tanpa menyimpan data apa pun.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-border">
                <Button
                  onClick={handleImport}
                  disabled={loading}
                  className="flex-1 rounded-lg font-semibold gap-1.5 bg-brand-primary text-white hover:bg-brand-primary/95"
                >
                  {loading ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                  {dryRun ? "Validasi" : "Mulai Import"}
                </Button>

                <Button
                  variant="outline"
                  onClick={handleClear}
                  disabled={loading}
                  className="rounded-lg font-semibold gap-1.5 border-border hover:bg-muted/10 text-muted-foreground"
                >
                  <Trash2 className="size-4" />
                  Bersihkan
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {result && (
        <Card className="border border-border shadow-sm rounded-xl overflow-hidden bg-card">
          <CardHeader className="border-b border-border bg-muted/20 py-4 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="font-heading text-body-lg font-semibold text-foreground flex items-center gap-2">
                <TerminalIcon className="size-5 text-muted-foreground" />
                Console Logs Ingesti
              </CardTitle>
              <p className="text-body-sm text-muted-foreground">
                Status eksekusi import bundel asesmen secara real-time.
              </p>
            </div>
            {loading && <Loader2 className="size-5 animate-spin text-brand-primary" />}
          </CardHeader>
          <CardContent className="p-0">
            <div className="bg-black text-gray-300 font-mono text-body-sm p-4 h-64 overflow-y-auto space-y-1">
              {result.logs.map((logStr, idx) => (
                <div
                  key={idx}
                  className={
                    logStr.includes("[FAIL]") || logStr.includes("[CRITICAL")
                      ? "text-status-error"
                      : logStr.includes("[SUCCESS]")
                        ? "text-status-success"
                        : "text-gray-300"
                  }
                >
                  {logStr}
                </div>
              ))}
              {loading && <div className="text-brand-primary animate-pulse">Running next step...</div>}
              <div ref={terminalEndRef} />
            </div>
          </CardContent>
        </Card>
      )}

      {result && !loading && result.success && result.stats && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {[
              { label: "Mata Kuliah ID", value: result.stats.courseId, icon: BookOpen },
              { label: "Sumber Ujian", value: result.stats.asCount, icon: HelpCircle },
              { label: "Butir Soal", value: result.stats.aoCount, icon: GitBranch },
            ].map((stat, idx) => (
              <Card key={idx} className="border border-border shadow-sm rounded-xl bg-card">
                <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0">
                  <p className="text-body-sm font-semibold text-muted-foreground">{stat.label}</p>
                  <stat.icon className="size-4 text-brand-primary" />
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="font-heading text-body-base font-bold text-foreground truncate max-w-full" title={String(stat.value)}>
                    {stat.value}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {result.stats.sourceDiffs.length > 0 && (
            <Card className="border border-border shadow-sm rounded-xl overflow-hidden bg-card">
              <CardHeader className="border-b border-border bg-muted/20 py-4">
                <CardTitle className="font-heading text-body-md font-semibold text-foreground">
                  Detail per Sumber Ujian
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 divide-y divide-border">
                {result.stats.sourceDiffs.map((d, idx) => (
                  <div key={idx} className="p-4 flex flex-col gap-1">
                    <span className="font-heading text-body-sm font-semibold text-foreground">
                      {d.sourceTitle} {d.isNew ? "(baru)" : ""}
                    </span>
                    <span className="text-body-sm text-muted-foreground">
                      +{d.aoAdded} ditambah / ~{d.aoUpdated} diperbarui / ={d.aoUnchanged} tidak berubah
                      {d.aoOrphaned > 0 ? ` / ${d.aoOrphaned} tidak lagi ada di bundel (dibiarkan, tidak dihapus)` : ""}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {result && !loading && !result.success && (
        <div className="p-5 rounded-xl border border-status-error/20 bg-status-error/5 text-status-error flex gap-3 text-left">
          <AlertCircle className="size-5 shrink-0 mt-0.5" />
          <div>
            <h5 className="font-heading text-body-base font-semibold leading-none">Import Gagal</h5>
            <p className="text-body-sm mt-2 text-status-error/90 whitespace-pre-line leading-relaxed font-sans">
              {result.friendlyExplanation || result.error || "Gagal mengimpor bundel asesmen. Periksa konsol logs di atas."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
