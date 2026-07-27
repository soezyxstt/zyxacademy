"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Clock, Award, ShieldAlert, BookOpen, Loader2, Calendar, Eye, Check } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getQuizTemplatePreviewAction } from "@/app/actions/tutor-management";
import { MathText } from "@/components/course/math-text";
import { formatDatetimeLocal } from "@/lib/date-utils";

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
 courses: Course[];
 courseMap: Record<string, string>;
 prefillCourseId?: string;
 prefillTags?: string;
}

export function QuizzesCurationClient({ initialTemplates, courses, courseMap, prefillCourseId, prefillTags }: Props) {
 const [templates, setTemplates] = useState<TemplateType[]>(initialTemplates);
 const [createOpen, setCreateOpen] = useState(false);
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

  // Creation Form State ; pre-populated from remediation action if params provided
  const [editingTemplate, setEditingTemplate] = useState<TemplateType | null>(null);
  const [courseId, setCourseId] = useState(
  prefillCourseId && courses.some((c) => c.id === prefillCourseId)
  ? prefillCourseId
  : (courses[0]?.id || "")
  );
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<TemplateType["category"]>("weekly");
  const [visibility, setVisibility] = useState<TemplateType["visibility"]>("free");
  const [timeLimitMinutes, setTimeLimitMinutes] = useState("");
  const [maxAttempts, setMaxAttempts] = useState("");
  const [openAt, setOpenAt] = useState("");
  const [closeAt, setCloseAt] = useState("");
  const [manualStatus, setManualStatus] = useState<TemplateType["manualStatus"]>("scheduled");

  const handleOpenCreate = () => {
    setEditingTemplate(null);
    setTitle("");
    setCategory("weekly");
    setVisibility("free");
    setTimeLimitMinutes("");
    setMaxAttempts("");
    setOpenAt("");
    setCloseAt("");
    setManualStatus("scheduled");
    setCount("10");
    setTagsStr("");
    setSelectedQIds([]);
    setEasy("3");
    setMedium("5");
    setHard("2");
    setCreateOpen(true);
  };

  const handleOpenEdit = (template: TemplateType) => {
    setEditingTemplate(template);
    setCourseId(template.courseId);
    setTitle(template.title);
    setCategory(template.category);
    setVisibility(template.visibility);
    setTimeLimitMinutes(template.timeLimitSeconds ? String(Math.round(template.timeLimitSeconds / 60)) : "");
    setMaxAttempts(template.maxAttempts ? String(template.maxAttempts) : "");
    setOpenAt(formatDatetimeLocal(template.openAt));
    setCloseAt(formatDatetimeLocal(template.closeAt));
    setManualStatus(template.manualStatus || "scheduled");

    const rules = template.selectionRules as Record<string, any>;
    setCount(String(rules?.count ?? 10));
    setTagsStr((rules?.tags ?? []).join(", "));
    setSelectedQIds(rules?.fixedQuestionIds ?? []);
    
    const diff = rules?.difficulty_proportions ?? { easy: 0, medium: 0, hard: 0 };
    setEasy(String(diff.easy));
    setMedium(String(diff.medium));
    setHard(String(diff.hard));

    setCreateOpen(true);
  };

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

      toast.success(`Status berhasil diubah menjadi ${newManualStatus === 'open' ? 'Buka Manual' : newManualStatus === 'closed' ? 'Tutup Manual' : 'Ikuti Jadwal'}`);
    } catch {
      toast.error("Gagal memperbarui status manual kuis.");
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

      toast.success(showDiscussion ? 'Pembahasan dibuka.' : 'Pembahasan ditutup.');
    } catch {
      toast.error("Gagal memperbarui status pembahasan.");
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

      toast.success(newStatus === 'published' ? 'Kuis berhasil dipublikasikan!' : 'Kuis disimpan sebagai draf.');
    } catch {
      toast.error("Gagal mengubah status publikasi kuis.");
    }
  };

 // Selection Rules State
 const [count, setCount] = useState("10");
 const [tagsStr, setTagsStr] = useState(prefillTags ?? "");
 const [easy, setEasy] = useState("3");
 const [medium, setMedium] = useState("5");
 const [hard, setHard] = useState("2");
 
 const [submitting, setSubmitting] = useState(false);
 const [courseQuestions, setCourseQuestions] = useState<any[]>([]);
 const [loadingQuestions, setLoadingQuestions] = useState(false);
 const [selectedQIds, setSelectedQIds] = useState<string[]>([]);

 useEffect(() => {
    if (!createOpen || !courseId) return;
    
    let active = true;
    async function loadQuestions() {
      setLoadingQuestions(true);
      try {
        const res = await fetch(`/api/admin/questions?courseId=${courseId}&reviewStatus=published&limit=200`);
        if (res.ok && active) {
          const data = await res.json();
          setCourseQuestions(data || []);
        }
      } catch (err) {
        console.error("Failed to load questions for course:", err);
      } finally {
        if (active) setLoadingQuestions(false);
      }
    }
    loadQuestions();
    return () => {
      active = false;
    };
  }, [courseId, createOpen]);

 const qCount = Number(count) || 10;
 const easyCount = Number(easy) || 0;
 const mediumCount = Number(medium) || 0;
 const hardCount = Number(hard) || 0;
 const totalProportion = easyCount + mediumCount + hardCount;

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
 toast.success("Template kuis berhasil dihapus.");
 setTemplates((prev) => prev.filter((t) => t.id !== deletingTemplate.id));
 setDeleteOpen(false);
 } else {
 toast.error("Gagal menghapus template kuis.");
 }
  } catch {
  toast.error("Terjadi kesalahan.");
  }
 };

  const handleCreateSubmit = async (e: React.FormEvent) => {
     e.preventDefault();
     if (!title.trim()) return toast.error("Judul kuis wajib diisi.");
     
     if (selectedQIds.length === 0) {
       if (isNaN(qCount) || qCount < 1) {
         return toast.error("Jumlah soal harus minimal 1.");
       }

       if (easyCount + mediumCount + hardCount !== qCount) {
         return toast.error(
           `Proporsi kesulitan (${easyCount} Easy + ${mediumCount} Medium + ${hardCount} Hard = ${easyCount + mediumCount + hardCount}) harus sama dengan total jumlah soal (${qCount}).`
         );
       }
     }

     try {
       setSubmitting(true);
       const tags = tagsStr.split(",").map((t) => t.trim()).filter(Boolean);
       
       const payload = {
         courseId,
         title,
         category,
         visibility,
         timeLimitSeconds: timeLimitMinutes ? Number(timeLimitMinutes) * 60 : null,
         maxAttempts: maxAttempts ? Number(maxAttempts) : null,
         openAt: openAt ? new Date(openAt).toISOString() : null,
         closeAt: closeAt ? new Date(closeAt).toISOString() : null,
         manualStatus,
         selectionRules: {
           tags: selectedQIds.length > 0 ? [] : tags,
           count: selectedQIds.length > 0 ? selectedQIds.length : qCount,
           fixedQuestionIds: selectedQIds.length > 0 ? selectedQIds : undefined,
           difficulty_proportions: selectedQIds.length > 0 ? undefined : {
             easy: easyCount,
             medium: mediumCount,
             hard: hardCount,
           },
         },
       };

       if (editingTemplate) {
         const res = await fetch(`/api/quiz/templates/${editingTemplate.id}`, {
           method: "PATCH",
           headers: { "Content-Type": "application/json" },
           body: JSON.stringify(payload),
         });

          if (!res.ok) {
            const errData = await res.json();
            const msg = typeof errData.error === "string" ? errData.error : JSON.stringify(errData.error);
            throw new Error(msg || "Gagal memperbarui kuis template");
          }

         toast.success("Template kuis berhasil diperbarui!");
         setTemplates((prev) =>
           prev.map((t) =>
             t.id === editingTemplate.id
               ? {
                   ...t,
                   courseId,
                   title,
                   category,
                   visibility,
                   timeLimitSeconds: payload.timeLimitSeconds,
                   maxAttempts: payload.maxAttempts,
                   openAt: openAt ? new Date(openAt) : null,
                   closeAt: closeAt ? new Date(closeAt) : null,
                   manualStatus,
                   selectionRules: payload.selectionRules,
                   updatedAt: new Date(),
                 }
               : t
           )
         );
       } else {
         const res = await fetch("/api/quiz/templates", {
           method: "POST",
           headers: { "Content-Type": "application/json" },
           body: JSON.stringify(payload),
         });

          if (!res.ok) {
            const errData = await res.json();
            const msg = typeof errData.error === "string" ? errData.error : JSON.stringify(errData.error);
            throw new Error(msg || "Gagal membuat kuis template");
          }

         const data = await res.json();
         toast.success("Template kuis berhasil dibuat!");

         const newTemplate: TemplateType = {
           id: data.templateId,
           courseId,
           title,
           category,
           visibility,
           status: "draft",
           manualStatus,
           timeLimitSeconds: payload.timeLimitSeconds,
           maxAttempts: payload.maxAttempts,
           openAt: openAt ? new Date(openAt) : null,
           closeAt: closeAt ? new Date(closeAt) : null,
           selectionRules: payload.selectionRules,
           createdAt: new Date(),
           updatedAt: new Date(),
         };

         setTemplates((prev) => [newTemplate, ...prev]);
       }

       setCreateOpen(false);
       // Reset Form
       setTitle("");
       setCategory("weekly");
       setVisibility("free");
       setTimeLimitMinutes("");
       setMaxAttempts("");
       setOpenAt("");
       setCloseAt("");
       setManualStatus("scheduled");
       setCount("10");
       setTagsStr("");
       setSelectedQIds([]);
       setEasy("3");
       setMedium("5");
       setHard("2");
     } catch (err: any) {
       toast.error(err.message || "Gagal menyimpan kuis");
     } finally {
       setSubmitting(false);
     }
  };

 return (
 <div className="space-y-6 font-sans">
 
 {/* Local Toolbar */}
 {templates.length > 0 && (
 <div className="flex justify-end border-b border-border/40 pb-4 text-left">
 <Button
 onClick={handleOpenCreate}
 className="rounded-lg bg-brand-primary !text-white hover:bg-brand-primary/95 flex items-center gap-2 cursor-pointer text-body-sm font-bold shadow-sm px-4 py-2 transition-all"
 >
 <Plus className="size-4" /> Buat Template Kuis
 </Button>
 </div>
 )}

 {/* Grid List */}
 {templates.length === 0 ? (
 <div className="rounded-2xl border border-border bg-card py-16 px-6 text-center shadow-xs flex flex-col items-center justify-center">
 <div className="mx-auto flex size-14 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary mb-5 border border-brand-primary/20">
 <Plus className="size-6" />
 </div>
 <h3 className="font-heading text-body-lg font-bold text-foreground">Belum Ada Template Kuis</h3>
 <p className="text-body-sm text-muted-foreground max-w-sm mx-auto mt-2 leading-relaxed">
 Mulai susun kuis otomatis dengan membuat konfigurasi kuis baru untuk kelas Anda.
 </p>
 <Button
 onClick={handleOpenCreate}
 className="mt-6 rounded-lg bg-brand-primary !text-white hover:bg-brand-primary/95 flex items-center gap-2 cursor-pointer text-body-sm font-bold shadow-md px-5 py-2.5 transition-all"
 >
 <Plus className="size-4" /> Buat Template Kuis
 </Button>
 </div>
 ) : (
 <div className="grid gap-5 sm:grid-cols-2 text-left">
 {templates.map((template) => {
 const rules = template.selectionRules as Record<string, any>;
 const qCount = rules?.count ?? 0;
 const props = rules?.difficulty_proportions ?? { easy: 0, medium: 0, hard: 0 };
 const tags = rules?.tags ?? [];

 return (
 <div
 key={template.id}
 className="group relative rounded-xl border border-border bg-card p-5 shadow-xs hover:border-brand-primary/40 hover:-translate-y-1 hover:shadow-md hover:shadow-brand-primary/5 transition-all duration-300 flex flex-col justify-between"
 >
 <div className="absolute top-0 left-0 right-0 h-1 bg-linear-to-r from-brand-primary/60 to-brand-primary/0 rounded-t-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
 
 <div>
  <div className="flex items-center justify-between gap-2 flex-wrap">
  <span className="text-xs font-bold text-brand-primary uppercase tracking-wider bg-brand-primary/8 px-2 py-0.5 rounded-md border border-brand-primary/10">
  {courseMap[template.courseId] ?? template.courseId}
  </span>
  <div className="flex gap-1.5 flex-wrap items-center">
    <span className="inline-flex rounded-md bg-muted/80 border border-border/40 px-2 py-0.5 text-body-xs font-semibold text-muted-foreground capitalize">
    {template.category === "weekly" ? "Mingguan" : template.category === "chapter" ? "Evaluasi Bab" : template.category === "premium" ? "Premium" : template.category === "simulation" ? "Simulasi" : "Harian"} · {template.visibility === "free" ? "Gratis" : "Premium"}
    </span>
    <button
      onClick={() => handleUpdateStatus(template.id, template.status === "published" ? "draft" : "published")}
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

 <h3 className="mt-4 font-heading text-body-md font-bold text-foreground leading-snug group-hover:text-brand-primary transition-colors">
 {template.title}
 </h3>

 <div className="mt-4 space-y-2.5 border-t border-border/40 pt-3.5 text-body-sm text-muted-foreground">
 <div className="flex items-center gap-2.5">
 <BookOpen className="size-4 text-brand-primary/85 shrink-0" />
  <span>
    <strong>{qCount} Soal</strong> {rules?.fixedQuestionIds && rules.fixedQuestionIds.length > 0 ? "(Soal Spesifik)" : <span className="text-muted-foreground/80">({props.easy} Easy · {props.medium} Medium · {props.hard} Hard)</span>}
  </span>
  </div>

  {rules?.fixedQuestionIds && rules.fixedQuestionIds.length > 0 && (
    <div className="mt-2.5 text-left border-t border-border/40 pt-2.5">
      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
        Daftar Soal Terpilih (ID):
      </span>
      <ol className="list-decimal pl-4 space-y-1 text-body-xs text-foreground/80 leading-normal max-h-24 overflow-y-auto pr-1">
        {rules.fixedQuestionIds.map((qId: string) => (
          <li key={qId} className="truncate font-mono text-[10px]" title={qId}>
            {qId}
          </li>
        ))}
      </ol>
    </div>
  )}

 <div className="flex items-center gap-2.5">
 <Clock className="size-4 text-emerald-500/85 shrink-0" />
 <span>
 Limit: {template.timeLimitSeconds ? `${Math.round(template.timeLimitSeconds / 60)} menit` : "Tanpa batas"}
 </span>
 </div>

 <div className="flex items-center gap-2.5">
 <Award className="size-4 text-brand-secondary/85 shrink-0" />
 <span>
 Batas Percobaan: {template.maxAttempts ? `${template.maxAttempts}x` : "Bebas"}
 </span>
 </div>
 </div>

 {tags.length > 0 && (
 <div className="mt-4 flex gap-1.5 flex-wrap">
 {tags.map((t: string) => (
 <span key={t} className="rounded-md bg-muted/65 border border-border/20 px-2 py-0.5 text-body-xs text-muted-foreground/90 font-medium">
 #{t}
 </span>
 ))}
 </div>
 )}

 {/* Schedule & Manual Status Section */}
 <div className="mt-4 pt-4 border-t border-border/40 space-y-2 text-body-sm">
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Akses Kuis:</span>
      <span className={cn(
        "inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        template.manualStatus === "open"
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
          : template.manualStatus === "closed"
          ? "bg-destructive/10 text-destructive border-destructive/20"
          : "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"
      )}>
        {template.manualStatus === "open" ? "Buka Manual" : template.manualStatus === "closed" ? "Tutup Manual" : "Ikuti Jadwal"}
      </span>
    </div>

    {template.manualStatus === "scheduled" && (template.openAt || template.closeAt) && (
      <div className="text-[11px] text-muted-foreground bg-muted/30 p-2 rounded-md border border-border/40 space-y-1">
        {template.openAt && (
          <div className="flex justify-between">
            <span>Buka:</span>
            <span className="font-semibold text-foreground">{new Date(template.openAt).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}</span>
          </div>
        )}
        {template.closeAt && (
          <div className="flex justify-between">
            <span>Tutup:</span>
            <span className="font-semibold text-foreground">{new Date(template.closeAt).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}</span>
          </div>
        )}
      </div>
    )}

    <div className="grid grid-cols-3 gap-1">
      <Button
        variant="outline"
        size="sm"
        className={cn(
          "text-[10px] h-7 px-1 rounded-md cursor-pointer",
          template.manualStatus === "open" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold border-emerald-500/30" : "text-muted-foreground hover:bg-muted"
        )}
        onClick={() => handleUpdateManualStatus(template.id, "open")}
      >
        Buka
      </Button>
      <Button
        variant="outline"
        size="sm"
        className={cn(
          "text-[10px] h-7 px-1 rounded-md cursor-pointer",
          template.manualStatus === "closed" ? "bg-destructive/15 text-destructive font-bold border-destructive/30" : "text-muted-foreground hover:bg-muted"
        )}
        onClick={() => handleUpdateManualStatus(template.id, "closed")}
      >
        Tutup
      </Button>
      <Button
        variant="outline"
        size="sm"
        className={cn(
          "text-[10px] h-7 px-1 rounded-md cursor-pointer",
          template.manualStatus === "scheduled" ? "bg-blue-500/15 text-blue-700 dark:text-blue-300 font-bold border-blue-500/30" : "text-muted-foreground hover:bg-muted"
        )}
        onClick={() => handleUpdateManualStatus(template.id, "scheduled")}
      >
        Jadwal
      </Button>
    </div>
    
    <div className="flex items-center justify-between gap-2 mt-4 pt-4 border-t border-border/40">
      <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Pembahasan:</span>
      <div className="flex gap-1">
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "text-[10px] h-7 px-3 rounded-md cursor-pointer",
            (template as any).showDiscussion ? "bg-brand-primary/15 text-brand-primary font-bold border-brand-primary/30" : "text-muted-foreground hover:bg-muted border-dashed"
          )}
          onClick={() => handleUpdateShowDiscussion(template.id, true)}
        >
          Tampil
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "text-[10px] h-7 px-3 rounded-md cursor-pointer",
            !(template as any).showDiscussion ? "bg-muted text-muted-foreground font-bold border-border" : "text-muted-foreground hover:bg-muted border-dashed"
          )}
          onClick={() => handleUpdateShowDiscussion(template.id, false)}
        >
          Sembunyi
        </Button>
      </div>
    </div>
  </div>
  </div>

  <div className="mt-5 flex items-center justify-between border-t border-border/40 pt-4">
  <span className="text-body-xs text-muted-foreground/80 flex items-center gap-1.5 font-medium">
  <Calendar className="size-3.5" />
  Dibuat {new Date(template.createdAt).toLocaleDateString("id-ID", { dateStyle: "medium" })}
  </span>

  <div className="flex gap-2">
   <Button
   variant="outline"
   size="sm"
   className="rounded-lg shrink-0 cursor-pointer shadow-xs gap-1.5 font-semibold text-xs h-8 px-2.5 text-brand-primary hover:bg-brand-primary/10 hover:text-brand-primary border-border/80"
   onClick={() => handleOpenPreviewTpl(template)}
   >
   <Eye className="size-3.5" />
   Preview
   </Button>
   <Button
     variant="outline"
     size="sm"
     className="rounded-lg shrink-0 cursor-pointer shadow-xs gap-1.5 font-semibold text-xs h-8 px-2.5 border-border/80 text-foreground hover:bg-muted"
     onClick={() => handleOpenEdit(template)}
   >
     Edit
   </Button>
  <Button
  variant="destructive"
  size="icon-sm"
  className="rounded-lg shrink-0 cursor-pointer shadow-xs transition-colors h-8 w-8 p-0"
  onClick={() => handleDeleteStart(template)}
  title="Hapus Template Kuis"
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

 {/* CREATE TEMPLATE DIALOG */}
 <Dialog open={createOpen} onOpenChange={setCreateOpen}>
 <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
 <DialogHeader className="p-6 pb-4 border-b border-border/60 shrink-0">
 <DialogTitle className="font-heading text-h6 font-bold text-foreground">
    {editingTemplate ? "Edit Template Kuis" : "Buat Template Kuis Baru"}
 </DialogTitle>
 <DialogDescription className="text-left">
    {editingTemplate ? "Perbarui parameter konfigurasi kuis Anda." : "Buat konfigurasi kuis secara manual dengan filter topik dan proporsi kesulitan soal menggunakan slider."}
 </DialogDescription>
 </DialogHeader>
 <form onSubmit={handleCreateSubmit} className="flex-1 flex flex-col min-h-0 text-left">
 <div className="flex-1 overflow-y-auto p-6 space-y-5 text-body-sm text-foreground">
 {/* Row 1: Course Target & Category */}
 <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
 <div className="space-y-1.5">
 <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Mata Kuliah Target</label>
 <Select value={courseId} onValueChange={setCourseId}>
 <SelectTrigger className="h-10 border-border/80 bg-background/50 text-body-sm font-medium">
 <SelectValue placeholder="Pilih Mata Kuliah" />
 </SelectTrigger>
 <SelectContent>
 {courses.map((c) => (
 <SelectItem key={c.id} value={c.id}>
 {c.title}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>

 <div className="space-y-1.5">
 <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Kategori Kuis</label>
 <Select value={category} onValueChange={(val) => setCategory(val as any)}>
 <SelectTrigger className="h-10 border-border/80 bg-background/50 text-body-sm font-medium">
 <SelectValue placeholder="Pilih Kategori" />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="weekly">Kuis Mingguan</SelectItem>
 <SelectItem value="chapter">Evaluasi Bab</SelectItem>
 <SelectItem value="simulation">Simulasi (Try Out)</SelectItem>
 <SelectItem value="premium">Premium Latihan</SelectItem>
 <SelectItem value="daily">Latihan Harian</SelectItem>
 </SelectContent>
 </Select>
 </div>
 </div>

 {/* Row 2: Title */}
 <div className="space-y-1.5">
 <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Judul Template Kuis</label>
 <Input
 type="text"
 value={title}
 onChange={(e) => setTitle(e.target.value)}
 placeholder="Contoh: Kuis 2 - Turunan Berantai"
 className="h-10 border-border/80 bg-background/50 text-body-sm font-medium"
 />
 </div>

 {/* Row 3: Limits (Time and Attempts) */}
 <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
 <div className="space-y-1.5">
 <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Batas Waktu (Menit)</label>
 <Input
 type="number"
 value={timeLimitMinutes}
 onChange={(e) => setTimeLimitMinutes(e.target.value)}
 placeholder="Kosongkan untuk tanpa batas"
 className="h-10 border-border/80 bg-background/50 text-body-sm font-medium"
 />
 </div>

 <div className="space-y-1.5">
 <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Maks. Percobaan Siswa</label>
 <Input
 type="number"
 value={maxAttempts}
 onChange={(e) => setMaxAttempts(e.target.value)}
 placeholder="Kosongkan untuk tanpa batas"
 className="h-10 border-border/80 bg-background/50 text-body-sm font-medium"
 />
 </div>
 </div>

 {/* Row 4: Visibility & Manual Status Control */}
 <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
    <div className="space-y-1.5">
      <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Visibilitas Kuis</label>
      <Select value={visibility} onValueChange={(val) => setVisibility(val as any)}>
        <SelectTrigger className="h-10 border-border/80 bg-background/50 text-body-sm font-medium">
          <SelectValue placeholder="Pilih Visibilitas" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="free">Gratis (Bisa diakses tanpa token)</SelectItem>
          <SelectItem value="paid">Premium (Hanya untuk kelas teraktivasi)</SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div className="space-y-1.5">
      <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Status Kontrol Manual</label>
      <Select value={manualStatus} onValueChange={(val) => setManualStatus(val as any)}>
        <SelectTrigger className="h-10 border-border/80 bg-background/50 text-body-sm font-medium">
          <SelectValue placeholder="Pilih Kontrol Akses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="scheduled">Ikuti Jadwal Waktu (Default)</SelectItem>
          <SelectItem value="open">Buka Manual (Bypass Jadwal)</SelectItem>
          <SelectItem value="closed">Tutup Manual (Blokir Akses)</SelectItem>
        </SelectContent>
      </Select>
    </div>
 </div>

 {/* Row 5: Open & Close Time Windows */}
 <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
 <div className="space-y-1.5">
 <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Waktu Buka Akses (Optional)</label>
 <Input
 type="datetime-local"
 value={openAt}
 onChange={(e) => setOpenAt(e.target.value)}
 className="h-10 border-border/80 bg-background/50 text-body-sm font-medium"
 />
 </div>

 <div className="space-y-1.5">
 <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Waktu Tutup Akses (Optional)</label>
 <Input
 type="datetime-local"
 value={closeAt}
 onChange={(e) => setCloseAt(e.target.value)}
 className="h-10 border-border/80 bg-background/50 text-body-sm font-medium"
 />
 </div>
 </div>

  {/* Selection Rules Section */}
  <div className="rounded-xl border border-border bg-muted/5 p-5 space-y-4">
    <h3 className="font-heading text-body-sm font-bold text-foreground border-b border-border/50 pb-2 flex items-center gap-2">
      <BookOpen className="size-4.5 text-brand-primary" />
      Aturan Seleksi &amp; Proporsi Kesulitan
    </h3>

    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Jumlah Total Soal</label>
        <Input
          type="number"
          disabled={selectedQIds.length > 0}
          value={selectedQIds.length > 0 ? selectedQIds.length.toString() : count}
          onChange={(e) => {
            const val = Number(e.target.value) || 10;
            setCount(e.target.value);
            // Auto balance difficulty proportions
            setEasy(String(Math.round(val * 0.3)));
            setMedium(String(Math.round(val * 0.5)));
            setHard(String(val - Math.round(val * 0.3) - Math.round(val * 0.5)));
          }}
          className="h-10 border-border/80 bg-background text-body-sm font-medium"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Filter Topik/Tags (Pisahkan Koma)</label>
        <Input
          type="text"
          disabled={selectedQIds.length > 0}
          value={selectedQIds.length > 0 ? "" : tagsStr}
          onChange={(e) => setTagsStr(e.target.value)}
          placeholder={selectedQIds.length > 0 ? "Diabaikan karena memilih soal spesifik" : "turunan, limit (opsional)"}
          className="h-10 border-border/80 bg-background text-body-sm font-medium"
        />
      </div>
    </div>

    {selectedQIds.length === 0 && (
      <>
        {/* VISUAL PROPORTION SLIDERS */}
        <div className="space-y-4 pt-2">
          <div className="flex justify-between items-center text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <span>Visualisasi Rasio Pembagian Kesulitan</span>
            <span className={cn(
              totalProportion === qCount ? "text-status-success" : "text-status-error",
              "font-semibold"
            )}>
              {totalProportion} / {qCount} Soal
            </span>
          </div>

          {/* Multi-color Progress bar breakdown */}
          <div className="h-3 w-full bg-muted rounded-md overflow-hidden flex border border-border">
            {qCount > 0 && (
              <>
                <div className="bg-emerald-500 transition-all duration-300" style={{ width: `${(easyCount/qCount)*100}%` }} title={`Easy: ${easyCount}`} />
                <div className="bg-amber-500 transition-all duration-300" style={{ width: `${(mediumCount/qCount)*100}%` }} title={`Medium: ${mediumCount}`} />
                <div className="bg-rose-500 transition-all duration-300" style={{ width: `${(hardCount/qCount)*100}%` }} title={`Hard: ${hardCount}`} />
              </>
            )}
          </div>

          {/* Range Sliders Stack */}
          <div className="space-y-3">
            {/* Easy Slider */}
            <div className="space-y-1 bg-emerald-500/5 p-2 rounded-lg border border-emerald-500/10">
              <div className="flex justify-between text-xs font-bold text-emerald-600 dark:text-emerald-400">
                <span>Easy</span>
                <span>{easyCount} Soal</span>
              </div>
              <input
                type="range"
                min="0"
                max={qCount}
                value={easy}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setEasy(String(val));
                  const remaining = qCount - val;
                  const currentMed = Number(medium) || 0;
                  const currentHard = Number(hard) || 0;
                  const totalOther = currentMed + currentHard;
                  if (totalOther > 0) {
                    const newMed = Math.min(remaining, Math.round((currentMed / totalOther) * remaining));
                    setMedium(String(newMed));
                    setHard(String(remaining - newMed));
                  } else {
                    const newMed = Math.round(remaining / 2);
                    setMedium(String(newMed));
                    setHard(String(remaining - newMed));
                  }
                }}
                className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
            </div>

            {/* Medium Slider */}
            <div className="space-y-1 bg-amber-500/5 p-2 rounded-lg border border-amber-500/10">
              <div className="flex justify-between text-xs font-bold text-amber-600 dark:text-amber-400">
                <span>Medium</span>
                <span>{mediumCount} Soal</span>
              </div>
              <input
                type="range"
                min="0"
                max={qCount}
                value={medium}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setMedium(String(val));
                  const remaining = qCount - val;
                  const currentEasy = Number(easy) || 0;
                  const currentHard = Number(hard) || 0;
                  const totalOther = currentEasy + currentHard;
                  if (totalOther > 0) {
                    const newEasy = Math.min(remaining, Math.round((currentEasy / totalOther) * remaining));
                    setEasy(String(newEasy));
                    setHard(String(remaining - newEasy));
                  } else {
                    const newEasy = Math.round(remaining / 2);
                    setEasy(String(newEasy));
                    setHard(String(remaining - newEasy));
                  }
                }}
                className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
            </div>

            {/* Hard Slider */}
            <div className="space-y-1 bg-rose-500/5 p-2 rounded-lg border border-rose-500/10">
              <div className="flex justify-between text-xs font-bold text-rose-600 dark:text-rose-400">
                <span>Hard</span>
                <span>{hardCount} Soal</span>
              </div>
              <input
                type="range"
                min="0"
                max={qCount}
                value={hard}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setHard(String(val));
                  const remaining = qCount - val;
                  const currentEasy = Number(easy) || 0;
                  const currentMed = Number(medium) || 0;
                  const totalOther = currentEasy + currentMed;
                  if (totalOther > 0) {
                    const newEasy = Math.min(remaining, Math.round((currentEasy / totalOther) * remaining));
                    setEasy(String(newEasy));
                    setMedium(String(remaining - newEasy));
                  } else {
                    const newEasy = Math.round(remaining / 2);
                    setEasy(String(newEasy));
                    setMedium(String(remaining - newEasy));
                  }
                }}
                className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-rose-500"
              />
            </div>
          </div>

          <span className="block text-xs text-muted-foreground leading-normal">
            Seret slider di atas untuk menyeimbangkan rasio kesulitan soal. Pembagian harus genap bernilai total {qCount} soal.
          </span>
        </div>
      </>
    )}

    {/* Manual Question Selector for Admin */}
    <div className="border border-border/80 rounded-xl p-3.5 bg-muted/15 space-y-2 text-left">
      <div className="flex justify-between items-center">
        <label className="text-body-xs font-semibold uppercase tracking-wider text-foreground flex items-center gap-1.5 font-bold">
          <BookOpen className="size-4 text-brand-primary shrink-0" />
          Pilih Soal Secara Spesifik ({selectedQIds.length} terpilih)
        </label>
      </div>
      <div className="text-[11px] text-muted-foreground mb-2">
        Opsional. Jika dipilih, kuis ini akan selalu berisi soal-soal ini secara tetap (mengabaikan filter tag & proporsi kesulitan).
      </div>
      
      {loadingQuestions ? (
        <div className="flex items-center justify-center py-6 text-xs text-muted-foreground gap-2">
          <Loader2 className="size-4 animate-spin text-brand-primary" />
          Memuat bank soal...
        </div>
      ) : courseQuestions.length === 0 ? (
        <div className="text-xs text-muted-foreground py-6 text-center border border-dashed border-border rounded-lg bg-background">
          Belum ada soal yang dipublikasikan di Bank Soal untuk mata kuliah target.
        </div>
      ) : (
        <div className="max-h-48 overflow-y-auto space-y-2 divide-y divide-border/45 pr-1 border border-border/45 rounded-lg bg-background p-2">
          {courseQuestions.map((q) => {
            const isChecked = selectedQIds.includes(q.id);
            const tags = q.tags ? (typeof q.tags === "string" ? JSON.parse(q.tags) : q.tags) : [];
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
                  <MathText className="text-xs font-semibold text-foreground line-clamp-2" as="div">
                    {q.prompt}
                  </MathText>
                  <div className="flex gap-1.5 items-center mt-1.5 text-[10px] text-muted-foreground">
                    <span className="uppercase font-mono font-bold bg-muted px-1 rounded text-[9px]">
                      {q.difficulty}
                    </span>
                    {tags.length > 0 && (
                      <span className="truncate">
                        Tags: {tags.join(", ")}
                      </span>
                    )}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      )}
    </div>
  </div>
  </div>

 <DialogFooter className="p-6 pt-4 border-t border-border/40 bg-muted/5 flex items-center justify-end gap-2.5 shrink-0">
 <Button type="button" variant="outline" className="rounded-lg cursor-pointer font-bold" onClick={() => setCreateOpen(false)}>
 Batal
 </Button>
 <Button type="submit" disabled={selectedQIds.length === 0 && totalProportion !== qCount} isLoading={submitting} className="rounded-lg cursor-pointer bg-brand-primary !text-white hover:bg-brand-primary/95 font-bold px-6 shadow-sm">
 {editingTemplate ? "Simpan Perubahan" : "Buat Template Kuis"}
 </Button>
 </DialogFooter>
 </form>
 </DialogContent>
 </Dialog>

 {/* DELETE TEMPLATE DIALOG */}
 <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
 <DialogContent className="max-w-md rounded-xl border border-border p-6 shadow-lg text-left">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2 text-status-error font-heading text-h6 font-bold">
 <ShieldAlert className="size-5 shrink-0" />
 Hapus Template Kuis
 </DialogTitle>
 <DialogDescription className="text-body-sm text-muted-foreground mt-2">
 Tindakan ini akan menghapus template kuis &ldquo;{deletingTemplate?.title}&rdquo; secara permanen dari database. Siswa tidak akan dapat mengakses kuis ini lagi.
 </DialogDescription>
 </DialogHeader>
 <DialogFooter className="mt-5 flex items-center justify-end gap-2.5">
 <Button variant="outline" className="rounded-lg cursor-pointer font-bold" onClick={() => setDeleteOpen(false)}>
 Batal
 </Button>
 <Button variant="destructive" className="rounded-lg cursor-pointer font-bold px-6 shadow-sm" onClick={handleDeleteConfirm}>
 Ya, Hapus Permanen
 </Button>
 </DialogFooter>
  </DialogContent>
  </Dialog>

      {/* PREVIEW QUIZ DIALOG */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
          <DialogHeader className="p-6 pb-4 border-b border-border shrink-0">
            <DialogTitle className="font-heading text-h6 font-bold text-foreground">
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
                        <span className={cn(
                          "capitalize text-[10px] px-2 py-0.5 rounded border font-medium",
                          q.difficulty === "easy"
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                            : q.difficulty === "medium"
                              ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
                              : "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20"
                        )}>
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
