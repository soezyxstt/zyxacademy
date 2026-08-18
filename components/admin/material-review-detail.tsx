"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { 
  ArchiveX, 
  BookOpen, 
  Check, 
  CheckCircle2, 
  ChevronLeft, 
  ChevronRight, 
  FileCheck2, 
  Layers, 
  Lightbulb, 
  ListFilter, 
  RotateCcw, 
  X 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchBar } from "@/components/ui/search-bar";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { AdminEmptyState, AdminErrorState } from "@/components/admin/state-panels";
import { AdminTabs, AdminTabsContent, AdminTabsList, AdminTabsTrigger } from "@/components/admin/tabs";
import { StatusBadge } from "@/components/admin/status-badges";
import { FormattedDate } from "@/components/ui/formatted-date";
import { MathText } from "@/components/course/math-text";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { explainBundleError } from "@/lib/bundle/admin-errors";
import { ProductDraftEditor, type ProductPreview } from "@/components/admin/product-bundle-v2-panel";
import type { ProductDependency, ProductEntity } from "@/lib/bundle/product-validator";
import { cn } from "@/lib/utils";

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

const articleBlockMeta: Record<string, { label: string; badge: string }> = {
  prior_knowledge_activation: { label: "Aktivasi Pengetahuan Awal", badge: "Prasyarat" },
  problem_introduction: { label: "Pengantar Masalah", badge: "Motivasi" },
  explanation: { label: "Penjelasan Konsep", badge: "Konsep Inti" },
  verbal_representation: { label: "Representasi Verbal", badge: "Intuitif" },
  mathematical_representation: { label: "Representasi Matematis", badge: "Formula" },
  worked_example: { label: "Contoh Soal & Pembahasan", badge: "Contoh" },
  misconception: { label: "Miskonsepsi Umum", badge: "Peringatan" },
  application: { label: "Aplikasi Nyata", badge: "Penerapan" },
  cross_idea_synthesis: { label: "Sintesis Lintas-Idea", badge: "Sintesis" },
  summary: { label: "Rangkuman Bab", badge: "Rangkuman" },
};

export type ParsedBlockContent = {
  content: string;
  metadata?: {
    ideaIds?: string[];
    sourceRefs?: Array<{ sourceId: string; version?: number; checksum?: string; excerptIds?: string[] }>;
    learningPurpose?: string;
    applicability?: { status: string; reason?: string };
    [key: string]: unknown;
  };
};

export function parseEmbeddedContent(rawText: string | null | undefined): ParsedBlockContent {
  if (!rawText) return { content: "" };
  const trimmed = rawText.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      if (typeof parsed.content === "string") {
        return {
          content: parsed.content,
          metadata: parsed as ParsedBlockContent["metadata"],
        };
      }
    } catch {
      // Return raw string if JSON parsing fails
    }
  }
  return { content: rawText };
}

function displayLabel(value: string, labels: Record<string, string>) {
  return labels[value] ?? value.replaceAll("_", " ");
}

function DetailStatus({ status }: { status: string }) {
  return <StatusBadge tone={statusTones[status] ?? "muted"}>{statusLabels[status] ?? status}</StatusBadge>;
}

function DetailLoading() {
  return <div className="rounded-xl border border-border bg-card p-8 text-center text-body-sm text-muted-foreground">Memuat isi artifact...</div>;
}

// ---------------------------------------------------------------------------
// Idea Bundle Review Detail (Compact & Space-Efficient)
// ---------------------------------------------------------------------------

export function IdeaBundleReviewDetail({ detailId, courseLabels = {} }: DetailProps) {
  const [payload, setPayload] = useState<IdeaDetailPayload | null>(null);
  const [draft, setDraft] = useState<IdeaDraft | null>(null);
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
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

  const ideasList = useMemo(() => payload?.preview.ideas ?? [], [payload]);
  const currentIndex = ideasList.findIndex((idea) => idea.id === selectedIdeaId);
  const activeIdea = ideasList[currentIndex >= 0 ? currentIndex : 0] ?? null;
  const activeDraftIdea = draft?.ideas.find((idea) => idea.id === activeIdea?.id) ?? null;

  const filteredIdeas = useMemo(() => {
    if (!searchQuery.trim()) return ideasList;
    const q = searchQuery.toLowerCase().trim();
    return ideasList.filter((idea) => idea.code.toLowerCase().includes(q) || idea.canonicalStatement.toLowerCase().includes(q) || idea.id.toLowerCase().includes(q));
  }, [ideasList, searchQuery]);

  function goToIndex(index: number) {
    if (index >= 0 && index < ideasList.length) {
      setSelectedIdeaId(ideasList[index].id);
      setEditing(false);
    }
  }

  if (loading) return <DetailLoading />;
  if (error && !payload) return <AdminErrorState message={error} onRetry={() => void load()} />;
  if (!payload) return <AdminEmptyState title="Artifact tidak ditemukan" description="Artifact mungkin sudah dihapus atau tidak dapat dibaca." />;

  return (
    <div className="space-y-4">
      {/* Compact Meta Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-3 text-body-sm">
          <span className="font-semibold text-foreground">{payload.bundle.courseId ? courseLabels[payload.bundle.courseId] ?? payload.bundle.courseId : "Belum terpetakan"}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground"><FormattedDate date={payload.bundle.createdAt} /></span>
          <span className="text-muted-foreground">·</span>
          <span className="font-medium text-foreground">{payload.preview.summary.ideaCount} Idea</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">{payload.preview.summary.sourceCount} sumber</span>
        </div>
        <DetailStatus status={payload.bundle.status} />
      </div>

      {/* Top Navigator Bar (Prev/Next Stepper, Quick Selector, Drawer) */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/40 p-2 shadow-xs">
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={currentIndex <= 0}
            onClick={() => goToIndex(currentIndex - 1)}
            aria-label="Idea sebelumnya"
            className="h-8 px-2.5"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="px-1 font-mono text-body-xs font-semibold text-foreground">
            {currentIndex + 1} / {ideasList.length}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={currentIndex >= ideasList.length - 1}
            onClick={() => goToIndex(currentIndex + 1)}
            aria-label="Idea berikutnya"
            className="h-8 px-2.5"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        {/* Quick Dropdown Selector */}
        <div className="min-w-0 flex-1 max-w-md">
          <Select value={activeIdea?.id ?? ""} onValueChange={(id) => { setSelectedIdeaId(id); setEditing(false); }}>
            <SelectTrigger className="h-8 text-body-xs">
              <SelectValue placeholder="Pilih Idea..." />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {ideasList.map((idea, idx) => (
                <SelectItem key={idea.id} value={idea.id} className="text-body-xs">
                  <span className="font-semibold">{idea.code || `Idea ${idx + 1}`}</span>: {idea.canonicalStatement.slice(0, 50)}...
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Drawer Trigger for 60+ Items Search List */}
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetTrigger asChild>
            <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-body-xs">
              <ListFilter className="size-3.5" />
              Daftar Idea ({ideasList.length})
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="flex flex-col w-full sm:max-w-md p-4">
            <SheetHeader className="pb-3 border-b border-border">
              <SheetTitle className="text-body-base font-semibold">Daftar Idea ({ideasList.length})</SheetTitle>
              <div className="mt-2">
                <SearchBar
                  size="sm"
                  value={searchQuery}
                  onSearch={setSearchQuery}
                  onClear={() => setSearchQuery("")}
                  placeholder="Cari kode atau teks Idea..."
                />
              </div>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto space-y-1 py-3 pr-1">
              {filteredIdeas.map((idea, index) => (
                <button
                  key={idea.id}
                  type="button"
                  onClick={() => { setSelectedIdeaId(idea.id); setEditing(false); setDrawerOpen(false); }}
                  className={cn(
                    "w-full rounded-lg p-2.5 text-left text-body-xs transition-colors hover:bg-muted",
                    activeIdea?.id === idea.id ? "bg-muted font-semibold border-l-2 border-brand-primary" : "text-foreground"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">{idea.code || `Idea ${index + 1}`}</span>
                    <Badge variant="outline" className="text-[10px]">{idea.provenance.length} sumber</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-muted-foreground">{idea.canonicalStatement}</p>
                </button>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* 100% Width Canvas for Idea Content */}
      {activeIdea ? (
        <article key={activeIdea.id} className="rounded-xl border border-border bg-card p-5 sm:p-7 shadow-xs space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-body-xs font-semibold">{displayLabel(activeIdea.knowledgeKind, knowledgeLabels)}</Badge>
                <Badge variant="outline" className="text-body-xs">{displayLabel(activeIdea.instructionalRole, roleLabels)}</Badge>
                <span className="text-body-xs text-muted-foreground">Bab {activeIdea.chapterId}</span>
              </div>
              <h3 className="mt-2 font-heading text-h5 font-bold text-foreground">{activeIdea.code || "Idea tanpa kode"}</h3>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{activeIdea.provenance.length} bukti sumber</Badge>
              {!editing && payload.bundle.status !== "published" && (
                <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)} className="h-8 text-body-xs">Edit isi</Button>
              )}
            </div>
          </div>

          {editing && activeDraftIdea ? (
            <div className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`detail-idea-code-${activeIdea.id}`}>Kode singkat</Label>
                  <Input id={`detail-idea-code-${activeIdea.id}`} value={activeDraftIdea.code} onChange={(event) => updateIdeaDraft(activeDraftIdea.id, { code: event.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label>Jenis pengetahuan</Label>
                    <Select value={activeDraftIdea.knowledgeKind} onValueChange={(value) => updateIdeaDraft(activeDraftIdea.id, { knowledgeKind: value })}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(knowledgeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Peran belajar</Label>
                    <Select value={activeDraftIdea.instructionalRole} onValueChange={(value) => updateIdeaDraft(activeDraftIdea.id, { instructionalRole: value })}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(roleLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`detail-idea-statement-${activeIdea.id}`}>Pernyataan utama</Label>
                <Textarea id={`detail-idea-statement-${activeIdea.id}`} value={activeDraftIdea.canonicalStatement} onChange={(event) => updateIdeaDraft(activeDraftIdea.id, { canonicalStatement: event.target.value })} className="min-h-24" />
                <div className="rounded-lg bg-muted p-3">
                  <p className="mb-1 text-body-xs font-semibold text-foreground">Preview KaTeX</p>
                  <MathText as="div" className="text-body-base leading-relaxed text-foreground">{activeDraftIdea.canonicalStatement}</MathText>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`detail-idea-explanation-${activeIdea.id}`}>Penjelasan ringkas</Label>
                <Textarea id={`detail-idea-explanation-${activeIdea.id}`} value={activeDraftIdea.conciseExplanation} onChange={(event) => updateIdeaDraft(activeDraftIdea.id, { conciseExplanation: event.target.value })} className="min-h-24" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`detail-idea-latex-${activeIdea.id}`}>Rumus LaTeX</Label>
                <Input id={`detail-idea-latex-${activeIdea.id}`} value={activeDraftIdea.latex ?? ""} onChange={(event) => updateIdeaDraft(activeDraftIdea.id, { latex: event.target.value || null })} placeholder="Contoh: \\frac{1}{2}mv^2" />
                {activeDraftIdea.latex && (
                  <div className="rounded-lg bg-muted p-3 text-center">
                    <MathText bareMath as="div">{activeDraftIdea.latex}</MathText>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                <Button type="button" size="sm" disabled={saving} onClick={() => void saveDraft()}>Simpan perubahan</Button>
                <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => void load()}>Batal</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-2">
                <span className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Pernyataan Utama</span>
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <MathText as="div" className="text-body-base leading-relaxed text-foreground font-medium">{activeIdea.canonicalStatement}</MathText>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Penjelasan Ringkas</span>
                <div className="rounded-xl border border-border bg-card p-4">
                  <MathText as="div" className="whitespace-pre-wrap text-body-sm leading-relaxed text-foreground">{activeIdea.conciseExplanation}</MathText>
                </div>
              </div>

              {activeIdea.latex && (
                <div className="space-y-2">
                  <span className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Rumus KaTeX</span>
                  <div className="rounded-xl border border-border bg-muted/50 p-4 text-center">
                    <MathText bareMath as="div">{activeIdea.latex}</MathText>
                  </div>
                </div>
              )}

              {activeIdea.provenance.length > 0 && (
                <div className="space-y-2.5 border-t border-border pt-4">
                  <span className="text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">Bukti Sumber ({activeIdea.provenance.length})</span>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {activeIdea.provenance.map((proof) => (
                      <div key={proof.id} className="rounded-lg border border-border/80 bg-muted/20 p-3 space-y-1 text-body-xs">
                        <p className="font-semibold text-foreground">{proof.sourceTitle}{proof.pageNumber ? ` · Hal. ${proof.pageNumber}` : ""}</p>
                        <p className="text-muted-foreground leading-relaxed line-clamp-3">{proof.excerpt}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </article>
      ) : (
        <AdminEmptyState title="Idea belum tersedia" description="Bundle ini tidak memiliki Idea." />
      )}

      {/* Relations Summary (Compact) */}
      {payload.preview.relations.length > 0 && (
        <details className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <summary className="cursor-pointer text-body-sm font-semibold text-foreground">
            Hubungan Antar-Idea ({payload.preview.relations.length} relasi)
          </summary>
          <div className="mt-3 divide-y divide-border">
            {payload.preview.relations.map((rel) => (
              <div key={rel.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-body-xs">
                <span className="font-mono font-medium text-foreground">{rel.sourceIdeaId}</span>
                <Badge variant="outline">{displayLabel(rel.relationType, relationLabels)}</Badge>
                <span className="font-mono font-medium text-foreground">{rel.targetIdeaId}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Review Actions Footer (Compact) */}
      <section className="rounded-xl border border-border bg-card p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="idea-review-note" className="text-body-sm font-semibold">Catatan Review</Label>
          <span className="text-body-xs text-muted-foreground">Disimpan bersama keputusan</span>
        </div>
        <Textarea
          id="idea-review-note"
          value={reviewNote}
          onChange={(event) => setReviewNote(event.target.value)}
          placeholder="Tulis catatan jika perlu..."
          className="min-h-16 text-body-sm"
        />
        {error && <p className="text-body-xs text-status-error">{error}</p>}
        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          {payload.bundle.status === "validated" && (
            <>
              <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => void decide("approved")}>
                <Check className="size-3.5" />Setujui
              </Button>
              <Button type="button" size="sm" variant="destructive" disabled={saving} onClick={() => void decide("rejected")}>
                <X className="size-3.5" />Tolak
              </Button>
            </>
          )}
          {payload.bundle.status === "approved" && (
            <Button type="button" size="sm" disabled={saving} onClick={() => void publish()}>
              <FileCheck2 className="size-3.5" />Publikasikan
            </Button>
          )}
          {payload.bundle.status === "published" && (
            <span className="text-body-sm text-status-success font-medium">Telah dipublikasikan</span>
          )}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dedicated Product Renderers (Article, Diktat, Flashcard, Question, etc.)
// ---------------------------------------------------------------------------

function ArticleProductView({ product }: { product: Extract<ProductEntity, { productType: "article" }> }) {
  const [viewMode, setViewMode] = useState<"student" | "blocks">("student");

  const sortedBlocks = useMemo(() => {
    return [...product.blocks].sort((a, b) => a.orderIndex - b.orderIndex);
  }, [product.blocks]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <span className="text-body-xs font-semibold uppercase tracking-wider text-brand-primary">Artikel Bab</span>
          <h3 className="mt-0.5 font-heading text-h5 font-bold text-foreground">{product.title}</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={viewMode === "student" ? "secondary" : "outline"}
            onClick={() => setViewMode("student")}
            className="h-8 text-body-xs"
          >
            <BookOpen className="size-3.5" />
            Tampilan Siswa
          </Button>
          <Button
            type="button"
            size="sm"
            variant={viewMode === "blocks" ? "secondary" : "outline"}
            onClick={() => setViewMode("blocks")}
            className="h-8 text-body-xs"
          >
            <Layers className="size-3.5" />
            Blok ({sortedBlocks.length})
          </Button>
        </div>
      </div>

      {viewMode === "student" ? (
        <div className="space-y-6">
          <div className="space-y-6">
            {sortedBlocks.map((block) => {
              const parsed = parseEmbeddedContent(block.content);
              const meta = articleBlockMeta[block.blockType] ?? { label: block.blockType.replaceAll("_", " "), badge: "Materi" };

              return (
                <section key={block.id} className="space-y-2">
                  <div className="flex items-center gap-2 border-b border-border/50 pb-1.5">
                    <Badge variant="secondary" className="text-body-xs font-semibold">{meta.badge}</Badge>
                    <h4 className="font-heading text-body-sm font-semibold text-foreground">{meta.label}</h4>
                  </div>
                  <div className="prose dark:prose-invert max-w-none text-body-base leading-relaxed text-foreground">
                    <MarkdownRenderer content={parsed.content} />
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedBlocks.map((block, idx) => {
            const parsed = parseEmbeddedContent(block.content);
            const meta = articleBlockMeta[block.blockType] ?? { label: block.blockType, badge: "Blok" };

            return (
              <div key={block.id} className="rounded-xl border border-border bg-card p-4 shadow-xs space-y-2">
                <div className="flex items-center justify-between border-b border-border/60 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded bg-muted text-body-xs font-bold text-muted-foreground">{idx + 1}</span>
                    <span className="text-body-sm font-semibold text-foreground">{meta.label}</span>
                    <Badge variant="outline" className="font-mono text-[10px]">{block.blockType}</Badge>
                  </div>
                </div>
                <div className="rounded-lg bg-muted/30 p-3">
                  <MarkdownRenderer content={parsed.content} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DiktatProductView({ product }: { product: Extract<ProductEntity, { productType: "diktat" }> }) {
  const parsed = parseEmbeddedContent(product.contentMarkdown);

  return (
    <div className="space-y-4">
      <div className="border-b border-border pb-3">
        <span className="text-body-xs font-semibold uppercase tracking-wider text-brand-primary">Diktat PDF Ringkas</span>
        <h3 className="mt-0.5 font-heading text-h5 font-bold text-foreground">{product.title}</h3>
      </div>
      <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-xs">
        <div className="prose dark:prose-invert max-w-none text-body-base leading-relaxed text-foreground">
          <MarkdownRenderer content={parsed.content} />
        </div>
      </div>
    </div>
  );
}

function FlashcardProductView({ product }: { product: Extract<ProductEntity, { productType: "flashcard" }> }) {
  const [isFlipped, setIsFlipped] = useState(false);
  const parsedFront = parseEmbeddedContent(product.front);
  const parsedBack = parseEmbeddedContent(product.back);
  const parsedExplanation = parseEmbeddedContent(product.explanation);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div>
          <span className="text-body-xs font-semibold uppercase tracking-wider text-brand-primary">Kartu Hafalan</span>
          <h3 className="mt-0.5 font-heading text-h6 font-bold text-foreground">{product.id}</h3>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => setIsFlipped((prev) => !prev)}
          className="h-8 gap-1.5 text-body-xs"
        >
          <RotateCcw className="size-3.5" />
          Balik Kartu ({isFlipped ? "Depan" : "Belakang"})
        </Button>
      </div>

      {/* Interactive Flashcard */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsFlipped((prev) => !prev)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setIsFlipped((prev) => !prev); }}
        className={cn(
          "flex min-h-[220px] cursor-pointer flex-col justify-between rounded-2xl border-2 p-6 shadow-xs transition-all sm:p-8",
          isFlipped
            ? "border-brand-secondary/70 bg-card hover:border-brand-secondary"
            : "border-brand-primary/60 bg-gradient-to-b from-card to-muted/20 hover:border-brand-primary"
        )}
      >
        <div className="flex items-center justify-between border-b border-border/40 pb-2">
          <Badge variant={isFlipped ? "default" : "outline"} className="text-body-xs">
            {isFlipped ? "Sisi Belakang · Jawaban" : "Sisi Depan · Pertanyaan"}
          </Badge>
          <span className="text-body-xs text-muted-foreground flex items-center gap-1">
            <RotateCcw className="size-3" /> Klik balik
          </span>
        </div>

        <div className="my-4 text-center text-body-lg font-semibold text-foreground">
          <MarkdownRenderer content={isFlipped ? parsedBack.content : parsedFront.content} />
        </div>

        <div className="text-center text-body-xs text-muted-foreground">
          {product.ideaLinks.length > 0 ? `Idea: ${product.ideaLinks.map((l) => l.id).join(", ")}` : "Flashcard"}
        </div>
      </div>

      {/* Explanation */}
      {parsedExplanation.content && (
        <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-1.5">
          <div className="flex items-center gap-1.5 text-body-xs font-semibold text-foreground">
            <Lightbulb className="size-3.5 text-brand-secondary" />
            <span>Penjelasan</span>
          </div>
          <div className="text-body-sm text-foreground/90 pl-5">
            <MarkdownRenderer content={parsedExplanation.content} />
          </div>
        </div>
      )}
    </div>
  );
}

function FlashcardSetProductView({ product, allProducts, onSelectCard }: { product: Extract<ProductEntity, { productType: "flashcard_set" }>; allProducts: ProductEntity[]; onSelectCard: (id: string) => void }) {
  const childCards = useMemo(() => {
    return allProducts.filter((p): p is Extract<ProductEntity, { productType: "flashcard" }> => p.productType === "flashcard" && (p.setId === product.id || product.cards.includes(p.id)));
  }, [allProducts, product]);

  return (
    <div className="space-y-4">
      <div className="border-b border-border pb-3">
        <span className="text-body-xs font-semibold uppercase tracking-wider text-brand-primary">Set Flashcard</span>
        <h3 className="mt-0.5 font-heading text-h5 font-bold text-foreground">{product.title}</h3>
        <p className="text-body-xs text-muted-foreground">{product.cards.length} kartu dalam set ini</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {childCards.map((card, idx) => {
          const frontParsed = parseEmbeddedContent(card.front);

          return (
            <div
              key={card.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectCard(card.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelectCard(card.id); }}
              className="rounded-xl border border-border bg-card p-3.5 shadow-xs transition-all hover:border-brand-primary cursor-pointer space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-[10px]">#{idx + 1}</Badge>
                <span className="text-[10px] font-mono text-muted-foreground">{card.id}</span>
              </div>
              <p className="line-clamp-2 text-body-xs font-semibold text-foreground">{frontParsed.content}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QuestionProductView({ product }: { product: Extract<ProductEntity, { productType: "question" }> }) {
  const promptParsed = parseEmbeddedContent(product.prompt);
  const difficultyLabels: Record<string, string> = { easy: "Mudah", medium: "Sedang", hard: "Sulit" };
  const difficultyTones: Record<string, "success" | "warning" | "error"> = { easy: "success", medium: "warning", hard: "error" };
  const cognitiveLabels: Record<string, string> = { remember: "Mengingat", understand: "Memahami", apply: "Menerapkan", analyze: "Menganalisis", evaluate: "Mengevaluasi", create: "Mencipta" };

  return (
    <div className="space-y-4">
      {/* Compact ITB Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div>
          <span className="text-body-xs font-semibold uppercase tracking-wider text-brand-primary">{product.itbSource.eventName}</span>
          <p className="text-body-xs text-muted-foreground">Ref: <span className="font-mono font-semibold text-foreground">{product.itbSource.referenceId}</span></p>
        </div>
        <div className="flex items-center gap-1.5">
          <StatusBadge tone={difficultyTones[product.difficulty] ?? "muted"}>
            {difficultyLabels[product.difficulty] ?? product.difficulty}
          </StatusBadge>
          <Badge variant="outline">{cognitiveLabels[product.cognitiveLevel] ?? product.cognitiveLevel}</Badge>
        </div>
      </div>

      {/* Prompt */}
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-7 shadow-xs space-y-4">
        <div className="text-body-base font-medium leading-relaxed text-foreground">
          <MarkdownRenderer content={promptParsed.content} />
        </div>

        {/* Options */}
        {product.options.length > 0 && (
          <div className="space-y-2 pt-2">
            {product.options.map((opt, idx) => {
              const letter = String.fromCharCode(65 + idx);
              const optParsed = parseEmbeddedContent(opt.text);

              return (
                <div
                  key={opt.id}
                  className={cn(
                    "flex items-start gap-2.5 rounded-xl border p-3 transition-colors",
                    opt.isCorrect
                      ? "border-status-success/80 bg-status-success/10 font-medium text-foreground"
                      : "border-border bg-card text-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded text-[11px] font-bold",
                      opt.isCorrect
                        ? "bg-status-success text-white"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {letter}
                  </span>
                  <div className="min-w-0 flex-1 text-body-sm leading-relaxed">
                    <MathText as="span">{optParsed.content}</MathText>
                  </div>
                  {opt.isCorrect && (
                    <Badge variant="default" className="shrink-0 bg-status-success text-white text-[10px] gap-1">
                      <CheckCircle2 className="size-3" /> Benar
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SolutionProductView({ product }: { product: Extract<ProductEntity, { productType: "solution" }> }) {
  const contentParsed = parseEmbeddedContent(product.content);

  return (
    <div className="space-y-4">
      <div className="border-b border-border pb-3">
        <span className="text-body-xs font-semibold uppercase tracking-wider text-brand-primary">Pembahasan Soal</span>
        <h3 className="mt-0.5 font-heading text-h5 font-bold text-foreground">{product.questionId}</h3>
      </div>
      <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-xs">
        <div className="prose dark:prose-invert max-w-none text-body-base leading-relaxed text-foreground">
          <MarkdownRenderer content={contentParsed.content} />
        </div>
      </div>
    </div>
  );
}

function AssessmentBlueprintProductView({ product }: { product: Extract<ProductEntity, { productType: "assessment_blueprint" }> }) {
  return (
    <div className="space-y-4">
      <div className="border-b border-border pb-3">
        <span className="text-body-xs font-semibold uppercase tracking-wider text-brand-primary">Blueprint Asesmen ({product.assessmentType.toUpperCase()})</span>
        <h3 className="mt-0.5 font-heading text-h5 font-bold text-foreground">{product.title}</h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <h4 className="text-body-xs font-semibold text-foreground uppercase tracking-wider">Bab ({product.chapterIds.length})</h4>
          <div className="flex flex-wrap gap-1.5">
            {product.chapterIds.map((ch) => <Badge key={ch} variant="secondary">{ch}</Badge>)}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <h4 className="text-body-xs font-semibold text-foreground uppercase tracking-wider">Soal ({product.questionIds.length})</h4>
          <div className="flex flex-wrap gap-1">
            {product.questionIds.map((qid) => <span key={qid} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground">{qid}</span>)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Product Bundle Main Detail Component (Ultra Space-Efficient & Compact)
// ---------------------------------------------------------------------------

export function ProductBundleReviewDetail({ detailId, courseLabels = {} }: DetailProps) {
  const [payload, setPayload] = useState<ProductDetailPayload | null>(null);
  const [draftProducts, setDraftProducts] = useState<ProductEntity[]>([]);
  const [activeType, setActiveType] = useState("all");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
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

  const typeCounts = useMemo(() => {
    if (!payload) return {};
    return payload.previews.reduce<Record<string, number>>((counts, preview) => {
      counts[preview.productType] = (counts[preview.productType] ?? 0) + 1;
      return counts;
    }, {});
  }, [payload]);

  const visiblePreviews = useMemo(() => {
    if (!payload) return [];
    return payload.previews.filter((preview) => activeType === "all" || preview.productType === activeType);
  }, [payload, activeType]);

  const drawerFilteredPreviews = useMemo(() => {
    if (!searchQuery.trim()) return visiblePreviews;
    const q = searchQuery.toLowerCase().trim();
    return visiblePreviews.filter((preview) => preview.title.toLowerCase().includes(q) || preview.id.toLowerCase().includes(q) || preview.productType.toLowerCase().includes(q));
  }, [visiblePreviews, searchQuery]);

  const currentIndex = visiblePreviews.findIndex((preview) => preview.id === selectedProductId);
  const activePreview = visiblePreviews[currentIndex >= 0 ? currentIndex : 0] ?? payload?.previews[0] ?? null;
  const activeDraftProduct = draftProducts.find((product) => product.id === activePreview?.id) ?? null;

  function goToIndex(index: number) {
    if (index >= 0 && index < visiblePreviews.length) {
      setSelectedProductId(visiblePreviews[index].id);
      setEditing(false);
    }
  }

  function handleTypeTabChange(newType: string) {
    setActiveType(newType);
    setEditing(false);
    const matching = payload?.previews.filter((preview) => newType === "all" || preview.productType === newType) ?? [];
    if (matching.length > 0) {
      setSelectedProductId(matching[0].id);
    }
  }

  function handleSelectProduct(id: string) {
    setSelectedProductId(id);
    setEditing(false);
    setDrawerOpen(false);
    const prod = payload?.previews.find((p) => p.id === id);
    if (prod && activeType !== "all" && prod.productType !== activeType) {
      setActiveType(prod.productType);
    }
  }

  if (loading) return <DetailLoading />;
  if (error && !payload) return <AdminErrorState message={error} onRetry={() => void load()} />;
  if (!payload) return <AdminEmptyState title="Artifact tidak ditemukan" description="Artifact mungkin sudah dihapus atau tidak dapat dibaca." />;

  return (
    <div className="space-y-4">
      {/* Compact Meta Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-3 text-body-sm">
          <span className="font-semibold text-foreground">{payload.bundle.courseId ? courseLabels[payload.bundle.courseId] ?? payload.bundle.courseId : "Belum terpetakan"}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground"><FormattedDate date={payload.bundle.createdAt} /></span>
          <span className="text-muted-foreground">·</span>
          <span className="font-medium text-foreground">{payload.previews.length} bagian</span>
        </div>
        <DetailStatus status={payload.bundle.status} />
      </div>

      {/* Tabs & Compact Navigator Header */}
      <AdminTabs value={activeType} onValueChange={handleTypeTabChange}>
        <div className="space-y-2.5">
          <AdminTabsList className="max-w-full overflow-x-auto">
            <AdminTabsTrigger value="all">Semua ({payload.previews.length})</AdminTabsTrigger>
            {Object.entries(typeCounts).map(([type, count]) => (
              <AdminTabsTrigger key={type} value={type}>
                {productLabels[type] ?? type} ({count})
              </AdminTabsTrigger>
            ))}
          </AdminTabsList>

          {/* Stepper + Quick Selector Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/40 p-2 shadow-xs">
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={currentIndex <= 0}
                onClick={() => goToIndex(currentIndex - 1)}
                aria-label="Bagian sebelumnya"
                className="h-8 px-2.5"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="px-1 font-mono text-body-xs font-semibold text-foreground">
                {currentIndex >= 0 ? currentIndex + 1 : 1} / {visiblePreviews.length}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={currentIndex >= visiblePreviews.length - 1}
                onClick={() => goToIndex(currentIndex + 1)}
                aria-label="Bagian berikutnya"
                className="h-8 px-2.5"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>

            {/* Quick Dropdown Selector */}
            <div className="min-w-0 flex-1 max-w-md">
              <Select value={activePreview?.id ?? ""} onValueChange={handleSelectProduct}>
                <SelectTrigger className="h-8 text-body-xs">
                  <SelectValue placeholder="Pilih bagian..." />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {visiblePreviews.map((preview, idx) => (
                    <SelectItem key={preview.id} value={preview.id} className="text-body-xs">
                      <span className="font-semibold">#{idx + 1}</span> {preview.title || preview.id} ({productLabels[preview.productType] ?? preview.productType})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Drawer for 60+ Items Search List */}
            <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
              <SheetTrigger asChild>
                <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-body-xs">
                  <ListFilter className="size-3.5" />
                  Daftar ({visiblePreviews.length})
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="flex flex-col w-full sm:max-w-md p-4">
                <SheetHeader className="pb-3 border-b border-border">
                  <SheetTitle className="text-body-base font-semibold">Daftar Bagian ({visiblePreviews.length})</SheetTitle>
                  <div className="mt-2">
                    <SearchBar
                      size="sm"
                      value={searchQuery}
                      onSearch={setSearchQuery}
                      onClear={() => setSearchQuery("")}
                      placeholder="Cari bagian..."
                    />
                  </div>
                </SheetHeader>
                <div className="flex-1 overflow-y-auto space-y-1 py-3 pr-1">
                  {drawerFilteredPreviews.map((preview, index) => (
                    <button
                      key={preview.id}
                      type="button"
                      onClick={() => handleSelectProduct(preview.id)}
                      className={cn(
                        "w-full rounded-lg p-2.5 text-left text-body-xs transition-colors hover:bg-muted",
                        activePreview?.id === preview.id ? "bg-muted font-semibold border-l-2 border-brand-primary" : "text-foreground"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground truncate">{preview.title || `Bagian ${index + 1}`}</span>
                        <Badge variant="outline" className="text-[10px] shrink-0">{productLabels[preview.productType] ?? preview.productType}</Badge>
                      </div>
                      <span className="text-[11px] text-muted-foreground font-mono">{preview.id}</span>
                    </button>
                  ))}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        <AdminTabsContent value={activeType} className="mt-4">
          {/* 100% Canvas Width for Content Review */}
          {activePreview ? (
            <article key={activePreview.id} className="rounded-xl border border-border bg-card p-5 sm:p-7 shadow-xs space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
                <div>
                  <Badge variant="secondary" className="text-body-xs font-semibold">{productLabels[activePreview.productType] ?? activePreview.productType}</Badge>
                  <h3 className="mt-1.5 font-heading text-h5 font-bold text-foreground">{activePreview.title || "Bagian tanpa judul"}</h3>
                  <span className="text-body-xs text-muted-foreground font-mono">ID: {activePreview.id} · Versi {activePreview.version}</span>
                </div>
                {!editing && payload.bundle.status === "draft" && (
                  <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)} className="h-8 text-body-xs">Edit isi</Button>
                )}
              </div>

              {editing && activeDraftProduct ? (
                <div className="space-y-4">
                  <ProductDraftEditor
                    product={activeDraftProduct}
                    index={draftProducts.findIndex((product) => product.id === activeDraftProduct.id)}
                    preview={activePreview}
                    onChange={(next) => setDraftProducts((current) => current.map((product) => product.id === next.id ? next : product))}
                  />
                  <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                    <Button type="button" size="sm" disabled={saving} onClick={() => void saveDraft()}>Simpan perubahan</Button>
                    <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => void load()}>Batal</Button>
                  </div>
                </div>
              ) : activeDraftProduct ? (
                <div className="space-y-6">
                  {activeDraftProduct.productType === "article" && (
                    <ArticleProductView product={activeDraftProduct} />
                  )}
                  {activeDraftProduct.productType === "diktat" && (
                    <DiktatProductView product={activeDraftProduct} />
                  )}
                  {activeDraftProduct.productType === "flashcard" && (
                    <FlashcardProductView product={activeDraftProduct} />
                  )}
                  {activeDraftProduct.productType === "flashcard_set" && (
                    <FlashcardSetProductView
                      product={activeDraftProduct}
                      allProducts={draftProducts}
                      onSelectCard={handleSelectProduct}
                    />
                  )}
                  {activeDraftProduct.productType === "question" && (
                    <QuestionProductView product={activeDraftProduct} />
                  )}
                  {activeDraftProduct.productType === "solution" && (
                    <SolutionProductView product={activeDraftProduct} />
                  )}
                  {activeDraftProduct.productType === "assessment_blueprint" && (
                    <AssessmentBlueprintProductView product={activeDraftProduct} />
                  )}

                  {activePreview.traceability.ideaIds.length > 0 && (
                    <div className="border-t border-border pt-3 text-body-xs text-muted-foreground flex flex-wrap gap-2">
                      <span className="font-semibold text-foreground">Idea terkait:</span>
                      {activePreview.traceability.ideaIds.map((id) => (
                        <span key={id} className="font-mono">{id}</span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {activePreview.sections.map((section) => (
                    <div key={section.label} className="space-y-1 border-b border-border/60 pb-3 last:border-0">
                      <h4 className="text-body-xs font-semibold text-foreground uppercase tracking-wider">{section.label}</h4>
                      <MathText as="div" className="whitespace-pre-wrap text-body-sm text-foreground">{section.content}</MathText>
                    </div>
                  ))}
                </div>
              )}
            </article>
          ) : (
            <AdminEmptyState title="Bagian belum tersedia" description="Tidak ada bagian yang cocok dengan filter." />
          )}
        </AdminTabsContent>
      </AdminTabs>

      {/* Review Actions Footer (Compact) */}
      <section className="rounded-xl border border-border bg-card p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="product-review-note" className="text-body-sm font-semibold">Catatan Review</Label>
          <span className="text-body-xs text-muted-foreground">Disimpan bersama keputusan</span>
        </div>
        <Textarea
          id="product-review-note"
          value={reviewNote}
          onChange={(event) => setReviewNote(event.target.value)}
          placeholder="Tulis catatan jika perlu..."
          className="min-h-16 text-body-sm"
        />
        {error && <p className="text-body-xs text-status-error">{error}</p>}
        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          {payload.bundle.status === "draft" && !reviewDecision && (
            <>
              <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => void decide("approved")}>
                <Check className="size-3.5" />Setujui
              </Button>
              <Button type="button" size="sm" variant="destructive" disabled={saving} onClick={() => void decide("rejected")}>
                <X className="size-3.5" />Tolak
              </Button>
            </>
          )}
          {payload.bundle.status === "draft" && reviewDecision === "approved" && (
            <Button type="button" size="sm" disabled={saving || payload.publicationBlocked} onClick={() => void mutate("publish")}>
              <FileCheck2 className="size-3.5" />Publikasikan
            </Button>
          )}
          {payload.bundle.status === "draft" && (
            <Button type="button" size="sm" variant="destructive" disabled={saving} onClick={() => void mutate("discard")}>
              <ArchiveX className="size-3.5" />Hapus draft
            </Button>
          )}
          {payload.bundle.status === "published" && (
            <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => void mutate("withdraw")}>
              <ArchiveX className="size-3.5" />Tarik publikasi
            </Button>
          )}
          {payload.bundle.status === "published" && (
            <span className="text-body-sm text-status-success font-medium">Telah dipublikasikan</span>
          )}
        </div>
      </section>
    </div>
  );
}
