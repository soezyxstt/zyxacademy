"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Plus, Edit2, Trash2, ClipboardList, HelpCircle, Loader2, Tag, Layers, Check, CheckSquare, Eye, Clock, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MathText } from "@/components/course/math-text";
import { toast } from "@/components/ui/toast";
import {
  deleteQuizTemplateAction,
  saveQuestionBankAction,
  deleteQuestionBankAction,
  getQuizTemplatePreviewAction,
} from "@/app/actions/tutor-management";

interface QuizTemplate {
  id: string;
  courseId: string;
  title: string;
  category: "daily" | "weekly" | "chapter" | "premium" | "simulation";
  visibility: "free" | "paid";
  status: "draft" | "published";
  timeLimitSeconds: number | null;
  maxAttempts: number | null;
  selectionRules: any; // { count: number, tags: string[], difficulty_proportions: { easy: number, medium: number, hard: number } }
  openAt?: Date | string | null;
  closeAt?: Date | string | null;
  manualStatus?: "open" | "closed" | "scheduled";
  showDiscussion?: boolean;
}

interface QuestionBankItem {
  id: string;
  courseId: string;
  prompt: string;
  options: any; // string[]
  correctIndices: any; // number[]
  acceptableAnswers?: any; // string[]
  difficulty: "easy" | "medium" | "hard";
  questionType: "multiple_choice" | "multiple_choices" | "short_answer" | "essay";
  explanation: string;
  tags: any; // string[]
}

interface Props {
  courseId: string;
  initialTemplates: QuizTemplate[];
  initialQuestionBank: QuestionBankItem[];
}

export function QuizzesClient({ courseId, initialTemplates, initialQuestionBank }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [deleteTplId, setDeleteTplId] = useState<string | null>(null);

  // Preview Dialog State
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewTpl, setPreviewTpl] = useState<QuizTemplate | null>(null);
  const [previewQuestions, setPreviewQuestions] = useState<any[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  async function handleOpenPreviewTpl(t: QuizTemplate) {
    setPreviewTpl(t);
    setIsPreviewOpen(true);
    setLoadingPreview(true);
    setPreviewQuestions([]);
    try {
      const res = await getQuizTemplatePreviewAction(courseId, t.id);
      if (res.success) {
        setPreviewQuestions(res.questions);
      } else {
        toast.error("Gagal memuat pratinjau kuis.");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Gagal memuat pratinjau kuis.";
      toast.error(message);
    } finally {
      setLoadingPreview(false);
    }
  }

  // Question Dialog State
  const [isQOpen, setIsQOpen] = useState(false);
  const [editingQ, setEditingQ] = useState<QuestionBankItem | null>(null);
  const [qPrompt, setQPrompt] = useState("");
  const [qType, setQType] = useState<"multiple_choice" | "multiple_choices" | "short_answer" | "essay">("multiple_choice");
  const [qDifficulty, setQDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [qOptions, setQOptions] = useState<string[]>(["", "", "", ""]);
  const [qCorrectIndices, setQCorrectIndices] = useState<number[]>([]);
  const [qAcceptableAnswers, setQAcceptableAnswers] = useState("");
  const [qExplanation, setQExplanation] = useState("");
  const [qTags, setQTags] = useState("");
  const [deleteQId, setDeleteQId] = useState<string | null>(null);

  async function handleDeleteTpl() {
    if (!deleteTplId) return;
    startTransition(async () => {
      try {
        const res = await deleteQuizTemplateAction(courseId, deleteTplId);
        if (res.success) {
          toast.success("Kuis berhasil dihapus.");
          setDeleteTplId(null);
          router.refresh();
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Gagal menghapus kuis.";
        toast.error(message);
      }
    });
  }

  async function handleTogglePublishStatus(templateId: string, currentStatus: "draft" | "published") {
    const newStatus = currentStatus === "published" ? "draft" : "published";
    try {
      const res = await fetch(`/api/quiz/templates/${templateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        throw new Error("Gagal mengubah status publish.");
      }

      toast.success(`Kuis diubah menjadi ${newStatus === "published" ? "Published" : "Draft"}`);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Gagal mengubah status kuis.");
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // QUESTION BANK HANDLERS
  // ───────────────────────────────────────────────────────────────────────────
  function handleOpenAddQ() {
    setEditingQ(null);
    setQPrompt("");
    setQType("multiple_choice");
    setQDifficulty("medium");
    setQOptions(["", "", "", ""]);
    setQCorrectIndices([]);
    setQAcceptableAnswers("");
    setQExplanation("");
    setQTags("");
    setIsQOpen(true);
  }

  function handleOpenEditQ(q: QuestionBankItem) {
    setEditingQ(q);
    setQPrompt(q.prompt);
    setQType(q.questionType);
    setQDifficulty(q.difficulty);
    
    const opts = typeof q.options === "string" ? JSON.parse(q.options) : q.options;
    setQOptions(Array.isArray(opts) ? opts : ["", "", "", ""]);
    
    const correct = typeof q.correctIndices === "string" ? JSON.parse(q.correctIndices) : q.correctIndices;
    setQCorrectIndices(Array.isArray(correct) ? correct : []);
    
    const accAnswers = typeof q.acceptableAnswers === "string" ? JSON.parse(q.acceptableAnswers) : q.acceptableAnswers;
    setQAcceptableAnswers(Array.isArray(accAnswers) ? accAnswers.join(", ") : "");

    setQExplanation(q.explanation || "");
    
    const tagsArr = typeof q.tags === "string" ? JSON.parse(q.tags) : q.tags;
    setQTags(Array.isArray(tagsArr) ? tagsArr.join(", ") : "");
    setIsQOpen(true);
  }

  function toggleCorrectIndex(idx: number) {
    if (qType === "multiple_choice") {
      setQCorrectIndices([idx]);
    } else {
      setQCorrectIndices((prev) =>
        prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx].sort()
      );
    }
  }

  async function handleSaveQ() {
    if (!qPrompt.trim()) {
      toast.error("Pertanyaan wajib diisi.");
      return;
    }

    if (qType === "multiple_choice" || qType === "multiple_choices") {
      if (qCorrectIndices.length === 0) {
        toast.error("Minimal satu pilihan benar wajib diisi.");
        return;
      }
      if (qOptions.some((o) => !o.trim())) {
        toast.error("Semua opsi jawaban A, B, C, D wajib diisi.");
        return;
      }
    } else if (qType === "short_answer") {
      if (!qAcceptableAnswers.trim()) {
        toast.error("Jawaban benar yang diterima wajib diisi.");
        return;
      }
    }

    const acceptableAnswers = qAcceptableAnswers.split(",").map((t) => t.trim()).filter(Boolean);

    startTransition(async () => {
      try {
        const res = await saveQuestionBankAction(courseId, editingQ?.id || null, {
          prompt: qPrompt,
          options: qType === "short_answer" || qType === "essay" ? [] : qOptions,
          correctIndices: qType === "short_answer" || qType === "essay" ? [] : qCorrectIndices,
          acceptableAnswers,
          difficulty: qDifficulty,
          questionType: qType,
          explanation: qExplanation,
          tags: qTags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
        });
        if (res.success) {
          toast.success(editingQ ? "Soal bank diperbarui!" : "Soal ditambahkan ke bank!");
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
        const res = await deleteQuestionBankAction(courseId, deleteQId);
        if (res.success) {
          toast.success("Soal berhasil dihapus dari bank.");
          setDeleteQId(null);
          router.refresh();
        }
      } catch (err: any) {
        toast.error(err.message || "Gagal menghapus soal.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="templates" className="w-full">
        <TabsList className="grid grid-cols-2 max-w-md bg-muted rounded-xl p-1 mb-6">
          <TabsTrigger value="templates" className="rounded-lg font-semibold py-2">
            <ClipboardList className="size-4 mr-2" />
            Kuis
          </TabsTrigger>
          <TabsTrigger value="questionbank" className="rounded-lg font-semibold py-2">
            <HelpCircle className="size-4 mr-2" />
            Bank Soal ({initialQuestionBank.length})
          </TabsTrigger>
        </TabsList>

        {/* =====================================================================
            TAB 1: QUIZ
            ===================================================================== */}
        <TabsContent value="templates" className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="font-heading text-body-base font-semibold text-foreground">Daftar Kuis ({initialTemplates.length})</h2>
            <Button asChild className="bg-brand-primary text-white hover:bg-brand-primary/90 rounded-md font-semibold gap-2">
              <Link href={`/admin/quizzes/new?courseId=${encodeURIComponent(courseId)}`}>
                <Plus className="size-4" />
                Buat Kuis Baru
              </Link>
            </Button>
          </div>

          {initialTemplates.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-border bg-card/50 rounded-2xl">
              <ClipboardList className="size-12 text-muted-foreground/50 mx-auto mb-3" />
              <h3 className="font-heading text-body-base font-bold text-foreground">Belum Ada Kuis</h3>
              <p className="text-body-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                Buat kuis untuk menguji pemahaman siswa. Anda dapat menentukan aturan pemilihan soal dari bank soal secara otomatis.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {initialTemplates.map((t) => {
                const rules = typeof t.selectionRules === "string" ? JSON.parse(t.selectionRules) : t.selectionRules;
                return (
                  <Card key={t.id} className="bg-card border-border shadow-sm rounded-2xl flex flex-col justify-between overflow-hidden">
                    <CardHeader className="p-5 pb-3">
                      <div className="flex justify-between items-start gap-2">
                        <CardTitle className="font-heading text-body-base font-bold text-foreground line-clamp-1">{t.title}</CardTitle>
                        <div className="flex gap-1.5 flex-wrap items-center">
                          <Badge variant="secondary" className="capitalize text-[10px] rounded-md px-2 py-0.5">
                            {t.category}
                          </Badge>
                          <button
                            onClick={() => handleTogglePublishStatus(t.id, t.status)}
                            className={cn(
                              "capitalize text-[10px] rounded-md px-2 py-0.5 font-semibold border cursor-pointer transition-colors",
                              t.status === "published"
                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                                : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/20"
                            )}
                          >
                            {t.status === "published" ? "Published" : "Draft"}
                          </button>
                        </div>
                      </div>
                      <p className="text-body-xs text-muted-foreground mt-0.5">
                        Batas percobaan: {t.maxAttempts ? `${t.maxAttempts}x` : "Tak terbatas"} · Durasi: {t.timeLimitSeconds ? `${t.timeLimitSeconds / 60} menit` : "Bebas"}
                      </p>
                    </CardHeader>
                    <CardContent className="px-5 pb-4 flex-1 space-y-2">
                      <div className="flex flex-wrap gap-1">
                        <span className="text-body-xs font-semibold text-muted-foreground mr-1.5 flex items-center gap-1">
                          <Layers className="size-3" />
                          {rules?.count || 5} soal {rules?.fixedQuestionIds && rules.fixedQuestionIds.length > 0 && "(Soal Spesifik)"}
                        </span>
                        {rules?.fixedQuestionIds && rules.fixedQuestionIds.length > 0 ? (
                          <Badge variant="outline" className="text-[10px] text-brand-primary border-brand-primary/30 rounded-md">
                            Tipe: Fixed
                          </Badge>
                        ) : (
                          rules?.tags?.map((tag: string) => (
                            <Badge key={tag} variant="outline" className="text-[10px] text-muted-foreground rounded-md flex items-center gap-1">
                              <Tag className="size-2.5" />
                              {tag}
                            </Badge>
                          ))
                        )}
                      </div>

                      {/* Schedule & Manual Status Section */}
                      <div className="mt-3 pt-3 border-t border-border/40 space-y-1.5 text-body-xs text-muted-foreground">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-muted-foreground flex items-center gap-1">
                            <Clock className="size-3" />
                            Akses Kuis:
                          </span>
                          <span className={cn(
                            "inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                            t.manualStatus === "open"
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                              : t.manualStatus === "closed"
                              ? "bg-destructive/10 text-destructive border-destructive/20"
                              : "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"
                          )}>
                            {t.manualStatus === "open" ? "Buka Manual" : t.manualStatus === "closed" ? "Tutup Manual" : "Ikuti Jadwal"}
                          </span>
                        </div>

                        {t.manualStatus === "scheduled" && (t.openAt || t.closeAt) && (
                          <div className="text-[10px] bg-muted/40 p-2 rounded-md border border-border/40 space-y-1 mt-1 text-foreground/80">
                            {t.openAt && (
                              <div className="flex justify-between">
                                <span>Buka:</span>
                                <span className="font-semibold">{new Date(t.openAt).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}</span>
                              </div>
                            )}
                            {t.closeAt && (
                              <div className="flex justify-between">
                                <span>Tutup:</span>
                                <span className="font-semibold">{new Date(t.closeAt).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {rules?.fixedQuestionIds && rules.fixedQuestionIds.length > 0 && (
                        <div className="mt-2.5 text-left border-t border-border/40 pt-2.5">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                            Daftar Soal Terpilih:
                          </span>
                          <ol className="list-decimal pl-4 space-y-1 text-body-xs text-foreground/80 leading-normal max-h-24 overflow-y-auto pr-1">
                            {rules.fixedQuestionIds.map((qId: string) => {
                              const question = initialQuestionBank.find((q) => q.id === qId);
                              return (
                                <li key={qId} className="truncate" title={question?.prompt || "Soal tidak ditemukan"}>
                                  {question?.prompt || <span className="italic text-muted-foreground">Soal telah dihapus dari bank</span>}
                                </li>
                              );
                            })}
                          </ol>
                        </div>
                      )}
                    </CardContent>
                    <div className="px-5 py-3.5 bg-muted/20 border-t border-border flex flex-wrap justify-end gap-2">
                      <Link href={`/tutor/${courseId}/quizzes/${t.id}/attempts`}>
                        <Button variant="outline" size="sm" className="rounded-md border-border/80 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-600 gap-1">
                          <FileSpreadsheet className="size-3.5" />
                          Sheet Attempt
                        </Button>
                      </Link>
                      <Button variant="outline" size="sm" onClick={() => handleOpenPreviewTpl(t)} className="rounded-md border-border/80 text-brand-primary hover:bg-brand-primary/10 hover:text-brand-primary gap-1">
                        <Eye className="size-3.5" />
                        Preview
                      </Button>
                      <Button asChild variant="outline" size="sm" className="rounded-md border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted gap-1">
                        <Link href={`/admin/quizzes/${t.id}/edit`}>
                          <Edit2 className="size-3.5" />
                          Edit
                        </Link>
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setDeleteTplId(t.id)} className="rounded-md border-border/80 text-status-error hover:bg-status-error/10 hover:text-status-error gap-1">
                        <Trash2 className="size-3.5" />
                        Hapus
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* =====================================================================
            TAB 2: QUESTION BANK
            ===================================================================== */}
        <TabsContent value="questionbank" className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="font-heading text-body-base font-semibold text-foreground">Kumpulan Bank Soal ({initialQuestionBank.length})</h2>
            <Button onClick={handleOpenAddQ} className="bg-brand-primary text-white hover:bg-brand-primary/90 rounded-md font-semibold gap-2">
              <Plus className="size-4" />
              Tambah Soal Baru
            </Button>
          </div>

          {initialQuestionBank.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-border bg-card/50 rounded-2xl">
              <HelpCircle className="size-12 text-muted-foreground/50 mx-auto mb-3" />
              <h3 className="font-heading text-body-base font-bold text-foreground">Bank Soal Kosong</h3>
              <p className="text-body-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                Tambahkan soal ke bank soal agar kuis template dapat mengacak dan menarik soal untuk siswa secara dinamis.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {initialQuestionBank.map((q, idx) => {
                const tagsArr = typeof q.tags === "string" ? JSON.parse(q.tags) : q.tags;
                const opts = typeof q.options === "string" ? JSON.parse(q.options) : q.options;
                const correct = typeof q.correctIndices === "string" ? JSON.parse(q.correctIndices) : q.correctIndices;

                return (
                  <Card key={q.id} className="bg-card border-border shadow-xs rounded-xl p-5 relative">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-body-xs font-bold text-muted-foreground">Soal #{initialQuestionBank.length - idx}</span>
                          <Badge className={`text-[10px] rounded-md px-1.5 py-0.5 border ${
                            q.difficulty === "easy" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" :
                            q.difficulty === "medium" ? "bg-amber-500/10 text-amber-600 border-amber-500/20" :
                            "bg-rose-500/10 text-rose-600 border-rose-500/20"
                          }`}>
                            {q.difficulty}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] rounded-md text-muted-foreground">
                            {q.questionType === "short_answer" ? "Isian Singkat" :
                             q.questionType === "essay" ? "Essay" :
                             q.questionType === "multiple_choices" ? "Multi Select" : "Single Choice"}
                          </Badge>
                        </div>
                        <MathText className="text-body-base font-medium text-foreground leading-relaxed pt-1" as="p">{q.prompt}</MathText>
                      </div>
                      
                      <div className="flex gap-1.5">
                        <Button variant="ghost" size="xs" onClick={() => handleOpenEditQ(q)} className="rounded-md text-muted-foreground hover:text-foreground">
                          <Edit2 className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="xs" onClick={() => setDeleteQId(q.id)} className="rounded-md text-status-error hover:bg-status-error/10 hover:text-status-error">
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Options list / Acceptable answers preview */}
                    {(q.questionType === "multiple_choice" || q.questionType === "multiple_choices" || (!q.questionType && Array.isArray(opts) && opts.length > 0)) && (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 pl-2">
                        {Array.isArray(opts) && opts.map((opt, i) => {
                          const isCorrect = Array.isArray(correct) && correct.includes(i);
                          return (
                            <div key={i} className={`flex items-center gap-2 text-body-xs px-3 py-1.5 rounded-lg border ${
                              isCorrect ? "bg-emerald-500/5 border-emerald-500/25 text-emerald-700" : "bg-muted/10 border-border/50 text-muted-foreground"
                            }`}>
                              <span className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                                isCorrect ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"
                              }`}>
                                {String.fromCharCode(65 + i)}
                              </span>
                              <span className="truncate">
                                <MathText className="leading-normal" as="span">{opt}</MathText>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {q.questionType === "short_answer" && (
                      <div className="mt-3 pl-2">
                        <span className="text-body-xs font-semibold text-muted-foreground block mb-1">Jawaban Benar Diterima:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {(Array.isArray(q.acceptableAnswers)
                            ? q.acceptableAnswers
                            : typeof q.acceptableAnswers === "string"
                            ? JSON.parse(q.acceptableAnswers)
                            : []).map((ans: string, i: number) => (
                            <span key={i} className="text-body-xs font-mono font-semibold bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                              {ans}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Tags */}
                    {Array.isArray(tagsArr) && tagsArr.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-border/40 flex flex-wrap gap-1">
                        {tagsArr.map((t: string) => (
                          <Badge key={t} variant="outline" className="text-[10px] text-muted-foreground rounded-md">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* =====================================================================
          QUESTION DIALOG
          ===================================================================== */}
      <Dialog open={isQOpen} onOpenChange={setIsQOpen}>
        <DialogContent className="max-w-2xl rounded-2xl border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-bold text-foreground">
              {editingQ ? "Edit Soal Bank" : "Tambah Soal Baru ke Bank"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 my-2 font-sans overflow-y-auto max-h-[70vh] pr-1">
            <div className="grid gap-2">
              <Label htmlFor="q-prompt" className="text-body-sm font-semibold">Pertanyaan / Soal</Label>
              <Textarea
                id="q-prompt"
                value={qPrompt}
                onChange={(e) => setQPrompt(e.target.value)}
                rows={4}
                placeholder="Gunakan LaTeX untuk rumus matematika, misal: Berapakah hasil dari $\lim_{x \to 0} \frac{\sin x}{x}$?"
                className="rounded-lg border-input bg-background"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="q-type" className="text-body-sm font-semibold">Tipe Soal</Label>
                <Select value={qType} onValueChange={(val: any) => {
                  setQType(val);
                  setQCorrectIndices([]);
                }}>
                  <SelectTrigger className="rounded-lg border-input bg-background">
                    <SelectValue placeholder="Pilih tipe" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="multiple_choice">Pilihan Ganda Tunggal</SelectItem>
                    <SelectItem value="multiple_choices">Pilihan Ganda Kompleks</SelectItem>
                    <SelectItem value="short_answer">Isian Singkat</SelectItem>
                    <SelectItem value="essay">Essay / Uraian</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="q-diff" className="text-body-sm font-semibold">Tingkat Kesulitan</Label>
                <Select value={qDifficulty} onValueChange={(val: any) => setQDifficulty(val)}>
                  <SelectTrigger className="rounded-lg border-input bg-background">
                    <SelectValue placeholder="Pilih tingkat" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="easy">Easy (Mudah)</SelectItem>
                    <SelectItem value="medium">Medium (Sedang)</SelectItem>
                    <SelectItem value="hard">Hard (Sulit)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Options Input Block for Multiple Choice */}
            {(qType === "multiple_choice" || qType === "multiple_choices") && (
              <div className="space-y-3">
                <Label className="text-body-sm font-semibold block">Opsi Jawaban & Kunci Jawaban</Label>
                <span className="text-[10px] text-muted-foreground block -mt-2">
                  Pilih/checklist tombol bulat/kotak di sebelah kiri sebagai kunci jawaban yang benar.
                </span>
                
                {qOptions.map((opt, i) => {
                  const checked = qCorrectIndices.includes(i);
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => toggleCorrectIndex(i)}
                        className={`flex size-6 shrink-0 items-center justify-center border transition-all ${
                          checked ? "bg-emerald-500 border-emerald-500 text-white rounded-lg shadow-sm" : "border-border text-muted-foreground hover:border-emerald-500 rounded-lg"
                        }`}
                      >
                        {qType === "multiple_choice" ? (
                          checked ? <Check className="size-3.5" /> : <span>{String.fromCharCode(65 + i)}</span>
                        ) : (
                          checked ? <CheckSquare className="size-3.5" /> : <span>{String.fromCharCode(65 + i)}</span>
                        )}
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

            {/* Input Block for Short Answer */}
            {qType === "short_answer" && (
              <div className="space-y-2 rounded-xl border border-border bg-muted/5 p-4">
                <Label htmlFor="q-short-ans" className="text-body-sm font-semibold">Jawaban Benar yang Diterima (Pisahkan dengan koma)</Label>
                <Input
                  id="q-short-ans"
                  value={qAcceptableAnswers}
                  onChange={(e) => setQAcceptableAnswers(e.target.value)}
                  placeholder="Contoh: 12, duabelas, 12.0"
                  className="rounded-lg border-input bg-background"
                />
                <p className="text-body-xs text-muted-foreground">Siswa dianggap benar jika jawaban teks mereka cocok dengan salah satu kata kunci di atas.</p>
              </div>
            )}

            {/* Input Block for Essay */}
            {qType === "essay" && (
              <div className="p-4 rounded-xl border border-border bg-muted/5 text-body-xs text-muted-foreground space-y-1">
                <p className="font-semibold text-foreground">Soal Tipe Essay / Uraian</p>
                <p>Siswa akan mengetikkan jawaban teks uraian bebas. Tuliskan rubrik penilaian atau kunci jawaban referensi pada kolom Pembahasan di bawah.</p>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="q-explanation" className="text-body-sm font-semibold">Pembahasan / Penjelasan (Optional)</Label>
              <Textarea
                id="q-explanation"
                value={qExplanation}
                onChange={(e) => setQExplanation(e.target.value)}
                rows={3}
                placeholder="Penjelasan pengerjaan untuk ditampilkan saat siswa me-review kuis..."
                className="rounded-lg border-input bg-background text-body-sm"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="q-tags" className="text-body-sm font-semibold">Tag Soal (Pisahkan Koma)</Label>
              <Input
                id="q-tags"
                value={qTags}
                onChange={(e) => setQTags(e.target.value)}
                placeholder="Contoh: limit, aljabar, kalkulus"
                className="rounded-lg border-input bg-background"
              />
            </div>
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

      {/* DELETE COFNIRMATIONS */}
      <Dialog open={deleteTplId !== null} onOpenChange={(open) => !open && setDeleteTplId(null)}>
        <DialogContent className="max-w-md rounded-2xl border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-bold text-foreground">Hapus Kuis?</DialogTitle>
            <DialogDescription className="text-body-xs text-muted-foreground">
              Apakah Anda yakin ingin menghapus template kuis ini? Percobaan pengerjaan siswa yang terkait juga dapat terpengaruh.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteTplId(null)} disabled={isPending} className="rounded-md border-border/80">
              Batal
            </Button>
            <Button onClick={handleDeleteTpl} isLoading={isPending} className="bg-status-error hover:bg-status-error/90 text-white rounded-md font-semibold gap-1.5">
              Hapus Kuis
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteQId !== null} onOpenChange={(open) => !open && setDeleteQId(null)}>
        <DialogContent className="max-w-md rounded-2xl border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-bold text-foreground">Hapus Soal?</DialogTitle>
            <DialogDescription className="text-body-xs text-muted-foreground">
              Apakah Anda yakin ingin menghapus soal ini dari bank soal? Soal tidak akan terpilih lagi untuk kuis baru.
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

      {/* PREVIEW QUIZ DIALOG */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
          <DialogHeader className="p-6 pb-4 border-b border-border shrink-0">
            <DialogTitle className="font-heading text-body-base font-bold text-foreground">
              Pratinjau Kuis: {previewTpl?.title}
            </DialogTitle>
            <DialogDescription className="text-left text-body-xs text-muted-foreground flex gap-3 flex-wrap items-center mt-1">
              <span className="bg-muted px-2 py-0.5 rounded-md border border-border">Kategori: {previewTpl?.category}</span>
              <span className="bg-muted px-2 py-0.5 rounded-md border border-border">Batas Waktu: {previewTpl?.timeLimitSeconds ? `${previewTpl.timeLimitSeconds / 60} menit` : "Bebas"}</span>
              <span className="bg-muted px-2 py-0.5 rounded-md border border-border">Percobaan: {previewTpl?.maxAttempts ? `${previewTpl.maxAttempts}x` : "Bebas"}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-6 text-left">
            {loadingPreview ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3">
                <Loader2 className="size-8 animate-spin text-brand-primary" />
                <p className="text-body-sm text-muted-foreground">Memilih dan meresolusi soal dari bank...</p>
              </div>
            ) : previewQuestions.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-body-sm">
                Tidak ada soal yang tersedia untuk aturan seleksi kuis ini.
              </div>
            ) : (
              <div className="space-y-6">
                {previewQuestions.map((q, idx) => (
                  <div key={q.id} className="p-5 rounded-xl border border-border bg-card space-y-4">
                    <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2">
                      <span className="text-body-sm font-bold text-foreground">Soal {idx + 1}</span>
                      <div className="flex items-center gap-2">
                        <span className="capitalize text-[10px] bg-muted/80 text-muted-foreground px-2 py-0.5 rounded border border-border font-medium">
                          {q.difficulty}
                        </span>
                        <span className="capitalize text-[10px] bg-muted/80 text-muted-foreground px-2 py-0.5 rounded border border-border font-medium">
                          {q.questionType === "multiple_choice" ? "Single Choice" : "Multi Choice"}
                        </span>
                      </div>
                    </div>

                    <MathText className="text-body-sm font-semibold text-foreground whitespace-pre-wrap leading-relaxed" as="p">
                      {q.prompt}
                    </MathText>

                    <div className="grid gap-2">
                      {q.options.map((opt: string, optIdx: number) => {
                        const isCorrect = q.correctIndices.includes(optIdx);
                        return (
                          <div
                            key={optIdx}
                            className={cn(
                              "flex items-center gap-3 p-3 rounded-lg border text-body-sm transition-colors",
                              isCorrect
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300 font-medium"
                                : "bg-background/50 border-border text-foreground/80"
                            )}
                          >
                            <span
                              className={cn(
                                "flex size-6 items-center justify-center rounded border text-body-xs font-bold shrink-0",
                                isCorrect
                                  ? "bg-emerald-500 border-emerald-600 text-white shadow-xs"
                                  : "bg-muted border-border text-muted-foreground"
                              )}
                            >
                              {String.fromCharCode(65 + optIdx)}
                            </span>
                            <MathText className="leading-normal" as="span">{opt}</MathText>
                            {isCorrect && <Check className="size-4 text-emerald-600 dark:text-emerald-400 ml-auto shrink-0" />}
                          </div>
                        );
                      })}
                    </div>

                    {q.explanation && (
                      <div className="bg-brand-primary/5 border border-brand-primary/10 rounded-lg p-3.5 space-y-1.5 text-body-sm">
                        <span className="font-bold text-brand-primary block text-body-xs uppercase tracking-wider">
                          Pembahasan Jawaban:
                        </span>
                        <MathText className="text-muted-foreground leading-relaxed whitespace-pre-wrap" as="p">
                          {q.explanation}
                        </MathText>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="p-4 border-t border-border bg-muted/10 shrink-0">
            <Button onClick={() => setIsPreviewOpen(false)} className="rounded-md bg-brand-primary text-white hover:bg-brand-primary/90">
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
