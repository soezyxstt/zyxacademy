"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  UploadCloud,
  Star,
  Calendar,
  Clock,
  ZoomIn,
} from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface QuestionItem {
  title: string;
  description?: string;
  imageUrl?: string;
  type: string;
  required?: boolean;
  options?: string[];
  scaleLow?: number;
  scaleHigh?: number;
  scaleLowLabel?: string;
  scaleHighLabel?: string;
  gridRows?: string[];
  gridColumns?: string[];
}

interface FormPayload {
  id: string;
  slug: string;
  title: string;
  description?: string;
  category: string;
  questions: QuestionItem[];
  settings?: {
    customSuccessMessage?: string;
  };
}

export function PublicFormViewer({ idOrSlug }: { idOrSlug: string }) {
  const [form, setForm] = useState<FormPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null);

  // Form input answers state
  const [answers, setAnswers] = useState<Record<number, any>>({});
  const [uploadingQIdx, setUploadingQIdx] = useState<number | null>(null);

  // Lightbox Image Dialog State
  const [zoomImageUri, setZoomImageUri] = useState<{ url: string; title: string } | null>(null);

  const fetchForm = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/forms/${idOrSlug}`);
      const data = await res.json();
      if (data.success && data.form) {
        setForm(data.form);
      } else {
        setErrorMsg(data.error || "Formulir tidak ditemukan.");
      }
    } catch {
      setErrorMsg("Terjadi kesalahan jaringan saat mengambil formulir.");
    } finally {
      setLoading(false);
    }
  }, [idOrSlug]);

  useEffect(() => {
    fetchForm();
  }, [fetchForm]);

  const handleAnswerChange = (qIdx: number, val: any) => {
    setAnswers((prev) => ({ ...prev, [qIdx]: val }));
  };

  const handleCheckboxToggle = (qIdx: number, opt: string) => {
    setAnswers((prev) => {
      const currentList: string[] = Array.isArray(prev[qIdx]) ? prev[qIdx] : [];
      const updated = currentList.includes(opt)
        ? currentList.filter((item) => item !== opt)
        : [...currentList, opt];
      return { ...prev, [qIdx]: updated };
    });
  };

  const handleGridChoice = (qIdx: number, rowVal: string, colVal: string, isCheckbox = false) => {
    setAnswers((prev) => {
      const currentGridObj = typeof prev[qIdx] === "object" && !Array.isArray(prev[qIdx]) ? { ...prev[qIdx] } : {};
      if (isCheckbox) {
        const rowList: string[] = Array.isArray(currentGridObj[rowVal]) ? currentGridObj[rowVal] : [];
        const updatedRowList = rowList.includes(colVal)
          ? rowList.filter((c) => c !== colVal)
          : [...rowList, colVal];
        currentGridObj[rowVal] = updatedRowList;
      } else {
        currentGridObj[rowVal] = colVal;
      }
      return { ...prev, [qIdx]: currentGridObj };
    });
  };

  const handleFileUpload = async (qIdx: number, file: File) => {
    setUploadingQIdx(qIdx);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/storage/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success && data.url) {
        handleAnswerChange(qIdx, data.url);
      } else {
        alert(data.error || "Gagal mengunggah berkas.");
      }
    } catch {
      alert("Terjadi kesalahan pengunggahan.");
    } finally {
      setUploadingQIdx(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;

    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/forms/${idOrSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const data = await res.json();
      if (data.success) {
        setSubmittedMessage(data.message || "Jawaban Anda telah berhasil disimpan.");
      } else {
        setErrorMsg(data.error || "Gagal mengirim formulir.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Terjadi kesalahan jaringan.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="size-8 animate-spin text-brand-primary" />
      </div>
    );
  }

  if (errorMsg || !form) {
    return (
      <Reveal className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="rounded-2xl border border-status-error/30 bg-card p-8 shadow-sm space-y-4">
          <AlertCircle className="size-12 text-status-error mx-auto" />
          <h1 className="font-heading text-h5 font-bold text-foreground">Formulir Tidak Ditemukan</h1>
          <p className="text-body-sm text-muted-foreground">{errorMsg || "Formulir ini mungkin telah dihapus atau ditutup."}</p>
        </div>
      </Reveal>
    );
  }

  if (submittedMessage) {
    return (
      <Reveal className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="rounded-2xl border border-status-success/30 bg-card p-8 shadow-sm space-y-4">
          <CheckCircle2 className="size-14 text-status-success mx-auto" />
          <h1 className="font-heading text-h4 font-bold text-foreground">Jawaban Berhasil Terkirim</h1>
          <p className="text-body-sm text-muted-foreground">{submittedMessage}</p>
          <Button
            onClick={() => {
              setSubmittedMessage(null);
              setAnswers({});
            }}
            variant="outline"
            className="mt-4"
          >
            Isi Formulir Lagi
          </Button>
        </div>
      </Reveal>
    );
  }

  return (
    <Reveal className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 space-y-6">
      {/* Header Card */}
      <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-sm border-t-8 border-t-brand-primary space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-md bg-brand-primary/10 px-2.5 py-1 text-body-2xs font-bold uppercase tracking-wider text-brand-primary">
            {form.category}
          </span>
        </div>
        <h1 className="font-heading text-h3 font-bold text-foreground">{form.title}</h1>
        {form.description && (
          <p className="text-body-sm text-muted-foreground whitespace-pre-line border-t border-border/40 pt-3">
            {form.description}
          </p>
        )}
      </div>

      {/* Form Submission Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        {form.questions.map((q, qIdx) => {
          const answerVal = answers[qIdx];

          return (
            <div
              key={qIdx}
              className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4"
            >
              {/* Title & Required */}
              <div className="space-y-1">
                <h3 className="font-heading text-h6 font-semibold text-foreground flex items-center gap-1.5">
                  <span>{qIdx + 1}. {q.title}</span>
                  {q.required && <span className="text-status-error font-bold">*</span>}
                </h3>
                {q.description && (
                  <p className="text-body-xs text-muted-foreground">{q.description}</p>
                )}
              </div>

              {/* Question Image Attachment with Zoom Lightbox */}
              {q.imageUrl && (
                <div className="relative inline-block rounded-xl border border-border bg-muted/20 p-2 group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={q.imageUrl}
                    alt={q.title}
                    className="max-h-56 rounded-lg object-contain cursor-pointer transition-transform group-hover:scale-[1.01]"
                    onClick={() => setZoomImageUri({ url: q.imageUrl!, title: q.title })}
                  />
                  <button
                    type="button"
                    onClick={() => setZoomImageUri({ url: q.imageUrl!, title: q.title })}
                    className="absolute bottom-4 right-4 inline-flex items-center gap-1 rounded-lg bg-black/75 px-2.5 py-1 text-body-2xs font-semibold text-white backdrop-blur-xs opacity-90 hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    <ZoomIn className="size-3.5" />
                    Perbesar Gambar
                  </button>
                </div>
              )}

              {/* Question Inputs per Type */}
              <div className="pt-1">
                {/* 1. TEXT */}
                {q.type === "TEXT" && (
                  <input
                    type="text"
                    required={q.required}
                    value={answerVal || ""}
                    onChange={(e) => handleAnswerChange(qIdx, e.target.value)}
                    placeholder="Jawaban Anda"
                    className="w-full sm:w-3/4 rounded-xl border border-input bg-background px-4 py-2.5 text-body-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                )}

                {/* 2. PARAGRAPH */}
                {q.type === "PARAGRAPH" && (
                  <textarea
                    rows={3}
                    required={q.required}
                    value={answerVal || ""}
                    onChange={(e) => handleAnswerChange(qIdx, e.target.value)}
                    placeholder="Tuliskan jawaban lengkap Anda di sini..."
                    className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-body-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                  />
                )}

                {/* 3. RADIO */}
                {q.type === "RADIO" && (
                  <div className="space-y-2.5">
                    {(q.options || []).map((opt, oIdx) => (
                      <label
                        key={oIdx}
                        className="flex items-center gap-3 rounded-xl border border-border/80 bg-background p-3 text-body-sm font-medium text-foreground hover:bg-muted/40 cursor-pointer transition-colors"
                      >
                        <input
                          type="radio"
                          name={`q_${qIdx}`}
                          required={q.required && !answerVal}
                          checked={answerVal === opt}
                          onChange={() => handleAnswerChange(qIdx, opt)}
                          className="size-4 text-brand-primary focus:ring-ring"
                        />
                        <span>{opt}</span>
                      </label>
                    ))}
                  </div>
                )}

                {/* 4. CHECKBOX */}
                {q.type === "CHECKBOX" && (
                  <div className="space-y-2.5">
                    {(q.options || []).map((opt, oIdx) => {
                      const selectedList: string[] = Array.isArray(answerVal) ? answerVal : [];
                      const isChecked = selectedList.includes(opt);

                      return (
                        <label
                          key={oIdx}
                          className="flex items-center gap-3 rounded-xl border border-border/80 bg-background p-3 text-body-sm font-medium text-foreground hover:bg-muted/40 cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleCheckboxToggle(qIdx, opt)}
                            className="size-4 rounded border-input text-brand-primary focus:ring-ring"
                          />
                          <span>{opt}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* 5. DROP_DOWN */}
                {q.type === "DROP_DOWN" && (
                  <Select
                    value={answerVal || ""}
                    onValueChange={(val) => handleAnswerChange(qIdx, val)}
                  >
                    <SelectTrigger className="w-full sm:w-2/3 h-11 text-body-sm">
                      <SelectValue placeholder="Pilih salah satu jawaban" />
                    </SelectTrigger>
                    <SelectContent>
                      {(q.options || []).map((opt, oIdx) => (
                        <SelectItem key={oIdx} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {/* 6. FILE_UPLOAD */}
                {q.type === "FILE_UPLOAD" && (
                  <div className="space-y-2">
                    {answerVal ? (
                      <div className="flex items-center justify-between rounded-xl border border-status-success/40 bg-status-success/10 p-3 text-body-xs">
                        <span className="font-semibold text-foreground truncate">File Terunggah: {answerVal}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAnswerChange(qIdx, undefined)}
                        >
                          Ganti File
                        </Button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-brand-primary/40 bg-brand-primary/5 p-6 text-center cursor-pointer hover:bg-brand-primary/10 transition-colors">
                        <UploadCloud className="size-8 text-brand-primary mb-2" />
                        <span className="text-body-sm font-bold text-foreground">
                          {uploadingQIdx === qIdx ? "Mengunggah Berkas..." : "Klik untuk Mengunggah Berkas / Dokumen"}
                        </span>
                        <span className="text-body-xs text-muted-foreground mt-1">
                          File akan disimpan dengan aman di Zyx Storage
                        </span>
                        <input
                          type="file"
                          disabled={uploadingQIdx === qIdx}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleFileUpload(qIdx, f);
                          }}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                )}

                {/* 7. SCALE */}
                {q.type === "SCALE" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-body-xs font-semibold text-muted-foreground px-1">
                      <span>{q.scaleLowLabel || "Sangat Buruk"} (1)</span>
                      <span>{q.scaleHighLabel || "Sangat Baik"} (5)</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-border/80 bg-background p-3">
                      {[1, 2, 3, 4, 5].map((val) => (
                        <label key={val} className="flex flex-col items-center gap-1 cursor-pointer">
                          <input
                            type="radio"
                            name={`q_${qIdx}`}
                            required={q.required}
                            checked={Number(answerVal) === val}
                            onChange={() => handleAnswerChange(qIdx, val)}
                            className="size-4 text-brand-primary focus:ring-ring"
                          />
                          <span className="text-body-xs font-bold">{val}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* 8. RATING */}
                {q.type === "RATING" && (
                  <div className="flex items-center gap-2 p-3 rounded-xl border border-border/80 bg-background">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => handleAnswerChange(qIdx, star)}
                        className="p-1 hover:scale-110 transition-transform cursor-pointer"
                      >
                        <Star
                          className={`size-7 ${
                            Number(answerVal) >= star
                              ? "text-status-warning fill-status-warning"
                              : "text-muted-foreground/30"
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                )}

                {/* 9 & 10. MATRIX (GRID_RADIO & GRID_CHECKBOX) */}
                {(q.type === "GRID_RADIO" || q.type === "GRID_CHECKBOX") && (
                  <div className="overflow-x-auto rounded-xl border border-border bg-background p-3">
                    <table className="w-full text-left text-body-xs border-collapse">
                      <thead>
                        <tr className="border-b border-border text-muted-foreground font-semibold">
                          <th className="p-2.5 w-1/3">Pertanyaan</th>
                          {(q.gridColumns || ["Kolom 1", "Kolom 2"]).map((col, cIdx) => (
                            <th key={cIdx} className="p-2.5 text-center">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {(q.gridRows || ["Baris 1", "Baris 2"]).map((row, rIdx) => {
                          const gridObj = typeof answerVal === "object" && !Array.isArray(answerVal) ? answerVal : {};
                          const rowAns = gridObj[row];

                          return (
                            <tr key={rIdx} className="hover:bg-muted/20">
                              <td className="p-2.5 font-medium text-foreground">{row}</td>
                              {(q.gridColumns || ["Kolom 1", "Kolom 2"]).map((col, cIdx) => {
                                const isChecked = q.type === "GRID_CHECKBOX"
                                  ? Array.isArray(rowAns) && rowAns.includes(col)
                                  : rowAns === col;

                                return (
                                  <td key={cIdx} className="p-2.5 text-center">
                                    <input
                                      type={q.type === "GRID_RADIO" ? "radio" : "checkbox"}
                                      name={`q_${qIdx}_row_${rIdx}`}
                                      checked={isChecked}
                                      onChange={() => handleGridChoice(qIdx, row, col, q.type === "GRID_CHECKBOX")}
                                      className="size-4 text-brand-primary focus:ring-ring cursor-pointer"
                                    />
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 11. DATE */}
                {q.type === "DATE" && (
                  <div className="flex items-center gap-2">
                    <Calendar className="size-5 text-brand-primary shrink-0" />
                    <input
                      type="date"
                      required={q.required}
                      value={answerVal || ""}
                      onChange={(e) => handleAnswerChange(qIdx, e.target.value)}
                      className="rounded-xl border border-input bg-background px-4 py-2 text-body-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                )}

                {/* 12. TIME */}
                {q.type === "TIME" && (
                  <div className="flex items-center gap-2">
                    <Clock className="size-5 text-brand-primary shrink-0" />
                    <input
                      type="time"
                      required={q.required}
                      value={answerVal || ""}
                      onChange={(e) => handleAnswerChange(qIdx, e.target.value)}
                      className="rounded-xl border border-input bg-background px-4 py-2 text-body-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <div className="pt-2">
          <Button
            type="submit"
            disabled={submitting}
            size="lg"
            className="w-full sm:w-auto px-8 font-bold"
          >
            {submitting ? (
              <>
                <RefreshCw className="size-4 animate-spin mr-2" />
                Mengirimkan...
              </>
            ) : (
              "Kirimkan Jawaban"
            )}
          </Button>
        </div>
      </form>

      {/* SHADCN DIALOG: LIGHTBOX IMAGE ZOOM */}
      <Dialog
        open={Boolean(zoomImageUri)}
        onOpenChange={(open) => {
          if (!open) setZoomImageUri(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{zoomImageUri?.title || "Pratinjau Gambar"}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center p-2">
            {zoomImageUri && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={zoomImageUri.url}
                alt={zoomImageUri.title}
                className="max-h-[75vh] rounded-xl object-contain"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Reveal>
  );
}
