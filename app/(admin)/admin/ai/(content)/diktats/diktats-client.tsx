"use client";

import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  BookText, 
  Trash2, 
  Download, 
  RefreshCw, 
  Loader2, 
  Layers, 
  ShieldAlert,
  Sliders,
  Calendar,
  Compass
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  createDiktatDraftAction,
  compileDiktatAction,
  deleteDiktatAction
} from "./actions";

interface Diktat {
  id: string;
  courseId: string;
  sourceMtdId: string;
  sourceMtdVersion: number;
  isStale: boolean;
  generationHash: string;
  title: string;
  chapterIds: unknown;
  fileUrl: string | null;
  status: string; // 'draft', 'generating', 'ready', 'failed'
  createdAt: string;
  updatedAt: string;
  settings: unknown;
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
  status: string;
}

interface Props {
  initialDiktats: Diktat[];
  courses: Course[];
  chapters: Chapter[];
  courseMap: Record<string, string>;
}

export function DiktatCompilerClient({
  initialDiktats,
  courses,
  chapters,
  courseMap
}: Props) {
  const [diktatsList, setDiktatsList] = useState<Diktat[]>(initialDiktats);
  
  // Compilation Form States
  const [selectedCourseId, setSelectedCourseId] = useState(courses[0]?.id || "");
  const [customTitle, setCustomTitle] = useState("");
  const [selectedChapters, setSelectedChapters] = useState<Set<string>>(new Set());
  const [coverStyle, setCoverStyle] = useState<"academic" | "modern">("academic");
  
  // App UI Loading States
  const [isCompiling, setIsCompiling] = useState(false);
  const [loadingDiktatId, setLoadingDiktatId] = useState<string | null>(null);

  // Deletion Dialog States
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingDiktat, setDeletingDiktat] = useState<Diktat | null>(null);

  // Filter chapters based on selected course
  const courseChapters = useMemo(() => {
    return chapters.filter(c => c.courseId === selectedCourseId);
  }, [chapters, selectedCourseId]);

  // Auto-generate title based on selected course and chapters
  useEffect(() => {
    if (selectedChapters.size === 0) {
      setCustomTitle("");
      return;
    }

    const course = courses.find((c) => c.id === selectedCourseId);
    if (!course) return;

    const selectedChapsList = courseChapters
      .filter((c) => selectedChapters.has(c.id))
      .sort((a, b) => a.orderIndex - b.orderIndex);

    if (selectedChapsList.length === 1) {
      const chap = selectedChapsList[0];
      setCustomTitle(`Diktat ${course.title} Bab ${chap.orderIndex} ${chap.title}`);
    } else if (selectedChapsList.length > 1) {
      const indices = selectedChapsList.map((c) => c.orderIndex).join(", ");
      setCustomTitle(`Diktat ${course.title} Bab ${indices}`);
    } else {
      setCustomTitle("");
    }
  }, [selectedChapters, selectedCourseId, courseChapters, courses]);

  // Handle chapter checkbox toggling
  const handleToggleChapter = (chapterId: string) => {
    setSelectedChapters(prev => {
      const next = new Set(prev);
      if (next.has(chapterId)) {
        next.delete(chapterId);
      } else {
        next.add(chapterId);
      }
      return next;
    });
  };

  const handleSelectAllChapters = () => {
    if (selectedChapters.size === courseChapters.length) {
      setSelectedChapters(new Set());
    } else {
      setSelectedChapters(new Set(courseChapters.map(c => c.id)));
    }
  };

  // Compile Trigger Action
  const handleStartCompilation = async () => {
    if (selectedChapters.size === 0) {
      toast.error("Silakan pilih minimal satu bab untuk dikompilasi.");
      return;
    }

    setIsCompiling(true);
    const chapterIdsArray = Array.from(selectedChapters);
    
    toast.info("Memulai kompilasi PDF. Proses Puppeteer sedang berlangsung...");

    try {
      const res = await createDiktatDraftAction(selectedCourseId, chapterIdsArray);
      if (res.success) {
        toast.success("Diktat berhasil dikompilasi!");
        
        // Construct a mock UI record representing the ready state
        const newDiktat: Diktat = {
          id: res.diktatId!,
          courseId: selectedCourseId,
          sourceMtdId: "mtd-linked",
          sourceMtdVersion: 1,
          isStale: false,
          generationHash: "gen-hash-" + Date.now(),
          title: customTitle.trim() || `Diktat ${courseMap[selectedCourseId]} - ${chapterIdsArray.length} Bab`,
          chapterIds: chapterIdsArray,
          fileUrl: res.url || null,
          status: res.warning ? "failed" : "ready",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          settings: {}
        };
        
        if (res.warning) {
          toast.warning(`Peringatan: ${res.warning}`);
        }
        
        setDiktatsList(prev => [newDiktat, ...prev]);
        
        // Reset fields
        setCustomTitle("");
        setSelectedChapters(new Set());
      } else {
        toast.error(`Kompilasi Gagal: ${res.error}`);
      }
    } catch {
      toast.error("Terjadi kesalahan jaringan.");
    } finally {
      setIsCompiling(false);
    }
  };

  const handleRegenerateDiktat = async (diktatId: string) => {
    setLoadingDiktatId(diktatId);
    toast.info("Mengompilasi ulang PDF diktat...");
    
    try {
      const res = await compileDiktatAction(diktatId);
      if (res.success) {
        toast.success("PDF Diktat berhasil diperbarui!");
        setDiktatsList(prev => prev.map(d => d.id === diktatId ? { ...d, fileUrl: res.url || null, status: "ready", updatedAt: new Date().toISOString() } : d));
      } else {
        toast.error(`Gagal kompilasi ulang: ${res.error}`);
        setDiktatsList(prev => prev.map(d => d.id === diktatId ? { ...d, status: "failed", updatedAt: new Date().toISOString() } : d));
      }
    } catch {
      toast.error("Terjadi kesalahan jaringan.");
    } finally {
      setLoadingDiktatId(null);
    }
  };

  const handleDeleteStart = (diktat: Diktat) => {
    setDeletingDiktat(diktat);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingDiktat) return;
    setLoadingDiktatId(deletingDiktat.id);
    
    try {
      const res = await deleteDiktatAction(deletingDiktat.id);
      if (res.success) {
        toast.success("Diktat berhasil dihapus.");
        setDiktatsList(prev => prev.filter(d => d.id !== deletingDiktat.id));
        setIsDeleteDialogOpen(false);
      } else {
        toast.error(`Gagal menghapus diktat: ${res.error}`);
      }
    } catch {
      toast.error("Terjadi kesalahan jaringan.");
    } finally {
      setLoadingDiktatId(null);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      {/* LEFT: COMPILER FORM */}
      <div className="lg:col-span-1 bg-card border border-border rounded-xl p-6 shadow-xs text-left h-fit space-y-5">
        <h2 className="font-heading text-body-lg font-bold text-foreground flex items-center gap-2 border-b border-border pb-3">
          <Sliders className="size-5 text-primary" />
          Konfigurasi Diktat
        </h2>

        {/* Course Target Select */}
        <div className="space-y-1.5">
          <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Mata Kuliah</label>
          <Select value={selectedCourseId} onValueChange={(val) => {
            setSelectedCourseId(val);
            setSelectedChapters(new Set()); // Reset selected chapters when course shifts
          }}>
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

        {/* Custom Title Input */}
        <div className="space-y-1.5">
          <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Judul Diktat Kustom (Opsional)</label>
          <Input
            type="text"
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
            placeholder="Contoh: Diktat Mandiri Kalkulus IA"
            className="h-10 border-border/80 bg-background/50 text-body-sm font-medium"
          />
        </div>

        {/* Cover Page Configurator */}
        <div className="space-y-1.5">
          <label className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Desain Sampul (Cover Page)</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setCoverStyle("academic")}
              className={cn(
                "p-3 rounded-lg border text-xs font-semibold text-center transition-all",
                coverStyle === "academic"
                  ? "bg-primary/5 border-primary text-primary"
                  : "border-border text-muted-foreground hover:bg-muted/50"
              )}
            >
              Academic (Formal)
            </button>
            <button
              type="button"
              onClick={() => setCoverStyle("modern")}
              className={cn(
                "p-3 rounded-lg border text-xs font-semibold text-center transition-all",
                coverStyle === "modern"
                  ? "bg-primary/5 border-primary text-primary"
                  : "border-border text-muted-foreground hover:bg-muted/50"
              )}
            >
              Modern (Sleek)
            </button>
          </div>
        </div>

        {/* Chapter Checklist */}
        <div className="space-y-2 border-t border-border pt-4">
          <div className="flex items-center justify-between text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Daftar Bab Tersedia ({courseChapters.length})</span>
            {courseChapters.length > 0 && (
              <button
                type="button"
                onClick={handleSelectAllChapters}
                className="text-xs text-primary hover:underline lowercase font-sans font-bold"
              >
                {selectedChapters.size === courseChapters.length ? "uncheck all" : "check all"}
              </button>
            )}
          </div>

          {courseChapters.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 italic">Belum ada bab yang dibuat untuk kelas ini.</p>
          ) : (
            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {courseChapters.map((chapter) => (
                <label 
                  key={chapter.id}
                  className="flex items-center gap-3 p-2.5 rounded-lg border border-border hover:bg-muted/20 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedChapters.has(chapter.id)}
                    onChange={() => handleToggleChapter(chapter.id)}
                    className="size-4 rounded border-border text-primary focus:ring-primary accent-primary cursor-pointer"
                  />
                  <div className="text-xs text-left min-w-0">
                    <span className="font-mono text-muted-foreground uppercase font-bold block text-xs mb-0.5">
                      Bab {chapter.orderIndex}
                    </span>
                    <span className="font-semibold text-foreground truncate block">
                      {chapter.title}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Trigger compile button */}
        <Button
          type="button"
          disabled={isCompiling || selectedChapters.size === 0}
          className="w-full rounded-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-2 mt-2 cursor-pointer shadow-sm"
          onClick={handleStartCompilation}
        >
          {isCompiling ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Mengompilasi PDF...
            </>
          ) : (
            <>
              <RefreshCw className="size-4" />
              Kompilasi Diktat Sekarang
            </>
          )}
        </Button>
      </div>

      {/* RIGHT: ACTIVE DIKTATS LIST */}
      <div className="lg:col-span-2 space-y-4 text-left">
        <div className="bg-card border border-border rounded-xl p-6 shadow-xs space-y-4">
          <h2 className="font-heading text-body-lg font-bold text-foreground flex items-center gap-2 border-b border-border pb-3">
            <BookText className="size-5 text-primary" />
            Daftar Diktat Terkompilasi ({diktatsList.length})
          </h2>

          {diktatsList.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-body-sm border border-dashed border-border rounded-xl bg-muted/5 flex flex-col items-center justify-center">
              <Compass className="size-8 text-muted-foreground/60 mb-2" />
              <p className="font-semibold">Belum Ada Diktat Buku</p>
              <p className="text-xs mt-0.5 max-w-xs leading-normal">
                Pilih bab-bab materi di menu samping lalu tekan tombol kompilasi untuk merakit buku diktat belajar.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border border border-border rounded-xl overflow-hidden bg-card">
              {diktatsList.map((diktat) => {
                const chapterIdsArray = Array.isArray(diktat.chapterIds) ? (diktat.chapterIds as string[]) : [];
                const status = diktat.status;
                const isReady = status === "ready";

                return (
                  <div key={diktat.id} className="p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4 hover:bg-muted/10 transition-colors">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-brand-primary uppercase tracking-wider bg-brand-primary/8 px-2 py-0.5 rounded-md border border-brand-primary/10">
                          {courseMap[diktat.courseId] ?? diktat.courseId}
                        </span>
                        
                        {/* Status Badge */}
                        <span className={cn(
                          "rounded-md px-2 py-0.5 text-xs font-semibold border uppercase tracking-wider",
                          status === "ready"
                            ? "bg-status-success/10 text-status-success border-status-success/20"
                            : status === "generating"
                              ? "bg-status-warning/10 text-status-warning border-status-warning/20 animate-pulse"
                              : status === "failed"
                                ? "bg-status-error/10 text-status-error border-status-error/20"
                                : "bg-muted text-muted-foreground border-border"
                        )}>
                          {status === "generating" ? "Compiling..." : status}
                        </span>
                      </div>

                      <h3 className="font-heading text-body-md font-bold text-foreground leading-snug">
                        {diktat.title}
                      </h3>

                      <p className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                        <Layers className="size-3.5" />
                        <span>Kompilasi dari <span className="font-semibold text-foreground">{chapterIdsArray.length} Bab</span></span>
                        <span>·</span>
                        <Calendar className="size-3.5" />
                        <span>Dibuat {new Date(diktat.createdAt).toLocaleDateString("id-ID", { dateStyle: "medium" })}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isReady && diktat.fileUrl ? (
                        <a 
                          href={diktat.fileUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                        >
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-lg text-xs font-semibold gap-1.5 h-9 bg-background/50 hover:bg-muted"
                          >
                            <Download className="size-3.5" />
                            Unduh PDF
                          </Button>
                        </a>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled
                          className="rounded-lg text-xs font-semibold gap-1.5 h-9"
                        >
                          <Loader2 className="size-3.5 animate-spin" />
                          Proses Compiler
                        </Button>
                      )}

                      <Button
                        variant="outline"
                        size="icon-sm"
                        disabled={loadingDiktatId === diktat.id}
                        className="rounded-lg h-9 w-9 p-0 hover:bg-muted"
                        onClick={() => handleRegenerateDiktat(diktat.id)}
                        title="Kompilasi Ulang Diktat"
                      >
                        <RefreshCw className={cn("size-3.5", loadingDiktatId === diktat.id && "animate-spin")} />
                      </Button>

                      <Button
                        variant="destructive"
                        size="icon-sm"
                        disabled={loadingDiktatId === diktat.id}
                        className="rounded-lg h-9 w-9 p-0 transition-colors"
                        onClick={() => handleDeleteStart(diktat)}
                        title="Hapus Diktat"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* CONFIRM DELETION DIALOG */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="max-w-md rounded-xl border border-border p-6 shadow-lg text-left">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-status-error font-heading text-h6 font-bold">
              <ShieldAlert className="size-5 shrink-0" />
              Hapus Diktat Terkompilasi?
            </DialogTitle>
            <DialogDescription className="text-body-sm text-muted-foreground mt-2 leading-relaxed">
              Tindakan ini akan menghapus diktat buku &ldquo;{deletingDiktat?.title}&rdquo; secara permanen dari basis data dan menghapus berkas fisiknya dari UploadThing CDN. Siswa tidak akan dapat mengunduh berkas ini lagi.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-5 flex items-center justify-end gap-2.5">
            <Button variant="outline" className="rounded-lg cursor-pointer font-bold" onClick={() => setIsDeleteDialogOpen(false)} disabled={loadingDiktatId !== null}>
              Batal
            </Button>
            <Button variant="destructive" className="rounded-lg cursor-pointer font-bold px-6 shadow-sm" onClick={handleDeleteConfirm} disabled={loadingDiktatId !== null}>
              Ya, Hapus Permanen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
