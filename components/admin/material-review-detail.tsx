"use client";

import { useCallback, useEffect, useState } from "react";
import { ArchiveX, Check, FileCheck2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminEmptyState, AdminErrorState } from "@/components/admin/state-panels";
import { AdminTable } from "@/components/admin/table";
import { AdminTabs, AdminTabsContent, AdminTabsList, AdminTabsTrigger } from "@/components/admin/tabs";
import { StatusBadge } from "@/components/admin/status-badges";
import { FormattedDate } from "@/components/ui/formatted-date";
import { MathText } from "@/components/course/math-text";
import { explainBundleError } from "@/lib/bundle/admin-errors";
import { WorkflowStepBar } from "@/components/admin/material-workflow-ui";
import { ProductDraftEditor, type ProductPreview } from "@/components/admin/product-bundle-v2-panel";
import type { ProductDependency, ProductEntity } from "@/lib/bundle/product-validator";

type DetailProps = {
  detailId: string;
  courseLabels?: Record<string, string>;
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

type IdeaDetailPayload = {
  bundle: { id: string; bundleId: string; courseId: string | null; status: string; createdAt: string; reviews?: { status: string; notes: string | null }[] };
  preview: IdeaPreview;
  draft: IdeaDraft;
};

type ProductDetailPayload = {
  bundle: { id: string; bundleId: string; courseId: string | null; status: string; createdAt: string; reviews?: { status: string; notes: string | null }[] };
  previews: ProductPreview[];
  draft: { products: ProductEntity[] };
  publicationBlocked?: boolean;
  dependencies?: ProductDependency[];
};

type IdeaDraftItem = IdeaPreview["ideas"][number] & {
  difficultyMetadata?: { level: "introductory" | "intermediate" | "advanced"; rationale?: string };
};

type IdeaDraft = {
  ideas: IdeaDraftItem[];
  provenance: { id: string; provenanceRole: string; note?: string }[];
  relations: IdeaPreview["relations"];
};

const ideaSteps = [
  { number: 1, title: "Artifact masuk", description: "ZIP tersimpan di staging" },
  { number: 2, title: "Review isi", description: "Periksa Idea dan bukti sumber" },
  { number: 3, title: "Simpan hasil", description: "Setujui atau publikasikan hasil" },
];

const productSteps = [
  { number: 1, title: "Artifact masuk", description: "ZIP tersimpan di staging" },
  { number: 2, title: "Review isi", description: "Periksa artikel, soal, diktat, dan produk lain" },
  { number: 3, title: "Simpan hasil", description: "Publikasikan atau simpan sebagai draft" },
];

const statusLabels: Record<string, string> = {
  validated: "Menunggu review",
  approved: "Disetujui",
  rejected: "Ditolak",
  draft: "Draft",
  published: "Terbit",
  withdrawn: "Ditarik",
};

const statusTones: Record<string, "muted" | "info" | "success" | "warning" | "error" | "brand"> = {
  validated: "warning",
  approved: "success",
  rejected: "error",
  draft: "info",
  published: "success",
  withdrawn: "muted",
};

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

const productLabels: Record<string, string> = {
  article: "Artikel",
  diktat: "Diktat",
  question: "Soal",
  solution: "Pembahasan",
  flashcard_set: "Set flashcard",
  flashcard: "Flashcard",
  assessment_blueprint: "Blueprint asesmen",
};

function displayLabel(value: string, labels: Record<string, string>) {
  return labels[value] ?? value.replaceAll("_", " ");
}

function DetailStatus({ status }: { status: string }) {
  return <StatusBadge tone={statusTones[status] ?? "muted"}>{statusLabels[status] ?? status}</StatusBadge>;
}

function DetailLoading() {
  return <div className="rounded-xl border border-border bg-card p-8 text-center text-body-sm text-muted-foreground">Memuat isi artifact...</div>;
}

export function IdeaBundleReviewDetail({ detailId, courseLabels = {} }: DetailProps) {
  const [payload, setPayload] = useState<IdeaDetailPayload | null>(null);
  const [draft, setDraft] = useState<IdeaDraft | null>(null);
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/bundles/idea/${encodeURIComponent(detailId)}`, { cache: "no-store" });
      const nextPayload = await response.json() as IdeaDetailPayload & { error?: string };
      if (!response.ok || !nextPayload.bundle || !nextPayload.preview) throw new Error(nextPayload.error || "IDEA_BUNDLE_DETAIL_FAILED");
      setPayload(nextPayload);
      setDraft(nextPayload.draft);
      setEditing(false);
      setSelectedIdeaId((current) => nextPayload.preview.ideas.some((idea) => idea.id === current) ? current : nextPayload.preview.ideas[0]?.id ?? null);
      setReviewNote(nextPayload.bundle.reviews?.[0]?.notes ?? "");
    } catch (loadError) {
      setError(explainBundleError(loadError instanceof Error ? loadError.message : "IDEA_BUNDLE_DETAIL_FAILED"));
    } finally {
      setLoading(false);
    }
  }, [detailId]);

  useEffect(() => { void load(); }, [load]);

  async function decide(decision: "approved" | "rejected") {
    if (!payload) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/bundles/idea/${encodeURIComponent(payload.bundle.id)}/review`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision, notes: reviewNote || undefined }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "IDEA_BUNDLE_REVIEW_FAILED");
      await load();
    } catch (reviewError) {
      setError(explainBundleError(reviewError instanceof Error ? reviewError.message : "IDEA_BUNDLE_REVIEW_FAILED"));
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (!payload) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/bundles/idea/${encodeURIComponent(payload.bundle.id)}/publish`, { method: "POST" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "IDEA_BUNDLE_PUBLISH_FAILED");
      await load();
    } catch (publishError) {
      setError(explainBundleError(publishError instanceof Error ? publishError.message : "IDEA_BUNDLE_PUBLISH_FAILED"));
    } finally {
      setSaving(false);
    }
  }

  function updateIdeaDraft(id: string, changes: Partial<IdeaDraftItem>) {
    setDraft((current) => current ? { ...current, ideas: current.ideas.map((idea) => idea.id === id ? { ...idea, ...changes } : idea) } : current);
  }

  async function saveDraft() {
    if (!payload || !draft) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/bundles/idea/${encodeURIComponent(payload.bundle.id)}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ draft }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "IDEA_BUNDLE_UPDATE_FAILED");
      await load();
    } catch (saveError) {
      setError(explainBundleError(saveError instanceof Error ? saveError.message : "IDEA_BUNDLE_UPDATE_FAILED"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <DetailLoading />;
  if (error && !payload) return <AdminErrorState message={error} onRetry={() => void load()} />;
  if (!payload) return <AdminEmptyState title="Artifact tidak ditemukan" description="Artifact mungkin sudah dihapus atau tidak dapat dibaca." />;

  const activeIdea = payload.preview.ideas.find((idea) => idea.id === selectedIdeaId) ?? payload.preview.ideas[0] ?? null;
  const activeDraftIdea = draft?.ideas.find((idea) => idea.id === activeIdea?.id) ?? null;
  const currentStep = payload.bundle.status === "approved" || payload.bundle.status === "published" ? 3 : 2;

  return (
    <div className="space-y-6">
      <WorkflowStepBar steps={ideaSteps} currentStep={currentStep} />
      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><p className="text-body-sm text-muted-foreground">Mata kuliah</p><p className="truncate font-semibold text-foreground">{payload.bundle.courseId ? courseLabels[payload.bundle.courseId] ?? payload.bundle.courseId : "Belum terpetakan"}</p></div>
        <div><p className="text-body-sm text-muted-foreground">Waktu masuk</p><p className="font-semibold text-foreground"><FormattedDate date={payload.bundle.createdAt} /></p></div>
        <div><p className="text-body-sm text-muted-foreground">Isi</p><p className="font-semibold text-foreground">{payload.preview.summary.ideaCount} Idea · {payload.preview.summary.sourceCount} sumber</p></div>
        <div><p className="text-body-sm text-muted-foreground">Status</p><DetailStatus status={payload.bundle.status} /></div>
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="font-heading text-h6 font-semibold text-foreground">Review isi Idea</h2><p className="mt-1 text-body-sm text-muted-foreground">Pilih satu Idea untuk membaca pernyataan, rumus, dan bukti sumbernya.</p></div>
          <Badge variant="outline">{payload.preview.ideas.length} Idea</Badge>
        </div>
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="rounded-xl border border-border bg-card p-2 shadow-sm">
            <p className="px-2 pb-2 pt-1 text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">Daftar Idea</p>
            <div className="space-y-1">
              {payload.preview.ideas.map((idea, index) => <Button key={idea.id} type="button" variant={activeIdea?.id === idea.id ? "secondary" : "ghost"} className="h-auto w-full justify-start whitespace-normal px-2.5 py-2 text-left" onClick={() => setSelectedIdeaId(idea.id)}><span className="min-w-0 flex-1"><span className="block truncate text-body-sm font-semibold">{idea.code || `Idea ${index + 1}`}</span><span className="mt-0.5 block line-clamp-2 text-body-xs font-normal text-muted-foreground">{idea.canonicalStatement}</span></span><Badge variant="outline" className="shrink-0">{idea.provenance.length}</Badge></Button>)}
            </div>
          </div>
          {activeIdea ? <article className="min-w-0 space-y-5 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4"><div><p className="text-body-xs font-semibold uppercase tracking-wide text-brand-primary">{displayLabel(activeIdea.knowledgeKind, knowledgeLabels)}</p><h3 className="mt-1 font-heading text-h5 text-foreground">{activeIdea.code || "Idea tanpa kode"}</h3><p className="mt-1 text-body-sm text-muted-foreground">{displayLabel(activeIdea.instructionalRole, roleLabels)} · Bab {activeIdea.chapterId}</p></div><div className="flex items-center gap-2"><Badge variant="outline">{activeIdea.provenance.length} bukti sumber</Badge>{!editing && payload.bundle.status !== "published" && <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>Edit isi</Button>}</div></div>
            {editing && activeDraftIdea ? <div className="space-y-5">
              <div className="grid gap-4 lg:grid-cols-2"><div className="space-y-2"><Label htmlFor={`detail-idea-code-${activeIdea.id}`}>Kode singkat</Label><Input id={`detail-idea-code-${activeIdea.id}`} value={activeDraftIdea.code} onChange={(event) => updateIdeaDraft(activeDraftIdea.id, { code: event.target.value })} /></div><div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>Jenis pengetahuan</Label><Select value={activeDraftIdea.knowledgeKind} onValueChange={(value) => updateIdeaDraft(activeDraftIdea.id, { knowledgeKind: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(knowledgeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Peran belajar</Label><Select value={activeDraftIdea.instructionalRole} onValueChange={(value) => updateIdeaDraft(activeDraftIdea.id, { instructionalRole: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(roleLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div></div></div>
              <div className="space-y-2"><Label htmlFor={`detail-idea-statement-${activeIdea.id}`}>Pernyataan utama</Label><Textarea id={`detail-idea-statement-${activeIdea.id}`} value={activeDraftIdea.canonicalStatement} onChange={(event) => updateIdeaDraft(activeDraftIdea.id, { canonicalStatement: event.target.value })} className="min-h-28" /><div className="rounded-lg bg-muted p-3"><p className="mb-1 text-body-sm font-semibold text-foreground">Preview teks dan rumus</p><MathText as="div">{activeDraftIdea.canonicalStatement}</MathText></div></div>
              <div className="space-y-2"><Label htmlFor={`detail-idea-explanation-${activeIdea.id}`}>Penjelasan ringkas</Label><Textarea id={`detail-idea-explanation-${activeIdea.id}`} value={activeDraftIdea.conciseExplanation} onChange={(event) => updateIdeaDraft(activeDraftIdea.id, { conciseExplanation: event.target.value })} className="min-h-28" /></div>
              <div className="space-y-2"><Label htmlFor={`detail-idea-latex-${activeIdea.id}`}>Rumus LaTeX, jika ada</Label><Input id={`detail-idea-latex-${activeIdea.id}`} value={activeDraftIdea.latex ?? ""} onChange={(event) => updateIdeaDraft(activeDraftIdea.id, { latex: event.target.value || null })} placeholder="Contoh: \\frac{1}{2}mv^2" />{activeDraftIdea.latex && <div className="rounded-lg bg-muted p-3"><MathText bareMath as="div">{activeDraftIdea.latex}</MathText></div>}</div>
              <div className="space-y-3 border-t border-border pt-4"><p className="text-body-sm font-semibold text-foreground">Catatan bukti sumber</p>{activeIdea.provenance.map((proof) => { const draftProof = draft?.provenance.find((item) => item.id === proof.id); return <div key={proof.id} className="space-y-2 border-l-2 border-brand-primary/40 pl-3"><p className="text-body-sm font-medium text-foreground">{proof.sourceTitle}{proof.pageNumber ? ` · halaman ${proof.pageNumber}` : ""}</p><p className="text-body-sm text-muted-foreground">{proof.excerpt}</p>{draftProof && <Input value={draftProof.note ?? ""} onChange={(event) => setDraft((current) => current ? { ...current, provenance: current.provenance.map((item) => item.id === proof.id ? { ...item, note: event.target.value } : item) } : current)} placeholder="Catatan reviewer, jika perlu" />}</div>; })}</div>
              <div className="flex flex-wrap gap-2 border-t border-border pt-4"><Button type="button" disabled={saving} onClick={() => void saveDraft()}>Simpan perubahan</Button><Button type="button" variant="outline" disabled={saving} onClick={() => void load()}>Batal</Button></div>
            </div> : <>
              <div className="space-y-2"><h4 className="text-body-sm font-semibold text-foreground">Pernyataan utama</h4><MathText as="div" className="text-body-base leading-relaxed text-foreground">{activeIdea.canonicalStatement}</MathText></div>
              <div className="space-y-2 border-t border-border pt-4"><h4 className="text-body-sm font-semibold text-foreground">Penjelasan ringkas</h4><MathText as="div" className="whitespace-pre-wrap text-body-sm leading-relaxed text-muted-foreground">{activeIdea.conciseExplanation}</MathText></div>
              {activeIdea.latex && <div className="space-y-2 border-t border-border pt-4"><h4 className="text-body-sm font-semibold text-foreground">Rumus</h4><div className="rounded-lg bg-muted p-4"><MathText bareMath as="div">{activeIdea.latex}</MathText></div></div>}
              <div className="space-y-3 border-t border-border pt-4"><h4 className="text-body-sm font-semibold text-foreground">Bukti sumber</h4>{activeIdea.provenance.map((proof) => <div key={proof.id} className="space-y-1 border-l-2 border-brand-primary/40 pl-3"><p className="text-body-sm font-medium text-foreground">{proof.sourceTitle}{proof.pageNumber ? ` · halaman ${proof.pageNumber}` : ""}</p><p className="whitespace-pre-wrap text-body-sm leading-relaxed text-muted-foreground">{proof.excerpt}</p></div>)}</div>
            </>}
          </article> : <AdminEmptyState title="Idea belum tersedia" description="Bundle ini tidak memiliki Idea yang dapat ditampilkan." />}
        </div>
      </section>

      <section className="space-y-4">
        <div><h2 className="font-heading text-h6 font-semibold text-foreground">Hubungan antar-Idea</h2><p className="mt-1 text-body-sm text-muted-foreground">Bagian ini membantu memeriksa prasyarat dan hubungan konsep tanpa mencampurnya dengan isi utama.</p></div>
        <AdminTable className="divide-y divide-border">
          {payload.preview.relations.length === 0 ? <p className="px-4 py-5 text-body-sm text-muted-foreground">Tidak ada relasi eksplisit.</p> : payload.preview.relations.map((relation) => <div key={relation.id} className="grid gap-2 px-4 py-3 text-body-sm sm:grid-cols-[1fr_auto_1fr] sm:items-center"><span className="font-medium text-foreground">{relation.sourceIdeaId}</span><span className="text-muted-foreground">{displayLabel(relation.relationType, relationLabels)}</span><span className="font-medium text-foreground">{relation.targetIdeaId}{relation.explanation ? ` · ${relation.explanation}` : ""}</span></div>)}
        </AdminTable>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div><Label htmlFor="idea-review-note">Catatan review</Label><p className="mt-1 text-body-xs text-muted-foreground">Catatan ini disimpan bersama keputusan review.</p></div>
        <Textarea id="idea-review-note" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Tulis catatan untuk reviewer berikutnya, jika perlu." className="min-h-24" />
        {error && <p className="text-body-sm text-status-error">{error}</p>}
        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          {payload.bundle.status === "validated" && <><Button type="button" variant="outline" disabled={saving} onClick={() => void decide("approved")}><Check className="size-4" />Tandai sudah direview</Button><Button type="button" variant="destructive" disabled={saving} onClick={() => void decide("rejected")}><X className="size-4" />Tolak artifact</Button></>}
          {payload.bundle.status === "approved" && <Button type="button" disabled={saving} onClick={() => void publish()}><FileCheck2 className="size-4" />Publikasikan</Button>}
          {payload.bundle.status === "published" && <span className="text-body-sm text-status-success">Artifact sudah dipublikasikan.</span>}
        </div>
      </section>
    </div>
  );
}

export function ProductBundleReviewDetail({ detailId, courseLabels = {} }: DetailProps) {
  const [payload, setPayload] = useState<ProductDetailPayload | null>(null);
  const [draftProducts, setDraftProducts] = useState<ProductEntity[]>([]);
  const [activeType, setActiveType] = useState("all");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewDecision, setReviewDecision] = useState<"approved" | "rejected" | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/bundles/product/${encodeURIComponent(detailId)}`, { cache: "no-store" });
      const nextPayload = await response.json() as ProductDetailPayload & { error?: string };
      if (!response.ok || !nextPayload.bundle) throw new Error(nextPayload.error || "PRODUCT_BUNDLE_DETAIL_FAILED");
      setPayload(nextPayload);
      setDraftProducts(nextPayload.draft?.products ?? []);
      setEditing(false);
      setSelectedProductId((current) => nextPayload.previews.some((preview) => preview.id === current) ? current : nextPayload.previews[0]?.id ?? null);
      const existingReview = nextPayload.bundle.reviews?.[0];
      setReviewDecision(existingReview?.status === "approved" || existingReview?.status === "rejected" ? existingReview.status : null);
      setReviewNote(existingReview?.notes ?? "");
    } catch (loadError) {
      setError(explainBundleError(loadError instanceof Error ? loadError.message : "PRODUCT_BUNDLE_DETAIL_FAILED"));
    } finally {
      setLoading(false);
    }
  }, [detailId]);

  useEffect(() => { void load(); }, [load]);

  async function decide(decision: "approved" | "rejected") {
    if (!payload) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/bundles/product/${encodeURIComponent(payload.bundle.id)}/review`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision, notes: reviewNote || undefined }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "PRODUCT_BUNDLE_REVIEW_FAILED");
      setReviewDecision(decision);
    } catch (reviewError) {
      setError(explainBundleError(reviewError instanceof Error ? reviewError.message : "PRODUCT_BUNDLE_REVIEW_FAILED"));
    } finally {
      setSaving(false);
    }
  }

  async function mutate(action: "publish" | "withdraw" | "discard") {
    if (!payload) return;
    setSaving(true);
    setError(null);
    try {
      const endpoint = action === "publish" ? `/api/admin/bundles/product/${encodeURIComponent(payload.bundle.id)}/publish` : action === "withdraw" ? `/api/admin/bundles/product/${encodeURIComponent(payload.bundle.id)}/withdraw` : `/api/admin/bundles/product/${encodeURIComponent(payload.bundle.id)}`;
      const response = await fetch(endpoint, { method: action === "discard" ? "DELETE" : "POST" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || `PRODUCT_BUNDLE_${action.toUpperCase()}_FAILED`);
      await load();
    } catch (mutationError) {
      setError(explainBundleError(mutationError instanceof Error ? mutationError.message : "PRODUCT_BUNDLE_UPDATE_FAILED"));
    } finally {
      setSaving(false);
    }
  }

  async function saveDraft() {
    if (!payload) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/bundles/product/${encodeURIComponent(payload.bundle.id)}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ draft: { products: draftProducts } }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "PRODUCT_BUNDLE_UPDATE_FAILED");
      await load();
    } catch (saveError) {
      setError(explainBundleError(saveError instanceof Error ? saveError.message : "PRODUCT_BUNDLE_UPDATE_FAILED"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <DetailLoading />;
  if (error && !payload) return <AdminErrorState message={error} onRetry={() => void load()} />;
  if (!payload) return <AdminEmptyState title="Artifact tidak ditemukan" description="Artifact mungkin sudah dihapus atau tidak dapat dibaca." />;

  const typeCounts = payload.previews.reduce<Record<string, number>>((counts, preview) => { counts[preview.productType] = (counts[preview.productType] ?? 0) + 1; return counts; }, {});
  const visiblePreviews = payload.previews.filter((preview) => activeType === "all" || preview.productType === activeType);
  const activePreview = visiblePreviews.find((preview) => preview.id === selectedProductId) ?? visiblePreviews[0] ?? null;
  const activeDraftProduct = draftProducts.find((product) => product.id === activePreview?.id) ?? null;
  const currentStep = payload.bundle.status === "published" || reviewDecision === "approved" ? 3 : 2;

  return (
    <div className="space-y-6">
      <WorkflowStepBar steps={productSteps} currentStep={currentStep} />
      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><p className="text-body-sm text-muted-foreground">Mata kuliah</p><p className="truncate font-semibold text-foreground">{payload.bundle.courseId ? courseLabels[payload.bundle.courseId] ?? payload.bundle.courseId : "Belum terpetakan"}</p></div>
        <div><p className="text-body-sm text-muted-foreground">Waktu masuk</p><p className="font-semibold text-foreground"><FormattedDate date={payload.bundle.createdAt} /></p></div>
        <div><p className="text-body-sm text-muted-foreground">Isi</p><p className="font-semibold text-foreground">{payload.previews.length} bagian · {Object.keys(typeCounts).length} jenis</p></div>
        <div><p className="text-body-sm text-muted-foreground">Status</p><DetailStatus status={payload.bundle.status} /></div>
      </div>

      <section className="space-y-4">
        <div><h2 className="font-heading text-h6 font-semibold text-foreground">Review isi Product</h2><p className="mt-1 text-body-sm text-muted-foreground">Gunakan filter jenis untuk membaca artikel, soal, diktat, dan bagian lain secara terpisah.</p></div>
        <AdminTabs value={activeType} onValueChange={(value) => { setActiveType(value); const first = payload.previews.find((preview) => value === "all" || preview.productType === value); setSelectedProductId(first?.id ?? null); }}>
          <AdminTabsList className="max-w-full overflow-x-auto"><AdminTabsTrigger value="all">Semua ({payload.previews.length})</AdminTabsTrigger>{Object.entries(typeCounts).map(([type, count]) => <AdminTabsTrigger key={type} value={type}>{productLabels[type] ?? type} ({count})</AdminTabsTrigger>)}</AdminTabsList>
          <AdminTabsContent value={activeType} className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
              <div className="rounded-xl border border-border bg-card p-2 shadow-sm"><p className="px-2 pb-2 pt-1 text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">Daftar bagian</p><div className="space-y-1">{visiblePreviews.map((preview, index) => <Button key={preview.id} type="button" variant={activePreview?.id === preview.id ? "secondary" : "ghost"} className="h-auto w-full justify-start whitespace-normal px-2.5 py-2 text-left" onClick={() => setSelectedProductId(preview.id)}><span className="min-w-0 flex-1"><span className="block truncate text-body-sm font-semibold">{preview.title || `Bagian ${index + 1}`}</span><span className="mt-0.5 block text-body-xs font-normal text-muted-foreground">{productLabels[preview.productType] ?? preview.productType} · versi {preview.version}</span></span></Button>)}</div></div>
              {activePreview ? <article className="min-w-0 space-y-5 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4"><div><p className="text-body-xs font-semibold uppercase tracking-wide text-brand-primary">{productLabels[activePreview.productType] ?? activePreview.productType}</p><h3 className="mt-1 font-heading text-h5 text-foreground">{activePreview.title || "Bagian tanpa judul"}</h3><p className="mt-1 text-body-sm text-muted-foreground">Versi {activePreview.version}</p></div>{!editing && payload.bundle.status === "draft" && <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>Edit isi</Button>}</div>{editing && activeDraftProduct ? <><ProductDraftEditor product={activeDraftProduct} index={draftProducts.findIndex((product) => product.id === activeDraftProduct.id)} preview={activePreview} onChange={(next) => setDraftProducts((current) => current.map((product) => product.id === next.id ? next : product))} /><div className="flex flex-wrap gap-2 border-t border-border pt-4"><Button type="button" disabled={saving} onClick={() => void saveDraft()}>Simpan perubahan</Button><Button type="button" variant="outline" disabled={saving} onClick={() => void load()}>Batal</Button></div></> : <><div className="space-y-4">{activePreview.sections.map((section) => <div key={section.label} className="space-y-2 border-b border-border pb-5 last:border-0 last:pb-0"><h4 className="text-body-sm font-semibold text-foreground">{section.label}</h4><MathText as="div" className="whitespace-pre-wrap text-body-sm leading-relaxed text-foreground">{section.content}</MathText></div>)}</div><div className="space-y-2 border-t border-border pt-4"><h4 className="text-body-sm font-semibold text-foreground">Jejak sumber</h4><p className="text-body-sm text-muted-foreground">{activePreview.traceability.ideaIds.length} Idea · {activePreview.traceability.sourceIds.length} sumber</p></div></>}</article> : <AdminEmptyState title="Bagian belum tersedia" description="Bundle ini tidak memiliki bagian yang dapat ditampilkan." />}
            </div>
          </AdminTabsContent>
        </AdminTabs>
      </section>

      {payload.publicationBlocked && <p className="rounded-lg border border-status-warning bg-status-warning/10 p-3 text-body-sm text-status-warning">Publikasi tertahan karena ada hubungan atau validasi yang perlu diperiksa.</p>}
      {payload.dependencies && payload.dependencies.length > 0 && <details className="rounded-xl border border-border bg-card p-4 shadow-sm"><summary className="cursor-pointer text-body-sm font-semibold text-foreground">Lihat {payload.dependencies.length} hubungan antar bagian</summary><div className="mt-3 divide-y divide-border">{payload.dependencies.map((dependency) => <p key={dependency.id} className="py-2 text-body-sm text-muted-foreground">{dependency.upstreamEntityId} menjadi sumber untuk {dependency.downstreamEntityId}</p>)}</div></details>}

      <section className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div><Label htmlFor="product-review-note">Catatan review</Label><p className="mt-1 text-body-xs text-muted-foreground">Catatan ini disimpan bersama keputusan review.</p></div>
        <Textarea id="product-review-note" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Tulis catatan untuk reviewer berikutnya, jika perlu." className="min-h-24" />
        {error && <p className="text-body-sm text-status-error">{error}</p>}
        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          {payload.bundle.status === "draft" && !reviewDecision && <><Button type="button" variant="outline" disabled={saving} onClick={() => void decide("approved")}><Check className="size-4" />Tandai sudah direview</Button><Button type="button" variant="destructive" disabled={saving} onClick={() => void decide("rejected")}><X className="size-4" />Tolak artifact</Button></>}
          {payload.bundle.status === "draft" && reviewDecision === "approved" && <Button type="button" disabled={saving || payload.publicationBlocked} onClick={() => void mutate("publish")}><FileCheck2 className="size-4" />Publikasikan</Button>}
          {payload.bundle.status === "draft" && <Button type="button" variant="destructive" disabled={saving} onClick={() => void mutate("discard")}><ArchiveX className="size-4" />Hapus draft</Button>}
          {payload.bundle.status === "published" && <Button type="button" variant="outline" disabled={saving} onClick={() => void mutate("withdraw")}><ArchiveX className="size-4" />Tarik publikasi</Button>}
          {payload.bundle.status === "published" && <span className="text-body-sm text-status-success">Product sudah dipublikasikan.</span>}
        </div>
      </section>
    </div>
  );
}
