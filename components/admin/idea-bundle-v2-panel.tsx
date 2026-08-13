"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Eye, FileCheck2, Layers, Search, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminSectionTitle } from "@/components/admin/section-title";
import { AdminTable } from "@/components/admin/table";
import { MathText } from "@/components/course/math-text";
import { explainBundleError } from "@/lib/bundle/admin-errors";

type BundleRow = {
  id: string;
  bundleId: string;
  checksum: string;
  courseId: string | null;
  status: string;
  validationReport: Record<string, unknown>;
  createdAt: string;
};

type Props = { initialImports: BundleRow[] };

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

export function IdeaBundleV2Panel({ initialImports }: Props) {
  const [imports, setImports] = useState(initialImports);
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<IdeaAnalysis | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<{ id: string; status: string; preview: IdeaPreview } | null>(null);
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
    return needle ? analysis.draft.ideas.filter((idea) => `${idea.code} ${idea.canonicalStatement} ${idea.conciseExplanation}`.toLowerCase().includes(needle)) : analysis.draft.ideas;
  }, [analysis, query]);
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
      setMessage(`Bundle ${payload.result?.bundleId ?? ""} ${payload.result?.status === "existing" ? "sudah ada" : "disimpan ke staging"}.`);
      setAnalysis(null);
      setFile(null);
      setQuery("");
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
    } catch (inspectError) {
      setError(inspectError instanceof Error ? inspectError.message : "IDEA_BUNDLE_DETAIL_FAILED");
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
      setMessage(decision === "approved" ? "Bundle disetujui." : "Bundle ditolak.");
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
      setMessage("Bundle dipublikasikan secara atomik.");
      await refresh();
      setSelected((current) => current?.id === id ? { ...current, status: "published" } : current);
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "IDEA_BUNDLE_PUBLISH_FAILED");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <AdminPageHeader
        icon={Layers}
        title="Idea Bundle"
        description="Analisis ZIP, periksa dan edit setiap Idea, lalu simpan hasil review ke staging."
      />

      <section className="space-y-3">
        <AdminSectionTitle as="h2" size="h6" title="1. Pilih dan analisis ZIP" />
        <form
          className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center"
          onSubmit={(event) => {
            event.preventDefault();
            void analyze();
          }}
        >
          <Input type="file" accept=".zip,application/zip" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setAnalysis(null); }} />
          <Button type="submit" disabled={!file || loading} isLoading={loading}>
            <Upload className="size-4" />
            Analisis ZIP
          </Button>
        </form>
        {message && <p className="text-body-sm text-status-success">{message}</p>}
        {error && <p className="text-body-sm text-status-error">{error}</p>}
      </section>

      {analysis && (
        <section className="space-y-5 border-t border-border pt-6">
          <AdminSectionTitle
            as="h2"
            size="h6"
            title="2. Periksa dan edit Idea"
            description="Perubahan masih berada di browser ini. ID, sumber, dan jejak bukti dikunci agar data tetap aman."
            right={<Badge variant="outline">Belum disimpan</Badge>}
          />
          <div className="grid gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
            <div><p className="text-body-sm text-muted-foreground">Bundle</p><p className="truncate font-semibold text-foreground">{analysis.manifest.bundleId}</p></div>
            <div><p className="text-body-sm text-muted-foreground">Course</p><p className="truncate font-semibold text-foreground">{analysis.manifest.courseId}</p></div>
            <div><p className="text-body-sm text-muted-foreground">Isi</p><p className="font-semibold text-foreground">{analysis.draft.ideas.length} Idea, {analysis.preview.summary.sourceCount} sumber</p></div>
            <div><p className="text-body-sm text-muted-foreground">Relasi</p><p className="font-semibold text-foreground">{analysis.draft.relations.length} relasi</p></div>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari kode atau isi Idea" className="pl-9" />
          </div>
          <div className="divide-y divide-border border-y border-border">
            {visibleIdeas.map((idea, index) => {
              const originalPreview = analysis.preview.ideas.find((item) => item.id === idea.id);
              return (
                <article key={idea.id} className="space-y-5 py-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><p className="font-heading text-h6 text-foreground">Idea {index + 1}</p><p className="text-body-sm text-muted-foreground">{idea.id} ; {idea.chapterId}</p></div>
                    <Badge variant="outline">{originalPreview?.provenance.length ?? 0} bukti sumber</Badge>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2"><Label htmlFor={`idea-code-${idea.id}`}>Kode singkat</Label><Input id={`idea-code-${idea.id}`} value={idea.code} onChange={(event) => updateIdea(idea.id, { code: event.target.value })} /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2"><Label>Jenis pengetahuan</Label><Select value={idea.knowledgeKind} onValueChange={(value) => updateIdea(idea.id, { knowledgeKind: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["definition", "principle", "formula", "procedure", "example", "constraint", "misconception", "other"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
                      <div className="space-y-2"><Label>Peran belajar</Label><Select value={idea.instructionalRole} onValueChange={(value) => updateIdea(idea.id, { instructionalRole: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["core", "prerequisite", "enrichment", "assessment_support", "reference"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
                    </div>
                  </div>
                  <div className="space-y-2"><Label htmlFor={`idea-statement-${idea.id}`}>Pernyataan utama</Label><Textarea id={`idea-statement-${idea.id}`} value={idea.canonicalStatement} onChange={(event) => updateIdea(idea.id, { canonicalStatement: event.target.value })} className="min-h-24" /><div className="rounded-lg bg-muted p-3"><p className="mb-1 text-body-sm font-semibold text-foreground">Preview rumus dan teks</p><MathText>{idea.canonicalStatement}</MathText></div></div>
                  <div className="space-y-2"><Label htmlFor={`idea-explanation-${idea.id}`}>Penjelasan ringkas</Label><Textarea id={`idea-explanation-${idea.id}`} value={idea.conciseExplanation} onChange={(event) => updateIdea(idea.id, { conciseExplanation: event.target.value })} className="min-h-28" /></div>
                  <div className="space-y-2"><Label htmlFor={`idea-latex-${idea.id}`}>LaTeX opsional</Label><Input id={`idea-latex-${idea.id}`} value={idea.latex ?? ""} onChange={(event) => updateIdea(idea.id, { latex: event.target.value || null })} placeholder="Contoh: x^2 + y^2" />{idea.latex && <div className="rounded-lg bg-muted p-3"><MathText>{idea.latex}</MathText></div>}</div>
                  <div className="space-y-3"><p className="text-body-sm font-semibold text-foreground">Bukti sumber yang mendukung</p>{originalPreview?.provenance.map((proof) => { const draftProof = analysis.draft.provenance.find((item) => item.id === proof.id); return <div key={proof.id} className="space-y-2 border-l-2 border-primary pl-3"><p className="text-body-sm font-medium text-foreground">{proof.sourceTitle}{proof.pageNumber ? ` ; halaman ${proof.pageNumber}` : ""}</p><p className="text-body-sm text-muted-foreground">{proof.excerpt}</p>{draftProof && <Input value={draftProof.note ?? ""} onChange={(event) => setAnalysis((current) => current ? { ...current, draft: { ...current.draft, provenance: current.draft.provenance.map((item) => item.id === proof.id ? { ...item, note: event.target.value } : item) } } : current)} placeholder="Catatan reviewer opsional" />}</div>; })}</div>
                </article>
              );
            })}
          </div>
          {analysis.draft.relations.length > 0 && <div className="space-y-3"><AdminSectionTitle as="h3" size="lg" title="Pemetaan relasi Idea" />{analysis.draft.relations.map((relation) => <div key={relation.id} className="grid gap-3 border-b border-border py-3 lg:grid-cols-[1fr_180px_1fr_2fr]"><p className="text-body-sm font-medium text-foreground">{analysis.draft.ideas.find((idea) => idea.id === relation.sourceIdeaId)?.code ?? relation.sourceIdeaId}</p><Select value={relation.relationType} onValueChange={(value) => setAnalysis((current) => current ? { ...current, draft: { ...current.draft, relations: current.draft.relations.map((item) => item.id === relation.id ? { ...item, relationType: value } : item) } } : current)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["prerequisite", "related", "extends", "example_of", "misconception_of"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select><p className="text-body-sm font-medium text-foreground">{analysis.draft.ideas.find((idea) => idea.id === relation.targetIdeaId)?.code ?? relation.targetIdeaId}</p><Input value={relation.explanation ?? ""} onChange={(event) => setAnalysis((current) => current ? { ...current, draft: { ...current.draft, relations: current.draft.relations.map((item) => item.id === relation.id ? { ...item, explanation: event.target.value } : item) } } : current)} placeholder="Jelaskan hubungan" /></div>)}</div>}
          {draftIssues.length > 0 && <div className="rounded-lg border border-status-warning bg-status-warning/10 p-4"><p className="text-body-sm font-semibold text-foreground">Lengkapi {draftIssues.length} bagian sebelum menyimpan</p><ul className="mt-2 list-disc space-y-1 pl-5 text-body-sm text-muted-foreground">{draftIssues.slice(0, 8).map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-foreground">Siap menyimpan hasil review?</p><p className="text-body-sm text-muted-foreground">Server akan memvalidasi ulang, menghitung hash baru, lalu menulis ZIP final ke staging.</p></div><div className="flex gap-2"><Button type="button" variant="outline" onClick={() => setAnalysis(null)} disabled={loading}>Batalkan draft</Button><Button type="button" onClick={() => void stageDraft()} disabled={loading || draftIssues.length > 0} isLoading={loading}><FileCheck2 className="size-4" />Simpan ke staging</Button></div></div>
        </section>
      )}

      <section className="space-y-3">
        <AdminSectionTitle
          as="h2"
          size="h6"
          border
          title="Import yang sudah distaging"
          right={<span className="text-body-sm text-muted-foreground">{imports.length} bundle</span>}
        />
        <AdminTable className="divide-y divide-border">
          {imports.length === 0 && <p className="px-4 py-6 text-body-sm text-muted-foreground">Belum ada Idea Bundle.</p>}
          {imports.map((item) => (
            <div key={item.id} className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="min-w-0 space-y-1">
                <p className="truncate font-semibold text-foreground">{item.bundleId}</p>
                <p className="break-all font-mono text-body-sm text-muted-foreground">{item.checksum}</p>
                <p className="text-body-sm text-muted-foreground">Course {item.courseId ?? "tidak tercatat"} ; Status {item.status}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => void inspect(item.id)}>
                  <Eye className="size-4" />
                  Tinjau isi
                </Button>
              </div>
            </div>
          ))}
        </AdminTable>
      </section>

      {selected && (
        <section className="space-y-4 border-t border-border pt-6">
          <AdminSectionTitle
            as="h2"
            size="h6"
            title="Review Idea dan sumber"
            right={<Button type="button" size="sm" variant="ghost" onClick={() => setSelected(null)}>Tutup</Button>}
          />
          <p className="text-body-sm text-muted-foreground">
            {selected.preview.summary.ideaCount} Idea ; {selected.preview.summary.sourceCount} sumber ; {selected.preview.summary.excerptCount} excerpt ; {selected.preview.summary.relationCount} relasi
          </p>
          {selected.preview.summary.ai && (
            <p className="text-body-sm text-muted-foreground">AI {selected.preview.summary.ai.provider} ; {selected.preview.summary.ai.model} ; prompt {selected.preview.summary.ai.promptVersion}</p>
          )}
          <div className="divide-y divide-border">
            {selected.preview.ideas.map((idea) => (
              <article key={idea.id} className="space-y-3 py-5">
                <div>
                  <p className="font-semibold text-foreground">{idea.code}</p>
                  <p className="text-body-sm text-muted-foreground">{idea.knowledgeKind} ; {idea.instructionalRole} ; {idea.chapterId}</p>
                </div>
                <MathText>{idea.canonicalStatement}</MathText>
                <p className="text-body-sm text-muted-foreground">{idea.conciseExplanation}</p>
                {idea.latex && <MathText>{idea.latex}</MathText>}
                <div className="space-y-2">
                  <p className="text-body-sm font-semibold text-foreground">Bukti sumber</p>
                  {idea.provenance.map((item) => (
                    <div key={item.id} className="border-l-2 border-border pl-3 text-body-sm">
                      <p className="font-medium text-foreground">{item.sourceTitle} ; {item.role}</p>
                      <p className="text-muted-foreground">{item.excerpt}</p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
          {selected.preview.relations.length > 0 && (
            <div className="space-y-2">
              <p className="text-body-sm font-semibold text-foreground">Relasi Idea</p>
              {selected.preview.relations.map((relation) => (
                <p key={relation.id} className="text-body-sm text-muted-foreground">{relation.sourceIdeaId} ; {relation.relationType} ; {relation.targetIdeaId}{relation.explanation ? ` ; ${relation.explanation}` : ""}</p>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            {selected.status === "validated" && (
              <>
                <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => void decide(selected.id, "approved")}><Check className="size-4" />Setujui setelah review</Button>
                <Button type="button" size="sm" variant="destructive" disabled={loading} onClick={() => void decide(selected.id, "rejected")}><X className="size-4" />Tolak</Button>
              </>
            )}
            {selected.status === "approved" && <Button type="button" size="sm" disabled={loading} onClick={() => void publish(selected.id)}>Publikasikan hasil review</Button>}
          </div>
        </section>
      )}
    </div>
  );
}
