"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Clock, Award, BookOpen, Loader2, Calendar, Eye, Check, Edit } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { CourseBadge, DifficultyBadge } from "@/components/admin/status-badges";
import { AdminOptionLetter } from "@/components/admin/option-letter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getQuizTemplatePreviewAction } from "@/app/actions/tutor-management";
import { MathText } from "@/components/course/math-text";

type TemplateType = {
  id: string;
  courseId: string;
  title: string;
  category: "daily" | "weekly" | "chapter" | "premium" | "simulation";
  visibility: "free" | "paid";
  status: "draft" | "published";
  manualStatus: "open" | "closed" | "scheduled";
  timeLimitSeconds: number | null;
  maxAttempts: number | null;
  openAt?: Date | null;
  closeAt?: Date | null;
  showDiscussion?: boolean;
  selectionRules: unknown;
  createdAt: Date;
  updatedAt?: Date;
};

interface Course {
  id: string;
  title: string;
}

interface Props {
  initialTemplates: TemplateType[];
  courses?: Course[];
  courseMap: Record<string, string>;
  prefillCourseId?: string;
  prefillTags?: string;
}

export function QuizzesCurationClient({ initialTemplates, courseMap, prefillCourseId, prefillTags }: Props) {
  const [templates, setTemplates] = useState<TemplateType[]>(initialTemplates);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState<TemplateType | null>(null);

  // Preview Dialog State
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewTpl, setPreviewTpl] = useState<TemplateType | null>(null);
  const [previewQuestions, setPreviewQuestions] = useState<any[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  async function handleOpenPreviewTpl(t: TemplateType) {
    setPreviewTpl(t);
    setIsPreviewOpen(true);
    setLoadingPreview(true);
    setPreviewQuestions([]);
    try {
      const res = await getQuizTemplatePreviewAction(t.courseId, t.id);
      if (res.success) {
        setPreviewQuestions(res.questions);
      } else {
        toast.error("Gagal memuat pratinjau kuis.");
      }
    } catch (err: any) {
      toast.error(err.message || "Gagal memuat pratinjau kuis.");
    } finally {
      setLoadingPreview(false);
    }
  }

  const handleUpdateManualStatus = async (templateId: string, newManualStatus: TemplateType["manualStatus"]) => {
    try {
      setTemplates((prev) =>
        prev.map((t) => (t.id === templateId ? { ...t, manualStatus: newManualStatus } : t))
      );

      const res = await fetch(`/api/quiz/templates/${templateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manualStatus: newManualStatus }),
      });

      if (!res.ok) {
        throw new Error("Failed to update status");
      }

      toast.success(
        `Status kuis berhasil diubah menjadi ${
          newManualStatus === "open" ? "Buka Manual" : newManualStatus === "closed" ? "Tutup Manual" : "Ikuti Jadwal"
        }`
      );
    } catch {
      toast.error("Gagal memperbarui status akses kuis.");
    }
  };

  const handleUpdateShowDiscussion = async (templateId: string, showDiscussion: boolean) => {
    try {
      setTemplates((prev) =>
        prev.map((t) => (t.id === templateId ? { ...t, showDiscussion } : t))
      );

      const res = await fetch(`/api/quiz/templates/${templateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showDiscussion }),
      });

      if (!res.ok) {
        throw new Error("Failed to update discussion status");
      }

      toast.success(showDiscussion ? "Pembahasan kuis dibuka." : "Pembahasan kuis ditutup.");
    } catch {
      toast.error("Gagal memperbarui status pembahasan kuis.");
    }
  };

  const handleUpdateStatus = async (templateId: string, newStatus: TemplateType["status"]) => {
    try {
      setTemplates((prev) =>
        prev.map((t) => (t.id === templateId ? { ...t, status: newStatus } : t))
      );

      const res = await fetch(`/api/quiz/templates/${templateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        throw new Error("Failed to update publish status");
      }

      toast.success(newStatus === "published" ? "Kuis berhasil dipublikasikan!" : "Kuis disimpan sebagai draf.");
    } catch {
      toast.error("Gagal mengubah status publikasi kuis.");
    }
  };

  const handleDeleteStart = (template: TemplateType) => {
    setDeletingTemplate(template);
    setDeleteOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingTemplate) return;
    try {
      const res = await fetch(`/api/quiz/templates/${deletingTemplate.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Kuis berhasil dihapus.");
        setTemplates((prev) => prev.filter((t) => t.id !== deletingTemplate.id));
        setDeleteOpen(false);
      } else {
        toast.error("Gagal menghapus kuis.");
      }
    } catch {
      toast.error("Terjadi kesalahan saat menghapus kuis.");
    }
  };

  const newQuizUrl = prefillCourseId
    ? `/admin/quizzes/new?courseId=${encodeURIComponent(prefillCourseId)}${prefillTags ? `&tags=${encodeURIComponent(prefillTags)}` : ""}`
    : "/admin/quizzes/new";

  return (
    <div className="space-y-6 font-sans">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between border-b border-border/40 pb-4">
        <span className="text-body-sm font-medium text-muted-foreground">
          Total <strong>{templates.length}</strong> Kuis Terdaftar
        </span>
        <Button asChild className="rounded-lg bg-brand-primary text-white hover:bg-brand-primary/95 font-bold shadow-xs">
          <Link href={newQuizUrl} className="flex items-center gap-2">
            <Plus className="size-4" /> Buat Kuis
          </Link>
        </Button>
      </div>

      {/* Grid List */}
      {templates.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card py-16 px-6 text-center shadow-xs flex flex-col items-center justify-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary mb-5 border border-brand-primary/20">
            <BookOpen className="size-6" />
          </div>
          <h3 className="font-heading text-body-lg font-bold text-foreground">Belum Ada Kuis</h3>
          <p className="text-body-sm text-muted-foreground max-w-sm mx-auto mt-2 leading-relaxed">
            Mulai susun kuis evaluasi untuk menguji pemahaman mahasiswa.
          </p>
          <Button asChild className="mt-6 rounded-lg bg-brand-primary text-white hover:bg-brand-primary/95 font-bold shadow-md">
            <Link href={newQuizUrl} className="flex items-center gap-2">
              <Plus className="size-4" /> Buat Kuis Baru
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 text-left">
          {templates.map((template) => {
            const rules = template.selectionRules as Record<string, any>;
            const qCount = rules?.count ?? 0;
            const props = rules?.difficulty_proportions ?? { easy: 0, medium: 0, hard: 0 };
            const tags = rules?.tags ?? [];
            const isSpecific = rules?.fixedQuestionIds && rules.fixedQuestionIds.length > 0;
            const perQuestionTimer = rules?.perQuestionTimerEnabled;

            return (
              <div
                key={template.id}
                className="group relative rounded-xl border border-border bg-card p-5 shadow-xs hover:border-brand-primary/40 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex flex-col justify-between"
              >
                <div className="absolute top-0 left-0 right-0 h-1 bg-linear-to-r from-brand-primary/60 to-brand-primary/0 rounded-t-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                <div>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CourseBadge>{courseMap[template.courseId] ?? template.courseId}</CourseBadge>
                    <div className="flex gap-1.5 flex-wrap items-center">
                      <span className="inline-flex rounded-md bg-muted/80 border border-border/40 px-2 py-0.5 text-body-xs font-semibold text-muted-foreground capitalize">
                        {template.category === "weekly"
                          ? "Mingguan"
                          : template.category === "chapter"
                          ? "Evaluasi Bab"
                          : template.category === "premium"
                          ? "Premium"
                          : template.category === "simulation"
                          ? "Simulasi"
                          : "Harian"}{" "}
                        · {template.visibility === "free" ? "Gratis" : "Khusus"}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateStatus(template.id, template.status === "published" ? "draft" : "published")
                        }
                        className={cn(
                          "inline-flex rounded-md border px-2 py-0.5 text-body-xs font-semibold capitalize cursor-pointer transition-colors hover:bg-muted/80",
                          template.status === "published"
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                            : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
                        )}
                        title="Klik untuk mengubah status draf/publikasi"
                      >
                        {template.status === "published" ? "Published" : "Draft"}
                      </button>
                    </div>
                  </div>

                  <h3 className="mt-3.5 font-heading text-body-md font-bold text-foreground leading-snug group-hover:text-brand-primary transition-colors">
                    {template.title}
                  </h3>

                  <div className="mt-3.5 space-y-2 border-t border-border/40 pt-3 text-body-sm text-muted-foreground">
                    <div className="flex items-center gap-2.5">
                      <BookOpen className="size-4 text-brand-primary/85 shrink-0" />
                      <span>
                        <strong>{qCount} Soal</strong>{" "}
                        {isSpecific ? (
                          <span className="text-brand-primary text-body-xs font-semibold">(Pilihan Spesifik)</span>
                        ) : (
                          <span className="text-muted-foreground/80 text-body-xs">
                            ({props.easy} Easy · {props.medium} Medium · {props.hard} Hard)
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <Clock className="size-4 text-emerald-500/85 shrink-0" />
                      <span>
                        Limit:{" "}
                        {template.timeLimitSeconds
                          ? `${Math.round(template.timeLimitSeconds / 60)} menit`
                          : "Tanpa batas"}
                      </span>
                      {perQuestionTimer && (
                        <Badge variant="outline" className="rounded-md border-brand-primary/30 text-brand-primary text-[10px] h-4 px-1">
                          Timer Per Soal
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2.5">
                      <Award className="size-4 text-brand-secondary/85 shrink-0" />
                      <span>
                        Batas Percobaan: {template.maxAttempts ? `${template.maxAttempts}x` : "Bebas"}
                      </span>
                    </div>
                  </div>

                  {tags.length > 0 && (
                    <div className="mt-3 flex gap-1.5 flex-wrap">
                      {tags.map((t: string) => (
                        <span
                          key={t}
                          className="rounded-md bg-muted/65 border border-border/20 px-2 py-0.5 text-body-xs text-muted-foreground/90 font-medium"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Schedule & Manual Status Section */}
                  <div className="mt-3 pt-3 border-t border-border/40 space-y-2 text-body-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                        Akses Kuis:
                      </span>
                      <span
                        className={cn(
                          "inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                          template.manualStatus === "open"
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                            : template.manualStatus === "closed"
                            ? "bg-destructive/10 text-destructive border-destructive/20"
                            : "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"
                        )}
                      >
                        {template.manualStatus === "open"
                          ? "Buka Manual"
                          : template.manualStatus === "closed"
                          ? "Tutup Manual"
                          : "Ikuti Jadwal"}
                      </span>
                    </div>

                    {template.manualStatus === "scheduled" && (template.openAt || template.closeAt) && (
                      <div className="text-[11px] text-muted-foreground bg-muted/30 p-2 rounded-md border border-border/40 space-y-1">
                        {template.openAt && (
                          <div className="flex justify-between">
                            <span>Buka:</span>
                            <span className="font-semibold text-foreground">
                              {new Date(template.openAt).toLocaleString("id-ID", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}
                            </span>
                          </div>
                        )}
                        {template.closeAt && (
                          <div className="flex justify-between">
                            <span>Tutup:</span>
                            <span className="font-semibold text-foreground">
                              {new Date(template.closeAt).toLocaleString("id-ID", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-1 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={cn(
                          "text-[10px] h-7 px-1 rounded-md cursor-pointer",
                          template.manualStatus === "open"
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold border-emerald-500/30"
                            : "text-muted-foreground hover:bg-muted"
                        )}
                        onClick={() => handleUpdateManualStatus(template.id, "open")}
                      >
                        Buka
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={cn(
                          "text-[10px] h-7 px-1 rounded-md cursor-pointer",
                          template.manualStatus === "closed"
                            ? "bg-destructive/15 text-destructive font-bold border-destructive/30"
                            : "text-muted-foreground hover:bg-muted"
                        )}
                        onClick={() => handleUpdateManualStatus(template.id, "closed")}
                      >
                        Tutup
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={cn(
                          "text-[10px] h-7 px-1 rounded-md cursor-pointer",
                          template.manualStatus === "scheduled"
                            ? "bg-blue-500/15 text-blue-700 dark:text-blue-300 font-bold border-blue-500/30"
                            : "text-muted-foreground hover:bg-muted"
                        )}
                        onClick={() => handleUpdateManualStatus(template.id, "scheduled")}
                      >
                        Jadwal
                      </Button>
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-border/40">
                      <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                        Pembahasan:
                      </span>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className={cn(
                            "text-[10px] h-7 px-2.5 rounded-md cursor-pointer",
                            template.showDiscussion
                              ? "bg-brand-primary/15 text-brand-primary font-bold border-brand-primary/30"
                              : "text-muted-foreground hover:bg-muted border-dashed"
                          )}
                          onClick={() => handleUpdateShowDiscussion(template.id, true)}
                        >
                          Buka
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className={cn(
                            "text-[10px] h-7 px-2.5 rounded-md cursor-pointer",
                            !template.showDiscussion
                              ? "bg-muted text-muted-foreground font-bold border-border"
                              : "text-muted-foreground hover:bg-muted border-dashed"
                          )}
                          onClick={() => handleUpdateShowDiscussion(template.id, false)}
                        >
                          Kunci
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-border/40 pt-3.5">
                  <span className="text-body-xs text-muted-foreground/80 flex items-center gap-1.5 font-medium">
                    <Calendar className="size-3.5" />
                    {new Date(template.createdAt).toLocaleDateString("id-ID", { dateStyle: "medium" })}
                  </span>

                  <div className="flex gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-lg shrink-0 cursor-pointer shadow-xs gap-1 font-semibold text-xs h-8 px-2 text-brand-primary hover:bg-brand-primary/10 hover:text-brand-primary border-border/80"
                      onClick={() => handleOpenPreviewTpl(template)}
                    >
                      <Eye className="size-3.5" />
                      Preview
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="rounded-lg shrink-0 cursor-pointer shadow-xs gap-1 font-semibold text-xs h-8 px-2.5 border-border/80 text-foreground hover:bg-muted"
                    >
                      <Link href={`/admin/quizzes/${template.id}/edit`}>
                        <Edit className="size-3.5" />
                        Edit
                      </Link>
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon-sm"
                      className="rounded-lg shrink-0 cursor-pointer shadow-xs transition-colors h-8 w-8 p-0"
                      onClick={() => handleDeleteStart(template)}
                      title="Hapus Kuis"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DELETE CONFIRM DIALOG */}
      <AdminConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Hapus Kuis"
        description={`Tindakan ini akan menghapus kuis "${deletingTemplate?.title}" secara permanen dari database. Siswa tidak akan dapat mengakses kuis ini lagi.`}
        confirmLabel="Ya, Hapus Permanen"
        onConfirm={handleDeleteConfirm}
      />

      {/* PREVIEW QUIZ DIALOG */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
          <DialogHeader className="p-6 pb-4 border-b border-border shrink-0">
            <DialogTitle className="font-heading text-h6 font-bold text-foreground">
              Pratinjau Kuis: {previewTpl?.title}
            </DialogTitle>
            <DialogDescription className="text-left text-body-xs text-muted-foreground flex gap-3 flex-wrap items-center mt-1">
              <span className="bg-muted px-2 py-0.5 rounded-md border border-border">
                Kategori: {previewTpl?.category}
              </span>
              <span className="bg-muted px-2 py-0.5 rounded-md border border-border">
                Batas Waktu: {previewTpl?.timeLimitSeconds ? `${previewTpl.timeLimitSeconds / 60} menit` : "Bebas"}
              </span>
              <span className="bg-muted px-2 py-0.5 rounded-md border border-border">
                Percobaan: {previewTpl?.maxAttempts ? `${previewTpl.maxAttempts}x` : "Bebas"}
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-6 text-left">
            {loadingPreview ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3">
                <Loader2 className="size-8 animate-spin text-brand-primary" />
                <p className="text-body-sm text-muted-foreground">Memilih dan meresolusi butir soal...</p>
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
                        <DifficultyBadge difficulty={q.difficulty} />
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
                            <AdminOptionLetter index={optIdx} isCorrect={isCorrect} />
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
