"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
import { MathText } from "@/components/course/math-text";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
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

  const [isClosed, setIsClosed] = useState(false);
  const [closedReason, setClosedReason] = useState<string | null>(null);

  const fetchForm = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/forms/${idOrSlug}`);
      const data = await res.json();
      if (data.form) {
        setForm(data.form);
        if (data.isClosed) {
          setIsClosed(true);
          setClosedReason(data.closedReason || "Formulir ini tidak lagi menerima tanggapan.");
        }
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

  const [currentStep, setCurrentStep] = useState<number>(0);

  const sections = useMemo(() => {
    if (!form || !form.questions || form.questions.length === 0) return [];

    const result: { title?: string; description?: string; questionIndices: number[] }[] = [];
    let currentSec = {
      title: form.title,
      description: form.description,
      questionIndices: [] as number[],
    };

    form.questions.forEach((q: any, idx: number) => {
      if (q.type === "SECTION") {
        if (currentSec.questionIndices.length > 0 || result.length > 0) {
          result.push(currentSec);
        }
        currentSec = {
          title: q.title || `Bagian ${result.length + 1}`,
          description: q.description,
          questionIndices: [],
        };
      } else {
        currentSec.questionIndices.push(idx);
      }
    });

    if (currentSec.questionIndices.length > 0 || result.length === 0) {
      result.push(currentSec);
    }

    return result;
  }, [form]);

  const handleNextStep = () => {
    if (!form) return;
    const activeSec = sections[currentStep];
    if (!activeSec) return;

    for (const qIdx of activeSec.questionIndices) {
      const q = form.questions[qIdx];
      if (q && q.required) {
        const userAns = answers[qIdx];
        if (
          userAns === undefined ||
          userAns === null ||
          userAns === "" ||
          (Array.isArray(userAns) && userAns.length === 0)
        ) {
          toast.error(`Harap isi pertanyaan wajib: "${q.title || `Pertanyaan #${qIdx + 1}`}"`);
          return;
        }
      }
    }

    setCurrentStep((prev) => Math.min(sections.length - 1, prev + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handlePrevStep = () => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

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
      if (form?.title) {
        formData.append("formTitle", form.title);
      }
      if (form?.slug || form?.id) {
        formData.append("formSlug", form.slug || form.id);
      }
      formData.append("questionNumber", String(qIdx + 1));

      const res = await fetch("/api/forms/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success && data.url) {
        handleAnswerChange(qIdx, data.url);
        toast.success("Berkas berhasil terunggah!");
      } else {
        toast.error(data.error || "Gagal mengunggah berkas.");
      }
    } catch {
      toast.error("Terjadi kesalahan pengunggahan.");
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
          <p className="text-body-sm text-muted-foreground">{errorMsg || "Formulir ini mungkin telah dihapus."}</p>
        </div>
      </Reveal>
    );
  }

  if (isClosed) {
    return (
      <Reveal className="mx-auto max-w-xl px-4 py-16 text-center space-y-6">
        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm border-t-8 border-t-status-warning space-y-3">
          <span className="rounded-md bg-status-warning/10 px-2.5 py-1 text-body-2xs font-bold uppercase tracking-wider text-status-warning">
            Pendaftaran / Tanggapan Ditutup
          </span>
          <h1 className="font-heading text-h3 font-bold text-foreground">{form.title}</h1>
          <p className="text-body-sm text-muted-foreground whitespace-pre-line border-t border-border/40 pt-3">
            {closedReason || "Formulir ini telah ditutup dan tidak lagi menerima tanggapan baru."}
          </p>
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
          {sections.length > 1 && (
            <span className="text-body-xs font-bold text-muted-foreground">
              Bagian {currentStep + 1} dari {sections.length}
            </span>
          )}
        </div>

        {/* Section Title & Description */}
        <h1 className="font-heading text-h3 font-bold text-foreground">
          {sections[currentStep]?.title || form.title}
        </h1>
        {sections[currentStep]?.description && (
          <p className="text-body-sm text-muted-foreground whitespace-pre-line border-t border-border/40 pt-3">
            {sections[currentStep].description}
          </p>
        )}

        {/* Progress Bar for multi-section forms */}
        {sections.length > 1 && (
          <div className="pt-2 space-y-1">
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-brand-primary transition-all duration-300"
                style={{ width: `${((currentStep + 1) / sections.length) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Form Submission Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        {(sections[currentStep]?.questionIndices || []).map((qIdx: number) => {
          const q = form.questions[qIdx];
          if (!q) return null;
          const answerVal = answers[qIdx];

          return (
            <div
              key={qIdx}
              className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4"
            >
              {/* Title & Required */}
              <div className="space-y-1">
                <h3 className="font-heading text-h6 font-semibold text-foreground flex items-center gap-1.5">
                  <span><MathText as="span">{`${qIdx + 1}. ${q.title}`}</MathText></span>
                  {q.required && <span className="text-status-error font-bold">*</span>}
                </h3>
                {q.description && (
                  <MathText className="text-body-xs text-muted-foreground block" as="div">{q.description}</MathText>
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
                    className="w-full sm:w-2/3 rounded-xl border border-input bg-background px-4 py-2.5 text-body-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                )}

                {/* 2. PARAGRAPH */}
                {q.type === "PARAGRAPH" && (
                  <textarea
                    rows={3}
                    required={q.required}
                    value={answerVal || ""}
                    onChange={(e) => handleAnswerChange(qIdx, e.target.value)}
                    placeholder="Jawaban Anda"
                    className="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-body-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                  />
                )}

                {/* 3. RADIO */}
                {q.type === "RADIO" && (
                  <div className="space-y-2.5">
                    {(q.options || []).map((opt, oIdx) => (
                      <label key={oIdx} className="flex items-center gap-3 cursor-pointer group text-body-sm">
                        <input
                          type="radio"
                          name={`q_${qIdx}`}
                          required={q.required && !answerVal}
                          checked={answerVal === opt}
                          onChange={() => handleAnswerChange(qIdx, opt)}
                          className="size-4.5 text-brand-primary focus:ring-ring"
                        />
                        <span className="text-foreground group-hover:text-brand-primary transition-colors">{opt}</span>
                      </label>
                    ))}
                  </div>
                )}

                {/* 4. CHECKBOX */}
                {q.type === "CHECKBOX" && (
                  <div className="space-y-2.5">
                    {(q.options || []).map((opt, oIdx) => {
                      const selectedList: string[] = Array.isArray(answerVal) ? answerVal : [];
                      return (
                        <label key={oIdx} className="flex items-center gap-3 cursor-pointer group text-body-sm">
                          <input
                            type="checkbox"
                            checked={selectedList.includes(opt)}
                            onChange={() => handleCheckboxToggle(qIdx, opt)}
                            className="size-4.5 rounded border-input text-brand-primary focus:ring-ring"
                          />
                          <span className="text-foreground group-hover:text-brand-primary transition-colors">{opt}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* 5. DROP_DOWN */}
                {q.type === "DROP_DOWN" && (
                  <Select value={answerVal || ""} onValueChange={(val) => handleAnswerChange(qIdx, val)}>
                    <SelectTrigger className="w-full sm:w-2/3 h-11 text-body-sm font-medium">
                      <SelectValue placeholder="Pilih satu opsi..." />
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
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <label className="inline-flex items-center gap-2 rounded-xl border border-input bg-background px-4 py-2.5 text-body-xs font-bold text-foreground hover:bg-muted transition-colors cursor-pointer shadow-xs">
                        <UploadCloud className="size-4 text-brand-primary" />
                        {uploadingQIdx === qIdx ? "Mengunggah..." : "Pilih & Unggah Berkas"}
                        <input
                          type="file"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleFileUpload(qIdx, f);
                          }}
                        />
                      </label>
                      {uploadingQIdx === qIdx && <RefreshCw className="size-4 animate-spin text-brand-primary" />}
                    </div>

                    {answerVal && (
                      <div className="flex items-center gap-2 text-body-xs font-semibold text-status-success bg-status-success/10 p-3 rounded-xl border border-status-success/30">
                        <CheckCircle2 className="size-4 shrink-0" />
                        <span className="truncate">Berkas terunggah: {String(answerVal)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* 7. SCALE (1-5) */}
                {q.type === "SCALE" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-body-xs text-muted-foreground max-w-md">
                      <span>{q.scaleLowLabel || "1 (Sangat Tidak Setuju)"}</span>
                      <span>{q.scaleHighLabel || "5 (Sangat Setuju)"}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {[1, 2, 3, 4, 5].map((valNum) => (
                        <label key={valNum} className="flex flex-col items-center gap-1 cursor-pointer">
                          <input
                            type="radio"
                            name={`q_${qIdx}`}
                            required={q.required}
                            checked={answerVal === valNum.toString()}
                            onChange={() => handleAnswerChange(qIdx, valNum.toString())}
                            className="size-5 text-brand-primary focus:ring-ring"
                          />
                          <span className="text-body-xs font-bold text-foreground">{valNum}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* 8. RATING (Bintang) */}
                {q.type === "RATING" && (
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((starIdx) => {
                      const currentRating = parseInt(answerVal || "0", 10);
                      const isFilled = starIdx <= currentRating;
                      return (
                        <button
                          key={starIdx}
                          type="button"
                          onClick={() => handleAnswerChange(qIdx, starIdx.toString())}
                          className="p-1 cursor-pointer transition-transform hover:scale-110"
                        >
                          <Star
                            className={`size-7 ${
                              isFilled ? "fill-status-warning text-status-warning" : "text-muted-foreground/40"
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* 9. GRID_RADIO & 10. GRID_CHECKBOX */}
                {(q.type === "GRID_RADIO" || q.type === "GRID_CHECKBOX") && (
                  <div className="overflow-x-auto rounded-xl border border-border bg-card p-4">
                    <table className="w-full text-left text-body-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted/40">
                          <th className="p-2.5 font-bold text-foreground">Baris / Kolom</th>
                          {(q.gridColumns || []).map((col: string, cIdx: number) => (
                            <th key={cIdx} className="p-2.5 font-bold text-foreground text-center">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {(q.gridRows || []).map((rowName: string, rIdx: number) => {
                          const currentObj = typeof answerVal === "object" && !Array.isArray(answerVal) ? answerVal : {};
                          const rowAns = currentObj[rowName];

                          return (
                            <tr key={rIdx} className="hover:bg-muted/20">
                              <td className="p-2.5 font-semibold text-foreground">{rowName}</td>
                              {(q.gridColumns || []).map((colName: string, cIdx: number) => {
                                const isChecked = q.type === "GRID_CHECKBOX"
                                  ? Array.isArray(rowAns) && rowAns.includes(colName)
                                  : rowAns === colName;

                                return (
                                  <td key={cIdx} className="p-2.5 text-center">
                                    <input
                                      type={q.type === "GRID_CHECKBOX" ? "checkbox" : "radio"}
                                      name={`grid_${qIdx}_${rIdx}`}
                                      checked={Boolean(isChecked)}
                                      onChange={() => handleGridChoice(qIdx, rowName, colName, q.type === "GRID_CHECKBOX")}
                                      className="size-4.5 text-brand-primary focus:ring-ring cursor-pointer"
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

        {/* Section Navigation Buttons (Kembali / Berikutnya / Kirimkan) */}
        <div className="flex items-center justify-between pt-4 border-t border-border/60">
          <div>
            {currentStep > 0 && (
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={handlePrevStep}
                className="px-6 font-semibold"
              >
                Kembali
              </Button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {currentStep < sections.length - 1 ? (
              <Button
                type="button"
                size="lg"
                onClick={handleNextStep}
                className="px-8 font-bold bg-brand-primary hover:bg-brand-primary/90 text-white"
              >
                Berikutnya
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={submitting}
                size="lg"
                className="px-8 font-bold"
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
            )}
          </div>
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
