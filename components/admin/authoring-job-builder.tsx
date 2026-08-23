"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, Search } from "lucide-react";
import { AdminSectionTitle } from "@/components/admin/section-title";
import { AdminTable } from "@/components/admin/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { AuthoringCourseOption } from "@/lib/authoring/catalog";
import { WorkflowFooter, WorkflowStepBar } from "@/components/admin/material-workflow-ui";

type SourceSection = { id: string; title: string; startUnit: number; endUnit: number };
type SourceDocument = {
  id: string;
  title: string;
  role: string;
  unitKind: string;
  expectedUnits: number;
  counts: { formulas: number; examples: number; applications: number; visuals: number; questions: number; solutions: number };
  sections: SourceSection[];
};
type Analysis = {
  filename: string;
  archiveChecksum: string;
  manifest: { packId: string; name: string; generator: { model: string }; documents: unknown[] };
  documents: SourceDocument[];
  summary: { documentCount: number; unitCount: number; sectionCount: number; questionCount: number; solutionCount: number };
};

type ProductChoice = "diktat" | "flashcard" | "question" | "assessment_blueprint";
const productChoices: Array<{ id: ProductChoice; label: string; description: string }> = [
  { id: "diktat", label: "Diktat", description: "Ringkasan belajar yang diturunkan dari Artikel." },
  { id: "flashcard", label: "Flashcard", description: "Kartu active recall untuk setiap Idea." },
  { id: "question", label: "Soal dan pembahasan", description: "Soal terverifikasi dengan pembahasan." },
  { id: "assessment_blueprint", label: "Blueprint asesmen", description: "Rencana kuis atau tryout dari soal." },
];

const workflowSteps = [
  { number: 1, title: "Pilih Source Pack", description: "Upload berkas sumber" },
  { number: 2, title: "Tentukan tujuan", description: "Pilih mata kuliah dan bab" },
  { number: 3, title: "Petakan sumber", description: "Hubungkan bagian ke bab" },
  { number: 4, title: "Pilih keluaran", description: "Tentukan produk belajar" },
  { number: 5, title: "Unduh pekerjaan", description: "Buat paket untuk agent" },
];

const errorMessages: Record<string, string> = {
  SOURCE_PACK_FILE_REQUIRED: "Pilih Source Pack ZIP terlebih dahulu.",
  SOURCE_PACK_FILE_LIMIT: "Ukuran Source Pack melewati batas 64 MiB.",
  SOURCE_PACK_MANIFEST_MISSING: "Source Pack tidak memiliki manifest.json di root ZIP.",
  SOURCE_PACK_MANIFEST_INVALID: "Manifest Source Pack belum mengikuti format yang diperlukan.",
  SOURCE_PACK_UNRESOLVED: "Source Pack masih memiliki bagian yang belum berhasil dibaca.",
  SOURCE_PACK_COUNT_MISMATCH: "Jumlah konten pada Source Pack belum cocok dengan dokumen sumber.",
  SOURCE_PACK_UNIT_SEQUENCE_INVALID: "Urutan unit sumber belum lengkap.",
  AUTHORING_JOB_MAPPING_INVALID: "Pemetaan bab tidak valid. Periksa seluruh bagian sumber.",
  AUTHORING_JOB_MAPPING_INCOMPLETE: "Setiap bagian sumber harus memiliki satu bab tujuan.",
  AUTHORING_JOB_COURSE_NOT_FOUND: "Mata kuliah tidak ditemukan atau tidak aktif.",
};

function explainError(value: string): string {
  return errorMessages[value.split(":", 1)[0]] ?? value;
}

export function AuthoringJobBuilder({ courses }: { courses: AuthoringCourseOption[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [courseId, setCourseId] = useState("");
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [products, setProducts] = useState<ProductChoice[]>(["diktat", "flashcard", "question", "assessment_blueprint"]);
  const [activeStep, setActiveStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const course = courses.find((item) => item.id === courseId) ?? null;
  const selectedChapters = course?.chapters.filter((chapter) => selectedChapterIds.includes(chapter.id)) ?? [];
  const allSections = useMemo(() => analysis?.documents.flatMap((document) => document.sections.map((section) => ({ ...section, documentId: document.id }))) ?? [], [analysis]);
  const activeDocument = analysis?.documents.find((document) => document.id === selectedDocumentId) ?? analysis?.documents[0] ?? null;
  const mappedSections = allSections.filter((section) => selectedChapterIds.includes(mapping[section.id])).length;
  const mappedUnits = allSections.filter((section) => selectedChapterIds.includes(mapping[section.id])).reduce((total, section) => total + section.endUnit - section.startUnit + 1, 0);
  const ready = Boolean(file && analysis && course && selectedChapterIds.length > 0 && mappedSections === allSections.length && allSections.length > 0);

  useEffect(() => {
    if (!analysis) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [analysis]);

  function selectCourse(value: string) {
    setCourseId(value);
    setSelectedChapterIds([]);
    setMapping({});
  }

  function toggleChapter(chapterId: string, checked: boolean) {
    const next = checked ? [...selectedChapterIds, chapterId] : selectedChapterIds.filter((id) => id !== chapterId);
    setSelectedChapterIds(next);
    setMapping((current) => next.length === 1
      ? Object.fromEntries(allSections.map((section) => [section.id, next[0]]))
      : Object.fromEntries(Object.entries(current).filter(([, value]) => next.includes(value))));
  }

  function toggleProduct(product: ProductChoice, checked: boolean) {
    setProducts((current) => {
      let next = checked ? [...new Set([...current, product])] : current.filter((item) => item !== product);
      if (product === "question" && !checked) next = next.filter((item) => item !== "assessment_blueprint");
      if (product === "assessment_blueprint" && checked && !next.includes("question")) next.push("question");
      return next;
    });
  }

  async function analyze() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("intent", "analyze");
      const response = await fetch("/api/admin/authoring-jobs", { method: "POST", body: form });
      const payload = (await response.json()) as Analysis & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "SOURCE_PACK_ANALYSIS_FAILED");
      setAnalysis(payload);
      setSelectedDocumentId(payload.documents[0]?.id ?? null);
      setMapping({});
      setActiveStep(2);
      setMessage("Source Pack terbaca. Belum ada file atau data yang disimpan.");
    } catch (analysisError) {
      setError(explainError(analysisError instanceof Error ? analysisError.message : "SOURCE_PACK_ANALYSIS_FAILED"));
    } finally {
      setLoading(false);
    }
  }

  async function download() {
    if (!file || !analysis || !course || !ready) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const requestedProducts = ["article", ...products, ...(products.includes("question") ? ["solution"] : [])];
      const form = new FormData();
      form.set("file", file);
      form.set("intent", "download");
      form.set("courseId", course.id);
      form.set("mappings", JSON.stringify(allSections.map((section) => ({ sectionId: section.id, chapterId: mapping[section.id] }))));
      form.set("requestedProducts", JSON.stringify([...new Set(requestedProducts)]));
      const response = await fetch("/api/admin/authoring-jobs", { method: "POST", body: form });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "AUTHORING_JOB_DOWNLOAD_FAILED");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/)?.[1];
      const filename = encodedName ? decodeURIComponent(encodedName) : `authoring-job-${analysis.manifest.packId}.zip`;
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
      setMessage("Authoring Job Pack siap diunduh.");
    } catch (downloadError) {
      setError(explainError(downloadError instanceof Error ? downloadError.message : "AUTHORING_JOB_DOWNLOAD_FAILED"));
    } finally {
      setLoading(false);
    }
  }

  function goNext() {
    if (activeStep === 1 && !analysis) {
      setError("Analisis Source Pack terlebih dahulu.");
      return;
    }
    if (activeStep === 2 && (!course || selectedChapterIds.length === 0)) {
      setError("Pilih mata kuliah dan minimal satu bab terlebih dahulu.");
      return;
    }
    if (activeStep === 3 && mappedSections !== allSections.length) {
      setError("Petakan seluruh bagian sumber sebelum lanjut.");
      return;
    }
    setError(null);
    setActiveStep((current) => Math.min(current + 1, workflowSteps.length));
  }

  function goBack() {
    setError(null);
    setActiveStep((current) => Math.max(current - 1, 1));
  }

  const nextDisabled = activeStep === 1 ? !analysis : activeStep === 2 ? !course || selectedChapterIds.length === 0 : activeStep === 3 ? mappedSections !== allSections.length : false;

  return (
    <div className="space-y-6">
      <WorkflowStepBar steps={workflowSteps} currentStep={activeStep} />

      {activeStep === 1 && (
        <section className="space-y-2.5">
          <form className="flex items-center gap-2" onSubmit={(event) => { event.preventDefault(); void analyze(); }}>
            <Label htmlFor="authoring-source-pack-file" className="sr-only">Pilih Source Pack ZIP</Label>
            <Input id="authoring-source-pack-file" type="file" accept=".zip,application/zip" className="h-9 text-body-sm rounded-lg flex-1" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setAnalysis(null); setMessage(null); setError(null); setActiveStep(1); }} />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="submit" size="sm" className="h-9 rounded-lg gap-1.5 shrink-0 font-semibold" disabled={!file || loading} isLoading={loading}>
                    <Search className="size-3.5" />
                    Analisis
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Analisis Source Pack</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </form>
          <p className="text-body-xs text-muted-foreground">ZIP diperiksa di memori. Tahap ini tidak menulis R2 atau database.</p>
        </section>
      )}

      {activeStep === 2 && analysis && <section className="space-y-4"><AdminSectionTitle as="h2" title="Tentukan tujuan" /><div className="grid gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4"><div><p className="text-body-sm text-muted-foreground">Source Pack</p><p className="truncate font-semibold text-foreground">{analysis.manifest.name}</p></div><div><p className="text-body-sm text-muted-foreground">Dokumen</p><p className="font-semibold text-foreground">{analysis.summary.documentCount}</p></div><div><p className="text-body-sm text-muted-foreground">Unit sumber</p><p className="font-semibold text-foreground">{analysis.summary.unitCount}</p></div><div><p className="text-body-sm text-muted-foreground">Soal dan pembahasan asli</p><p className="font-semibold text-foreground">{analysis.summary.questionCount} soal · {analysis.summary.solutionCount} pembahasan</p></div></div><div className="space-y-2"><Label htmlFor="authoring-course" className="text-body-sm font-semibold">Mata kuliah</Label><Select value={courseId} onValueChange={selectCourse}><SelectTrigger id="authoring-course" className="h-9 text-body-sm rounded-lg"><SelectValue placeholder="Pilih mata kuliah" /></SelectTrigger><SelectContent>{courses.map((item) => <SelectItem key={item.id} value={item.id}>{item.code} · {item.title}</SelectItem>)}</SelectContent></Select></div>{course && <div className="space-y-3"><p className="text-body-sm font-semibold text-foreground">Bab yang digunakan</p>{course.chapters.length === 0 ? <p className="text-body-sm text-status-warning">Mata kuliah ini belum memiliki bab aktif.</p> : <div className="grid gap-3 sm:grid-cols-2">{course.chapters.map((chapter) => <CheckboxField key={chapter.id} id={`chapter-${chapter.id}`} checked={selectedChapterIds.includes(chapter.id)} onCheckedChange={(checked) => toggleChapter(chapter.id, checked === true)} label={`${chapter.code} · ${chapter.title}`} description={`Urutan ${chapter.orderIndex + 1}`} />)}</div>}</div>}</section>}

      {activeStep === 3 && analysis && <section className="space-y-4"><AdminSectionTitle as="h2" title="Petakan bagian sumber" /><div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]"><div className="rounded-xl border border-border bg-card p-2 shadow-sm"><p className="px-2 pb-2 pt-1 text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">Dokumen sumber</p><div className="space-y-1">{analysis.documents.map((document) => <Button key={document.id} type="button" variant={activeDocument?.id === document.id ? "secondary" : "ghost"} className="h-auto w-full justify-start whitespace-normal px-2.5 py-2 text-left" onClick={() => setSelectedDocumentId(document.id)}><span className="min-w-0 flex-1"><span className="block truncate text-body-sm font-semibold">{document.title}</span><span className="mt-0.5 block text-body-xs font-normal text-muted-foreground">{document.sections.length} bagian · {document.expectedUnits} unit</span></span></Button>)}</div></div>{activeDocument && <AdminTable className="divide-y divide-border"><div className="flex flex-wrap items-start justify-between gap-3 px-4 py-4"><div><p className="font-semibold text-foreground">{activeDocument.title}</p><p className="text-body-sm text-muted-foreground">{activeDocument.counts.formulas} formula · {activeDocument.counts.visuals} visual · {activeDocument.counts.questions} soal · {activeDocument.counts.solutions} pembahasan</p></div><Badge variant="outline">{activeDocument.role}</Badge></div>{activeDocument.sections.map((section) => <div key={section.id} className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-center"><div><p className="text-body-sm font-medium text-foreground">{section.title}</p><p className="text-body-xs text-muted-foreground">{activeDocument.unitKind} {section.startUnit}{section.endUnit !== section.startUnit ? ` sampai ${section.endUnit}` : ""}</p></div><Select value={mapping[section.id] ?? ""} onValueChange={(chapterId) => setMapping((current) => ({ ...current, [section.id]: chapterId }))} disabled={selectedChapters.length === 0}><SelectTrigger className="h-9 text-body-sm rounded-lg"><SelectValue placeholder="Pilih bab tujuan" /></SelectTrigger><SelectContent>{selectedChapters.map((chapter) => <SelectItem key={chapter.id} value={chapter.id}>{chapter.code} · {chapter.title}</SelectItem>)}</SelectContent></Select></div>)}</AdminTable>}</div><p className={mappedSections === allSections.length ? "text-body-sm text-status-success" : "text-body-sm text-status-warning"}>{mappedSections} dari {allSections.length} bagian dipetakan · {mappedUnits} dari {analysis.summary.unitCount} unit tercakup</p></section>}

      {activeStep === 4 && analysis && <section className="space-y-4"><AdminSectionTitle as="h2" title="Pilih keluaran materi" /><CheckboxField checked disabled label="Artikel" description="Bahan ajar lengkap untuk mahasiswa. Wajib." /><div className="grid gap-4 sm:grid-cols-2">{productChoices.map((choice) => <CheckboxField key={choice.id} checked={products.includes(choice.id)} onCheckedChange={(checked) => toggleProduct(choice.id, checked === true)} label={choice.label} description={choice.description} />)}</div></section>}

      {activeStep === 5 && analysis && <section className="space-y-4"><AdminSectionTitle as="h2" title="Unduh paket pekerjaan" /><div className="grid gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:grid-cols-3"><div><p className="text-body-sm text-muted-foreground">Mata kuliah</p><p className="font-semibold text-foreground">{course?.code} · {course?.title}</p></div><div><p className="text-body-sm text-muted-foreground">Bab</p><p className="font-semibold text-foreground">{selectedChapters.length} bab</p></div><div><p className="text-body-sm text-muted-foreground">Keluaran</p><p className="font-semibold text-foreground">Artikel + {products.length} pilihan</p></div></div><div className="rounded-xl border border-status-success/30 bg-status-success/10 p-4"><p className="font-semibold text-foreground">{ready ? "Konfigurasi lengkap" : "Konfigurasi belum lengkap"}</p><p className="mt-1 text-body-sm text-muted-foreground">Periksa ringkasan di atas. Paket belum dikirim ke agent sampai Anda menekan tombol unduh.</p></div></section>}

      {message && <p className="text-body-sm text-status-success">{message}</p>}
      {error && <p className="text-body-sm text-status-error">{error}</p>}

      <WorkflowFooter onBack={activeStep > 1 ? goBack : undefined} onNext={activeStep < workflowSteps.length ? goNext : undefined} nextDisabled={nextDisabled} nextLabel={activeStep === 4 ? "Tinjau ringkasan" : "Lanjut"}>{activeStep === workflowSteps.length && <Button type="button" disabled={!ready || loading} isLoading={loading} onClick={() => void download()}><Download className="size-4" />Unduh paket kerja</Button>}{activeStep === 1 && analysis && <Button type="button" variant="outline" onClick={() => { setAnalysis(null); setActiveStep(1); }}>Pilih ulang berkas</Button>}{activeStep > 1 && <span className="inline-flex items-center gap-1.5 text-body-xs text-muted-foreground"><ArrowLeft className="size-3.5" />Perubahan hanya tersimpan di browser sampai tahap unduh</span>}</WorkflowFooter>
    </div>
  );
}
