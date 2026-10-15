"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, FileCheck2, Layers, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchBar } from "@/components/ui/search-bar";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminSectionTitle } from "@/components/admin/section-title";
import { AdminTable } from "@/components/admin/table";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlTab } from "@/hooks/use-url-tab";
import { MathText } from "@/components/course/math-text";
import { explainBundleError } from "@/lib/bundle/admin-errors";
import {
  MaterialArtifactCard,
  type MaterialBundleRow,
  WorkflowFooter,
  WorkflowStepBar,
} from "@/components/admin/material-workflow-ui";

export type BundleRow = MaterialBundleRow;

type Props = {
  initialImports: BundleRow[];
  courseLabels?: Record<string, string>;
  authorLabels?: Record<string, string>;
  embedded?: boolean;
};

type IdeaPreview = {
  summary: { ideaCount: number; sourceCount: number; excerptCount: number; relationCount: number; ai: { provider: string; model: string; promptVersion: string } | null };
  ideas: {
    id: string;
    code: string;
    chapterId: string;
    canonicalStatement: string;
    conciseExplanation: string;
    latex: string | null;
    knowledgeKind: string;
    instructionalRole: string;
    provenance: { id: string; role: string; sourceTitle: string; excerpt: string; sectionLocator: string | null; pageNumber: number | null; note: string | null }[];
  }[];
  relations: { id: string; sourceIdeaId: string; targetIdeaId: string; relationType: string; explanation: string | null }[];
};

type IdeaDraft = {
  ideas: Array<IdeaPreview["ideas"][number] & {
    difficultyMetadata?: { level: "introductory" | "intermediate" | "advanced"; rationale?: string };
  }>;
  provenance: Array<{ id: string; provenanceRole: string; note?: string }>;
  relations: Array<IdeaPreview["relations"][number]>;
};

type IdeaAnalysis = {
  filename: string;
  manifest: { bundleId: string; courseId: string; schemaVersion: string };
  preview: IdeaPreview;
  draft: IdeaDraft;
};

const ideaSteps = [
  { number: 1, title: "Upload hasil MCP", description: "Pilih ZIP yang akan diperiksa" },
  { number: 2, title: "Review isi", description: "Periksa Idea dan bukti sumber" },
  { number: 3, title: "Simpan hasil", description: "Kirim hasil review ke staging" },
];

const knowledgeLabels: Record<string, string> = {
  definition: "Definisi",
  principle: "Prinsip",
  formula: "Rumus",
  procedure: "Prosedur",
  example: "Contoh",
  constraint: "Batasan",
  misconception: "Miskonsepsi",
  other: "Lainnya",
};

const roleLabels: Record<string, string> = {
  core: "Konsep inti",
  prerequisite: "Prasyarat",
  enrichment: "Pengayaan",
  assessment_support: "Pendukung asesmen",
  reference: "Referensi",
};

const relationLabels: Record<string, string> = {
  prerequisite: "Prasyarat",
  related: "Berkaitan",
  extends: "Mengembangkan",
  example_of: "Contoh dari",
  misconception_of: "Miskonsepsi dari",
};

function humanLabel(value: string, labels: Record<string, string>) {
  return labels[value] ?? value.replaceAll("_", " ");
}

export function IdeaBundleV2Panel({ initialImports, courseLabels = {}, authorLabels = {}, embedded = false }: Props) {
  const [imports, setImports] = useState(initialImports);
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<IdeaAnalysis | null>(null);
  const [query, setQuery] = useState("");
  const [analysisTab, setAnalysisTab] = useUrlTab("ideaView", "ideas");
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ id: string; status: string; preview: IdeaPreview } | null>(null);
  const [selectedPreviewIdeaId, setSelectedPreviewIdeaId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const response = await fetch("/api/admin/bundles/idea", { cache: "no-store" });
    if (!response.ok) throw new Error("IDEA_BUNDLE_LIST_FAILED");
    const payload = (await response.json()) as { imports: BundleRow[] };
    setImports(payload.imports);
  }

  const visibleIdeas = useMemo(() => {
    if (!analysis) return [];
    const needle = query.trim().toLowerCase();
    return needle
      ? analysis.draft.ideas.filter((idea) => `${idea.code} ${idea.canonicalStatement} ${idea.conciseExplanation}`.toLowerCase().includes(needle))
      : analysis.draft.ideas;
  }, [analysis, query]);

  const activeIdea = visibleIdeas.find((idea) => idea.id === selectedIdeaId) ?? visibleIdeas[0] ?? null;
  const activePreviewIdea = selected?.preview.ideas.find((idea) => idea.id === selectedPreviewIdeaId) ?? selected?.preview.ideas[0] ?? null;
  const draftIssues = useMemo(() => analysis?.draft.ideas.flatMap((idea) => [
    !idea.code.trim() ? `${idea.id}: kode belum diisi` : null,
    !idea.canonicalStatement.trim() ? `${idea.code || idea.id}: pernyataan utama belum diisi` : null,
    !idea.conciseExplanation.trim() ? `${idea.code || idea.id}: penjelasan belum diisi` : null,
  ].filter((issue): issue is string => Boolean(issue))) ?? [], [analysis]);

  useEffect(() => {
    if (!analysis) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [analysis]);

  function resetAnalysis() {
    setAnalysis(null);
    setFile(null);
    setQuery("");
    setSelectedIdeaId(null);
    setAnalysisTab("ideas");
  }

  function updateIdea(id: string, changes: Partial<IdeaDraft["ideas"][number]>) {
    setAnalysis((current) => current ? { ...current, draft: { ...current.draft, ideas: current.draft.ideas.map((idea) => idea.id === id ? { ...idea, ...changes } : idea) } } : current);
  }

  async function analyze() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("intent", "preview");
      const response = await fetch("/api/admin/bundles/idea", { method: "POST", body: form });
      const payload = (await response.json()) as IdeaAnalysis & { error?: string; reasonCodes?: string[] };
      if (!response.ok) throw new Error(payload.reasonCodes?.join(", ") || payload.error || "IDEA_BUNDLE_UPLOAD_FAILED");
      setAnalysis(payload);
      setSelectedIdeaId(payload.draft.ideas[0]?.id ?? null);
      setAnalysisTab("ideas");
      setMessage("ZIP lolos pemeriksaan awal. Belum ada data yang disimpan.");
    } catch (uploadError) {
      setError(explainBundleError(uploadError instanceof Error ? uploadError.message : "IDEA_BUNDLE_UPLOAD_FAILED"));
    } finally {
      setLoading(false);
    }
  }

  async function stageDraft() {
    if (!file || !analysis) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("intent", "stage");
      form.set("draft", JSON.stringify(analysis.draft));
      const response = await fetch("/api/admin/bundles/idea", { method: "POST", body: form });
      const payload = (await response.json()) as { result?: { status: string; bundleId: string }; error?: string; reasonCodes?: string[] };
      if (!response.ok) throw new Error(payload.reasonCodes?.join(", ") || payload.error || "IDEA_BUNDLE_STAGE_FAILED");
      setMessage(`Hasil review ${payload.result?.bundleId ?? ""} ${payload.result?.status === "existing" ? "sudah tersedia" : "disimpan"}.`);
      resetAnalysis();
      await refresh();
    } catch (stageError) {
      setError(explainBundleError(stageError instanceof Error ? stageError.message : "IDEA_BUNDLE_STAGE_FAILED"));
    } finally {
      setLoading(false);
    }
  }

  async function inspect(id: string) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/bundles/idea/${id}`, { cache: "no-store" });
      const payload = (await response.json()) as { bundle?: { id: string; status: string }; preview?: IdeaPreview; error?: string };
      if (!response.ok || !payload.bundle || !payload.preview) throw new Error(payload.error || "IDEA_BUNDLE_DETAIL_FAILED");
      setSelected({ id: payload.bundle.id, status: payload.bundle.status, preview: payload.preview });
      setSelectedPreviewIdeaId(payload.preview.ideas[0]?.id ?? null);
    } catch (inspectError) {
      setError(explainBundleError(inspectError instanceof Error ? inspectError.message : "IDEA_BUNDLE_DETAIL_FAILED"));
    } finally {
      setLoading(false);
    }
  }

  async function decide(id: string, decision: "approved" | "rejected") {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/bundles/idea/${id}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "IDEA_BUNDLE_REVIEW_FAILED");
      setMessage(decision === "approved" ? "Artifact ditandai sudah direview." : "Artifact ditolak.");
      await refresh();
      setSelected((current) => current?.id === id ? { ...current, status: decision } : current);
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "IDEA_BUNDLE_REVIEW_FAILED");
    } finally {
      setLoading(false);
    }
  }

  async function publish(id: string) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/bundles/idea/${id}/publish`, { method: "POST" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "IDEA_BUNDLE_PUBLISH_FAILED");
      setMessage("Artifact dipublikasikan.");
      await refresh();
      setSelected((current) => current?.id === id ? { ...current, status: "published" } : current);
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "IDEA_BUNDLE_PUBLISH_FAILED");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={embedded ? "space-y-6" : "space-y-8"}>
      {!embedded && <AdminPageHeader icon={Layers} title="Source Pack + Idea" />}

      <WorkflowStepBar steps={ideaSteps} currentStep={analysis ? 2 : 1} />

      {!analysis ? (
        <section className="space-y-4">
          <AdminSectionTitle as="h2" size="h6" icon={Upload} title="Upload ZIP" description="ZIP hanya dibaca untuk pemeriksaan awal. Belum ada data yang disimpan sampai Anda menekan tombol simpan." />
          <form className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center" onSubmit={(event) => { event.preventDefault(); void analyze(); }}>
            <Label htmlFor="idea-bundle-file" className="sr-only">Pilih ZIP hasil generasi MCP</Label>
            <Input id="idea-bundle-file" type="file" accept=".zip,application/zip" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setMessage(null); setError(null); }} />
            <Button type="submit" disabled={!file || loading} isLoading={loading}><Upload className="size-4" />Periksa ZIP</Button>
          </form>
        </section>
      ) : (
        <section className="space-y-5">
          <AdminSectionTitle as="h2" size="h6" title="Review isi Idea" description="Identitas, sumber, dan bukti terkunci." right={<Badge variant="outline">Belum disimpan</Badge>} />

          <AdminStatStrip className="sm:grid-cols-2 lg:grid-cols-4">
            <AdminStatStripItem label="Mata kuliah" value={courseLabels[analysis.manifest.courseId] ?? analysis.manifest.courseId} />
            <AdminStatStripItem label="Isi" value={`${analysis.draft.ideas.length} Idea`} />
            <AdminStatStripItem label="Sumber" value={`${analysis.preview.summary.sourceCount} sumber`} />
            <AdminStatStripItem label="Relasi" value={`${analysis.draft.relations.length} relasi`} />
          </AdminStatStrip>

          <Tabs value={analysisTab} onValueChange={(value) => setAnalysisTab(value as "ideas" | "relations")}>
            <TabsList>
              <TabsTrigger value="ideas">Idea</TabsTrigger>
              <TabsTrigger value="relations">Peta relasi</TabsTrigger>
            </TabsList>

            <TabsContent value="ideas" className="space-y-4">
              <SearchBar value={query} onSearch={setQuery} onClear={() => setQuery("")} placeholder="Cari kode atau isi Idea" />
              <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
                <div className="lg:border-r lg:border-border lg:pr-3">
                  <p className="px-2 pb-2 pt-1 text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">Daftar Idea</p>
                  <div className="space-y-1">
                    {visibleIdeas.map((idea, index) => <Button key={idea.id} type="button" variant={activeIdea?.id === idea.id ? "secondary" : "ghost"} className="h-auto w-full justify-start whitespace-normal px-2.5 py-2 text-left" onClick={() => setSelectedIdeaId(idea.id)}><span className="min-w-0 flex-1"><span className="block truncate text-body-sm font-semibold">{idea.code || `Idea ${index + 1}`}</span><span className="mt-0.5 block line-clamp-2 text-body-xs font-normal text-muted-foreground"><MathText as="span">{idea.canonicalStatement}</MathText></span></span><Badge variant="outline" className="shrink-0">{idea.provenance.length}</Badge></Button>)}
                    {visibleIdeas.length === 0 && <p className="px-2 py-4 text-body-sm text-muted-foreground">Idea tidak ditemukan.</p>}
                  </div>
                </div>

                {activeIdea && <article className="min-w-0 space-y-5 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4"><div className="min-w-0"><p className="text-body-xs font-semibold uppercase tracking-wide text-brand-primary">Editor Idea</p><h3 className="mt-1 truncate font-heading text-body-base text-foreground">{activeIdea.code || "Idea tanpa kode"}</h3><p className="mt-1 text-body-sm text-muted-foreground">Bab {activeIdea.chapterId} · {activeIdea.provenance.length} bukti sumber</p></div><Badge variant="outline">{humanLabel(activeIdea.knowledgeKind, knowledgeLabels)}</Badge></div>
                  <div className="grid gap-4 lg:grid-cols-2"><div className="space-y-2"><Label htmlFor={`idea-code-${activeIdea.id}`}>Kode singkat</Label><Input id={`idea-code-${activeIdea.id}`} value={activeIdea.code} onChange={(event) => updateIdea(activeIdea.id, { code: event.target.value })} /></div><div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>Jenis pengetahuan</Label><Select value={activeIdea.knowledgeKind} onValueChange={(value) => updateIdea(activeIdea.id, { knowledgeKind: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(knowledgeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Peran belajar</Label><Select value={activeIdea.instructionalRole} onValueChange={(value) => updateIdea(activeIdea.id, { instructionalRole: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(roleLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div></div></div>
                  <div className="space-y-2"><Label htmlFor={`idea-statement-${activeIdea.id}`}>Pernyataan utama</Label><Textarea id={`idea-statement-${activeIdea.id}`} value={activeIdea.canonicalStatement} onChange={(event) => updateIdea(activeIdea.id, { canonicalStatement: event.target.value })} className="min-h-28" /><div className="rounded-lg bg-muted p-3"><p className="mb-1 text-body-sm font-semibold text-foreground">Preview teks dan rumus</p><MathText as="div">{activeIdea.canonicalStatement}</MathText></div></div>
                  <div className="space-y-2"><Label htmlFor={`idea-explanation-${activeIdea.id}`}>Penjelasan ringkas</Label><Textarea id={`idea-explanation-${activeIdea.id}`} value={activeIdea.conciseExplanation} onChange={(event) => updateIdea(activeIdea.id, { conciseExplanation: event.target.value })} className="min-h-28" /></div>
                  <div className="space-y-2"><Label htmlFor={`idea-latex-${activeIdea.id}`}>Rumus LaTeX, jika ada</Label><Input id={`idea-latex-${activeIdea.id}`} value={activeIdea.latex ?? ""} onChange={(event) => updateIdea(activeIdea.id, { latex: event.target.value || null })} placeholder="Contoh: \\frac{1}{2}mv^2" />{activeIdea.latex && <div className="rounded-lg bg-muted p-3"><MathText bareMath as="div">{activeIdea.latex}</MathText></div>}</div>
                  <div className="space-y-3 border-t border-border pt-4"><p className="text-body-sm font-semibold text-foreground">Bukti sumber yang mendukung</p>{activeIdea.provenance.length === 0 && <p className="text-body-sm text-status-warning">Belum ada bukti sumber.</p>}{activeIdea.provenance.map((proof) => { const draftProof = analysis.draft.provenance.find((item) => item.id === proof.id); return <div key={proof.id} className="space-y-2 border-l-2 border-primary pl-3"><p className="text-body-sm font-medium text-foreground">{proof.sourceTitle}{proof.pageNumber ? ` · halaman ${proof.pageNumber}` : ""}</p><p className="text-body-sm text-muted-foreground">{proof.excerpt}</p>{draftProof && <Input value={draftProof.note ?? ""} onChange={(event) => setAnalysis((current) => current ? { ...current, draft: { ...current.draft, provenance: current.draft.provenance.map((item) => item.id === proof.id ? { ...item, note: event.target.value } : item) } } : current)} placeholder="Catatan reviewer, jika perlu" />}</div>; })}</div>
                </article>}
              </div>
            </TabsContent>

            <TabsContent value="relations" className="space-y-4">
              <AdminSectionTitle as="h3" size="lg" title="Peta hubungan antar-Idea" />
              <AdminTable className="divide-y divide-border">
                {analysis.draft.relations.length === 0 && <p className="px-4 py-6 text-body-sm text-muted-foreground">Tidak ada relasi eksplisit.</p>}
                {analysis.draft.relations.map((relation) => <div key={relation.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_200px_minmax(0,1fr)_minmax(0,1.5fr)] lg:items-center"><p className="text-body-sm font-medium text-foreground">{analysis.draft.ideas.find((idea) => idea.id === relation.sourceIdeaId)?.code ?? relation.sourceIdeaId}</p><Select value={relation.relationType} onValueChange={(value) => setAnalysis((current) => current ? { ...current, draft: { ...current.draft, relations: current.draft.relations.map((item) => item.id === relation.id ? { ...item, relationType: value } : item) } } : current)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(relationLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select><p className="text-body-sm font-medium text-foreground">{analysis.draft.ideas.find((idea) => idea.id === relation.targetIdeaId)?.code ?? relation.targetIdeaId}</p><Input value={relation.explanation ?? ""} onChange={(event) => setAnalysis((current) => current ? { ...current, draft: { ...current.draft, relations: current.draft.relations.map((item) => item.id === relation.id ? { ...item, explanation: event.target.value } : item) } } : current)} placeholder="Penjelasan hubungan" /></div>)}
              </AdminTable>
            </TabsContent>
          </Tabs>

          {draftIssues.length > 0 && <div className="rounded-lg border border-status-warning bg-status-warning/10 p-4"><p className="text-body-sm font-semibold text-foreground">Lengkapi {draftIssues.length} bagian sebelum menyimpan</p><ul className="mt-2 list-disc space-y-1 pl-5 text-body-sm text-muted-foreground">{draftIssues.slice(0, 8).map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
          <WorkflowFooter onBack={resetAnalysis} onNext={() => void stageDraft()} backDisabled={loading} nextDisabled={loading || draftIssues.length > 0} nextLabel="Simpan hasil review" />
        </section>
      )}

      {message && <p className="text-body-sm text-status-success">{message}</p>}
      {error && <p className="text-body-sm text-status-error">{error}</p>}

      <section className="space-y-3">
        <AdminSectionTitle as="h2" size="h6" border title="Artifact tersimpan" right={<span className="text-body-sm text-muted-foreground">{imports.length} artifact</span>} />
        <AdminTable className="divide-y divide-border">
          {imports.length === 0 && <p className="px-4 py-6 text-body-sm text-muted-foreground">Belum ada hasil Source Pack + Idea.</p>}
          {imports.map((item) => <MaterialArtifactCard key={item.id} row={item} kind="idea" courseLabel={item.courseId ? courseLabels[item.courseId] : undefined} authorLabel={item.requestedBy ? authorLabels[item.requestedBy] : undefined} onInspect={() => void inspect(item.id)} loading={loading} />)}
        </AdminTable>
      </section>

      {selected && <section className="space-y-4 border-t border-border pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><AdminSectionTitle as="h2" size="h6" title="Review artifact tersimpan" /><Button type="button" size="sm" variant="ghost" onClick={() => setSelected(null)}>Tutup</Button></div>
        <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          <div className="lg:border-r lg:border-border lg:pr-3"><p className="px-2 pb-2 pt-1 text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">Daftar Idea</p><div className="space-y-1">{selected.preview.ideas.map((idea, index) => <Button key={idea.id} type="button" variant={activePreviewIdea?.id === idea.id ? "secondary" : "ghost"} className="h-auto w-full justify-start whitespace-normal px-2.5 py-2 text-left" onClick={() => setSelectedPreviewIdeaId(idea.id)}><span className="min-w-0 flex-1"><span className="block truncate text-body-sm font-semibold">{idea.code || `Idea ${index + 1}`}</span><span className="mt-0.5 block line-clamp-2 text-body-xs font-normal text-muted-foreground"><MathText as="span">{idea.canonicalStatement}</MathText></span></span><Badge variant="outline" className="shrink-0">{idea.provenance.length}</Badge></Button>)}</div></div>
          {activePreviewIdea && <article className="min-w-0 space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5"><div className="border-b border-border pb-4"><p className="font-heading text-body-base text-foreground">{activePreviewIdea.code}</p><p className="mt-1 text-body-sm text-muted-foreground">{humanLabel(activePreviewIdea.knowledgeKind, knowledgeLabels)} · {humanLabel(activePreviewIdea.instructionalRole, roleLabels)} · Bab {activePreviewIdea.chapterId}</p></div><MathText as="div" className="text-body-base text-foreground">{activePreviewIdea.canonicalStatement}</MathText><p className="text-body-sm text-muted-foreground">{activePreviewIdea.conciseExplanation}</p>{activePreviewIdea.latex && <div className="rounded-lg bg-muted p-3"><MathText bareMath as="div">{activePreviewIdea.latex}</MathText></div>}<div className="space-y-2 border-t border-border pt-4"><p className="text-body-sm font-semibold text-foreground">Bukti sumber</p>{activePreviewIdea.provenance.map((item) => <div key={item.id} className="border-l-2 border-border pl-3 text-body-sm"><p className="font-medium text-foreground">{item.sourceTitle} · {item.role}</p><p className="text-muted-foreground">{item.excerpt}</p></div>)}</div></article>}
        </div>
        {selected.preview.relations.length > 0 && <details className="rounded-xl border border-border bg-card p-4 shadow-sm"><summary className="cursor-pointer text-body-sm font-semibold text-foreground">Lihat {selected.preview.relations.length} relasi Idea</summary><div className="mt-3 divide-y divide-border">{selected.preview.relations.map((relation) => <p key={relation.id} className="py-2 text-body-sm text-muted-foreground">{relation.sourceIdeaId} · {humanLabel(relation.relationType, relationLabels)} · {relation.targetIdeaId}{relation.explanation ? ` · ${relation.explanation}` : ""}</p>)}</div></details>}
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">{selected.status === "validated" && <><Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => void decide(selected.id, "approved")}><Check className="size-4" />Tandai sudah direview</Button><Button type="button" size="sm" variant="destructive" disabled={loading} onClick={() => void decide(selected.id, "rejected")}><X className="size-4" />Tolak artifact</Button></>}{selected.status === "approved" && <Button type="button" size="sm" disabled={loading} onClick={() => void publish(selected.id)}><FileCheck2 className="size-4" />Publikasikan</Button>}</div>
      </section>}
    </div>
  );
}
