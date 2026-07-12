"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Edit2, Trash2, Trophy, Clock, Layers, ArrowLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import {
  saveTryoutAction,
  deleteTryoutAction,
  saveTryoutQuestionAction,
  deleteTryoutQuestionAction,
} from "@/app/actions/tutor-management";

interface TryoutExam {
  id: string;
  courseId: string;
  title: string;
  type: "quiz" | "tryout";
  status: "draft" | "published" | "ended";
  settings: any; // { timeLimitMinutes?: number, maxAttempts?: number }
  openAt?: Date | string | null;
  closeAt?: Date | string | null;
}

interface TryoutQuestion {
  id: string;
  examId: string;
  type: string; // 'multiple_choice' | 'multiple_choices' | 'short_answer' | 'essay'
  content: any; // { prompt, options, correctIndex, correctIndices, acceptsImage, acceptsFile, acceptableAnswers }
  order: number;
}

interface Props {
  courseId: string;
  initialTryouts: TryoutExam[];
  initialQuestions: TryoutQuestion[];
}

export function TryoutsClient({ courseId, initialTryouts, initialQuestions }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Tryout Dialog State
  const [isTOpen, setIsTOpen] = useState(false);
  const [editingT, setEditingT] = useState<TryoutExam | null>(null);
  const [tTitle, setTTitle] = useState("");
  const [tStatus, setTStatus] = useState<"draft" | "published" | "ended">("draft");
  const [tTimeLimit, setTTimeLimit] = useState("90");
  const [tMaxAttempts, setTMaxAttempts] = useState("2");
  const [tOpenAt, setTOpenAt] = useState("");
  const [tCloseAt, setTCloseAt] = useState("");
  const [deleteTId, setDeleteTId] = useState<string | null>(null);

  // Active View (list or questions)
  const [activeExam, setActiveExam] = useState<TryoutExam | null>(null);

  // Question Dialog State
  const [isQOpen, setIsQOpen] = useState(false);
  const [editingQ, setEditingQ] = useState<TryoutQuestion | null>(null);
  const [qPrompt, setQPrompt] = useState("");
  const [qType, setQType] = useState<"multiple_choice" | "multiple_choices" | "short_answer" | "essay">("multiple_choice");
  const [qOrder, setQOrder] = useState("1");
  const [qOptions, setQOptions] = useState<string[]>(["", "", "", ""]);
  const [qCorrectIndex, setQCorrectIndex] = useState<number | undefined>(undefined);
  const [qCorrectIndices, setQCorrectIndices] = useState<number[]>([]);
  const [qAcceptsFile, setQAcceptsFile] = useState(false);
  const [qAcceptableAnswers, setQAcceptableAnswers] = useState("");
  const [deleteQId, setDeleteQId] = useState<string | null>(null);

  const activeQuestions = activeExam
    ? initialQuestions.filter((q) => q.examId === activeExam.id).sort((a, b) => a.order - b.order)
    : [];

  // Helper to format Date to datetime-local input string (YYYY-MM-DDTHH:mm)
  function formatDatetimeLocal(d: Date | string | null | undefined): string {
    if (!d) return "";
    const date = new Date(d);
    if (isNaN(date.getTime())) return "";
    const pad = (n: number) => n.toString().padStart(2, '0');
    const yyyy = date.getFullYear();
    const mm = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());
    const hh = pad(date.getHours());
    const min = pad(date.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TRYOUT EXAM HANDLERS
  // ───────────────────────────────────────────────────────────────────────────
  function handleOpenAddT() {
    setEditingT(null);
    setTTitle("");
    setTStatus("draft");
    setTTimeLimit("90");
    setTMaxAttempts("2");
    setTOpenAt("");
    setTCloseAt("");
    setIsTOpen(true);
  }

  function handleOpenEditT(t: TryoutExam) {
    setEditingT(t);
    setTTitle(t.title);
    setTStatus(t.status);
    const settings = typeof t.settings === "string" ? JSON.parse(t.settings) : t.settings;
    setTTimeLimit((settings?.timeLimitMinutes || 90).toString());
    setTMaxAttempts((settings?.maxAttempts || 2).toString());
    setTOpenAt(formatDatetimeLocal(t.openAt));
    setTCloseAt(formatDatetimeLocal(t.closeAt));
    setIsTOpen(true);
  }

  async function handleSaveT() {
    if (!tTitle.trim()) {
      toast.error("Judul tryout wajib diisi.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await saveTryoutAction(courseId, editingT?.id || null, {
          title: tTitle,
          status: tStatus,
          timeLimitMinutes: parseInt(tTimeLimit, 10) || 90,
          maxAttempts: parseInt(tMaxAttempts, 10) || 2,
          openAt: tOpenAt ? new Date(tOpenAt).toISOString() : null,
          closeAt: tCloseAt ? new Date(tCloseAt).toISOString() : null,
        });
        if (res.success) {
          toast.success(editingT ? "Tryout diperbarui!" : "Tryout baru dibuat!");
          setIsTOpen(false);
          router.refresh();
        }
      } catch (err: any) {
        toast.error(err.message || "Gagal menyimpan tryout.");
      }
    });
  }

  async function handleDeleteT() {
    if (!deleteTId) return;
    startTransition(async () => {
      try {
        const res = await deleteTryoutAction(courseId, deleteTId);
        if (res.success) {
          toast.success("Tryout berhasil dihapus.");
          setDeleteTId(null);
          router.refresh();
        }
      } catch (err: any) {
        toast.error(err.message || "Gagal menghapus tryout.");
      }
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TRYOUT QUESTION HANDLERS
  // ───────────────────────────────────────────────────────────────────────────
  function handleOpenAddQ() {
    if (!activeExam) return;
    setEditingQ(null);
    setQPrompt("");
    setQType("multiple_choice");
    setQOrder((activeQuestions.length + 1).toString());
    setQOptions(["", "", "", ""]);
    setQCorrectIndex(undefined);
    setQCorrectIndices([]);
    setQAcceptsFile(false);
    setQAcceptableAnswers("");
    setIsQOpen(true);
  }

  function handleOpenEditQ(q: TryoutQuestion) {
    setEditingQ(q);
    const content = typeof q.content === "string" ? JSON.parse(q.content) : q.content;
    setQPrompt(content.prompt || "");
    setQType(q.type as any);
    setQOrder(q.order.toString());
    setQOptions(Array.isArray(content.options) && content.options.length > 0 ? content.options : ["", "", "", ""]);
    setQCorrectIndex(content.correctIndex);
    setQCorrectIndices(content.correctIndices || []);
    setQAcceptsFile(content.acceptsFile || false);
    setQAcceptableAnswers((content.acceptableAnswers || []).join(", "));
    setIsQOpen(true);
  }

  async function handleSaveQ() {
    if (!activeExam) return;
    if (!qPrompt.trim()) {
      toast.error("Pertanyaan wajib diisi.");
      return;
    }

    if (qType === "multiple_choice" && qCorrectIndex === undefined) {
      toast.error("Pilih salah satu kunci jawaban benar.");
      return;
    }

    if (qType === "multiple_choices" && qCorrectIndices.length === 0) {
      toast.error("Checklist minimal satu kunci jawaban benar.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await saveTryoutQuestionAction(courseId, activeExam.id, editingQ?.id || null, {
          type: qType,
          order: parseInt(qOrder, 10) || 1,
          prompt: qPrompt,
          options: qOptions,
          correctIndex: qCorrectIndex,
          correctIndices: qCorrectIndices,
          acceptsFile: qAcceptsFile,
          acceptableAnswers: qAcceptableAnswers.split(",").map((a) => a.trim()).filter(Boolean),
        });
        if (res.success) {
          toast.success("Soal tryout disimpan!");
          setIsQOpen(false);
          router.refresh();
        }
      } catch (err: any) {
        toast.error(err.message || "Gagal menyimpan soal.");
      }
    });
  }

  async function handleDeleteQ() {
    if (!deleteQId) return;
    startTransition(async () => {
      try {
        const res = await deleteTryoutQuestionAction(courseId, deleteQId);
        if (res.success) {
          toast.success("Soal tryout dihapus.");
          setDeleteQId(null);
          router.refresh();
        }
      } catch (err: any) {
        toast.error(err.message || "Gagal menghapus soal.");
      }
    });
  }

  // Toggle correct index for single choice MC
  function selectSingleCorrect(idx: number) {
    setQCorrectIndex(idx);
    setQCorrectIndices([idx]);
  }

  // Toggle correct index for multiple choice MC
  function toggleMultiCorrect(idx: number) {
    setQCorrectIndices((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx].sort()
    );
  }

  // Render listing or nested questions view
  if (activeExam) {
    return (
      <div className="space-y-6">
        {/* Sub-view Header */}
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setActiveExam(null)} className="rounded-md border-border/80">
            <ArrowLeft className="mr-1.5 size-4" />
            Kembali
          </Button>
          <div>
            <h2 className="font-heading text-body-lg font-bold text-foreground">Kelola Soal: {activeExam.title}</h2>
            <p className="text-body-xs text-muted-foreground">Total: {activeQuestions.length} Soal</p>
          </div>
        </div>

        {/* Action Row */}
        <div className="flex justify-end">
          <Button onClick={handleOpenAddQ} className="bg-brand-primary text-white hover:bg-brand-primary/90 rounded-md font-semibold gap-2">
            <Plus className="size-4" />
            Tambah Pertanyaan
          </Button>
        </div>

        {/* Questions List */}
        {activeQuestions.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-border bg-card/50 rounded-2xl">
            <Trophy className="size-12 text-muted-foreground/50 mx-auto mb-3" />
            <h3 className="font-heading text-body-base font-bold text-foreground">Ujian Belum Memiliki Soal</h3>
            <p className="text-body-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              Tambahkan soal pilihan ganda, isian singkat, atau esai agar siswa dapat mulai mengerjakan.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {activeQuestions.map((q) => {
              const content = typeof q.content === "string" ? JSON.parse(q.content) : q.content;
              return (
                <Card key={q.id} className="bg-card border border-border shadow-xs rounded-2xl p-5 relative">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary text-body-xs font-bold font-mono">
                          {q.order}
                        </span>
                        <Badge variant="outline" className="text-[10px] rounded-md text-muted-foreground capitalize">
                          {q.type.replace("_", " ")}
                        </Badge>
                      </div>
                      <p className="text-body-base font-medium text-foreground leading-relaxed pt-1">{content.prompt}</p>
                    </div>

                    <div className="flex gap-1">
                      <Button variant="ghost" size="xs" onClick={() => handleOpenEditQ(q)} className="rounded-md text-muted-foreground hover:text-foreground">
                        <Edit2 className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="xs" onClick={() => setDeleteQId(q.id)} className="rounded-md text-status-error hover:bg-status-error/10 hover:text-status-error">
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Options Preview for MC */}
                  {(q.type === "multiple_choice" || q.type === "multiple_choices") && content.options && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 pl-8">
                      {content.options.map((opt: string, i: number) => {
                        const isCorrect = q.type === "multiple_choice"
                          ? content.correctIndex === i
                          : content.correctIndices?.includes(i);
                        return (
                          <div key={i} className={`flex items-center gap-2 text-body-xs px-3 py-1.5 rounded-lg border ${
                            isCorrect ? "bg-emerald-500/5 border-emerald-500/25 text-emerald-700 font-medium" : "bg-muted/10 border-border/50 text-muted-foreground"
                          }`}>
                            <span className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                              isCorrect ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"
                            }`}>
                              {String.fromCharCode(65 + i)}
                            </span>
                            <span>{opt}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Short Answer Key */}
                  {q.type === "short_answer" && content.acceptableAnswers && (
                    <p className="text-body-xs text-muted-foreground mt-3 pl-8">
                      Kunci Jawaban Benar: <span className="font-semibold text-foreground">{(content.acceptableAnswers).join(" / ")}</span>
                    </p>
                  )}

                  {/* Essay attachments */}
                  {q.type === "essay" && (
                    <p className="text-body-xs text-muted-foreground mt-3 pl-8">
                      Fitur: <span className="font-semibold text-foreground">{content.acceptsFile ? "Bisa Unggah Lampiran Coretan/PDF" : "Teks Esai Saja"}</span>
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {/* Delete Question Dialog */}
        <Dialog open={deleteQId !== null} onOpenChange={(open) => !open && setDeleteQId(null)}>
          <DialogContent className="max-w-md rounded-2xl border-border bg-card">
            <DialogHeader>
              <DialogTitle className="font-heading text-body-lg font-bold text-foreground">Hapus Pertanyaan?</DialogTitle>
              <DialogDescription className="text-body-sm text-muted-foreground">
                Apakah Anda yakin ingin menghapus pertanyaan ini? Ujian yang sedang dikerjakan siswa mungkin terganggu.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 mt-4">
              <Button variant="outline" onClick={() => setDeleteQId(null)} disabled={isPending} className="rounded-md border-border/80">
                Batal
              </Button>
              <Button onClick={handleDeleteQ} isLoading={isPending} className="bg-status-error hover:bg-status-error/90 text-white rounded-md font-semibold gap-1.5">
                Hapus Soal
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Question editor dialog */}
        <Dialog open={isQOpen} onOpenChange={setIsQOpen}>
          <DialogContent className="max-w-xl rounded-2xl border-border bg-card">
            <DialogHeader>
              <DialogTitle className="font-heading text-body-lg font-bold text-foreground">
                {editingQ ? "Edit Pertanyaan Tryout" : "Tambah Pertanyaan Baru"}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 my-2 font-sans overflow-y-auto max-h-[65vh] pr-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="que-type" className="text-body-sm font-semibold">Tipe Soal</Label>
                  <Select value={qType} onValueChange={(val: any) => {
                    setQType(val);
                    setQCorrectIndex(undefined);
                    setQCorrectIndices([]);
                  }}>
                    <SelectTrigger className="rounded-lg border-input bg-background">
                      <SelectValue placeholder="Pilih tipe" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      <SelectItem value="multiple_choice">Pilihan Ganda (Single Choice)</SelectItem>
                      <SelectItem value="multiple_choices">Pilihan Ganda (Multi Select)</SelectItem>
                      <SelectItem value="short_answer">Isian Singkat</SelectItem>
                      <SelectItem value="essay">Esai Mandiri</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="que-order" className="text-body-sm font-semibold">Nomor Urut Soal</Label>
                  <Input
                    id="que-order"
                    type="number"
                    value={qOrder}
                    onChange={(e) => setQOrder(e.target.value)}
                    className="rounded-lg border-input bg-background"
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="que-prompt" className="text-body-sm font-semibold">Pertanyaan</Label>
                <Textarea
                  id="que-prompt"
                  value={qPrompt}
                  onChange={(e) => setQPrompt(e.target.value)}
                  rows={4}
                  placeholder="Gunakan LaTeX jika terdapat notasi matematika..."
                  className="rounded-lg border-input bg-background"
                />
              </div>

              {/* RENDER EDIT MC OPTIONS */}
              {(qType === "multiple_choice" || qType === "multiple_choices") && (
                <div className="space-y-3">
                  <Label className="text-body-sm font-semibold block">Opsi Jawaban & Kunci</Label>
                  {qOptions.map((opt, i) => {
                    const checked = qType === "multiple_choice"
                      ? qCorrectIndex === i
                      : qCorrectIndices.includes(i);
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => qType === "multiple_choice" ? selectSingleCorrect(i) : toggleMultiCorrect(i)}
                          className={`flex size-6 shrink-0 items-center justify-center border transition-all ${
                            checked ? "bg-emerald-500 border-emerald-500 text-white rounded-lg" : "border-border hover:border-emerald-500 rounded-lg"
                          }`}
                        >
                          {checked ? <Check className="size-3.5" /> : <span>{String.fromCharCode(65 + i)}</span>}
                        </button>
                        <Input
                          value={opt}
                          onChange={(e) => {
                            const copy = [...qOptions];
                            copy[i] = e.target.value;
                            setQOptions(copy);
                          }}
                          placeholder={`Opsi ${String.fromCharCode(65 + i)}`}
                          className="rounded-lg border-input bg-background flex-1"
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* RENDER SHORT ANSWER OPTIONS */}
              {qType === "short_answer" && (
                <div className="grid gap-2">
                  <Label htmlFor="que-short" className="text-body-sm font-semibold">Jawaban Benar yang Diterima (Pisahkan Koma)</Label>
                  <Input
                    id="que-short"
                    value={qAcceptableAnswers}
                    onChange={(e) => setQAcceptableAnswers(e.target.value)}
                    placeholder="Contoh: 2, 2.0, dua"
                    className="rounded-lg border-input bg-background"
                  />
                </div>
              )}

              {/* RENDER ESSAY OPTIONS */}
              {qType === "essay" && (
                <div className="flex items-center gap-2 pt-2 select-none cursor-pointer">
                  <input
                    type="checkbox"
                    id="que-file"
                    checked={qAcceptsFile}
                    onChange={(e) => setQAcceptsFile(e.target.checked)}
                    className="size-4 rounded-sm border-border text-brand-primary focus:ring-brand-primary"
                  />
                  <Label htmlFor="que-file" className="text-body-sm font-semibold cursor-pointer">
                    Izinkan siswa mengunggah berkas coretan pendukung (PDF/Gambar)
                  </Label>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button variant="outline" onClick={() => setIsQOpen(false)} disabled={isPending} className="rounded-md border-border/80">
                Batal
              </Button>
              <Button onClick={handleSaveQ} isLoading={isPending} className="bg-brand-primary text-white hover:bg-brand-primary/90 rounded-md font-semibold gap-1.5">
                Simpan Soal
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Default Listing view
  return (
    <div className="space-y-6">
      {/* Header action */}
      <div className="flex justify-between items-center">
        <h2 className="text-body-lg font-semibold text-foreground">Daftar Tryout ({initialTryouts.length})</h2>
        <Button onClick={handleOpenAddT} className="bg-brand-primary text-white hover:bg-brand-primary/90 rounded-md font-semibold gap-2">
          <Plus className="size-4" />
          Tambah Tryout Baru
        </Button>
      </div>

      {initialTryouts.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border bg-card/50 rounded-2xl">
          <Trophy className="size-12 text-muted-foreground/50 mx-auto mb-3" />
          <h3 className="font-heading text-body-base font-bold text-foreground">Belum Ada Tryout</h3>
          <p className="text-body-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            Tryout adalah ujian formal yang dinilai secara manual oleh pengajar untuk bagian esainya.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {initialTryouts.map((t) => {
            const settings = typeof t.settings === "string" ? JSON.parse(t.settings) : t.settings;
            const qCount = initialQuestions.filter((q) => q.examId === t.id).length;
            
            return (
              <Card key={t.id} className="bg-card border-border shadow-sm rounded-2xl flex flex-col justify-between overflow-hidden">
                <CardHeader className="p-5 pb-3">
                  <div className="flex justify-between items-start gap-2">
                    <CardTitle className="font-heading text-body-base font-bold text-foreground line-clamp-1">{t.title}</CardTitle>
                    <Badge variant={t.status === "published" ? "default" : "secondary"} className={`text-[10px] rounded-md px-1.5 py-0.5 border ${
                      t.status === "published" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" :
                      t.status === "draft" ? "bg-amber-500/10 text-amber-600 border-amber-500/20" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {t.status}
                    </Badge>
                  </div>
                  <p className="text-body-xs text-muted-foreground mt-0.5 flex items-center gap-4">
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" />
                      {settings?.timeLimitMinutes || 90} menit
                    </span>
                    <span className="flex items-center gap-1">
                      <Layers className="size-3" />
                      {qCount} soal
                    </span>
                  </p>
                </CardHeader>

                <div className="px-5 py-3.5 bg-muted/20 border-t border-border flex justify-between gap-2">
                  <Button variant="outline" size="sm" onClick={() => setActiveExam(t)} className="rounded-md border-border/80 text-brand-primary hover:bg-brand-primary/5 hover:text-brand-primary">
                    Kelola Soal
                  </Button>
                  
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleOpenEditT(t)} className="rounded-md border-border/80 text-muted-foreground hover:text-foreground">
                      Edit
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setDeleteTId(t.id)} className="rounded-md border-border/80 text-status-error hover:bg-status-error/10 hover:text-status-error">
                      Hapus
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Tryout dialog */}
      <Dialog open={isTOpen} onOpenChange={setIsTOpen}>
        <DialogContent className="max-w-md rounded-2xl border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-lg font-bold text-foreground">
              {editingT ? "Edit Tryout" : "Buat Tryout Baru"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 my-2 font-sans">
            <div className="grid gap-2">
              <Label htmlFor="t-title" className="text-body-sm font-semibold">Judul Tryout</Label>
              <Input
                id="t-title"
                value={tTitle}
                onChange={(e) => setTTitle(e.target.value)}
                placeholder="Contoh: Tryout UTS - Fisika Dasar I"
                className="rounded-lg border-input bg-background"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="t-time" className="text-body-sm font-semibold">Waktu (Menit)</Label>
                <Input
                  id="t-time"
                  type="number"
                  value={tTimeLimit}
                  onChange={(e) => setTTimeLimit(e.target.value)}
                  placeholder="90"
                  className="rounded-lg border-input bg-background"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="t-attempts" className="text-body-sm font-semibold">Batas Percobaan</Label>
                <Input
                  id="t-attempts"
                  type="number"
                  value={tMaxAttempts}
                  onChange={(e) => setTMaxAttempts(e.target.value)}
                  placeholder="2"
                  className="rounded-lg border-input bg-background"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="t-status" className="text-body-sm font-semibold">Status Publikasi</Label>
              <Select value={tStatus} onValueChange={(val: any) => setTStatus(val)}>
                <SelectTrigger className="rounded-lg border-input bg-background">
                  <SelectValue placeholder="Pilih status" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="draft">Draft (Disembunyikan)</SelectItem>
                  <SelectItem value="published">Published (Dibuka)</SelectItem>
                  <SelectItem value="ended">Ended (Ditutup)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="t-open" className="text-body-sm font-semibold">Waktu Buka (Optional)</Label>
                <Input
                  id="t-open"
                  type="datetime-local"
                  value={tOpenAt}
                  onChange={(e) => setTOpenAt(e.target.value)}
                  className="rounded-lg border-input bg-background"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="t-close" className="text-body-sm font-semibold">Waktu Tutup (Optional)</Label>
                <Input
                  id="t-close"
                  type="datetime-local"
                  value={tCloseAt}
                  onChange={(e) => setTCloseAt(e.target.value)}
                  className="rounded-lg border-input bg-background"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsTOpen(false)} disabled={isPending} className="rounded-md border-border/80">
              Batal
            </Button>
            <Button onClick={handleSaveT} isLoading={isPending} className="bg-brand-primary text-white hover:bg-brand-primary/90 rounded-md font-semibold gap-1.5">
              Simpan Tryout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete tryout exam dialog */}
      <Dialog open={deleteTId !== null} onOpenChange={(open) => !open && setDeleteTId(null)}>
        <DialogContent className="max-w-md rounded-2xl border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-lg font-bold text-foreground">Hapus Tryout?</DialogTitle>
            <DialogDescription className="text-body-sm text-muted-foreground">
              Apakah Anda yakin ingin menghapus tryout ini? Seluruh soal di dalamnya dan riwayat pengumpulan siswa juga akan ikut terhapus.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteTId(null)} disabled={isPending} className="rounded-md border-border/80">
              Batal
            </Button>
            <Button onClick={handleDeleteT} isLoading={isPending} className="bg-status-error hover:bg-status-error/90 text-white rounded-md font-semibold gap-1.5">
              Hapus Permanen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
