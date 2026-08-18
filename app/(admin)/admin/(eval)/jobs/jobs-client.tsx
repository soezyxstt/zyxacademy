"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Zap, RefreshCw } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { StatusBadge } from "@/components/admin/status-badges";
import { AdminSectionTitle } from "@/components/admin/section-title";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type JobStatus = "pending" | "processing" | "completed" | "failed";

interface Job {
 id: string;
 courseId: string;
 tutorId: string;
 status: JobStatus;
 promptParameters: unknown;
 targetCount: number;
 generatedCount: number;
 tokenUsage: number;
 errorMessage: string | null;
 createdAt: Date;
 updatedAt: Date;
}

interface Course {
 id: string;
 title: string;
}

interface Chapter {
 id: string;
 courseId: string;
 title: string;
 orderIndex: number;
}

interface KnowledgeObject {
 id: string;
 courseId: string;
 chapterId: string;
 title: string;
 conceptName: string;
}

interface Props {
 jobs: Job[];
 courses: Course[];
 chapters: Chapter[];
 knowledgeObjects: KnowledgeObject[];
 courseMap: Record<string, string>;
}

const statusTone: Record<JobStatus, "muted" | "info" | "success" | "error"> = {
  pending: "muted",
  processing: "info",
  completed: "success",
  failed: "error",
};

export function GenerationJobsClient({ jobs, courses, chapters, knowledgeObjects, courseMap }: Props) {
 const [showForm, setShowForm] = useState(false);
 const [submitting, setSubmitting] = useState(false);
 const [localJobs, setLocalJobs] = useState(jobs);
 const [form, setForm] = useState({
 courseId: "",
 chapterId: "",
 koId: "all",
 });

 const filteredChapters = chapters.filter((c) => c.courseId === form.courseId);
 const filteredKOs = knowledgeObjects.filter((k) => k.chapterId === form.chapterId);

 async function handleCreate(e: React.FormEvent) {
 e.preventDefault();
 if (!form.courseId || !form.chapterId) {
 toast.error("Kursus dan bab wajib diisi.");
 return;
 }
 setSubmitting(true);
 try {
 const res = await fetch("/api/admin/generation-jobs", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(form),
 });
 const data = await res.json();
 if (!res.ok) {
 toast.error("Gagal membuat job: " + (data.error ?? "Unknown error"));
 return;
 }
 
 const targetCount = data.targetCount ?? (form.koId === "all" ? filteredKOs.length : 1);
 toast.success(`Job berhasil dibuat: ${data.jobId}. Pipeline berjalan di background.`);
 setShowForm(false);
 
 // Optimistically add job to list
 setLocalJobs((prev) => [
 {
 id: data.jobId,
 courseId: form.courseId,
 tutorId: "",
 status: "pending" as JobStatus,
 promptParameters: { 
 chapterId: form.chapterId, 
 koId: form.koId,
 logs: [`[${new Date().toLocaleString("id-ID")}] Job dibuat.`] 
 },
 targetCount,
 generatedCount: 0,
 tokenUsage: 0,
 errorMessage: null,
 createdAt: new Date(),
 updatedAt: new Date(),
 },
 ...prev,
 ]);
  } catch {
 toast.error("Terjadi kesalahan jaringan.");
 } finally {
 setSubmitting(false);
 }
 }

 async function refreshJob(jobId: string) {
 const res = await fetch(`/api/admin/generation-jobs/${jobId}`);
 if (!res.ok) return;
 const updated = await res.json();
 setLocalJobs((prev) => prev.map((j) => (j.id === jobId ? updated : j)));
 }

 // Auto-poll any in-flight job so status/logs update live without a manual click.
 const activeIds = localJobs
 .filter((j) => j.status === "pending" || j.status === "processing")
 .map((j) => j.id);
 const activeKey = activeIds.join(",");
 const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

 useEffect(() => {
 if (activeIds.length === 0) {
 if (pollRef.current) {
 clearInterval(pollRef.current);
 pollRef.current = null;
 }
 return;
 }
 const interval = setInterval(() => {
 activeKey.split(",").forEach((id) => {
 if (id) refreshJob(id);
 });
 }, 3000);
 pollRef.current = interval;
 return () => clearInterval(interval);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [activeKey]);

 return (
 <div>
 <div className="flex items-center justify-between mb-6">
 <p className="text-body-sm text-muted-foreground">{localJobs.length} job terbaru</p>
 <Button
 className="rounded-lg gap-2"
 onClick={() => setShowForm((v) => !v)}
 variant={showForm ? "outline" : "default"}
 >
 <Plus className="size-4" />
 {showForm ? "Tutup" : "Buat Job Baru"}
 </Button>
 </div>

 {showForm && (
 <form
 onSubmit={handleCreate}
 className="mb-8 rounded-xl border border-border bg-card p-6 shadow-sm space-y-4"
 >
  <AdminSectionTitle size="h6" icon={Zap} iconClassName="text-status-warning" title="Buat Generation Job" />

  <div className="grid gap-4 sm:grid-cols-2">
  <div>
  <label className="text-body-sm font-medium text-foreground mb-1 block">Kursus</label>
  <Select
    value={form.courseId}
    onValueChange={(courseId) => {
      setForm({ courseId, chapterId: "", koId: "all" });
    }}
  >
    <SelectTrigger className="w-full">
      <SelectValue placeholder="Pilih kursus..." />
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

  <div>
  <label className="text-body-sm font-medium text-foreground mb-1 block">Bab (Chapter)</label>
  <Select
    value={form.chapterId}
    onValueChange={(chapterId) => {
      setForm((f) => ({ ...f, chapterId, koId: "all" }));
    }}
    disabled={!form.courseId}
  >
    <SelectTrigger className="w-full">
      <SelectValue placeholder="Pilih bab..." />
    </SelectTrigger>
    <SelectContent>
      {filteredChapters.map((c) => (
        <SelectItem key={c.id} value={c.id}>
          Bab {c.orderIndex}: {c.title}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
  </div>
  </div>

  <div>
  <label className="text-body-sm font-medium text-foreground mb-1 block">Objek Pengetahuan (KO)</label>
  <Select
    value={form.koId}
    onValueChange={(koId) => setForm((f) => ({ ...f, koId }))}
    disabled={!form.chapterId}
  >
    <SelectTrigger className="w-full">
      <SelectValue placeholder="Semua Objek Pengetahuan (Generate Massal)" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="all">Semua Objek Pengetahuan (Generate Massal)</SelectItem>
      {filteredKOs.map((k) => (
        <SelectItem key={k.id} value={k.id}>
          [{k.conceptName}] {k.title}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
  </div>

 {form.chapterId && (
 <p className="text-xs text-muted-foreground">
 {form.koId === "all"
 ? `Menargetkan generasi kuis untuk ${filteredKOs.length} Objek Pengetahuan aktif dalam bab ini.`
 : "Menargetkan generasi kuis untuk 1 Objek Pengetahuan terpilih."}
 </p>
 )}

 <div className="flex gap-3 pt-2">
 <Button type="submit" className="rounded-lg" disabled={submitting}>
 {submitting ? "Mengirim..." : "Jalankan Pipeline"}
 </Button>
 <Button
 type="button"
 variant="outline"
 className="rounded-lg"
 onClick={() => setShowForm(false)}
 >
 Batal
 </Button>
 </div>
 </form>
 )}

 {localJobs.length === 0 ? (
 <AdminEmptyState compact className="py-16" title="Belum ada generation job." />
 ) : (
 <div className="divide-y divide-border">
 {localJobs.map((job) => {
 const params = job.promptParameters as Record<string, any> || {};
 const chapter = chapters.find((c) => c.id === params.chapterId);
 const chapterDisplay = chapter ? `Bab ${chapter.orderIndex}: ${chapter.title}` : params.chapterId || "";
 const koTitle = params.koId && params.koId !== "all"
 ? knowledgeObjects.find((k) => k.id === params.koId)?.title || params.koId
 : "Semua Objek Pengetahuan";

 return (
 <div key={job.id} className="py-4 flex items-start gap-4">
 <Zap className="size-5 text-status-warning mt-0.5 shrink-0" />
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 flex-wrap">
 <span className="font-medium text-foreground text-body-sm">
 {chapterDisplay}
 </span>
 <span className="text-muted-foreground text-body-sm">·</span>
 <span className="text-body-sm text-foreground">
 {koTitle}
 </span>
 <span className="text-muted-foreground text-body-sm">·</span>
 <span className="text-body-sm text-muted-foreground">
 {courseMap[job.courseId] ?? job.courseId}
 </span>
 <StatusBadge tone={statusTone[job.status]}>{job.status}</StatusBadge>
 </div>
 <p className="text-body-sm text-muted-foreground mt-1">
 {job.generatedCount}/{job.targetCount} soal ·{" "}
 {new Date(job.createdAt).toLocaleString("id-ID")}
 </p>
 {params?.logs && Array.isArray(params.logs) && params.logs.length > 0 && (
 <div className="mt-2.5 rounded-lg border border-border bg-muted/20 p-3 text-xs font-mono space-y-1 text-muted-foreground max-h-36 overflow-y-auto">
 <p className="font-sans font-bold text-[10px] text-muted-foreground/80 tracking-wider uppercase mb-1">PROGRES DETAIL:</p>
 {params.logs.map((log: string, idx: number) => (
 <div key={idx} className="leading-relaxed">
 {log}
 </div>
 ))}
 </div>
 )}
 {job.errorMessage && (
 <p className="text-body-sm text-status-error mt-1.5 font-medium">
 Detail Error: {job.errorMessage}
 </p>
 )}
 </div>
 {(job.status === "pending" || job.status === "processing") && (
 <button
 onClick={() => refreshJob(job.id)}
 className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
 aria-label="Refresh status"
 >
 <RefreshCw className="size-4" />
 </button>
 )}
 </div>
 );
 })}
 </div>
 )}
 </div>
 );
}

