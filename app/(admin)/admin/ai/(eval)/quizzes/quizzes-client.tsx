"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Clock, Award, ShieldAlert, BookOpen, Loader2, Calendar, ChevronDown, ListPlus, Sliders, FileJson } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type TemplateType = {
 id: string;
 courseId: string;
 title: string;
 category: "daily" | "weekly" | "chapter" | "premium";
 visibility: "free" | "paid";
 timeLimitSeconds: number | null;
 maxAttempts: number | null;
 selectionRules: unknown;
 createdAt: Date;
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
 const [createOpen, setCreateOpen] = useState(() => !!prefillCourseId || !!prefillTags);
 const [deleteOpen, setDeleteOpen] = useState(false);
 const [deletingTemplate, setDeletingTemplate] = useState<TemplateType | null>(null);

 // Snapshot Auditor State
 const [auditingTemplate, setAuditingTemplate] = useState<TemplateType | null>(null);

 // Creation Form State ; pre-populated from remediation action if params provided
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

 // Selection Rules State
 const [count, setCount] = useState("10");
 const [tagsStr, setTagsStr] = useState(prefillTags ?? "");
 const [easy, setEasy] = useState("3");
 const [medium, setMedium] = useState("5");
 const [hard, setHard] = useState("2");
 
 const [submitting, setSubmitting] = useState(false);

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
 } catch (e) {
 toast.error("Terjadi kesalahan.");
 }
 };

 const handleCreateSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 if (!title.trim()) return toast.error("Judul kuis wajib diisi.");
 
 if (isNaN(qCount) || qCount < 1) {
 return toast.error("Jumlah soal harus minimal 1.");
 }

 if (easyCount + mediumCount + hardCount !== qCount) {
 return toast.error(
 `Proporsi kesulitan (${easyCount} Easy + ${mediumCount} Medium + ${hardCount} Hard = ${easyCount + mediumCount + hardCount}) harus sama dengan total jumlah soal (${qCount}).`
 );
 }

 try {
 setSubmitting(true);
 const tags = tagsStr.split(",").map((t) => t.trim()).filter(Boolean);
 
 const payload = {
 courseId,
 title,
 category,
 visibility,
 timeLimitSeconds: timeLimitMinutes ? Number(timeLimitMinutes) * 60 : undefined,
 maxAttempts: maxAttempts ? Number(maxAttempts) : undefined,
 openAt: openAt ? new Date(openAt).toISOString() : null,
 closeAt: closeAt ? new Date(closeAt).toISOString() : null,
 selectionRules: {
 tags,
 count: qCount,
 difficulty_proportions: {
 easy: easyCount,
 medium: mediumCount,
 hard: hardCount,
 },
 },
 };

 const res = await fetch("/api/quiz/templates", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(payload),
 });

 if (!res.ok) {
 const errData = await res.json();
 throw new Error(errData.error || "Gagal membuat kuis template");
 }

 const data = await res.json();
 toast.success("Template kuis berhasil dibuat!");

 const newTemplate: TemplateType = {
 id: data.templateId,
 courseId,
 title,
 category,
 visibility,
 timeLimitSeconds: timeLimitMinutes ? Number(timeLimitMinutes) * 60 : null,
 maxAttempts: maxAttempts ? Number(maxAttempts) : null,
 openAt: openAt ? new Date(openAt) : null,
 closeAt: closeAt ? new Date(closeAt) : null,
 selectionRules: payload.selectionRules,
 createdAt: new Date(),
 updatedAt: new Date(),
 };

 setTemplates((prev) => [newTemplate, ...prev]);
 setCreateOpen(false);

 // Reset Form
 setTitle("");
 setCategory("weekly");
 setVisibility("free");
 setTimeLimitMinutes("");
 setMaxAttempts("");
 setOpenAt("");
 setCloseAt("");
 setCount("10");
 setTagsStr("");
 setEasy("3");
 setMedium("5");
 setHard("2");
 } catch (err: any) {
 toast.error(err.message || "Gagal membuat kuis");
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
 onClick={() => setCreateOpen(true)}
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
 onClick={() => setCreateOpen(true)}
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
 <span className="inline-flex rounded-md bg-muted/80 border border-border/40 px-2 py-0.5 text-body-xs font-semibold text-muted-foreground capitalize">
 {template.category === "weekly" ? "Mingguan" : template.category === "chapter" ? "Evaluasi Bab" : template.category === "premium" ? "Premium" : "Harian"} · {template.visibility === "free" ? "Gratis" : "Premium"}
 </span>
 </div>

 <h3 className="mt-4 font-heading text-body-md font-bold text-foreground leading-snug group-hover:text-brand-primary transition-colors">
 {template.title}
 </h3>

 <div className="mt-4 space-y-2.5 border-t border-border/40 pt-3.5 text-body-sm text-muted-foreground">
 <div className="flex items-center gap-2.5">
 <BookOpen className="size-4 text-brand-primary/85 shrink-0" />
 <span>
 <strong>{qCount} Soal</strong> <span className="text-muted-foreground/80">({props.easy} Easy · {props.medium} Medium · {props.hard} Hard)</span>
 </span>
 </div>

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
 className="rounded-lg shrink-0 cursor-pointer shadow-xs gap-1.5 font-semibold text-xs h-8 px-2.5"
 onClick={() => setAuditingTemplate(template)}
 >
 <FileJson className="size-3.5" />
 Audit
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
 <DialogTitle className="font-heading text-h6 font-bold text-foreground">Buat Template Kuis Baru</DialogTitle>
 <DialogDescription className="text-left">
 Buat konfigurasi kuis secara manual dengan filter topik dan proporsi kesulitan soal menggunakan slider.
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

 {/* Row 4: Visibility */}
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
 value={count}
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
 value={tagsStr}
 onChange={(e) => setTagsStr(e.target.value)}
 placeholder="turunan, limit (opsional)"
 className="h-10 border-border/80 bg-background text-body-sm font-medium"
 />
 </div>
 </div>

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
 </div>
 </div>

 <DialogFooter className="p-6 pt-4 border-t border-border/40 bg-muted/5 flex items-center justify-end gap-2.5 shrink-0">
 <Button type="button" variant="outline" className="rounded-lg cursor-pointer font-bold" onClick={() => setCreateOpen(false)}>
 Batal
 </Button>
 <Button type="submit" disabled={submitting || totalProportion !== qCount} className="rounded-lg cursor-pointer bg-brand-primary !text-white hover:bg-brand-primary/95 font-bold px-6 shadow-sm">
 {submitting ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
 Buat Template Kuis
 </Button>
 </DialogFooter>
 </form>
 </DialogContent>
 </Dialog>

 {/* SNAPSHOT AUDITOR DIALOG */}
 <Dialog open={!!auditingTemplate} onOpenChange={() => setAuditingTemplate(null)}>
 <DialogContent className="max-w-3xl rounded-xl border border-border p-6 shadow-lg text-left">
 <DialogHeader className="border-b border-border pb-3 mb-4">
 <DialogTitle className="flex items-center gap-2 font-heading text-h6 font-bold text-foreground">
 <FileJson className="size-5 text-primary shrink-0" />
 Auditor Struktur Snapshot Attempt Kuis
 </DialogTitle>
 <DialogDescription>
 Struktur JSON snapshot permanen yang dikunci saat siswa mulai mengerjakan kuis dari template ini.
 </DialogDescription>
 </DialogHeader>
 
 <div className="space-y-4">
 <p className="text-body-sm text-muted-foreground leading-relaxed">
 Untuk melindungi rekam nilai siswa dari perubahan/penghapusan soal di bank soal di masa depan, sistem database Zyx Academy mengambil <strong>deep snapshot</strong> seluruh konten soal saat sesi pengerjaan diaktifkan.
 </p>

 <div className="rounded-lg border border-border overflow-hidden bg-muted/20 p-4 font-mono text-xs max-h-[350px] overflow-y-auto leading-relaxed text-foreground/90">
 <pre>{JSON.stringify({
 attemptId: "att_9a8f27b1-872f-402a-bf3d-2490acbd0829",
 templateId: auditingTemplate?.id || "tmpl_example",
 title: auditingTemplate?.title || "Kuis Turunan",
 startedAt: new Date().toISOString(),
 settings: {
 timeLimitSeconds: auditingTemplate?.timeLimitSeconds,
 maxAttempts: auditingTemplate?.maxAttempts
 },
 questionsSnapshot: [
 {
 id: "qbank_98c19920-f11a-4d7a",
 knowledgeObjectId: "ko-calc-1-2",
 difficulty: auditingTemplate?.selectionRules ? (auditingTemplate.selectionRules as any).difficulty_proportions?.easy > 0 ? "easy" : "medium" : "medium",
 prompt: "Jika $f(x) = x^2 - 3x$, tentukan nilai dari $f'(2)$ menggunakan limit fungsi turunan.",
 options: [
 "$1$ (Benar secara aljabar)",
 "$-1$ (Hasil kalkulasi salah tanda)",
 "$0$",
 "$2$"
 ],
 correctIndices: [0],
 explanation: "Menggunakan definisi turunan $f'(x) = 2x - 3$. Dengan mensubstitusi $x = 2$, diperoleh $f'(2) = 2(2) - 3 = 1$."
 }
 ],
 studentAnswers: {
 "qbank_98c19920-f11a-4d7a": [0]
 },
 grades: {
 "qbank_98c19920-f11a-4d7a": {
 isCorrect: true,
 score: 1.0,
 gradedAt: new Date().toISOString()
 }
 }
 }, null, 2)}</pre>
 </div>

 <div className="flex gap-2 p-3 bg-primary/5 rounded-lg border border-primary/10 text-body-xs text-muted-foreground leading-relaxed">
 <BookOpen className="size-4 shrink-0 text-primary mt-0.5" />
 <span>Snapshot di atas disimpan pada kolom <code>student_quiz_attempts.questions_snapshot</code> menggunakan struktur JSONB relasional PostgreSQL, menjamin audit mutu ujian tetap konsisten selamanya.</span>
 </div>
 </div>

 <DialogFooter className="mt-5 flex items-center justify-end">
 <Button className="rounded-lg font-bold" onClick={() => setAuditingTemplate(null)}>
 Tutup Auditor
 </Button>
 </DialogFooter>
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
 </div>
 );
}
