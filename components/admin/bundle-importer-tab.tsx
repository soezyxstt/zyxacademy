"use client";

import React, { useState, useRef, useEffect } from "react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";
import { Label } from "@/components/ui/label";
import { importCourseBundleAction, type ImportResult } from "@/app/(admin)/admin/(academic)/courses/import-actions";
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
  CheckCircle2,
  AlertCircle,
  Loader2,
  Terminal as TerminalIcon,
  Trash2,
  BookOpen,
  Layers,
  FileText,
  HelpCircle,
  GitBranch,
} from "lucide-react";

export function BundleImporterTab() {
  const [bundleText, setBundleText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  // Importer settings
  const [mode, setMode] = useState<"create" | "upsert" | "append">("upsert");
  const [postProcess, setPostProcess] = useState(true);
  const [dryRun, setDryRun] = useState(false);

  // Stepper state representing active phase
  const [activeStep, setActiveStep] = useState<number>(-1);

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
    setActiveStep(-1);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleImport = async () => {
    if (!bundleText.trim()) {
      toast.error("Silakan unggah file JSON atau tempel teks bundle terlebih dahulu");
      return;
    }

    setLoading(true);
    setResult({ success: true, error: null, logs: ["[SYSTEM] Inisialisasi parser dan validasi bundle..."] });
    setActiveStep(0); // Validating

    try {
      // Simulate stepper transitions as processing progresses
      const stepTimer1 = setTimeout(() => {
        setActiveStep(1); // Writing to DB
        setResult(prev => prev ? { ...prev, logs: [...prev.logs, "[SYSTEM] Membuka transaksi database, menulis data..."] } : null);
      }, 1000);

      const stepTimer2 = setTimeout(() => {
        if (postProcess) {
          setActiveStep(2); // Compiling materials
          setResult(prev => prev ? { ...prev, logs: [...prev.logs, "[SYSTEM] Kompilasi markdown, validasi KO coverage, dan indeks popover..."] } : null);
        }
      }, 2500);

      const stepTimer3 = setTimeout(() => {
        if (postProcess) {
          setActiveStep(3); // Mapping exam questions
          setResult(prev => prev ? { ...prev, logs: [...prev.logs, "[SYSTEM] Menjalankan pemetaan heuristik konsep pada soal ujian..."] } : null);
        }
      }, 4000);

      const res = await importCourseBundleAction(bundleText, { mode, postProcess, dryRun });

      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      clearTimeout(stepTimer3);

      setResult(res);

      if (res.success) {
        setActiveStep(4); // Success / Complete
        toast.success(dryRun ? "Validasi bundle berhasil!" : "Import bundle berhasil diselesaikan!");
      } else {
        setActiveStep(-2); // Failed
        toast.error(`Gagal melakukan import: ${res.error}`);
      }
    } catch (err: any) {
      setActiveStep(-2); // Failed
      setResult({
        success: false,
        error: err.message || "Terjadi kesalahan yang tidak terduga.",
        logs: [
          "[CRITICAL ERROR] Proses import terhenti karena crash sistem.",
          err.message || String(err)
        ]
      });
      toast.error("Gagal melakukan import bundle.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-card p-4 lg:grid-cols-3">
        {/* Controls and Input Area */}
        <div className="space-y-6 lg:col-span-2">
          <Card className="gap-3 border-0 bg-transparent py-0 shadow-none">
            <CardHeader className="border-b border-border px-0 pb-3 pt-0">
              <CardTitle className="font-heading text-body-base font-semibold text-foreground flex items-center gap-2">
                <Upload className="size-5 text-brand-primary" />
                Course Bundle JSON
              </CardTitle>
              <p className="text-body-sm text-muted-foreground">
                Gunakan JSON hasil compiler.
              </p>
            </CardHeader>
            <CardContent className="p-0 space-y-4">
              {/* Drag & Drop File Zone */}
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all duration-150 ${
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

                <div className="text-muted-foreground">
                  <Upload className="size-6 text-foreground" />
                </div>

                <p className="font-heading text-body-base font-semibold text-foreground mt-2">
                  {fileName ? fileName : "Pilih atau seret berkas JSON"}
                </p>
                <span className="sr-only">Klik untuk memilih berkas JSON</span>
              </div>

              {/* Textarea Paste Option */}
              <div className="space-y-2">
                <Label htmlFor="paste-json" className="text-body-sm font-semibold text-foreground">
                  Konten JSON
                </Label>
                <Textarea
                  id="paste-json"
                  rows={8}
                  value={bundleText}
                  onChange={(e) => setBundleText(e.target.value)}
                  placeholder='{"metadata": {"schemaVersion": "1.1.1"}, "course": {...}}'
                  className="w-full font-mono text-body-sm p-4 bg-muted border border-border rounded-xl focus:outline-hidden focus:ring-1 focus:ring-brand-primary focus:border-brand-primary text-foreground"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Configurations Card */}
        <div className="space-y-6">
          <Card className="gap-3 border-0 bg-transparent py-0 shadow-none">
            <CardHeader className="border-b border-border px-0 pb-3 pt-0">
              <CardTitle className="font-heading text-body-base font-semibold text-foreground">
                Pengaturan impor
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 space-y-4">
              {/* Mode Select */}
              <div className="space-y-2">
                <Label htmlFor="import-mode" className="text-body-sm font-semibold text-foreground">
                  Mode Ingesti
                </Label>
                <Select value={mode} onValueChange={(val: any) => setMode(val)}>
                  <SelectTrigger id="import-mode" className="w-full rounded-lg">
                    <SelectValue placeholder="Pilih mode import" />
                  </SelectTrigger>
                  <SelectContent className="rounded-lg">
                    <SelectItem value="upsert" className="rounded-md">
                      Upsert (Perbarui yang ada / Tambah baru)
                    </SelectItem>
                    <SelectItem value="create" className="rounded-md">
                      Create (Gagal jika kelas sudah terdaftar)
                    </SelectItem>
                    <SelectItem value="append" className="rounded-md">
                      Append (Hanya tambahkan data non-konflik)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Checkboxes */}
              <div className="space-y-4 pt-2">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="post-process"
                    checked={postProcess}
                    onCheckedChange={(checked) => setPostProcess(checked === true)}
                    className="mt-0.5"
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label htmlFor="post-process" className="text-body-sm font-semibold text-foreground cursor-pointer">
                      Jalankan pasca-proses
                    </Label>
                    <p className="text-body-sm text-muted-foreground">
                      Mengompilasi materi markdown, membangun relasi peta konsep, pemetaan soal ujian, serta antrean sinkronisasi canonical Vectorize.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Checkbox
                    id="dry-run"
                    checked={dryRun}
                    onCheckedChange={(checked) => setDryRun(checked === true)}
                    className="mt-0.5"
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label htmlFor="dry-run" className="text-body-sm font-semibold text-foreground cursor-pointer">
                      Validasi saja
                    </Label>
                    <p className="text-body-sm text-muted-foreground">
                      Hanya memvalidasi integritas struktur JSON tanpa menyimpan data apa pun ke database lokal.
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t border-border">
                <Button
                  onClick={handleImport}
                  disabled={loading}
                  className="flex-1 rounded-lg font-semibold gap-1.5 bg-brand-primary text-white hover:bg-brand-primary/95"
                >
                  {loading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Play className="size-4" />
                  )}
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

      {/* Stepper (Only show when active) */}
      {(loading || result) && (
        <Card className="gap-3 rounded-xl border border-border bg-card p-4 shadow-none">
          <CardContent className="p-0">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              {[
                { label: "Validasi Bundel", desc: "Mengecek struktur JSON" },
                { label: "Transaksi DB", desc: "Menulis tabel kelas & bab" },
                { label: "Kompilasi Materi", desc: "Markdown & popover term" },
                { label: "Pemetaan Ujian", desc: "Heuristik konsep soal" },
                { label: "Selesai", desc: "Vektor siap disinkronkan" }
              ].map((step, idx) => {
                let isCompleted = activeStep > idx || activeStep === 4;
                let isActive = activeStep === idx;
                let isFailed = activeStep === -2;

                return (
                  <div key={idx} className="flex items-center gap-3 w-full md:w-auto">
                    <div
                      className={`size-8 rounded-lg flex items-center justify-center font-heading text-body-base font-bold shrink-0 transition-colors duration-200 ${
                        isCompleted
                          ? "bg-brand-primary/10 text-brand-primary border border-brand-primary/20"
                          : isActive
                          ? "bg-brand-primary text-white"
                          : isFailed
                          ? "bg-status-error/10 text-status-error border border-status-error/20"
                          : "bg-muted text-muted-foreground border border-border"
                      }`}
                    >
                      {isCompleted ? <CheckCircle2 className="size-5" /> : idx + 1}
                    </div>
                    <div className="text-left">
                      <p className="font-heading text-body-sm font-semibold text-foreground">
                        {step.label}
                      </p>
                      <p className="text-body-sm text-muted-foreground hidden md:block">
                        {step.desc}
                      </p>
                    </div>
                    {idx < 4 && (
                      <div className="hidden lg:block w-8 h-[2px] bg-border mx-2" />
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Terminal logs monitor */}
      {result && (
        <Card className="gap-3 rounded-xl border border-border bg-card p-4 shadow-none">
          <CardHeader className="border-b border-border px-0 pb-3 pt-0 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="font-heading text-body-base font-semibold text-foreground flex items-center gap-2">
                <TerminalIcon className="size-5 text-muted-foreground" />
                Console Logs Ingesti
              </CardTitle>
              <p className="text-body-sm text-muted-foreground">
                Status eksekusi import course bundle secara real-time.
              </p>
            </div>
            {loading && <Loader2 className="size-5 animate-spin text-brand-primary" />}
          </CardHeader>
          <CardContent className="p-0">
            <div className="bg-black text-gray-300 font-mono text-body-sm p-4 h-64 overflow-y-auto space-y-1">
              {result.logs.map((logStr, idx) => (
                <div key={idx} className={logStr.includes("[FAIL]") || logStr.includes("[CRITICAL") ? "text-status-error" : logStr.includes("[SUCCESS]") ? "text-status-success" : "text-gray-300"}>
                  {logStr}
                </div>
              ))}
              {loading && <div className="text-brand-primary animate-pulse">Running next step...</div>}
              <div ref={terminalEndRef} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Import Statistics & Summary */}
      {result && !loading && result.success && result.stats && (
        <AdminStatStrip className="grid-cols-2 md:grid-cols-4 lg:grid-cols-5">
          {[
            { label: "Mata Kuliah ID", value: result.stats.courseId, icon: BookOpen },
            { label: "Bab Belajar", value: result.stats.chapterCount, icon: Layers },
            { label: "Knowledge Objects", value: result.stats.koCount, icon: FileText },
            { label: "Ujian / Kuis", value: result.stats.asCount, icon: HelpCircle },
            { label: "Soal Terindex", value: result.stats.aoCount, icon: GitBranch },
          ].map((stat, idx) => (
            <AdminStatStripItem key={idx} icon={stat.icon} label={stat.label} value={stat.value} tone="brand" />
          ))}
        </AdminStatStrip>
      )}

      {/* Impact Analysis: per-chapter diff, computed (and in dry-run mode, rolled back) before commit */}
      {result && !loading && result.success && result.stats && result.stats.chapterDiffs.length > 0 && (
        <Card className="gap-3 rounded-xl border border-border bg-card p-4 shadow-none">
          <CardHeader className="border-b border-border px-0 pb-3 pt-0">
            <CardTitle className="font-heading text-body-base font-semibold text-foreground flex items-center gap-2">
              <Layers className="size-5 text-brand-primary" />
              {dryRun ? "Pratinjau Dampak (belum disimpan)" : "Ringkasan Perubahan"}
            </CardTitle>
            <p className="text-body-sm text-muted-foreground">
              {dryRun
                ? "Inilah yang akan terjadi jika Anda mempublikasikan bundel ini, dihitung dari basis data saat ini tanpa menuliskan apa pun."
                : "Perubahan Knowledge Object per bab pada import ini."}
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {result.stats.chapterDiffs.map((diff) => (
                <div key={diff.chapterId} className="p-4 flex items-center justify-between gap-4 text-left">
                  <div className="min-w-0">
                    <p className="text-body-sm font-semibold text-foreground truncate">{diff.chapterTitle}</p>
                    <p className="text-body-xs text-muted-foreground mt-0.5">
                      {diff.cascadedStaleness
                        ? "Konten berubah; materi website, flashcard, diktat, dan bank soal terkait akan ditandai usang."
                        : "Tidak ada perubahan substantif; tidak ada aset turunan yang akan ditandai usang."}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 text-body-xs font-mono">
                    {diff.koAdded > 0 && (
                      <span className="px-1.5 py-0.5 rounded-md bg-status-success/15 text-status-success">+{diff.koAdded}</span>
                    )}
                    {diff.koUpdated > 0 && (
                      <span className="px-1.5 py-0.5 rounded-md bg-status-warning/15 text-status-warning">~{diff.koUpdated}</span>
                    )}
                    {diff.koUnchanged > 0 && (
                      <span className="px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">={diff.koUnchanged}</span>
                    )}
                    {diff.koRetired > 0 && (
                      <span className="px-1.5 py-0.5 rounded-md bg-status-error/15 text-status-error">-{diff.koRetired}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Failure alert */}
      {result && !loading && !result.success && (
        <div className="space-y-6">
          {/* Main Error Message Card */}
          <div className="p-5 rounded-xl border border-status-error/20 bg-status-error/5 text-status-error flex gap-3 text-left">
            <AlertCircle className="size-5 shrink-0 mt-0.5" />
            <div>
              <h5 className="font-heading text-body-base font-semibold leading-none">Import Gagal</h5>
              <p className="text-body-sm mt-2 text-status-error/90 whitespace-pre-line leading-relaxed font-sans">
                {result.friendlyExplanation || result.error || "Gagal mengimpor bundel mata kuliah. Periksa konsol logs di atas."}
              </p>
            </div>
          </div>

          {/* Detailed Error Context (Non-Technical friendly details) */}
          {result.errorContext && (
            <Card className="gap-3 rounded-xl border border-border bg-card p-4 shadow-none">
              <CardHeader className="border-b border-border px-0 pb-3 pt-0 text-left">
                <CardTitle className="font-heading text-body-base font-semibold text-foreground flex items-center gap-2">
                  <HelpCircle className="size-5 text-brand-primary" />
                  Identifikasi Lokasi Masalah
                </CardTitle>
                <p className="text-body-sm text-muted-foreground">
                  Berikut adalah perkiraan lokasi data yang menyebabkan kesalahan di dalam file bundel Anda:
                </p>
              </CardHeader>
              <CardContent className="p-0 text-left space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {result.errorContext.courseTitle && (
                    <div className="p-3 bg-muted/50 border border-border rounded-lg">
                      <span className="text-body-xs font-semibold text-muted-foreground uppercase tracking-wider block">Mata Kuliah</span>
                      <span className="text-body-sm font-semibold text-foreground block mt-0.5">{result.errorContext.courseTitle}</span>
                    </div>
                  )}
                  {result.errorContext.chapterTitle && (
                    <div className="p-3 bg-muted/50 border border-border rounded-lg">
                      <span className="text-body-xs font-semibold text-muted-foreground uppercase tracking-wider block">Bab Belajar</span>
                      <span className="text-body-sm font-semibold text-foreground block mt-0.5">
                        {result.errorContext.chapterTitle}
                        {result.errorContext.chapterIndex && ` (Bab ke-${result.errorContext.chapterIndex})`}
                      </span>
                    </div>
                  )}
                  {result.errorContext.entityType && (
                    <div className="p-3 bg-muted/50 border border-border rounded-lg">
                      <span className="text-body-xs font-semibold text-muted-foreground uppercase tracking-wider block">Tipe Komponen</span>
                      <span className="text-body-sm font-semibold text-foreground block mt-0.5">{result.errorContext.entityType}</span>
                    </div>
                  )}
                  {result.errorContext.entityName && (
                    <div className="p-3 bg-muted/50 border border-border rounded-lg">
                      <span className="text-body-xs font-semibold text-muted-foreground uppercase tracking-wider block">Nama Komponen</span>
                      <span className="text-body-sm font-semibold text-foreground block mt-0.5">{result.errorContext.entityName}</span>
                    </div>
                  )}
                  {result.errorContext.propertyName && (
                    <div className="p-3 bg-muted/50 border border-border rounded-lg md:col-span-2">
                      <span className="text-body-xs font-semibold text-muted-foreground uppercase tracking-wider block">Nama Kolom / Properti</span>
                      <code className="text-body-sm font-mono text-brand-primary block mt-0.5 bg-brand-primary/5 px-2 py-0.5 rounded-md w-fit">
                        {result.errorContext.propertyName}
                      </code>
                    </div>
                  )}
                </div>

                {/* Indonesian Remediation Action Checklist */}
                <div className="mt-4 p-4 rounded-xl border border-brand-primary/10 bg-brand-primary/5 space-y-2">
                  <h6 className="font-heading text-body-sm font-semibold text-brand-primary flex items-center gap-1.5">
                    💡 Panduan Perbaikan Mandiri (Untuk Excel / Word / Text)
                  </h6>
                  <ul className="list-disc pl-5 text-body-sm text-muted-foreground space-y-1.5 leading-relaxed">
                    {result.error && result.error.includes("Invalid JSON format") ? (
                      <>
                        <li>
                          Buka kembali file spreadsheet atau aplikasi penyusun materi Anda, cari bagian{" "}
                          <strong>{result.errorContext.entityName || result.errorContext.entityType || "materi"}</strong>.
                        </li>
                        {result.error.toLowerCase().includes("bad escaped character") ? (
                          <>
                            <li>
                              Periksa apakah terdapat karakter garis miring terbalik (backslash <code>\</code>) di dalam teks tersebut.
                            </li>
                            <li>
                              Ubah karakter <code>\</code> menjadi garis miring biasa <code>/</code>, atau jika Anda ingin tetap menuliskannya, tulislah ganda menjadi <code>\\</code>.
                            </li>
                          </>
                        ) : result.error.toLowerCase().includes("unexpected token }") || result.error.toLowerCase().includes("unexpected token ]") ? (
                          <li>
                            Ada kelebihan tanda koma (<code>,</code>) di akhir daftar data. Hapus tanda koma terakhir sebelum tanda kurung tutup.
                          </li>
                        ) : (
                          <>
                            <li>
                              Periksa jika ada penggunaan tanda kutip ganda (<code>{"\""}</code>) di dalam teks deskripsi atau isi materi. Gantilah dengan tanda kutip tunggal (<code>{"'"}</code>).
                            </li>
                            <li>
                              Pastikan tidak ada karakter khusus yang tidak sengaja terketik di luar tanda kutip pembuka atau penutup.
                            </li>
                          </>
                        )}
                      </>
                    ) : result.error && result.error.includes("UNIQUE constraint failed") ? (
                      <>
                        <li>
                          Sistem mendeteksi adanya data ganda untuk bagian yang harus unik (seperti Judul Kelas, Slug Konsep, atau ID Bab).
                        </li>
                        <li>
                          Silakan ganti nama atau kode unik <strong>{result.errorContext.entityName || "komponen"}</strong> pada kolom <strong>{result.errorContext.propertyName || "data"}</strong> dengan nilai yang berbeda.
                        </li>
                      </>
                    ) : result.error && result.error.includes("foreign key constraint failed") ? (
                      <>
                        <li>
                          Ada hubungan data yang terputus. Pastikan materi atau relasi yang Anda buat merujuk ke ID konsep atau bab yang benar-benar terdaftar di file ini.
                        </li>
                        <li>
                          Periksa kembali kolom referensi seperti <code>concept$ref</code> atau <code>chapter$ref</code>.
                        </li>
                      </>
                    ) : (
                      <li>
                        Silakan periksa kembali berkas asal materi Anda, pastikan seluruh data telah diisi lengkap dan format penulisan karakter khusus sudah sesuai panduan.
                      </li>
                    )}
                    <li>Setelah melakukan perbaikan, lakukan ekspor ulang ke file JSON dan coba unggah kembali ke sini.</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          )}

          {/* JSON code snippet highlight */}
          {result.jsonSnippet && (
            <div className="rounded-xl border border-border bg-muted/30 p-5">
              <h6 className="font-heading text-body-sm font-semibold text-foreground mb-3 text-left">Potongan Kode Bermasalah (JSON)</h6>
              <pre className="text-left font-mono text-body-sm overflow-x-auto p-4 bg-zinc-950 text-zinc-100 rounded-lg whitespace-pre select-all leading-relaxed border border-border">
                {result.jsonSnippet}
              </pre>
              <p className="text-body-xs text-muted-foreground mt-3 text-left">
                💡 Tip: Karakter salah ditandai dengan tanda panah <code>👉</code> di sebelah kiri dan simbol caret <code>^</code> di bawahnya.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
