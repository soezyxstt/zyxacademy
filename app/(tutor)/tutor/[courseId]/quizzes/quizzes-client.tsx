"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Edit2, Trash2, ClipboardList, HelpCircle, Loader2, Tag, Layers, Check, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import {
  saveQuizTemplateAction,
  deleteQuizTemplateAction,
  saveQuestionBankAction,
  deleteQuestionBankAction,
} from "@/app/actions/tutor-management";

interface QuizTemplate {
  id: string;
  courseId: string;
  title: string;
  category: "daily" | "weekly" | "chapter" | "premium";
  visibility: "free" | "paid";
  timeLimitSeconds: number | null;
  maxAttempts: number | null;
  selectionRules: any; // { count: number, tags: string[], difficulty_proportions: { easy: number, medium: number, hard: number } }
}

interface QuestionBankItem {
  id: string;
  courseId: string;
  prompt: string;
  options: any; // string[]
  correctIndices: any; // number[]
  difficulty: "easy" | "medium" | "hard";
  questionType: "multiple_choice" | "multiple_choices";
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

  // Template Dialog State
  const [isTplOpen, setIsTplOpen] = useState(false);
  const [editingTpl, setEditingTpl] = useState<QuizTemplate | null>(null);
  const [tplTitle, setTplTitle] = useState("");
  const [tplCategory, setTplCategory] = useState<"daily" | "weekly" | "chapter" | "premium">("weekly");
  const [tplVisibility, setTplVisibility] = useState<"free" | "paid">("free");
  const [tplTimeLimit, setTplTimeLimit] = useState("20"); // in minutes
  const [tplMaxAttempts, setTplMaxAttempts] = useState("3");
  const [tplCount, setTplCount] = useState("5");
  const [tplTags, setTplTags] = useState("");
  const [deleteTplId, setDeleteTplId] = useState<string | null>(null);
  const [selectedQIds, setSelectedQIds] = useState<string[]>([]);

  // Question Dialog State
  const [isQOpen, setIsQOpen] = useState(false);
  const [editingQ, setEditingQ] = useState<QuestionBankItem | null>(null);
  const [qPrompt, setQPrompt] = useState("");
  const [qType, setQType] = useState<"multiple_choice" | "multiple_choices">("multiple_choice");
  const [qDifficulty, setQDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [qOptions, setQOptions] = useState<string[]>(["", "", "", ""]);
  const [qCorrectIndices, setQCorrectIndices] = useState<number[]>([]);
  const [qExplanation, setQExplanation] = useState("");
  const [qTags, setQTags] = useState("");
  const [deleteQId, setDeleteQId] = useState<string | null>(null);

  // ───────────────────────────────────────────────────────────────────────────
  // QUIZ TEMPLATE HANDLERS
  // ───────────────────────────────────────────────────────────────────────────
  function handleOpenAddTpl() {
    setEditingTpl(null);
    setTplTitle("");
    setTplCategory("weekly");
    setTplVisibility("free");
    setTplTimeLimit("20");
    setTplMaxAttempts("3");
    setTplCount("5");
    setTplTags("");
    setSelectedQIds([]);
    setIsTplOpen(true);
  }

  function handleOpenEditTpl(t: QuizTemplate) {
    setEditingTpl(t);
    setTplTitle(t.title);
    setTplCategory(t.category);
    setTplVisibility(t.visibility);
    setTplTimeLimit(t.timeLimitSeconds ? (t.timeLimitSeconds / 60).toString() : "");
    setTplMaxAttempts(t.maxAttempts ? t.maxAttempts.toString() : "");
    
    const rules = typeof t.selectionRules === "string" ? JSON.parse(t.selectionRules) : t.selectionRules;
    setTplCount((rules?.count || 5).toString());
    setTplTags((rules?.tags || []).join(", "));
    setSelectedQIds(rules?.fixedQuestionIds || []);
    setIsTplOpen(true);
  }

  async function handleSaveTpl() {
    if (!tplTitle.trim()) {
      toast.error("Judul kuis wajib diisi.");
      return;
    }

    const countNum = selectedQIds.length > 0 ? selectedQIds.length : (parseInt(tplCount, 10) || 5);
    const rules: any = {
      count: countNum,
      tags: selectedQIds.length > 0 ? [] : tplTags.split(",").map((t) => t.trim()).filter(Boolean),
    };

    if (selectedQIds.length > 0) {
      rules.fixedQuestionIds = selectedQIds;
    } else {
      rules.difficulty_proportions = {
        easy: Math.ceil(countNum * 0.4),
        medium: Math.ceil(countNum * 0.4),
        hard: Math.floor(countNum * 0.2),
      };
    }

    startTransition(async () => {
      try {
        const res = await saveQuizTemplateAction(courseId, editingTpl?.id || null, {
          title: tplTitle,
          category: tplCategory,
          visibility: tplVisibility,
          timeLimitSeconds: tplTimeLimit ? parseInt(tplTimeLimit, 10) * 60 : null,
          maxAttempts: tplMaxAttempts ? parseInt(tplMaxAttempts, 10) : null,
          selectionRules: rules,
        });
        if (res.success) {
          toast.success(editingTpl ? "Template kuis diperbarui!" : "Template kuis ditambahkan!");
          setIsTplOpen(false);
          router.refresh();
        }
      } catch (err: any) {
        toast.error(err.message || "Gagal menyimpan kuis.");
      }
    });
  }

  async function handleDeleteTpl() {
    if (!deleteTplId) return;
    startTransition(async () => {
      try {
        const res = await deleteQuizTemplateAction(courseId, deleteTplId);
        if (res.success) {
          toast.success("Template kuis dihapus.");
          setDeleteTplId(null);
          router.refresh();
        }
      } catch (err: any) {
        toast.error(err.message || "Gagal menghapus kuis.");
      }
    });
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
    if (!qPrompt.trim() || qCorrectIndices.length === 0) {
      toast.error("Pertanyaan dan minimal satu pilihan benar wajib diisi.");
      return;
    }

    if (qOptions.some((o) => !o.trim())) {
      toast.error("Semua opsi jawaban A, B, C, D wajib diisi.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await saveQuestionBankAction(courseId, editingQ?.id || null, {
          prompt: qPrompt,
          options: qOptions,
          correctIndices: qCorrectIndices,
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
            Template Kuis
          </TabsTrigger>
          <TabsTrigger value="questionbank" className="rounded-lg font-semibold py-2">
            <HelpCircle className="size-4 mr-2" />
            Bank Soal ({initialQuestionBank.length})
          </TabsTrigger>
        </TabsList>

        {/* =====================================================================
            TAB 1: QUIZ TEMPLATES
            ===================================================================== */}
        <TabsContent value="templates" className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-body-lg font-semibold text-foreground">Daftar Kuis ({initialTemplates.length})</h2>
            <Button onClick={handleOpenAddTpl} className="bg-brand-primary text-white hover:bg-brand-primary/90 rounded-md font-semibold gap-2">
              <Plus className="size-4" />
              Buat Kuis Baru
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
                        <Badge variant="secondary" className="capitalize text-[10px] rounded-md px-2 py-0.5">
                          {t.category}
                        </Badge>
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

                      {rules?.fixedQuestionIds && rules.fixedQuestionIds.length > 0 && (
                        <div className="mt-2.5 text-left border-t border-border/40 pt-2.5">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                            Daftar Soal Terpilih:
                          </span>
                          <ol className="list-decimal pl-4 space-y-1 text-[11px] text-foreground/80 leading-normal max-h-24 overflow-y-auto pr-1">
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
                    <div className="px-5 py-3.5 bg-muted/20 border-t border-border flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleOpenEditTpl(t)} className="rounded-md border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted gap-1">
                        <Edit2 className="size-3.5" />
                        Edit
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
            <h2 className="text-body-lg font-semibold text-foreground">Kumpulan Bank Soal ({initialQuestionBank.length})</h2>
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
                            {q.questionType === "multiple_choice" ? "Single Choice" : "Multi Select"}
                          </Badge>
                        </div>
                        <p className="text-body-base font-medium text-foreground leading-relaxed pt-1">{q.prompt}</p>
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

                    {/* Options list preview */}
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
                            <span className="truncate">{opt}</span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Tags */}
                    {Array.isArray(tagsArr) && tagsArr.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-border/40 flex flex-wrap gap-1">
                        {tagsArr.map((t: string) => (
                          <Badge key={t} variant="outline" className="text-[9px] text-muted-foreground rounded-md">
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
          TEMPLATE DIALOG
          ===================================================================== */}
      <Dialog open={isTplOpen} onOpenChange={setIsTplOpen}>
        <DialogContent className="max-w-xl rounded-2xl border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-lg font-bold text-foreground">
              {editingTpl ? "Edit Template Kuis" : "Buat Template Kuis Baru"}
            </DialogTitle>
            <DialogDescription className="text-body-sm text-muted-foreground">
              Tentukan parameter kuis. Soal akan otomatis ditarik dari bank soal berdasarkan filter tag.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 my-3 font-sans">
            <div className="grid gap-2">
              <Label htmlFor="tpl-title" className="text-body-sm font-semibold">Judul Kuis</Label>
              <Input
                id="tpl-title"
                value={tplTitle}
                onChange={(e) => setTplTitle(e.target.value)}
                placeholder="Contoh: Kuis Mingguan 1 - Turunan Dasar"
                className="rounded-lg border-input bg-background"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="tpl-category" className="text-body-sm font-semibold">Kategori Kuis</Label>
                <Select value={tplCategory} onValueChange={(val: any) => setTplCategory(val)}>
                  <SelectTrigger className="rounded-lg border-input bg-background">
                    <SelectValue placeholder="Pilih kategori" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="daily">Daily Quiz</SelectItem>
                    <SelectItem value="weekly">Weekly Quiz</SelectItem>
                    <SelectItem value="chapter">Chapter Evaluation</SelectItem>
                    <SelectItem value="premium">Premium Test</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="tpl-visibility" className="text-body-sm font-semibold">Aksesibilitas</Label>
                <Select value={tplVisibility} onValueChange={(val: any) => setTplVisibility(val)}>
                  <SelectTrigger className="rounded-lg border-input bg-background">
                    <SelectValue placeholder="Pilih akses" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="free">Gratis (Bisa dikerjakan guest)</SelectItem>
                    <SelectItem value="paid">Premium (Butuh Token Kelas)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="tpl-time" className="text-body-sm font-semibold">Batas Waktu (Menit)</Label>
                <Input
                  id="tpl-time"
                  type="number"
                  value={tplTimeLimit}
                  onChange={(e) => setTplTimeLimit(e.target.value)}
                  placeholder="20"
                  className="rounded-lg border-input bg-background"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="tpl-attempts" className="text-body-sm font-semibold">Maks. Percobaan</Label>
                <Input
                  id="tpl-attempts"
                  type="number"
                  value={tplMaxAttempts}
                  onChange={(e) => setTplMaxAttempts(e.target.value)}
                  placeholder="3"
                  className="rounded-lg border-input bg-background"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="tpl-count" className="text-body-sm font-semibold">Jumlah Soal</Label>
                <Input
                  id="tpl-count"
                  type="number"
                  disabled={selectedQIds.length > 0}
                  value={selectedQIds.length > 0 ? selectedQIds.length.toString() : tplCount}
                  onChange={(e) => setTplCount(e.target.value)}
                  placeholder="5"
                  className="rounded-lg border-input bg-background"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="tpl-tags" className="text-body-sm font-semibold">Filter Tag Soal (Pisahkan Koma)</Label>
              <Input
                id="tpl-tags"
                disabled={selectedQIds.length > 0}
                value={selectedQIds.length > 0 ? "" : tplTags}
                onChange={(e) => setTplTags(e.target.value)}
                placeholder={selectedQIds.length > 0 ? "Diabaikan karena memilih soal spesifik" : "Contoh: limit, turunan, aljabar"}
                className="rounded-lg border-input bg-background"
              />
              <span className="text-[10px] text-muted-foreground leading-normal">
                {selectedQIds.length > 0 ? "Filter tag dinonaktifkan karena Anda memilih soal secara spesifik." : "Kosongkan jika ingin menarik soal secara acak tanpa memandang tag."}
              </span>
            </div>

            <div className="border border-border/85 rounded-xl p-3.5 bg-muted/15 space-y-2 text-left">
              <Label className="text-body-sm font-semibold flex items-center gap-1.5 text-foreground">
                <CheckSquare className="size-4 text-brand-primary shrink-0" />
                Pilih Soal Secara Spesifik ({selectedQIds.length} terpilih)
              </Label>
              <div className="text-[11px] text-muted-foreground mb-2">
                Opsional. Jika dipilih, kuis ini akan selalu berisi soal-soal ini secara tetap (mengabaikan filter tag & proporsi kesulitan).
              </div>
              <div className="max-h-48 overflow-y-auto space-y-2 divide-y divide-border/45 pr-1 border border-border/45 rounded-lg bg-background p-2">
                {initialQuestionBank.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-2 text-center">
                    Belum ada soal di Bank Soal kelas ini.
                  </div>
                ) : (
                  initialQuestionBank.map((q) => {
                    const isChecked = selectedQIds.includes(q.id);
                    return (
                      <label
                        key={q.id}
                        className="flex items-start gap-2.5 py-2 cursor-pointer hover:bg-muted/30 px-1.5 rounded transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedQIds((prev) => [...prev, q.id]);
                            } else {
                              setSelectedQIds((prev) => prev.filter((id) => id !== q.id));
                            }
                          }}
                          className="mt-1 cursor-pointer shrink-0"
                        />
                        <div className="flex-1 text-left min-w-0">
                          <div className="text-xs font-semibold text-foreground line-clamp-2">
                            {q.prompt}
                          </div>
                          <div className="flex gap-1.5 items-center mt-1.5 text-[10px] text-muted-foreground">
                            <span className="uppercase font-mono font-bold bg-muted px-1 rounded">
                              {q.difficulty}
                            </span>
                            {q.tags && q.tags.length > 0 && (
                              <span className="truncate">
                                Tags: {q.tags.join(", ")}
                              </span>
                            )}
                          </div>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsTplOpen(false)} disabled={isPending} className="rounded-md border-border/80">
              Batal
            </Button>
            <Button onClick={handleSaveTpl} disabled={isPending} className="bg-brand-primary text-white hover:bg-brand-primary/90 rounded-md font-semibold gap-1.5">
              {isPending && <Loader2 className="size-4 animate-spin" />}
              Simpan Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* =====================================================================
          QUESTION DIALOG
          ===================================================================== */}
      <Dialog open={isQOpen} onOpenChange={setIsQOpen}>
        <DialogContent className="max-w-2xl rounded-2xl border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-lg font-bold text-foreground">
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
                    <SelectItem value="multiple_choices">Pilihan Ganda Kompleks (Multi Select)</SelectItem>
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

            {/* Options Input Block */}
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
            <Button onClick={handleSaveQ} disabled={isPending} className="bg-brand-primary text-white hover:bg-brand-primary/90 rounded-md font-semibold gap-1.5">
              {isPending && <Loader2 className="size-4 animate-spin" />}
              Simpan Soal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELETE COFNIRMATIONS */}
      <Dialog open={deleteTplId !== null} onOpenChange={(open) => !open && setDeleteTplId(null)}>
        <DialogContent className="max-w-md rounded-2xl border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-lg font-bold text-foreground">Hapus Kuis?</DialogTitle>
            <DialogDescription className="text-body-sm text-muted-foreground">
              Apakah Anda yakin ingin menghapus template kuis ini? Percobaan pengerjaan siswa yang terkait juga dapat terpengaruh.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteTplId(null)} disabled={isPending} className="rounded-md border-border/80">
              Batal
            </Button>
            <Button onClick={handleDeleteTpl} disabled={isPending} className="bg-status-error hover:bg-status-error/90 text-white rounded-md font-semibold gap-1.5">
              {isPending && <Loader2 className="size-4 animate-spin" />}
              Hapus Kuis
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteQId !== null} onOpenChange={(open) => !open && setDeleteQId(null)}>
        <DialogContent className="max-w-md rounded-2xl border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-lg font-bold text-foreground">Hapus Soal?</DialogTitle>
            <DialogDescription className="text-body-sm text-muted-foreground">
              Apakah Anda yakin ingin menghapus soal ini dari bank soal? Soal tidak akan terpilih lagi untuk kuis baru.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteQId(null)} disabled={isPending} className="rounded-md border-border/80">
              Batal
            </Button>
            <Button onClick={handleDeleteQ} disabled={isPending} className="bg-status-error hover:bg-status-error/90 text-white rounded-md font-semibold gap-1.5">
              {isPending && <Loader2 className="size-4 animate-spin" />}
              Hapus Soal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
