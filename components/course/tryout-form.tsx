"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Flag, Timer, BookOpen, AlertCircle, FileText, CheckCircle2, Trash2, ArrowLeft, ArrowRight, UploadCloud } from "lucide-react";
import { MathText } from "@/components/course/math-text";
import type { ExamFixture, QuestionSpec } from "@/lib/student-course-fixtures";
import { QuestionSourceCitation } from "@/components/course/question-source-citation";

import { submitTryoutAction } from "@/app/actions/tutor-management";

type AnswerState =
  | { type: "short_answer"; text: string; fileName: string | null }
  | { type: "multiple_choice"; index: number | null }
  | { type: "multiple_choices"; indices: number[] }
  | { type: "essay"; text: string; fileName: string | null; fileSize?: string };

function emptyAnswer(q: QuestionSpec): AnswerState {
  if (q.type === "short_answer") return { type: "short_answer", text: "", fileName: null };
  if (q.type === "multiple_choice") return { type: "multiple_choice", index: null };
  if (q.type === "multiple_choices") return { type: "multiple_choices", indices: [] };
  return { type: "essay", text: "", fileName: null, fileSize: "" };
}

type TryoutFormProps = {
  courseId: string;
  exam: ExamFixture;
};

export function TryoutForm({ courseId, exam }: TryoutFormProps) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>(() => {
    const init: Record<string, AnswerState> = {};
    for (const q of exam.questions) init[q.id] = emptyAnswer(q);
    return init;
  });

  // Flag and Time tracking
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [timeLeft, setTimeLeft] = useState<number>(() => {
    return (exam.settings?.timeLimitMinutes ?? 90) * 60;
  });

  // S3 Cloudflare R2 upload simulation state
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadingFile, setUploadingFile] = useState<Record<string, string>>({});

  const handleSubmit = useCallback(async () => {
    try {
      // Save to Database
      const res = await submitTryoutAction(courseId, exam.id, answers);
      if (res.success) {
        toast.success("Tryout selesai dikumpulkan! Menunggu penilaian pengajar.");
      }
    } catch (err: any) {
      console.error("Error submitting tryout:", err);
      toast.error(err.message || "Gagal mengumpulkan lembar jawaban.");
    }

    router.push(`/courses/${courseId}/my-results`);
  }, [courseId, exam.id, answers, router]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          toast.warning("Waktu ujian berakhir! Lembar jawaban dikumpulkan otomatis.");
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [handleSubmit]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h > 0 ? `${h}:` : ""}${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const sorted = useMemo(
    () => [...exam.questions].sort((a, b) => a.order - b.order),
    [exam.questions],
  );

  const q = sorted[index];
  const progress = ((index + 1) / sorted.length) * 100;

  function setAnswerFor(id: string, next: AnswerState) {
    setAnswers((prev) => ({ ...prev, [id]: next }));
  }

  function toggleFlag(id: string) {
    setFlags((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  // Simulate Cloudflare R2 Upload progress bar
  function simulateUpload(questionId: string, file: File) {
    setUploadingFile((prev) => ({ ...prev, [questionId]: file.name }));
    setUploadProgress((prev) => ({ ...prev, [questionId]: 0 }));

    let current = 0;
    const interval = setInterval(() => {
      current += Math.floor(Math.random() * 25) + 10;
      if (current >= 100) {
        current = 100;
        clearInterval(interval);
        
        // Save uploaded state
        const sizeFormatted = (file.size / (1024 * 1024)).toFixed(2) + " MB";
        setAnswerFor(questionId, {
          ...answers[questionId],
          fileName: file.name,
          fileSize: sizeFormatted,
        } as AnswerState);
        toast.success(`Berkas ${file.name} berhasil diunggah ke Cloudflare R2 bucket!`);
      }
      setUploadProgress((prev) => ({ ...prev, [questionId]: current }));
    }, 250);
  }

  function handleFileChange(questionId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) {
      simulateUpload(questionId, f);
    }
  }

  function handleRemoveFile(questionId: string) {
    setAnswerFor(questionId, {
      ...answers[questionId],
      fileName: null,
      fileSize: undefined,
    } as AnswerState);
    setUploadProgress((prev) => {
      const copy = { ...prev };
      delete copy[questionId];
      return copy;
    });
    setUploadingFile((prev) => {
      const copy = { ...prev };
      delete copy[questionId];
      return copy;
    });
    toast.info("Lampiran berkas dihapus.");
  }

  function goPrev() {
    if (index > 0) setIndex((i) => i - 1);
  }

  function goNext() {
    if (index < sorted.length - 1) setIndex((i) => i + 1);
  }

  const isQuestionAnswered = (question: QuestionSpec) => {
    const ans = answers[question.id];
    if (!ans) return false;
    if (ans.type === "multiple_choice") return ans.index !== null;
    if (ans.type === "multiple_choices") return ans.indices.length > 0;
    if (ans.type === "short_answer" || ans.type === "essay") {
      const textDone = ans.text.trim() !== "";
      const fileDone = ans.fileName !== null;
      return textDone || fileDone;
    }
    return false;
  };

  const ans = answers[q.id];
  const currentFlagged = !!flags[q.id];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start font-sans">
      
      {/* LEFT COLUMN: Ujian Workspace (8 cols) */}
      <div className="lg:col-span-8 space-y-6">
        
        {/* Progress Tracker Bar */}
        <div className="bg-card/50 border border-border/70 p-4 rounded-2xl flex items-center justify-between gap-4 backdrop-blur-xs">
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center justify-between text-body-xs font-semibold text-muted-foreground">
              <span>SIMULASI UTS / UAS</span>
              <span>Soal {index + 1} dari {sorted.length}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-md bg-muted">
              <div
                className="h-full rounded-md bg-linear-to-r from-brand-primary via-tertiary-1 to-brand-secondary transition-[width] duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-1.5 bg-brand-secondary/10 border border-brand-secondary/35 text-brand-secondary px-3.5 py-1.5 rounded-xl font-mono text-body-sm font-bold">
            <Timer className="size-4 animate-pulse" />
            <span>{formatTime(timeLeft)}</span>
          </div>
        </div>

        {/* Card for Active Question */}
        <div
          className={cn(
            "rounded-3xl border border-border/80 bg-card p-6 shadow-lg backdrop-blur-xs md:p-8 relative",
            "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300",
            currentFlagged && "ring-1 ring-brand-secondary/35 border-brand-secondary/40"
          )}
        >
          {/* Question Prompt */}
          <div className="flex gap-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-body-sm font-bold text-white shadow-xs">
              {index + 1}
            </span>
            <h2 className="font-heading text-body-lg font-bold text-foreground leading-snug md:text-h5">
              <MathText>{q.prompt}</MathText>
            </h2>
          </div>

          {/* RENDER A: Pilihan Ganda (Single Choice) */}
          {q.type === "multiple_choice" && ans.type === "multiple_choice" ? (
            <fieldset className="mt-8 space-y-3">
              <legend className="sr-only">Pilih satu jawaban</legend>
              {q.options.map((opt, i) => {
                const selected = ans.index === i;
                return (
                  <label
                    key={i}
                    className={cn(
                      "flex cursor-pointer items-center gap-3.5 rounded-2xl border-2 px-5 py-4 transition-all duration-200",
                      selected
                        ? "border-brand-primary bg-brand-primary/10 shadow-sm"
                        : "border-border/70 bg-muted/10 hover:border-brand-primary/45"
                    )}
                  >
                    <input
                      type="radio"
                      name={q.id}
                      checked={selected}
                      onChange={() => setAnswerFor(q.id, { type: "multiple_choice", index: i })}
                      className="size-4 text-brand-primary accent-brand-primary border-border"
                    />
                    <span className="text-body-sm font-semibold text-foreground mr-1">
                      {String.fromCharCode(65 + i)}.
                    </span>
                    <MathText className="text-body-sm text-foreground leading-normal">{opt}</MathText>
                  </label>
                );
              })}
            </fieldset>
          ) : null}

          {/* RENDER B: Pilihan Ganda Kompleks (Multi Select) */}
          {q.type === "multiple_choices" && ans.type === "multiple_choices" ? (
            <fieldset className="mt-8 space-y-3">
              <legend className="sr-only">Pilih semua yang benar (Multi-select)</legend>
              {q.options.map((opt, i) => {
                const checked = ans.indices.includes(i);
                return (
                  <label
                    key={i}
                    className={cn(
                      "flex cursor-pointer items-center gap-3.5 rounded-2xl border-2 px-5 py-4 transition-all duration-200",
                      checked
                        ? "border-tertiary-1 bg-tertiary-1/10 shadow-sm"
                        : "border-border/70 bg-muted/10 hover:border-tertiary-1/45"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const next = checked
                          ? ans.indices.filter((x) => x !== i)
                          : [...ans.indices, i].sort((a, b) => a - b);
                        setAnswerFor(q.id, { type: "multiple_choices", indices: next });
                      }}
                      className="size-4 text-tertiary-1 accent-tertiary-1 rounded border-border"
                    />
                    <span className="text-body-sm font-semibold text-foreground mr-1">
                      {String.fromCharCode(65 + i)}.
                    </span>
                    <MathText className="text-body-sm text-foreground leading-normal">{opt}</MathText>
                  </label>
                );
              })}
            </fieldset>
          ) : null}

          {/* RENDER C: Isian Singkat */}
          {q.type === "short_answer" && ans.type === "short_answer" ? (
            <div className="mt-8">
              <label className="block">
                <span className="mb-2 block text-body-xs font-semibold text-muted-foreground uppercase">
                  Isikan Jawaban Singkat Anda:
                </span>
                <input
                  type="text"
                  value={ans.text}
                  onChange={(e) => setAnswerFor(q.id, { ...ans, text: e.target.value })}
                  className="w-full rounded-2xl border border-input bg-background px-4 py-3.5 text-body-sm text-foreground shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  placeholder="Tulis angka atau kata kunci jawaban..."
                />
              </label>
            </div>
          ) : null}

          {/* RENDER D: Esai (Text Area + Cloudflare R2 Upload) */}
          {q.type === "essay" && ans.type === "essay" ? (
            <div className="mt-8 space-y-5">
              <label className="block">
                <span className="mb-2 block text-body-xs font-semibold text-muted-foreground uppercase">
                  Jawaban Esai Teks:
                </span>
                <textarea
                  value={ans.text}
                  onChange={(e) => setAnswerFor(q.id, { ...ans, text: e.target.value })}
                  rows={8}
                  className="w-full rounded-2xl border border-input bg-background px-4 py-3.5 text-body-sm leading-relaxed text-foreground shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  placeholder="Ketik penjelasan runut, penjabaran matematika, atau esai Anda di sini..."
                />
              </label>

              {/* Cloudflare R2 file uploader widget */}
              {q.acceptsFile && (
                <div className="space-y-3">
                  <span className="block text-body-xs font-semibold text-muted-foreground uppercase">
                    Unggah Lampiran Berkas (PDF / Gambar coretan):
                  </span>

                  {!ans.fileName && !uploadingFile[q.id] ? (
                    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-muted/10 p-6 text-center hover:bg-muted/20 hover:border-brand-primary/40 transition-all relative">
                      <input
                        type="file"
                        accept=".pdf,image/*"
                        onChange={(e) => handleFileChange(q.id, e)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <UploadCloud className="size-8 text-muted-foreground mb-2" />
                      <p className="text-body-xs font-bold text-foreground">Klik atau Seret Berkas di sini</p>
                      <p className="text-[10px] text-muted-foreground mt-1">Mendukung PDF, PNG, JPG (Maks. 10 MB)</p>
                    </div>
                  ) : null}

                  {/* Uploading Progress */}
                  {uploadingFile[q.id] && uploadProgress[q.id] < 100 ? (
                    <div className="rounded-2xl border border-brand-secondary/35 bg-brand-secondary/5 p-4 space-y-2 animate-pulse">
                      <div className="flex justify-between text-body-xs font-semibold text-brand-secondary">
                        <span className="truncate max-w-[200px]">Mengunggah: {uploadingFile[q.id]}</span>
                        <span>{uploadProgress[q.id]}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-muted rounded overflow-hidden">
                        <div
                          className="h-full bg-brand-secondary rounded transition-all"
                          style={{ width: `${uploadProgress[q.id]}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground">Menyimpan langsung ke Cloudflare R2 Object Storage...</p>
                    </div>
                  ) : null}

                  {/* Upload completed display */}
                  {ans.fileName && (
                    <div className="rounded-2xl border border-status-success/35 bg-status-success/5 p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-status-success/15 text-status-success">
                          <FileText className="size-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-body-xs font-bold text-foreground truncate max-w-[200px] md:max-w-xs">{ans.fileName}</p>
                          <p className="text-[10px] text-muted-foreground">{ans.fileSize || "1.2 MB"} • Cloudflare R2</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveFile(q.id)}
                        className="rounded-md p-2 text-muted-foreground hover:bg-status-error/10 hover:text-status-error transition-colors shrink-0"
                        title="Hapus lampiran"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}

          {/* Ragu-ragu Checkbox */}
          <div className="mt-8 border-t border-border pt-5 flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={currentFlagged}
                onChange={() => toggleFlag(q.id)}
                className="size-4 rounded-sm border-border text-brand-secondary accent-brand-secondary focus:ring-brand-secondary"
              />
              <span className={cn(
                "text-body-xs font-semibold flex items-center gap-1 transition-colors",
                currentFlagged ? "text-brand-secondary" : "text-muted-foreground hover:text-foreground"
              )}>
                <Flag className={cn("size-3.5", currentFlagged ? "fill-brand-secondary text-brand-secondary" : "")} />
                Tandai Ragu-ragu
              </span>
            </label>

            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="size-3 text-status-success" />
              Progress ujian tersimpan aman
            </span>
          </div>
          <QuestionSourceCitation origin={q.origin} sourceEventName={q.sourceEventName} />
        </div>

        {/* Back and Forth Control buttons */}
        <div className="flex items-center justify-between gap-3 bg-muted/20 p-4 rounded-2xl border border-border/60">
          <Button
            type="button"
            variant="outline"
            className="gap-1 border-border/80"
            onClick={goPrev}
            disabled={index === 0}
          >
            <ArrowLeft className="size-4" />
            Sebelumnya
          </Button>

          <div className="flex gap-2">
            {index < sorted.length - 1 ? (
              <Button type="button" className="gap-1 bg-foreground text-background hover:bg-foreground/90 px-6" onClick={goNext}>
                Lanjut
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button type="button" className="bg-brand-primary text-white hover:bg-brand-primary/95 px-8 font-bold" onClick={handleSubmit}>
                Kumpulkan Jawaban
              </Button>
            )}
          </div>
        </div>

      </div>

      {/* RIGHT COLUMN: Sidebar Navigation (4 cols) */}
      <div className="lg:col-span-4 space-y-6">
        
        {/* Navigation grid panel */}
        <div className="rounded-3xl border border-border bg-card p-5 shadow-md space-y-5">
          <div>
            <h3 className="font-heading text-body-sm font-bold text-foreground flex items-center gap-2">
              <BookOpen className="size-4 text-brand-primary" />
              Indikator Lembar Jawab
            </h3>
            <p className="text-body-xs text-muted-foreground mt-1">
              Navigasi cepat untuk mengecek soal yang sudah dikerjakan:
            </p>
          </div>

          {/* Grid buttons */}
          <div className="grid grid-cols-5 gap-2.5">
            {sorted.map((question, idx) => {
              const active = index === idx;
              const isDone = isQuestionAnswered(question);
              const isFlagged = !!flags[question.id];

              return (
                <button
                  key={question.id}
                  type="button"
                  onClick={() => setIndex(idx)}
                  className={cn(
                    "flex size-10 items-center justify-center rounded-xl font-heading font-bold text-body-xs transition-all border-2",
                    active
                      ? "border-brand-primary ring-2 ring-brand-primary/20 scale-105"
                      : "border-transparent",
                    isFlagged
                      ? "bg-brand-secondary/15 text-brand-secondary border-brand-secondary/60 hover:bg-brand-secondary/25"
                      : isDone
                      ? "bg-tertiary-1/15 text-tertiary-1 border-tertiary-1/50 hover:bg-tertiary-1/25"
                      : "bg-muted/40 text-muted-foreground border-border/50 hover:bg-muted/80"
                  )}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          {/* Indicators Legend */}
          <div className="border-t border-border pt-4 space-y-2 text-body-xs">
            <span className="font-semibold text-foreground block">Legenda:</span>
            <div className="grid grid-cols-2 gap-2 text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <span className="size-3 rounded bg-muted/40 border border-border/50 shrink-0" />
                <span>Belum diisi</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-3 rounded bg-tertiary-1/15 border border-tertiary-1/50 shrink-0" />
                <span>Sudah diisi</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-3 rounded bg-brand-secondary/15 border border-brand-secondary/60 shrink-0" />
                <span>Ragu-ragu</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-3 rounded border-2 border-brand-primary shrink-0" />
                <span>Aktif</span>
              </div>
            </div>
          </div>
        </div>

        {/* Warning panel */}
        <div className="rounded-2xl border border-brand-secondary/20 bg-brand-secondary/5 p-4 flex items-start gap-3">
          <AlertCircle className="size-5 text-brand-secondary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-body-xs font-bold text-foreground">Kumpulkan Sesuai Waktu</h4>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Pastikan Anda mengklik <b>Kumpulkan Jawaban</b> sebelum sisa waktu habis. Sistem akan mengumpulkan berkas secara otomatis saat penghitung waktu mencapai nol.
            </p>
          </div>
        </div>

      </div>

    </div>
  );
}
