"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DifficultyBadge } from "@/components/admin/status-badges";
import { AdminPageHeader } from "@/components/admin/page-header";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  RefreshCw,
  Trash2,
  Archive,
  BookOpen,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lightbulb,
  Layers,
  FileQuestion,
  Tag,
  Hash,
} from "lucide-react";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { MathText } from "@/components/course/math-text";
import { parseFrontmatter } from "@/lib/assessment-frontmatter";

interface Source {
  id: string;
  title: string;
  courseId: string;
  origin: "uploaded" | "generated";
  category: "tutorial" | "quiz" | "uts" | "uas" | "tryout";
  year: number;
  semester: number | null;
  sourceMarkdown: string;
  sourceHash: string;
  version: number;
  parserVersion: string;
  ingestionStatus: "pending" | "processing" | "completed" | "failed";
  ingestionError: string | null;
  originalFilename: string | null;
  uploadedByUserId: string;
  deletedAt: Date | null;
  createdAt: Date;
}

interface Course {
  id: string;
  title: string;
}

interface Question {
  id: string;
  questionOrder: number;
  sourceQuestionNumber: string | null;
  questionType: string;
  difficulty: number;
  applicationLevel: number;
  pattern: string;
  reasoningType: string;
  estimatedSteps: number;
  questionMarkdown: string;
  answerMarkdown: string | null;
  options: string[] | null;
  canonicalQuestionHash: string;
}

interface ConceptMapping {
  assessmentObjectId: string;
  conceptId: string;
  displayName: string;
}

interface ResolvedChapter {
  id: string;
  title: string;
}

interface Props {
  source: Source;
  course: Course;
  questions: Question[];
  conceptMappings: ConceptMapping[];
  resolvedChapters: ResolvedChapter[];
}

export function AssessmentDetailClient({
  source,
  course,
  questions,
  conceptMappings,
  resolvedChapters,
}: Props) {
  const router = useRouter();
  const [reingesting, setReingesting] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/assessments/${source.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Dokumen sumber berhasil dihapus");
        router.push("/admin/assessments");
      } else {
        const err = await res.json();
        toast.error("Gagal menghapus: " + (err.error ?? "Unknown error"));
      }
    } catch {
      toast.error("Terjadi kesalahan jaringan.");
    } finally {
      setDeleting(false);
    }
  };

  // Group concepts by question ID
  const questionConcepts = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const mapping of conceptMappings) {
      if (!map[mapping.assessmentObjectId]) {
        map[mapping.assessmentObjectId] = [];
      }
      map[mapping.assessmentObjectId].push(mapping.displayName);
    }
    return map;
  }, [conceptMappings]);

  // Diagnostics warnings: compare frontmatter chapters with resolved ones
  const diagnostics = useMemo(() => {
    const { frontmatter } = parseFrontmatter(source.sourceMarkdown);
    const expectedChapters = frontmatter.chapters || [];
    const resolvedTitles = new Set(resolvedChapters.map((c) => c.title.toLowerCase().trim()));

    const warnings: string[] = [];
    for (const chapName of expectedChapters) {
      if (!resolvedTitles.has(chapName.toLowerCase().trim())) {
        warnings.push(`Bab "${chapName}" terdaftar di frontmatter tetapi tidak ditemukan/gagal di-resolve di database.`);
      }
    }
    return warnings;
  }, [source.sourceMarkdown, resolvedChapters]);

  // Trigger Re-Ingest Action
  const handleReIngest = async () => {
    setReingesting(true);
    try {
      const res = await fetch(`/api/admin/assessments/${source.id}/re-ingest`, {
        method: "POST",
      });

      if (!res.ok) {
        throw new Error("Gagal memicu ingesti ulang.");
      }

      toast.success("Ingesti ulang berhasil dipicu. Klasifikasi berjalan di latar belakang.");
      router.refresh();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Gagal memproses re-ingest.");
    } finally {
      setReingesting(false);
    }
  };

  // Archive / Restore Action
  const handleArchiveToggle = async () => {
    setArchiving(true);
    const action = source.deletedAt ? "restore" : "archive";
    try {
      const res = await fetch(`/api/admin/assessments/${source.id}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) {
        throw new Error(`Gagal melakukan aksi ${action}.`);
      }

      toast.success(action === "archive" ? "Dokumen berhasil diarsipkan." : "Dokumen berhasil dipulihkan.");
      router.refresh();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Gagal mengubah status arsip.");
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={BookOpen}
        title={source.title}
        description={<>Mata kuliah: <span className="font-semibold text-foreground">{course.title}</span></>}
        backHref="/admin/assessments"
        backLabel="Kembali ke Daftar Asesmen"
        actions={
          <>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReIngest}
            disabled={reingesting || source.ingestionStatus === "processing"}
            className="flex items-center gap-1.5"
          >
            <RefreshCw size={14} className={reingesting ? "animate-spin" : ""} />
            Re-Ingest Soal
          </Button>

          <Button
            variant={source.deletedAt ? "default" : "destructive"}
            size="sm"
            onClick={handleArchiveToggle}
            disabled={archiving}
            className="flex items-center gap-1.5"
          >
            <Archive size={14} />
            {source.deletedAt ? "Pulihkan Ujian" : "Arsipkan Ujian"}
          </Button>

          <Button
            variant="destructive"
            size="sm"
            onClick={() => setIsDeleteDialogOpen(true)}
            disabled={reingesting || archiving}
            className="flex items-center gap-1.5"
          >
            <Trash2 size={14} />
            Hapus Permanen
          </Button>
          </>
        }
      />

      {/* Hero Metadata Panel */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2 pt-1">
              {source.deletedAt && (
                <Badge variant="outline" className="border-status-error/30 bg-status-error/5 text-[10px] uppercase tracking-wide text-status-error">
                  Archived
                </Badge>
              )}
              <Badge variant="outline" className="uppercase text-[10px] tracking-wider font-semibold">
                Kategori: {source.category}
              </Badge>
              <Badge variant="outline" className="text-[10px] tracking-wider font-semibold">
                Tahun: {source.year}
              </Badge>
              {source.semester && (
                <Badge variant="outline" className="text-[10px] tracking-wider font-semibold">
                  Semester: {source.semester}
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px] tracking-wider font-semibold">
                Versi: v{source.version}
              </Badge>
              <Badge variant="outline" className="text-[10px] tracking-wider font-semibold">
                Parser: v{source.parserVersion}
              </Badge>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 text-right">
            <div className="flex items-center gap-2">
              <span className="text-body-sm text-muted-foreground">Status Ingest:</span>
              {source.ingestionStatus === "completed" && (
                <Badge className="bg-status-success/10 text-status-success flex items-center gap-1 border-0">
                  <CheckCircle2 size={12} />
                  Completed
                </Badge>
              )}
              {source.ingestionStatus === "processing" && (
                <Badge className="bg-status-warning/10 text-status-warning flex items-center gap-1 border-0">
                  <Clock className="animate-spin" size={12} />
                  Processing
                </Badge>
              )}
              {source.ingestionStatus === "pending" && (
                <Badge className="bg-muted text-muted-foreground flex items-center gap-1 border-0">
                  <Clock size={12} />
                  Pending
                </Badge>
              )}
              {source.ingestionStatus === "failed" && (
                <Badge className="bg-status-error/10 text-status-error flex items-center gap-1 border-0">
                  <XCircle size={12} />
                  Failed
                </Badge>
              )}
            </div>
            {source.originalFilename && (
              <span className="text-body-xs text-muted-foreground">
                File Asli: <span className="font-semibold">{source.originalFilename}</span>
              </span>
            )}
          </div>
        </div>

        {/* Ingestion error notice */}
        {source.ingestionStatus === "failed" && source.ingestionError && (
          <div className="mt-4 p-4 rounded-lg bg-status-error/10 border border-status-error/20 flex items-start gap-3">
            <AlertTriangle size={18} className="text-status-error mt-0.5" />
            <div>
              <p className="text-body-sm font-semibold text-status-error">Kesalahan Penguraian Ingest:</p>
                    <p className="text-body-sm text-muted-foreground mt-1 font-mono bg-background/50 p-2 rounded">
                {source.ingestionError}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="questions" className="space-y-6">
        <TabsList className="w-full justify-start border-b border-border bg-transparent p-0 rounded-none h-auto">
          <TabsTrigger
            value="questions"
            className="border-b-2 border-transparent px-4 py-2 text-body-sm font-semibold text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none bg-transparent"
          >
            Daftar Soal ({questions.length})
          </TabsTrigger>
          <TabsTrigger
            value="markdown"
            className="border-b-2 border-transparent px-4 py-2 text-body-sm font-semibold text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none bg-transparent"
          >
            Canonical Markdown
          </TabsTrigger>
          <TabsTrigger
            value="chapters"
            className="border-b-2 border-transparent px-4 py-2 text-body-sm font-semibold text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none bg-transparent"
          >
            Bab Terkait ({resolvedChapters.length})
          </TabsTrigger>
          <TabsTrigger
            value="diagnostics"
            className="border-b-2 border-transparent px-4 py-2 text-body-sm font-semibold text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none bg-transparent"
          >
            Diagnostik
            {diagnostics.length > 0 && (
              <Badge variant="outline" className="border-status-error/30 text-status-error bg-status-error/5 ml-1.5 h-4 w-4 p-0 flex items-center justify-center rounded-full text-[10px]">
                {diagnostics.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Tab content: Extracted Questions list */}
        <TabsContent value="questions" className="space-y-4">
          {questions.length === 0 ? (
            <div className="py-12 border border-dashed border-border rounded-xl text-center">
              <FileQuestion className="mx-auto text-muted-foreground/30 mb-2" size={32} />
              <p className="text-body-sm text-muted-foreground">
                Belum ada objek soal yang terekstraksi. Klik <strong>Re-Ingest Soal</strong> untuk memulai.
              </p>
            </div>
          ) : (
            questions.map((q) => (
              <div key={q.id} className="rounded-xl border border-border bg-card p-6 shadow-sm hover:border-border/80 transition-colors duration-150">
                {/* Question Metadata Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="font-heading font-semibold text-body-xs">
                      Soal {q.sourceQuestionNumber || q.questionOrder}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] font-mono select-all flex items-center gap-0.5">
                      <Hash size={10} />
                      {q.canonicalQuestionHash.slice(0, 10)}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px] tracking-wide uppercase">
                      Tipe: {q.questionType.replace("_", " ")}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] tracking-wide uppercase">
                      Pola: {q.pattern.replace("_", " ")}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] tracking-wide uppercase">
                      Bloom: L{q.applicationLevel}
                    </Badge>
                    <DifficultyBadge difficulty={q.difficulty} prefix="Kesulitan" />
                  </div>
                </div>

                {/* Content Area */}
                <div className="space-y-4">
                  <div>
                    <h4 className="text-body-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Pertanyaan</h4>
                    <div className="bg-background/40 p-4 rounded-lg border border-border/50">
                      <MarkdownRenderer content={q.questionMarkdown} className="space-y-3" />
                    </div>
                  </div>

                  {q.options && q.options.length > 0 && (
                    <div>
                      <h4 className="text-body-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Pilihan Jawaban</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {q.options.map((opt, idx) => (
                          <div key={idx} className="bg-background/20 px-3 py-2 rounded border border-border/30 text-body-sm text-foreground flex gap-2">
                            <span className="font-semibold text-primary">{String.fromCharCode(65 + idx)}.</span>
                            <MathText as="span">{opt}</MathText>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {q.answerMarkdown && (
                    <div>
                      <h4 className="text-body-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Lightbulb size={14} className="text-status-warning" />
                        Solusi / Pembahasan
                      </h4>
                      <div className="bg-status-success/5 p-4 rounded-lg border border-status-success/10 text-body-sm text-foreground">
                        <MarkdownRenderer content={q.answerMarkdown} className="space-y-3" />
                      </div>
                    </div>
                  )}

                  {/* Tagged Concepts */}
                  {questionConcepts[q.id] && (
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/40 mt-4">
                      <span className="text-body-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        <Tag size={12} />
                        Konsep Terpaut:
                      </span>
                      {questionConcepts[q.id].map((concept, idx) => (
                        <Badge key={idx} className="bg-primary/10 text-primary hover:bg-primary/20 border-0 font-medium text-body-xs">
                          {concept}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </TabsContent>

        {/* Tab content: Raw Markdown view */}
        <TabsContent value="markdown">
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h3 className="font-heading text-body-base font-semibold mb-4 flex items-center gap-2">
              <FileText size={18} className="text-muted-foreground" />
              Konten Canonical Markdown Asli
            </h3>
            <div className="bg-background border border-border/80 rounded-lg p-4 font-mono text-body-xs overflow-auto max-h-[500px] whitespace-pre-wrap leading-relaxed select-all">
              {source.sourceMarkdown}
            </div>
          </div>
        </TabsContent>

        {/* Tab content: Resolved Chapters */}
        <TabsContent value="chapters">
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h3 className="font-heading text-body-base font-semibold mb-4 flex items-center gap-2">
              <BookOpen size={18} className="text-muted-foreground" />
              Daftar Bab Mata Kuliah Terkait
            </h3>
            {resolvedChapters.length === 0 ? (
              <p className="text-body-sm text-muted-foreground">
                Tidak ada bab yang berhasil dikaitkan. Pastikan judul bab di frontmatter tertulis dengan benar.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {resolvedChapters.map((chap) => (
                  <div key={chap.id} className="bg-background/50 border border-border p-3 rounded-lg flex items-center gap-2.5">
                    <Layers size={16} className="text-primary" />
                    <span className="font-medium text-body-sm text-foreground">{chap.title}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Tab content: Ingest Diagnostics */}
        <TabsContent value="diagnostics">
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
            <h3 className="font-heading text-body-base font-semibold flex items-center gap-2">
              <AlertTriangle size={18} className="text-status-warning" />
              Analisis Peringatan Diagnostik
            </h3>

            {diagnostics.length === 0 ? (
              <div className="flex items-center gap-2 p-4 rounded-lg bg-status-success/5 border border-status-success/10 text-status-success">
                <CheckCircle2 size={16} />
                <span className="text-body-sm font-semibold">Semua bab ter-resolve secara sempurna. Tidak ada diagnostik aktif.</span>
              </div>
            ) : (
              <div className="space-y-2">
                {diagnostics.map((warning, index) => (
                  <div key={index} className="flex items-start gap-2.5 p-3 rounded-lg bg-status-warning/5 border border-status-warning/10 text-body-sm text-foreground">
                    <AlertTriangle size={16} className="text-status-warning mt-0.5 shrink-0" />
                    <span>{warning}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 pt-4 border-t border-border">
              <h4 className="text-body-sm font-bold text-foreground mb-2">Bantuan Resolusi Manual</h4>
              <p className="text-body-sm text-muted-foreground leading-relaxed">
                Jika bab tidak ter-resolve, pastikan nama bab dalam daftar <code>chapters</code> di bagian frontmatter markdown ditulis sesuai dengan judul bab di kurikulum Zyx, atau daftarkan alias baru untuk bab tersebut dalam sistem jika diperlukan.
              </p>
            </div>
          </div>
        </TabsContent>
      </Tabs>
      {/* Confirmation Deletion Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="rounded-xl border border-border">
          <DialogHeader>
            <DialogTitle>Hapus Dokumen Asesmen?</DialogTitle>
            <DialogDescription>
              Apakah Anda yakin ingin menghapus dokumen asesmen/bank soal &quot;{source.title}&quot;?
              Tindakan ini akan menghapus dokumen secara permanen dan menyinkronkan profil asesmen
              kursus terkait.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              className="rounded-lg"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={deleting}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              className="rounded-lg"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Menghapus..." : "Hapus Permanen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
