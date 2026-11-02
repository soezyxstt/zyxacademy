"use client";

import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BookText,
  Trash2,
  Download,
  RefreshCw,
  Layers,
  Sliders,
  Calendar,
  Compass
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { AdminSectionTitle } from "@/components/admin/section-title";
import { CourseBadge, StatusBadge } from "@/components/admin/status-badges";
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
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

      {/* LEFT: COMPILER FORM */}
      <div className="lg:col-span-1 bg-card border border-border rounded-xl p-4 text-left h-fit space-y-4">
        <AdminSectionTitle size="lg" border icon={Sliders} title="Konfigurasi Diktat" />

        {/* Course Target Select */}
        <div className="space-y-1.5">
          <label htmlFor="diktat-course" className="text-body-sm font-semibold">Mata kuliah</label>
          <Select value={selectedCourseId} onValueChange={(val) => {
            setSelectedCourseId(val);
            setSelectedChapters(new Set()); // Reset selected chapters when course shifts
          }}>
            <SelectTrigger id="diktat-course" className="h-10 border-border/80 bg-background/50 text-body-sm font-medium">
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
          <label htmlFor="diktat-title" className="text-body-sm font-semibold">Judul diktat (opsional)</label>
          <Input
            id="diktat-title"
            type="text"
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
            placeholder="Contoh: Diktat Mandiri Kalkulus IA"
            className="h-10 border-border/80 bg-background/50 text-body-sm font-medium"
          />
        </div>

        {/* Cover Page Configurator */}
        <div className="space-y-1.5">
          <p id="diktat-cover-label" className="text-body-sm font-semibold">Sampul</p>
          <div role="group" aria-labelledby="diktat-cover-label" className="grid grid-cols-2 gap-3">
            <Button variant="outline"
              type="button"
              aria-pressed={coverStyle === "academic"}
              onClick={() => setCoverStyle("academic")}
              className={cn(
                "p-3 rounded-lg border text-body-sm font-semibold text-center transition-all",
                coverStyle === "academic"
                  ? "bg-primary/5 border-primary text-primary"
                  : "border-border text-muted-foreground hover:bg-muted/50"
              )}
            >
              Formal
            </Button>
            <Button variant="outline"
              type="button"
              aria-pressed={coverStyle === "modern"}
              onClick={() => setCoverStyle("modern")}
              className={cn(
                "p-3 rounded-lg border text-body-sm font-semibold text-center transition-all",
                coverStyle === "modern"
                  ? "bg-primary/5 border-primary text-primary"
                  : "border-border text-muted-foreground hover:bg-muted/50"
              )}
            >
              Modern
            </Button>
          </div>
        </div>

        {/* Chapter Checklist */}
        <div className="space-y-2 border-t border-border pt-4">
          <div className="flex items-center justify-between text-body-sm font-semibold">
            <span>Bab ({courseChapters.length})</span>
            {courseChapters.length > 0 && (
              <Button variant="outline"
                type="button"
                onClick={handleSelectAllChapters}
                className="text-body-sm text-primary hover:underline lowercase font-sans font-bold"
              >
                {selectedChapters.size === courseChapters.length ? "Batalkan semua" : "Pilih semua"}
              </Button>
            )}
          </div>

          {courseChapters.length === 0 ? (
            <p className="text-body-xs text-muted-foreground py-4 italic">Belum ada bab yang dibuat untuk kelas ini.</p>
          ) : (
            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {courseChapters.map((chapter) => (
                <label
                  key={chapter.id}
                  className="flex items-center gap-3 py-2 border-b border-border last:border-0 hover:bg-muted/20 cursor-pointer transition-colors"
                >
                  <Checkbox
                    checked={selectedChapters.has(chapter.id)}
                    onCheckedChange={() => handleToggleChapter(chapter.id)}
                    aria-label={`Pilih bab ${chapter.orderIndex}`}
                  />
                  <div className="text-body-xs text-left min-w-0">
                    <span className="font-mono text-muted-foreground uppercase font-bold block text-body-xs mb-0.5">
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
          disabled={selectedChapters.size === 0}
          isLoading={isCompiling}
          className="w-full rounded-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-2 mt-2 cursor-pointer shadow-sm"
          onClick={handleStartCompilation}
        >
          <RefreshCw className="size-4" />
          Kompilasi Diktat Sekarang
        </Button>
      </div>

      {/* RIGHT: ACTIVE DIKTATS LIST */}
      <div className="lg:col-span-2 space-y-4 text-left">
        <div className="space-y-3">
        <AdminSectionTitle size="lg" border icon={BookText} title={`Daftar Diktat Terkompilasi (${diktatsList.length})`} />

          {diktatsList.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-body-sm border border-dashed border-border rounded-xl bg-muted/5 flex flex-col items-center justify-center">
              <Compass className="size-8 text-muted-foreground/60 mb-2" />
              <p className="font-semibold">Belum Ada Diktat Buku</p>
              <p className="text-body-xs mt-0.5 max-w-xs leading-normal">
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
                  <div key={diktat.id} className="p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3 hover:bg-muted/10 transition-colors">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CourseBadge>{courseMap[diktat.courseId] ?? diktat.courseId}</CourseBadge>

                        {/* Status Badge */}
                        <StatusBadge
                          tone={status === "ready" ? "success" : status === "generating" ? "warning" : status === "failed" ? "error" : "muted"}
                          className={status === "generating" ? "animate-pulse" : undefined}
                        >
                          {status === "generating" ? "Compiling" : status}
                        </StatusBadge>
                      </div>

                      <h3 className="font-heading text-body-base font-bold text-foreground leading-snug">
                        {diktat.title}
                      </h3>

                      <p className="text-body-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                        <Layers className="size-3.5" />
                        <span><span className="font-semibold text-foreground">{chapterIdsArray.length} bab</span></span>
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
                            className="rounded-lg text-body-sm font-semibold gap-1.5 h-9 bg-background/50 hover:bg-muted"
                          >
                            <Download className="size-3.5" />
                            Unduh PDF
                          </Button>
                        </a>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          isLoading={true}
                          className="rounded-lg text-body-sm font-semibold gap-1.5 h-9"
                        >
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
      <AdminConfirmDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title="Hapus Diktat Terkompilasi?"
        description={`Tindakan ini akan menghapus diktat buku "${deletingDiktat?.title}" secara permanen dari basis data dan menghapus berkas fisiknya dari UploadThing CDN. Siswa tidak akan dapat mengunduh berkas ini lagi.`}
        confirmLabel="Ya, Hapus Permanen"
        loading={loadingDiktatId !== null}
        onConfirm={handleDeleteConfirm}
      />

    </div>
  );
}
