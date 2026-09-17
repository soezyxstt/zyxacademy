"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArchiveX,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  FileText,
  Info,
  Layers,
  Lightbulb,
  ListFilter,
  Loader2,
  MessageSquareText,
  MoreHorizontal,
  RotateCcw,
  ShieldAlert,
  Trash2,
  X
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { DropdownMenu } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchBar } from "@/components/ui/search-bar";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { AdminEmptyState, AdminErrorState } from "@/components/admin/state-panels";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlTab } from "@/hooks/use-url-tab";
import { StatusBadge } from "@/components/admin/status-badges";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { FormattedDate } from "@/components/ui/formatted-date";
import { MathText } from "@/components/course/math-text";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { ArticleReadingCanvas } from "@/components/course/article-reading-canvas";
import { StructuredArticleSectionContent } from "@/components/course/structured-article-reader";
import { FormativeCheckEndpointProvider } from "@/components/course/formative-check-endpoint-context";
import {
  computeDeterministicSectionNumbering,
  sanitizeFormativeCheck,
  sanitizeWorkedExample,
  type PublicSectionReadModel,
} from "@/lib/articles/structured-read-model";
import { explainBundleError } from "@/lib/bundle/admin-errors";
import { ProductDraftEditor } from "@/components/admin/product-draft-editor";
import {
  PEDAGOGIC_CRITERION_IDS,
  QUALITY_POLICY_VERSION,
  type PedagogicCriterionId,
  type PedagogicRubricItem,
} from "@/lib/materials/quality-policy";
import type { ProductPreview } from "@/lib/bundle/product-preview";
import type { ProductDependency, ProductEntity } from "@/lib/bundle/product-validator";
import { cn } from "@/lib/utils";
import styles from "./material-review-detail.module.css";

type DetailProps = {
  detailId: string;
  courseLabels?: Record<string, string>;
  backHref?: string;
};

type IdeaPreview = {
  summary: { ideaCount: number; sourceCount: number; excerptCount: number; relationCount: number; learningSectionCount: number; ai: { provider: string; model: string; promptVersion: string } | null };
  learningSections: { id: string; chapterId: string; parentSectionId: string | null; title: string; slug: string; orderIndex: number; learningObjective: string; primaryIdeaIds: readonly string[]; supportingIdeaIds: readonly string[]; sourceChunkIds: readonly string[] }[];
  ideas: {
    id: string;
    code: string;
    chapterId: string;
    canonicalStatement: string;
    conciseExplanation: string;
    latex: string | null;
    knowledgeKind: string;
    instructionalRole: string;
    learningSection: { id: string; title: string; slug: string } | null;
    provenance: { id: string; role: string; sourceTitle: string; excerpt: string; sectionLocator: string | null; pageNumber: number | null; note: string | null }[];
  }[];
  relations: { id: string; sourceIdeaId: string; targetIdeaId: string; relationType: string; explanation: string | null }[];
};

type IdeaDetailPayload = {
  bundle: { id: string; bundleId: string; courseId: string | null; status: string; checksum: string; createdAt: string; reviews?: { status: string; notes: string | null }[] };
  preview: IdeaPreview;
  draft: IdeaDraft;
  itemReviews: { id: string; targetType: "idea"; targetId: string; status: "pending" | "approved" | "changes_requested"; notes: string | null }[];
  structuredReaderEnabled?: boolean;
};

export type ProductBlockReview = {
  id: string;
  importId?: string;
  reviewerId?: string;
  productId: string;
  blockId?: string;
  targetType?: "article_section" | "article_block";
  targetId?: string;
  status: "pending" | "approved" | "changes_requested";
  notes: string | null;
  reviewedAt?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

export type ProductBlockReviewSummary = {
  total: number;
  pending: number;
  approved: number;
  changesRequested: number;
};

export type QualityIssue = {
  code: string;
  severity: "blocking" | "warning";
  target: { targetType: string; targetId: string };
  reason: string;
  remediation?: string;
};

export type QualityEvaluationState = {
  valid: boolean;
  publicationReady: boolean;
  policyVersion: string;
  contentFingerprint: string;
  issues: QualityIssue[];
  metrics?: Record<string, number>;
};

export type PedagogicReviewState = {
  id: string;
  status: "approved" | "rejected" | "changes_requested";
  policyVersion: string;
  contentFingerprint: string;
  criteria: Array<{
    criterionId: PedagogicCriterionId;
    status: "met" | "needs_revision" | "not_met";
    reason: string;
    contentAnchors: Array<{ targetType: "section" | "block" | "visual" | "document"; targetId: string }>;
  }>;
  exceptions?: Array<{
    criterionId: PedagogicCriterionId;
    approved: boolean;
    reason: string;
  }>;
  notes?: string | null;
  createdAt: string | Date;
};

export type PdfEvidenceState = {
  id?: string;
  status: "none" | "pending" | "ready" | "failed" | "stale";
  productId?: string;
  pageCount?: number;
  failureCode?: string;
  message?: string;
};

export type RevisionFreshnessState = {
  currentFingerprint: string;
  reviewFingerprint: string | null;
  isFresh: boolean;
  isFingerprintMatch: boolean;
  isPolicyMatch: boolean;
  policyVersion: string;
  completenessState: "incomplete" | "complete" | "stale";
};

export type ProductDetailPayload = {
  bundle: {
    id: string;
    bundleId: string;
    courseId: string | null;
    status: string;
    checksum: string;
    createdAt: string;
    currentReview?: { id: string; status: string; notes: string | null; reviewedAt: string | Date } | null;
    reviews?: { id?: string; reviewerId?: string; status: string; notes: string | null; reviewedAt?: string }[];
  };
  previews: ProductPreview[];
  draft: { products: ProductEntity[] };
  publicationBlocked?: boolean;
  dependencies?: ProductDependency[];
  blockReviews?: ProductBlockReview[];
  blockReviewSummary?: ProductBlockReviewSummary;
  structuredReaderEnabled?: boolean;
  qualityEvaluation?: QualityEvaluationState;
  pedagogicReview?: PedagogicReviewState | null;
  pdfStatus?: PdfEvidenceState;
  blockingIssues?: QualityIssue[];
  revisionFreshness?: RevisionFreshnessState;
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
  discarding: "Penghapusan tertunda",
};

const statusTones: Record<string, "muted" | "info" | "success" | "warning" | "error" | "brand"> = {
  validated: "warning",
  approved: "success",
  rejected: "error",
  draft: "info",
  published: "success",
  withdrawn: "muted",
  discarding: "warning",
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

function shortIdeaCode(code: string): string {
  return code.replace(/^[^-]+-/, "");
}

function ideaName(idea: IdeaPreview["ideas"][number] | undefined): string {
  if (!idea) return "Idea tidak ditemukan";
  const code = shortIdeaCode(idea.code);
  if (!code) return idea.learningSection?.title ?? "Idea tanpa nama";
  return code
    .toLocaleLowerCase("id-ID")
    .replaceAll("-", " ")
    .replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase("id-ID"));
}

function readableSourceExcerpt(excerpt: string): string {
  return excerpt
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^:::.*$/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

export function IdeaBundleReviewDetail({ detailId, backHref }: DetailProps) {
  const router = useRouter();
  const [payload, setPayload] = useState<IdeaDetailPayload | null>(null);
  const [draft, setDraft] = useState<IdeaDraft | null>(null);
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "changes_requested">("all");
  const [ideaReviewNotes, setIdeaReviewNotes] = useState<Record<string, string>>({});
  const [reviewNote, setReviewNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<"discard" | "withdraw" | null>(null);

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
      const response = await fetch(`/api/admin/bundles/idea/${encodeURIComponent(payload.bundle.id)}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ draft, expectedRevision: payload.bundle.checksum }) });
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
    const statusMatches = (idea: IdeaPreview["ideas"][number]) => statusFilter === "all" || (payload?.itemReviews.find((review) => review.targetId === idea.id)?.status ?? "pending") === statusFilter;
    if (!searchQuery.trim()) return ideasList.filter(statusMatches);
    const q = searchQuery.toLowerCase().trim();
    return ideasList.filter((idea) => statusMatches(idea) && (idea.code.toLowerCase().includes(q) || idea.canonicalStatement.toLowerCase().includes(q) || idea.id.toLowerCase().includes(q)));
  }, [ideasList, payload?.itemReviews, searchQuery, statusFilter]);

  async function saveIdeaItemReview(status: "pending" | "approved" | "changes_requested") {
    if (!activeIdea) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/bundles/idea/${encodeURIComponent(payload!.bundle.id)}/item-reviews`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetType: "idea", targetId: activeIdea.id, status, notes: ideaReviewNotes[activeIdea.id]?.trim() || undefined }),
      });
      const result = await response.json() as { result?: IdeaDetailPayload["itemReviews"][number]; error?: string };
      if (!response.ok) throw new Error(result.error || "IDEA_ITEM_REVIEW_UPDATE_FAILED");
      if (!result.result) throw new Error("IDEA_ITEM_REVIEW_UPDATE_FAILED");
      const nextReviews = [
        ...payload!.itemReviews.filter((review) => review.targetId !== activeIdea.id),
        result.result,
      ];
      setPayload((current) => current ? { ...current, itemReviews: nextReviews } : current);
      const nextPending = ideasList
        .slice(currentIndex + 1)
        .find((idea) => (nextReviews.find((review) => review.targetId === idea.id)?.status ?? "pending") === "pending");
      if (nextPending) setSelectedIdeaId(nextPending.id);
    } catch (reviewError) {
      setError(explainBundleError(reviewError instanceof Error ? reviewError.message : "IDEA_ITEM_REVIEW_UPDATE_FAILED"));
    } finally {
      setSaving(false);
    }
  }

  function goToIndex(index: number) {
    if (index >= 0 && index < ideasList.length) {
      setSelectedIdeaId(ideasList[index].id);
      setEditing(false);
    }
  }

  async function mutate(action: "discard" | "withdraw") {
    if (!payload) return;
    setSaving(true);
    setError(null);
    try {
      const endpoint = action === "withdraw"
        ? `/api/admin/bundles/idea/${encodeURIComponent(payload.bundle.id)}/withdraw`
        : `/api/admin/bundles/idea/${encodeURIComponent(payload.bundle.id)}`;
      const response = await fetch(endpoint, { method: action === "discard" ? "DELETE" : "POST" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || `IDEA_BUNDLE_${action.toUpperCase()}_FAILED`);
      if (action === "discard") {
        router.replace(backHref ?? "/admin/materials/review?section=idea");
      } else {
        setPayload((current) => current ? { ...current, bundle: { ...current.bundle, status: "withdrawn" } } : current);
      }
    } catch (mutationError) {
      setError(explainBundleError(mutationError instanceof Error ? mutationError.message : "IDEA_BUNDLE_UPDATE_FAILED"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <DetailLoading />;
  if (error && !payload) return <AdminErrorState message={error} onRetry={() => void load()} />;
  if (!payload) return <AdminEmptyState title="Artifact tidak ditemukan" description="Artifact mungkin sudah dihapus atau tidak dapat dibaca." />;

  return (
    <div className="space-y-4">
      {/* Top Navigator Bar */}
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

        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
          <SelectTrigger className="h-8 w-40 text-body-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua status</SelectItem>
            <SelectItem value="pending">Menunggu review</SelectItem>
            <SelectItem value="approved">Disetujui</SelectItem>
            <SelectItem value="changes_requested">Perlu revisi</SelectItem>
          </SelectContent>
        </Select>

        {/* Drawer Trigger for 60+ Items Search List */}
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetTrigger asChild>
            <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-body-sm">
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
                    <span className="font-semibold text-foreground">{shortIdeaCode(idea.code) || `Idea ${index + 1}`}</span>
                    <Badge variant="outline" className="text-[10px]">{idea.provenance.length} sumber</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-muted-foreground"><MathText as="span">{idea.canonicalStatement}</MathText></p>
                </button>
              ))}
            </div>
          </SheetContent>
        </Sheet>

      </div>

      {/* 100% Width Canvas for Idea Content */}
      {activeIdea ? (
        <div className={cn("grid items-start gap-5", payload.structuredReaderEnabled && "lg:grid-cols-[minmax(240px,0.7fr)_minmax(0,2.3fr)]")}>
          {payload.structuredReaderEnabled ? <aside className="sticky top-4 hidden max-h-[calc(100vh-2rem)] space-y-3 overflow-y-auto lg:block">
            <SearchBar size="sm" value={searchQuery} onSearch={setSearchQuery} onClear={() => setSearchQuery("")} placeholder="Cari Idea" />
            {filteredIdeas.map((idea) => {
              const status = payload.itemReviews.find((review) => review.targetId === idea.id)?.status ?? "pending";
              return <button key={idea.id} type="button" aria-label={`${shortIdeaCode(idea.code)}, ${blockReviewLabels[status]}`} onClick={() => { setSelectedIdeaId(idea.id); setEditing(false); }} className={cn("w-full rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", status === "approved" ? "border-status-success/50 bg-status-success/10 hover:bg-status-success/15" : status === "changes_requested" ? "border-status-warning/60 bg-status-warning/10 hover:bg-status-warning/15" : "border-border bg-card hover:bg-muted/50", activeIdea.id === idea.id && "ring-2 ring-primary ring-offset-1 ring-offset-background")}><span className="text-body-sm font-semibold">{shortIdeaCode(idea.code)}</span><p className="mt-1 line-clamp-2 text-body-xs text-muted-foreground"><MathText as="span">{idea.canonicalStatement}</MathText></p></button>;
            })}
          </aside> : null}
        <article key={activeIdea.id} className="space-y-6 rounded-xl border border-border bg-card p-5 shadow-xs sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-body-xs font-semibold">{displayLabel(activeIdea.knowledgeKind, knowledgeLabels)}</Badge>
                <Badge variant="outline" className="text-body-xs">{displayLabel(activeIdea.instructionalRole, roleLabels)}</Badge>
                <span className="text-body-xs text-muted-foreground">Bab {activeIdea.chapterId}</span>
              </div>
              <h3 className="mt-2 font-heading text-body-base font-bold text-foreground">{shortIdeaCode(activeIdea.code) || "Idea tanpa kode"}</h3>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{activeIdea.provenance.length} bukti sumber</Badge>
              {!editing && !["published", "withdrawn", "discarding"].includes(payload.bundle.status) && (
                <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)} className="h-8 text-body-sm">Edit isi</Button>
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
                  <div className="grid gap-2">
                    {activeIdea.provenance.map((proof) => (
                      <div key={proof.id} className="space-y-1.5 rounded-lg border border-border/80 bg-muted/20 p-4">
                        <p className="text-body-sm font-semibold text-foreground">{proof.sourceTitle}{proof.pageNumber ? ` · Hal. ${proof.pageNumber}` : ""}</p>
                        <div className="text-body-sm leading-relaxed text-muted-foreground">
                          <MarkdownRenderer content={readableSourceExcerpt(proof.excerpt)} density="compact" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {!["published", "withdrawn", "discarding"].includes(payload.bundle.status) ? (
            <div className="space-y-3 border-t border-border pt-4">
              <Textarea
                value={ideaReviewNotes[activeIdea.id] ?? payload.itemReviews.find((review) => review.targetId === activeIdea.id)?.notes ?? ""}
                onChange={(event) => setIdeaReviewNotes((current) => ({ ...current, [activeIdea.id]: event.target.value }))}
                placeholder="Catatan review Idea"
                className="min-h-20 text-body-sm"
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" disabled={saving} onClick={() => void saveIdeaItemReview("approved")} className="bg-status-success text-white hover:bg-status-success/90">
                  <Check className="size-4" />Setujui dan lanjut
                </Button>
                <Button type="button" size="sm" disabled={saving} variant="outline" onClick={() => void saveIdeaItemReview("changes_requested")} className="border-status-warning text-status-warning">
                  <AlertTriangle className="size-4" />Perlu perbaikan
                </Button>
                {(payload.itemReviews.find((review) => review.targetId === activeIdea.id)?.status ?? "pending") !== "pending" ? (
                  <Button type="button" size="sm" disabled={saving} variant="ghost" onClick={() => void saveIdeaItemReview("pending")}>
                    <RotateCcw className="size-4" />Batalkan status
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </article>
        </div>
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
                <span className="font-medium text-foreground">{ideaName(ideasList.find((idea) => idea.id === rel.sourceIdeaId))}</span>
                <Badge variant="outline">{displayLabel(rel.relationType, relationLabels)}</Badge>
                <span className="font-medium text-foreground">{ideaName(ideasList.find((idea) => idea.id === rel.targetIdeaId))}</span>
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
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <div className="flex flex-wrap gap-2">
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
          {payload.bundle.status === "withdrawn" && (
            <span className="text-body-sm font-medium text-muted-foreground">Publikasi telah ditarik</span>
          )}
          {payload.bundle.status === "discarding" && (
            <span className="text-body-sm font-medium text-status-warning">Penghapusan ZIP perlu dicoba lagi</span>
          )}
          </div>
          {(["validated", "approved", "rejected", "published", "discarding"] as string[]).includes(payload.bundle.status) && (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button type="button" size="sm" variant="outline" disabled={saving} aria-label="Aksi lainnya">
                  <MoreHorizontal className="size-4" />Aksi lainnya
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-44 rounded-lg border border-border bg-popover p-1 text-body-sm text-popover-foreground shadow-lg">
                  {payload.bundle.status === "published" ? (
                    <DropdownMenu.Item onSelect={() => setConfirmAction("withdraw")} className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-status-error outline-none focus:bg-muted">
                      <ArchiveX className="size-3.5" />Tarik publikasi
                    </DropdownMenu.Item>
                  ) : (
                    <DropdownMenu.Item onSelect={() => setConfirmAction("discard")} className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-status-error outline-none focus:bg-muted">
                      <Trash2 className="size-3.5" />Hapus bundle
                    </DropdownMenu.Item>
                  )}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          )}
        </div>
      </section>
      <AdminConfirmDialog
        open={confirmAction !== null}
        onOpenChange={(open) => { if (!open) setConfirmAction(null); }}
        title={confirmAction === "withdraw" ? "Tarik publikasi Idea Bundle" : "Hapus Idea Bundle"}
        description={confirmAction === "withdraw" ? "Idea dan sumber dari bundle ini tidak lagi aktif. Riwayat dan audit tetap disimpan." : "Bundle staging dan ZIP akan dihapus permanen."}
        confirmLabel={confirmAction === "withdraw" ? "Ya, Tarik Publikasi" : "Ya, Hapus Bundle"}
        icon={confirmAction === "withdraw" ? ArchiveX : Trash2}
        destructive
        loading={saving}
        onConfirm={() => { const action = confirmAction; setConfirmAction(null); if (action) void mutate(action); }}
      />
    </div>
  );
}

const blockReviewLabels: Record<string, string> = {
  pending: "Menunggu review",
  approved: "Disetujui",
  changes_requested: "Perlu revisi",
};

const blockReviewTones: Record<string, "muted" | "success" | "warning"> = {
  pending: "muted",
  approved: "success",
  changes_requested: "warning",
};

// ---------------------------------------------------------------------------
// Block Inspector Component for Article View
// ---------------------------------------------------------------------------

function ArticleBlockInspector({
  block,
  parsed,
  review,
  product,
  dependencies = [],
}: {
  block: Extract<ProductEntity, { productType: "article" }>["blocks"][number] | null;
  parsed: ParsedBlockContent | null;
  review: ProductBlockReview | null;
  product: Extract<ProductEntity, { productType: "article" }>;
  dependencies?: ProductDependency[];
}) {
  if (!block || !parsed) {
    return (
      <div className="p-4 text-center text-body-xs text-muted-foreground">
        Pilih blok materi di samping untuk memeriksa metadata dan detailnya.
      </div>
    );
  }

  const meta = articleBlockMeta[block.blockType] ?? { label: block.blockType, badge: "Blok" };
  const ideaIds = parsed.metadata?.ideaIds ?? product.ideaLinks.map((l) => l.id);
  const sourceRefs = parsed.metadata?.sourceRefs ?? product.sourceRefs;
  const learningPurpose = parsed.metadata?.learningPurpose;
  const applicability = parsed.metadata?.applicability;

  const matchingDeps = dependencies.filter(
    (dep) =>
      dep.downstreamEntityId === product.id ||
      (ideaIds.length > 0 && ideaIds.includes(dep.upstreamEntityId))
  );

  const freshnessLabels: Record<string, string> = {
    UP_TO_DATE: "Mutakhir",
    NEEDS_REVIEW: "Perlu review",
    STALE: "Kedaluwarsa",
  };

  const freshnessTones: Record<string, "success" | "warning" | "error" | "muted"> = {
    UP_TO_DATE: "success",
    NEEDS_REVIEW: "warning",
    STALE: "error",
  };

  return (
    <div className="space-y-4 text-left">
      {/* Header Info */}
      <div className="border-b border-border pb-3">
        <div className="flex items-center justify-between gap-2">
          <Badge variant="secondary" className="text-body-xs font-semibold">
            {meta.badge}
          </Badge>
          <StatusBadge tone={blockReviewTones[review?.status ?? "pending"]}>
            {blockReviewLabels[review?.status ?? "pending"]}
          </StatusBadge>
        </div>
        <h4 className="mt-1.5 font-heading text-body-sm font-bold text-foreground">
          {block.orderIndex + 1}. {meta.label}
        </h4>
        <p className="mt-0.5 font-mono text-body-xs text-muted-foreground">{block.id}</p>
      </div>

      {/* Review Status & Note */}
      {review?.notes && (
        <div className="rounded-lg border border-border/80 bg-muted/40 p-2.5 space-y-1">
          <span className="text-body-xs font-semibold text-foreground">Catatan review</span>
          <p className="text-body-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {review.notes}
          </p>
        </div>
      )}

      {/* Learning Purpose */}
      {learningPurpose && (
        <div className="space-y-1">
          <span className="text-body-xs font-semibold text-foreground">Tujuan belajar</span>
          <p className="text-body-xs text-muted-foreground leading-relaxed bg-muted/20 p-2.5 rounded-lg border border-border/60">
            {learningPurpose}
          </p>
        </div>
      )}

      {/* Applicability */}
      {applicability && (
        <div className="space-y-1">
          <span className="text-body-xs font-semibold text-foreground">Kesesuaian materi</span>
          <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5 text-body-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status:</span>
              <span className="font-semibold text-foreground">{applicability.status}</span>
            </div>
            {applicability.reason && (
              <p className="text-muted-foreground leading-relaxed pt-1 border-t border-border/40">
                {applicability.reason}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Idea Traceability */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-body-xs font-semibold text-foreground">Idea terkait</span>
          <Badge variant="outline" className="text-body-xs">{ideaIds.length}</Badge>
        </div>
        {ideaIds.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {ideaIds.map((id) => (
              <span key={id} className="rounded bg-muted px-1.5 py-0.5 font-mono text-body-xs text-foreground">
                {id}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-body-xs text-muted-foreground">Tidak ada relasi Idea spesifik.</p>
        )}
      </div>

      {/* Source References & Excerpts */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-body-xs font-semibold text-foreground">Referensi sumber</span>
          <Badge variant="outline" className="text-body-xs">{sourceRefs.length}</Badge>
        </div>
        {sourceRefs.length > 0 ? (
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {sourceRefs.map((ref, idx) => (
              <div key={`${ref.sourceId}-${idx}`} className="rounded-lg border border-border/60 bg-muted/20 p-2 text-body-xs space-y-1">
                <p className="font-semibold text-foreground truncate">{ref.sourceId}</p>
                {ref.excerptIds && ref.excerptIds.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {ref.excerptIds.map((eid) => (
                      <span key={eid} className="rounded bg-background px-1 py-0.5 font-mono text-body-xs text-muted-foreground border border-border">
                        {eid}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-body-xs text-muted-foreground">Tidak ada referensi sumber eksplisit.</p>
        )}
      </div>

      {/* Matching Dependency Freshness */}
      {matchingDeps.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-body-xs font-semibold text-foreground">Kesegaran dependensi</span>
          <div className="space-y-1">
            {matchingDeps.map((dep) => (
              <div key={dep.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 p-2 text-body-xs">
                <span className="font-mono text-body-xs truncate text-muted-foreground">{dep.upstreamEntityId}</span>
                <StatusBadge tone={freshnessTones[dep.freshness] ?? "muted"}>
                  {freshnessLabels[dep.freshness] ?? dep.freshness}
                </StatusBadge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dedicated Product Renderers (Article, Diktat, Flashcard, Question, etc.)
// ---------------------------------------------------------------------------

function StructuredArticleProductView({
  product,
  bundleId,
  bundleStatus,
  reviewLocked,
  itemReviews,
  onReviewChange,
  dependencies,
}: {
  product: Extract<ProductEntity, { productType: "article" }>;
  bundleId: string;
  bundleStatus: string;
  reviewLocked: boolean;
  itemReviews: ProductBlockReview[];
  onReviewChange?: (review: ProductBlockReview) => void;
  dependencies: ProductDependency[];
}) {
  const sections = useMemo(() => [...product.sections].sort((a, b) => a.orderIndex - b.orderIndex), [product.sections]);
  const [selectedSectionId, setSelectedSectionId] = useState(sections[0]?.id ?? "");
  const [mobileQueueOpen, setMobileQueueOpen] = useState(false);
  const [mobileEvidenceOpen, setMobileEvidenceOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState("");
  const [reviewError, setReviewError] = useState<string | null>(null);
  const numbering = useMemo(() => computeDeterministicSectionNumbering(
    sections.map((section) => ({
      id: section.id,
      orderIndex: section.orderIndex,
      parentSectionId: section.parentSectionId,
      sectionKind: section.kind,
    })),
  ), [sections]);
  const selected = sections.find((section) => section.id === selectedSectionId) ?? sections[0];
  const reviews = itemReviews.filter((review) => review.productId === product.id && review.targetType === "article_section");
  const review = selected ? reviews.find((entry) => entry.targetId === selected.id) : undefined;
  const publicSection: PublicSectionReadModel | null = selected ? {
    id: selected.id,
    slug: selected.slug,
    title: selected.title,
    sectionNumber: numbering.get(selected.id) ?? String(selected.orderIndex + 1),
    sectionKind: selected.kind,
    learningObjective: selected.learningObjective,
    estimatedReadingMinutes: Math.max(1, Math.round(selected.blocks.reduce((total, block) => total + block.contentMarkdown.trim().split(/\s+/).length, 0) / 200)),
    orderIndex: selected.orderIndex,
    parentSectionId: selected.parentSectionId ?? null,
    blocks: [...selected.blocks].sort((a, b) => a.orderIndex - b.orderIndex).map((block) => ({
      id: block.id,
      blockKey: block.id,
      blockType: block.blockType,
      title: block.title ?? null,
      orderIndex: block.orderIndex,
      content: block.contentMarkdown,
      workedExample: sanitizeWorkedExample(block.workedExamplePayload),
      formativeCheck: sanitizeFormativeCheck(block.formativeCheckPayload),
    })),
  } : null;

  useEffect(() => {
    setNotes(review?.notes ?? "");
  }, [review?.notes, selected?.id]);

  async function saveSectionReview(status: ProductBlockReview["status"]) {
    if (!selected || bundleStatus !== "draft" || reviewLocked) return;
    setSaving(true);
    setReviewError(null);
    try {
      const response = await fetch(`/api/admin/bundles/product/${encodeURIComponent(bundleId)}/item-reviews`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetType: "article_section", targetId: selected.id, productId: product.id, status, notes: notes.trim() || undefined }),
      });
      const data = await response.json() as { result?: ProductBlockReview; error?: string };
      if (!response.ok || !data.result) throw new Error(data.error || "PRODUCT_SECTION_REVIEW_UPDATE_FAILED");
      onReviewChange?.(data.result);
      const pending = sections.find((section) => {
        if (section.id === selected.id) return false;
        return !reviews.some((entry) => entry.targetId === section.id && entry.status !== "pending");
      });
      if (pending) setSelectedSectionId(pending.id);
    } catch (error) {
      setReviewError(explainBundleError(error instanceof Error ? error.message : "PRODUCT_SECTION_REVIEW_UPDATE_FAILED"));
    } finally {
      setSaving(false);
    }
  }

  const queue = (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-heading text-body-sm font-bold">Bagian artikel</h3>
        <Badge variant="outline" className="text-body-xs">{reviews.filter((entry) => entry.status === "approved").length}/{sections.length}</Badge>
      </div>
      {sections.map((section) => {
        const sectionReview = reviews.find((entry) => entry.targetId === section.id);
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => { setSelectedSectionId(section.id); setMobileQueueOpen(false); }}
            className={cn("w-full rounded-lg border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", selected?.id === section.id ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/50")}
          >
            <div className="flex items-center justify-between gap-2 text-body-xs text-muted-foreground">
              <span>{numbering.get(section.id)}</span>
              <StatusBadge tone={blockReviewTones[sectionReview?.status ?? "pending"]}>{blockReviewLabels[sectionReview?.status ?? "pending"]}</StatusBadge>
            </div>
            <p className="mt-1 text-body-sm font-semibold text-foreground">{section.title}</p>
          </button>
        );
      })}
    </div>
  );

  const evidence = selected ? (
    <div className="space-y-4">
      <h3 className="font-heading text-body-sm font-bold">Keterlacakan</h3>
      <div>
        <p className="text-body-xs font-semibold text-muted-foreground">Idea tercakup</p>
        <div className="mt-2 flex flex-wrap gap-1">{selected.ideaIds.map((id) => <Badge key={id} variant="outline" className="text-body-xs">{id}</Badge>)}</div>
      </div>
      <div>
        <p className="text-body-xs font-semibold text-muted-foreground">Sumber</p>
        <div className="mt-2 space-y-2">{selected.sourceRefs.map((source) => <div key={`${source.sourceId}-${source.version}`} className="rounded-lg border border-border bg-muted/30 p-2 text-body-xs"><p className="font-semibold">{source.sourceId}, v{source.version}</p><p className="mt-1 text-muted-foreground">{source.excerptIds.join(", ")}</p></div>)}</div>
      </div>
      <div>
        <p className="text-body-xs font-semibold text-muted-foreground">Dependensi</p>
        <p className="mt-1 text-body-xs text-muted-foreground">{dependencies.filter((dependency) => dependency.downstreamEntityId === product.id).length} dependensi artikel</p>
      </div>
      <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Catatan review bagian" className="min-h-24 text-body-sm" />
      {reviewError ? <p className="text-body-xs text-status-error">{reviewError}</p> : null}
      {bundleStatus === "draft" && !reviewLocked ? <div className="grid grid-cols-2 gap-2"><Button type="button" disabled={saving} onClick={() => void saveSectionReview("approved")} className="bg-status-success text-white hover:bg-status-success/90"><Check className="mr-1 size-4" />Setujui</Button><Button type="button" disabled={saving} variant="outline" onClick={() => void saveSectionReview("changes_requested")} className="border-status-warning text-status-warning"><AlertTriangle className="mr-1 size-4" />Perbaikan</Button></div> : null}
    </div>
  ) : null;

  return (
    <div className="space-y-3">
      <div className="flex gap-2 lg:hidden"><Button type="button" variant="outline" onClick={() => setMobileQueueOpen(true)}><ListFilter className="mr-1 size-4" />Daftar bagian</Button><Button type="button" variant="outline" onClick={() => setMobileEvidenceOpen(true)}><Info className="mr-1 size-4" />Keterlacakan</Button></div>
      <div className="grid gap-5 lg:grid-cols-[minmax(220px,0.75fr)_minmax(0,2fr)_minmax(240px,0.85fr)]">
        <aside className="hidden lg:block">{queue}</aside>
        <article className="mx-auto w-full max-w-[75ch] space-y-6">
          {publicSection ? (
            <FormativeCheckEndpointProvider
              endpointBase={bundleStatus === "draft"
                ? `/api/admin/bundles/product/${encodeURIComponent(bundleId)}/formative-check`
                : "/api/materials/formative-check"}
            >
              <StructuredArticleSectionContent
                section={publicSection}
                articleId={product.id}
                articleVersion={product.version}
                showProgress={false}
              />
            </FormativeCheckEndpointProvider>
          ) : (
            <AdminEmptyState
              icon={BookOpen}
              title="Artikel belum memiliki bagian"
              description="Tambahkan section V3 melalui authoring."
            />
          )}
        </article>
        <aside className="hidden rounded-xl border border-border bg-card p-4 lg:block">{evidence}</aside>
      </div>
      <Sheet open={mobileQueueOpen} onOpenChange={setMobileQueueOpen}><SheetContent side="left" className="overflow-y-auto"><SheetHeader><SheetTitle>Daftar bagian</SheetTitle></SheetHeader><div className="mt-4">{queue}</div></SheetContent></Sheet>
      <Sheet open={mobileEvidenceOpen} onOpenChange={setMobileEvidenceOpen}><SheetContent side="right" className="overflow-y-auto"><SheetHeader><SheetTitle>Keterlacakan</SheetTitle></SheetHeader><div className="mt-4">{evidence}</div></SheetContent></Sheet>
    </div>
  );
}

function LegacyArticleProductView({
  product,
  viewMode,
  onViewModeChange,
  bundleId,
  bundleStatus,
  reviewLocked = false,
  blockReviews = [],
  onBlockReviewChange,
  dependencies = [],
}: {
  product: Extract<ProductEntity, { productType: "article" }>;
  viewMode: "student" | "blocks";
  onViewModeChange: (mode: "student" | "blocks") => void;
  bundleId: string;
  bundleStatus: string;
  reviewLocked?: boolean;
  blockReviews?: ProductBlockReview[];
  onBlockReviewChange?: (review: ProductBlockReview) => void;
  dependencies?: ProductDependency[];
}) {
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [blockNotes, setBlockNotes] = useState<Record<string, string>>({});
  const [savingStates, setSavingStates] = useState<Record<string, "saving" | "saved" | "error">>({});
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});

  const sortedBlocks = useMemo(() => {
    return [...product.blocks].sort((a, b) => a.orderIndex - b.orderIndex);
  }, [product.blocks]);

  // Ensure default selected block
  useEffect(() => {
    if (sortedBlocks.length > 0 && (!selectedBlockId || !sortedBlocks.some((b) => b.id === selectedBlockId))) {
      setSelectedBlockId(sortedBlocks[0].id);
    }
  }, [sortedBlocks, selectedBlockId]);

  // Map review status by blockId
  const blockReviewMap = useMemo(() => {
    const map: Record<string, ProductBlockReview> = {};
    for (const rev of blockReviews) {
      const blockId = rev.blockId ?? (rev.targetType === "article_block" ? rev.targetId : undefined);
      if (rev.productId === product.id && blockId) {
        map[blockId] = rev;
      }
    }
    return map;
  }, [blockReviews, product.id]);

  // Combine continuous Markdown for student mode
  const continuousMarkdown = useMemo(() => {
    return sortedBlocks
      .map((block) => parseEmbeddedContent(block.content).content)
      .filter((text) => text.trim().length > 0)
      .join("\n\n");
  }, [sortedBlocks]);

  const activeBlock = sortedBlocks.find((b) => b.id === selectedBlockId) ?? sortedBlocks[0] ?? null;
  const activeParsed = activeBlock ? parseEmbeddedContent(activeBlock.content) : null;
  const activeReview = activeBlock ? blockReviewMap[activeBlock.id] ?? null : null;

  async function saveBlockReview(
    blockId: string,
    status: "pending" | "approved" | "changes_requested",
    overrideNote?: string
  ) {
    if (bundleStatus !== "draft" || reviewLocked) return;
    const noteToSave = overrideNote !== undefined ? overrideNote : (blockNotes[blockId] ?? blockReviewMap[blockId]?.notes ?? "");
    setSavingStates((prev) => ({ ...prev, [blockId]: "saving" }));
    setSaveErrors((prev) => {
      const next = { ...prev };
      delete next[blockId];
      return next;
    });
    try {
      const response = await fetch(`/api/admin/bundles/product/${encodeURIComponent(bundleId)}/block-reviews`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          blockId,
          status,
          notes: noteToSave.trim() || undefined,
        }),
      });
      const data = await response.json() as { result?: ProductBlockReview; error?: string };
      if (!response.ok || !data.result) {
        throw new Error(data.error || "PRODUCT_BLOCK_REVIEW_UPDATE_FAILED");
      }
      onBlockReviewChange?.(data.result);
      setSavingStates((prev) => ({ ...prev, [blockId]: "saved" }));
      setTimeout(() => {
        setSavingStates((prev) => {
          if (prev[blockId] === "saved") {
            const next = { ...prev };
            delete next[blockId];
            return next;
          }
          return prev;
        });
      }, 2500);
    } catch (saveError) {
      setSavingStates((prev) => ({ ...prev, [blockId]: "error" }));
      setSaveErrors((prev) => ({
        ...prev,
        [blockId]: saveError instanceof Error ? explainBundleError(saveError.message) : "Review blok belum dapat disimpan. Coba lagi.",
      }));
    }
  }

  function handleNoteBlur(blockId: string) {
    const currentNote = blockNotes[blockId];
    if (currentNote === undefined) return;
    const existingReview = blockReviewMap[blockId];
    const existingNote = existingReview?.notes ?? "";
    if (currentNote.trim() !== existingNote.trim()) {
      const currentStatus = existingReview?.status ?? "pending";
      void saveBlockReview(blockId, currentStatus, currentNote);
    }
  }

  function handleNoteKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>, blockId: string) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      const currentNote = blockNotes[blockId] ?? blockReviewMap[blockId]?.notes ?? "";
      const currentStatus = blockReviewMap[blockId]?.status ?? "pending";
      void saveBlockReview(blockId, currentStatus, currentNote);
    }
  }

  return (
    <div className="space-y-5">
      {/* Mode Switcher Header */}
      <div className={cn(
        "flex flex-wrap items-center gap-3 border-b border-border pb-3",
        viewMode === "student" ? "justify-end" : "justify-between"
      )}>
        {viewMode === "blocks" && (
          <div>
            <span className="text-body-xs font-semibold uppercase tracking-wider text-brand-primary">Artikel Bab</span>
            <h3 className="mt-0.5 font-heading text-body-base font-bold text-foreground">{product.title}</h3>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={viewMode === "student" ? "secondary" : "outline"}
            onClick={() => onViewModeChange("student")}
            className="h-8 text-body-xs gap-1.5"
          >
            <BookOpen className="size-3.5" />
            Tampilan Siswa
          </Button>
          <Button
            type="button"
            size="sm"
            variant={viewMode === "blocks" ? "secondary" : "outline"}
            onClick={() => onViewModeChange("blocks")}
            className="h-8 text-body-xs gap-1.5"
          >
            <Layers className="size-3.5" />
            Mode Blok ({sortedBlocks.length})
          </Button>
          {viewMode === "blocks" && (
            <Sheet open={mobileInspectorOpen} onOpenChange={setMobileInspectorOpen}>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={cn(styles.mobileInspector, "h-8 items-center gap-1.5 text-body-xs")}
                  aria-label="Buka inspector"
                >
                  <Info className="size-3.5" />
                  Info
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="flex flex-col w-full sm:max-w-md p-4 overflow-y-auto">
                <SheetHeader className="pb-3 border-b border-border text-left">
                  <SheetTitle className="text-body-base font-semibold">Inspector blok materi</SheetTitle>
                </SheetHeader>
                <div className="py-3">
                  <ArticleBlockInspector
                    block={activeBlock}
                    parsed={activeParsed}
                    review={activeReview}
                    product={product}
                    dependencies={dependencies}
                  />
                </div>
              </SheetContent>
            </Sheet>
          )}
        </div>
      </div>

      {viewMode === "student" ? (
        /* Continuous Student Mode with ArticleReadingCanvas */
        <div className="rounded-2xl border border-border bg-card shadow-xs">
          <ArticleReadingCanvas
            content={continuousMarkdown}
            chapterTitle={product.title}
            showDivider={false}
          />
        </div>
      ) : (
        /* Block Review Mode with Desktop Inspector Aside and Mobile Drawer */
        <div className="space-y-4">
          {/* Desktop 2-Column Grid */}
          <div className={cn(styles.blockLayout, "gap-5 items-start")}>
            {/* Left Column: Blocks List */}
            <div className="space-y-3">
              {sortedBlocks.map((block, idx) => {
                const parsed = parseEmbeddedContent(block.content);
                const meta = articleBlockMeta[block.blockType] ?? { label: block.blockType.replaceAll("_", " "), badge: "Materi" };
                const review = blockReviewMap[block.id];
                const currentStatus = review?.status ?? "pending";
                const isSelected = selectedBlockId === block.id;
                const saveState = savingStates[block.id];

                return (
                  <div
                    key={block.id}
                    className={cn(
                      "rounded-xl border p-4 shadow-xs transition-colors space-y-3",
                      isSelected
                        ? "border-brand-primary bg-card ring-1 ring-brand-primary/20"
                        : "border-border bg-card hover:border-border/80"
                    )}
                  >
                    {/* Block Toolbar Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2.5">
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => setSelectedBlockId(block.id)}
                        className="flex min-w-0 items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="flex size-5 shrink-0 items-center justify-center rounded bg-muted font-mono text-body-xs font-bold text-muted-foreground">
                          {idx + 1}
                        </span>
                        <span className="text-body-sm font-semibold text-foreground">{meta.label}</span>
                        <Badge variant="outline" className="font-mono text-body-xs hidden sm:inline-flex">
                          {block.blockType}
                        </Badge>
                      </button>

                      {/* Review Status & Actions */}
                      <div className="flex items-center gap-2">
                        {/* Save State Indicator */}
                        {saveState === "saving" && (
                          <span className="text-body-xs text-muted-foreground animate-pulse">Menyimpan...</span>
                        )}
                        {saveState === "saved" && (
                          <span className="text-body-xs text-status-success flex items-center gap-1">
                            <Check className="size-3" /> Tersimpan
                          </span>
                        )}
                        {saveState === "error" && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-body-xs text-status-error"
                            onClick={() => void saveBlockReview(block.id, currentStatus)}
                          >
                            Coba lagi
                          </Button>
                        )}

                        {/* Persistent Decision Controls */}
                        {bundleStatus === "draft" && !reviewLocked ? (
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant={currentStatus === "approved" ? "default" : "outline"}
                              className={cn(
                                "h-7 px-2 text-body-xs gap-1",
                                currentStatus === "approved" && "bg-status-success text-white hover:bg-status-success/90"
                              )}
                              onClick={() => void saveBlockReview(block.id, currentStatus === "approved" ? "pending" : "approved")}
                              title={currentStatus === "approved" ? "Batalkan persetujuan" : "Setujui blok ini"}
                            >
                              <Check className="size-3" />
                              <span className="hidden sm:inline">Setujui</span>
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={currentStatus === "changes_requested" ? "default" : "outline"}
                              className={cn(
                                "h-7 px-2 text-body-xs gap-1",
                                currentStatus === "changes_requested" && "bg-status-warning text-white hover:bg-status-warning/90"
                              )}
                              onClick={() => void saveBlockReview(block.id, currentStatus === "changes_requested" ? "pending" : "changes_requested")}
                              title={currentStatus === "changes_requested" ? "Batalkan permintaan perbaikan" : "Minta perbaikan blok ini"}
                            >
                              <AlertTriangle className="size-3" />
                              <span className="hidden sm:inline">Perbaikan</span>
                            </Button>
                          </div>
                        ) : (
                          <StatusBadge tone={blockReviewTones[currentStatus]}>
                            {blockReviewLabels[currentStatus]}
                          </StatusBadge>
                        )}
                      </div>
                    </div>

                    {/* Block Rendered Content */}
                    <div className="rounded-lg bg-muted/25 p-3 text-body-base leading-relaxed">
                      <MarkdownRenderer content={parsed.content} />
                    </div>

                    {/* Notes Textarea (Autosave on blur or Ctrl+Enter) */}
                    {bundleStatus === "draft" && !reviewLocked && (
                      <div className="space-y-1 pt-1">
                        <Textarea
                          value={blockNotes[block.id] ?? review?.notes ?? ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setBlockNotes((prev) => ({ ...prev, [block.id]: val }));
                          }}
                          onBlur={() => handleNoteBlur(block.id)}
                          onFocus={() => setSelectedBlockId(block.id)}
                          onKeyDown={(e) => handleNoteKeyDown(e, block.id)}
                          placeholder="Catatan blok opsional (tersimpan saat blur atau Ctrl+Enter)..."
                          className="min-h-14 text-body-xs bg-background"
                        />
                        {(() => {
                          const currentNote = blockNotes[block.id];
                          const storedNote = review?.notes ?? "";
                          const isDirty = currentNote !== undefined && currentNote.trim() !== storedNote.trim();
                          if (saveState === "error") {
                            return <p className="text-body-xs text-status-error">{saveErrors[block.id] ?? "Gagal menyimpan review blok."}</p>;
                          }
                          if (isDirty && saveState !== "saving") {
                            return <p className="text-body-xs text-muted-foreground">Belum disimpan</p>;
                          }
                          return null;
                        })()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Right Column: Sticky Inspector on Desktop */}
            <aside className={cn(styles.desktopInspector, "sticky top-4 rounded-xl border border-border bg-card p-4 shadow-xs")}>
              <div className="flex items-center justify-between border-b border-border pb-2.5 mb-3">
                <h4 className="font-heading text-body-sm font-bold text-foreground">Inspector blok</h4>
                <Badge variant="outline" className="text-body-xs">
                  {sortedBlocks.length} total
                </Badge>
              </div>
              <ArticleBlockInspector
                block={activeBlock}
                parsed={activeParsed}
                review={activeReview}
                product={product}
                dependencies={dependencies}
              />
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}

export function ArticleProductView(props: Parameters<typeof LegacyArticleProductView>[0] & { structuredEnabled?: boolean }) {
  if (props.structuredEnabled && props.product.sections.length > 0) {
    return <StructuredArticleProductView product={props.product} bundleId={props.bundleId} bundleStatus={props.bundleStatus} reviewLocked={props.reviewLocked ?? false} itemReviews={props.blockReviews ?? []} onReviewChange={props.onBlockReviewChange} dependencies={props.dependencies ?? []} />;
  }
  return <LegacyArticleProductView {...props} />;
}

export function DiktatProductView({
  product,
  dependencies = [],
  bundleId,
  pdfStatus,
  onPdfRendered,
}: {
  product: (Extract<ProductEntity, { productType: "diktat" }> & { fileKey?: string | null }) | {
    id: string;
    productType?: "diktat";
    title: string;
    contentMarkdown: string;
    sourceArticleId?: string;
    sourceArticleVersion?: number;
    fileKey?: string | null;
  };
  dependencies?: ProductDependency[];
  bundleId?: string;
  pdfStatus?: { status: string; pageCount?: number | null };
  onPdfRendered?: () => void;
}) {
  const [rendering, setRendering] = useState(false);
  const [renderedKey, setRenderedKey] = useState<string | null>(product.fileKey ?? null);
  const parsed = parseEmbeddedContent(product.contentMarkdown);

  const matchingDep = dependencies.find(
    (dep) => dep.downstreamEntityId === product.id || (product.sourceArticleId && dep.upstreamEntityId === product.sourceArticleId)
  );

  const freshnessLabels: Record<string, string> = {
    UP_TO_DATE: "Mutakhir",
    NEEDS_REVIEW: "Perlu review",
    STALE: "Kedaluwarsa",
  };

  const freshnessTones: Record<string, "success" | "warning" | "error" | "muted"> = {
    UP_TO_DATE: "success",
    NEEDS_REVIEW: "warning",
    STALE: "error",
  };

  const hasPdf = Boolean(renderedKey || product.fileKey || pdfStatus?.status === "ready");
  const pdfViewUrl = bundleId
    ? `/api/admin/bundles/product/${encodeURIComponent(bundleId)}/pdf`
    : `/api/admin/diktats/${encodeURIComponent(product.id)}/pdf`;

  const handleRenderPdf = async () => {
    setRendering(true);
    try {
      if (bundleId) {
        const res = await fetch(`/api/admin/bundles/product/${encodeURIComponent(bundleId)}/pdf`, { method: "POST" });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Gagal mengantrekan render PDF");
        }
        toast.success("Permintaan render PDF berhasil dikirim.");
        onPdfRendered?.();
      } else {
        const res = await fetch(`/api/admin/diktats/${encodeURIComponent(product.id)}/pdf`, { method: "POST" });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || "Gagal merender PDF diktat");
        }
        setRenderedKey(data.fileKey);
        toast.success("PDF diktat berhasil dirender.");
        onPdfRendered?.();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal memproses render PDF");
    } finally {
      setRendering(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Meta Header */}
      <div className="border-b border-border pb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="text-body-xs font-semibold uppercase tracking-wider text-brand-primary">Diktat PDF Ringkas</span>
          <h3 className="mt-0.5 font-heading text-body-base font-bold text-foreground">{product.title}</h3>
          {product.sourceArticleId ? (
            <p className="mt-1 text-body-xs text-muted-foreground">
              Artikel sumber: <span className="font-mono font-semibold text-foreground">{product.sourceArticleId}</span> (v{product.sourceArticleVersion})
            </p>
          ) : (
            <p className="mt-1 text-body-xs text-muted-foreground font-mono">
              ID: {product.id}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {matchingDep && (
            <div className="flex items-center gap-1.5 mr-2">
              <span className="text-body-xs text-muted-foreground">Dependensi:</span>
              <StatusBadge tone={freshnessTones[matchingDep.freshness] ?? "muted"}>
                {freshnessLabels[matchingDep.freshness] ?? matchingDep.freshness}
              </StatusBadge>
            </div>
          )}

          {hasPdf && (
            <Button asChild type="button" size="sm" variant="outline" className="gap-1.5 h-8 text-body-xs">
              <a href={pdfViewUrl} target="_blank" rel="noreferrer">
                <FileText className="size-3.5" />
                Pratinjau PDF
              </a>
            </Button>
          )}

          <Button
            type="button"
            size="sm"
            variant={hasPdf ? "outline" : "default"}
            disabled={rendering}
            onClick={() => void handleRenderPdf()}
            className="gap-1.5 h-8 text-body-xs"
          >
            {rendering ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Merender...
              </>
            ) : hasPdf ? (
              <>
                <RotateCcw className="size-3.5" />
                Render ulang PDF
              </>
            ) : (
              <>
                <FileText className="size-3.5" />
                Render PDF
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Diktat Content in Compact Mode */}
      <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-xs">
        <div className="prose dark:prose-invert max-w-none text-body-base leading-relaxed text-foreground">
          <MarkdownRenderer content={parsed.content} density="compact" />
        </div>
      </div>
    </div>
  );
}

export function FlashcardProductView({ product }: { product: Extract<ProductEntity, { productType: "flashcard" }> | { id: string; front: string; back: string; explanation?: string | null } }) {
  const [isFlipped, setIsFlipped] = useState(false);
  const parsedFront = parseEmbeddedContent(product.front);
  const parsedBack = parseEmbeddedContent(product.back);
  const parsedExplanation = parseEmbeddedContent(product.explanation);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div>
          <span className="text-body-xs font-semibold uppercase tracking-wider text-brand-primary">Kartu Hafalan</span>
          <h3 className="mt-0.5 font-heading text-body-sm font-bold text-foreground">{product.id}</h3>
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

        <div className="my-4 text-center text-body-base font-semibold text-foreground">
          <MarkdownRenderer content={isFlipped ? parsedBack.content : parsedFront.content} />
        </div>

        <div className="text-center text-body-xs text-muted-foreground">
          {"ideaLinks" in product && Array.isArray(product.ideaLinks) && product.ideaLinks.length > 0
            ? `Idea: ${(product.ideaLinks as Array<{ id: string }>).map((l) => l.id).join(", ")}`
            : "Flashcard"}
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
        <h3 className="mt-0.5 font-heading text-body-base font-bold text-foreground">{product.title}</h3>
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

export function QuestionProductView({ product }: { product: Extract<ProductEntity, { productType: "question" }> | {
  prompt: string;
  options: { id: string; text: string; isCorrect: boolean }[];
  difficulty: "easy" | "medium" | "hard";
  cognitiveLevel: "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create";
  itbSource?: { eventName: string; referenceId: string };
} }) {
  const promptParsed = parseEmbeddedContent(product.prompt);
  const difficultyLabels: Record<string, string> = { easy: "Mudah", medium: "Sedang", hard: "Sulit" };
  const difficultyTones: Record<string, "success" | "warning" | "error"> = { easy: "success", medium: "warning", hard: "error" };
  const cognitiveLabels: Record<string, string> = { remember: "Mengingat", understand: "Memahami", apply: "Menerapkan", analyze: "Menganalisis", evaluate: "Mengevaluasi", create: "Mencipta" };

  return (
    <div className="space-y-4">
      {/* Compact ITB Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div>
          {product.itbSource ? (
            <>
              <span className="text-body-xs font-semibold uppercase tracking-wider text-brand-primary">{product.itbSource.eventName}</span>
              <p className="text-body-xs text-muted-foreground">Ref: <span className="font-mono font-semibold text-foreground">{product.itbSource.referenceId}</span></p>
            </>
          ) : (
            <span className="text-body-xs font-semibold uppercase tracking-wider text-brand-primary">Bank Soal</span>
          )}
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
                      "flex size-5 shrink-0 items-center justify-center rounded text-body-xs font-bold",
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
        <h3 className="mt-0.5 font-heading text-body-base font-bold text-foreground">{product.questionId}</h3>
      </div>
      <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-xs">
        <div className="prose dark:prose-invert max-w-none text-body-base leading-relaxed text-foreground">
          <MarkdownRenderer content={contentParsed.content} />
        </div>
      </div>
    </div>
  );
}

export function AssessmentBlueprintProductView({ product }: { product: Extract<ProductEntity, { productType: "assessment_blueprint" }> | {
  title: string;
  assessmentType: string;
  chapterIds: string[];
  questionIds: string[];
} }) {
  return (
    <div className="space-y-4">
      <div className="border-b border-border pb-3">
        <span className="text-body-xs font-semibold uppercase tracking-wider text-brand-primary">Blueprint Asesmen ({product.assessmentType.toUpperCase()})</span>
        <h3 className="mt-0.5 font-heading text-body-base font-bold text-foreground">{product.title}</h3>
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

type ConfirmActionState =
  | { type: "discard" }
  | { type: "withdraw" }
  | null;

const pedagogicCriterionLabels: Record<PedagogicCriterionId, string> = {
  concept_accuracy: "Akurasi konsep",
  prerequisite_completeness: "Kelengkapan prasyarat",
  explanation_sequence: "Urutan penjelasan",
  symbol_and_condition_clarity: "Kejelasan simbol dan kondisi",
  example_reasoning: "Penalaran contoh",
  representation_or_visual: "Representasi atau visual",
  misconceptions_and_limits: "Miskonsepsi dan batas berlaku",
  formative_check_and_explanation: "Cek formatif dan pembahasan",
};

type ReviewSubmission = {
  decision: "approved" | "rejected" | "changes_requested";
  criteria: PedagogicRubricItem[];
};

function PedagogicReviewPanel({
  payload,
  saving,
  onSubmit,
  onRefresh,
}: {
  payload: ProductDetailPayload;
  saving: boolean;
  onSubmit: (submission: ReviewSubmission) => void;
  onRefresh: () => Promise<void>;
}) {
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfRequestFailed, setPdfRequestFailed] = useState(false);
  const article = payload.draft.products.find((product) => product.productType === "article");
  const anchorOptions = useMemo(() => {
    if (!article || article.productType !== "article") return [];
    return [
      { targetType: "document" as const, targetId: article.id, label: `Artikel: ${article.title}` },
      ...article.sections.flatMap((section) => [
        { targetType: "section" as const, targetId: section.id, label: `Bagian: ${section.title}` },
        ...section.blocks.map((block) => ({
          targetType: "block" as const,
          targetId: block.id,
          label: `Blok: ${block.title || block.id}`,
        })),
      ]),
      ...(article.visuals ?? []).map((visual) => ({
        targetType: "visual" as const,
        targetId: visual.id,
        label: `Visual: ${visual.label}`,
      })),
    ];
  }, [article]);

  const [criteria, setCriteria] = useState<PedagogicRubricItem[]>([]);

  useEffect(() => {
    const existing = payload.pedagogicReview?.criteria;
    setCriteria(
      PEDAGOGIC_CRITERION_IDS.map((criterionId) => {
        const saved = existing?.find((item) => item.criterionId === criterionId);
        return saved ?? {
          criterionId,
          status: "needs_revision" as const,
          contentAnchors: anchorOptions[0]
            ? [{ targetType: anchorOptions[0].targetType, targetId: anchorOptions[0].targetId }]
            : [],
          reason: "",
        };
      }),
    );
  }, [payload.pedagogicReview?.criteria, payload.pedagogicReview?.id, payload.revisionFreshness?.currentFingerprint, anchorOptions]);

  const updateCriterion = (criterionId: PedagogicCriterionId, update: Partial<PedagogicRubricItem>) => {
    setCriteria((current) => current.map((item) => item.criterionId === criterionId ? { ...item, ...update } : item));
  };
  const complete = criteria.length === PEDAGOGIC_CRITERION_IDS.length && criteria.every(
    (item) => item.reason.trim() && item.contentAnchors.length > 0,
  );
  const allMet = complete && criteria.every((item) => item.status === "met");
  const freshness = payload.revisionFreshness?.completenessState ?? "incomplete";
  const pdf = payload.pdfStatus ?? { status: "pending" as const };

  const requestPdf = async () => {
    setPdfBusy(true);
    setPdfRequestFailed(false);
    try {
      const response = await fetch(`/api/admin/bundles/product/${encodeURIComponent(payload.bundle.id)}/pdf`, { method: "POST" });
      if (!response.ok) {
        setPdfRequestFailed(true);
        return;
      }
      await onRefresh();
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-xs sm:p-5" aria-labelledby="pedagogic-review-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="pedagogic-review-title" className="font-heading text-body-base font-bold text-foreground">Review pedagogi</h2>
          <p className="mt-1 text-body-xs text-muted-foreground">Nilai delapan kriteria dan tautkan setiap keputusan ke bukti konten.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className={cn("text-body-xs", freshness === "complete" ? "text-status-success" : freshness === "stale" ? "text-status-error" : "text-status-warning")}>
            {freshness === "complete" ? "Review lengkap" : freshness === "stale" ? "Review kedaluwarsa" : "Review belum lengkap"}
          </Badge>
          <Badge variant="outline" className={cn("text-body-xs", pdf.status === "ready" ? "text-status-success" : pdf.status === "failed" ? "text-status-error" : "text-status-warning")}>
            PDF {pdf.status === "ready" ? `siap${pdf.pageCount ? `, ${pdf.pageCount} halaman` : ""}` : pdf.status === "failed" ? "gagal" : "menunggu"}
          </Badge>
          {pdf.status === "ready" ? (
            <Button asChild type="button" size="sm" variant="outline">
              <a href={`/api/admin/bundles/product/${encodeURIComponent(payload.bundle.id)}/pdf`} target="_blank" rel="noreferrer">Pratinjau PDF</a>
            </Button>
          ) : (
            <Button type="button" size="sm" variant="outline" disabled={pdfBusy} onClick={() => void requestPdf()}>
              {pdfBusy ? "Mengantrekan..." : pdf.status === "failed" ? "Coba render lagi" : "Render PDF"}
            </Button>
          )}
        </div>
      </div>

      {pdfRequestFailed && (
        <div className="rounded-lg border border-status-error/30 bg-status-error/5 p-3 text-body-xs text-status-error">
          PDF belum dapat diproses. Periksa layanan renderer, lalu coba lagi.
        </div>
      )}

      {(payload.blockingIssues?.length ?? 0) > 0 && (
        <div className="rounded-lg border border-status-error/30 bg-status-error/5 p-3">
          <div className="flex items-center gap-2 text-body-sm font-semibold text-status-error"><ShieldAlert className="size-4" />Penghambat publikasi</div>
          <ul className="mt-2 space-y-1.5 text-body-xs text-foreground">
            {payload.blockingIssues?.map((issue) => (
              <li key={`${issue.code}:${issue.target.targetId}`}>{issue.reason}{issue.remediation ? ` ${issue.remediation}` : ""}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="divide-y divide-border rounded-lg border border-border">
        {criteria.map((item, index) => {
          const anchor = item.contentAnchors[0];
          const anchorValue = anchor ? `${anchor.targetType}|${anchor.targetId}` : "";
          return (
            <div key={item.criterionId} className="grid gap-3 p-3 lg:grid-cols-[minmax(180px,0.8fr)_160px_minmax(220px,1fr)_minmax(220px,1.2fr)] lg:items-start">
              <Label className="pt-2 text-body-sm font-semibold">{index + 1}. {pedagogicCriterionLabels[item.criterionId]}</Label>
              <Select value={item.status} onValueChange={(status: PedagogicRubricItem["status"]) => updateCriterion(item.criterionId, { status })}>
                <SelectTrigger className="h-9 text-body-sm" aria-label={`Status ${pedagogicCriterionLabels[item.criterionId]}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="met">Terpenuhi</SelectItem>
                  <SelectItem value="needs_revision">Perlu revisi</SelectItem>
                  <SelectItem value="not_met">Tidak terpenuhi</SelectItem>
                </SelectContent>
              </Select>
              <Select value={anchorValue} onValueChange={(value) => {
                const separator = value.indexOf("|");
                updateCriterion(item.criterionId, { contentAnchors: [{ targetType: value.slice(0, separator) as PedagogicRubricItem["contentAnchors"][number]["targetType"], targetId: value.slice(separator + 1) }] });
              }}>
                <SelectTrigger className="h-9 text-body-sm" aria-label={`Bukti ${pedagogicCriterionLabels[item.criterionId]}`}><SelectValue placeholder="Pilih bukti konten" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {anchorOptions.map((option) => <SelectItem key={`${option.targetType}:${option.targetId}`} value={`${option.targetType}|${option.targetId}`}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                value={item.reason}
                onChange={(event) => updateCriterion(item.criterionId, { reason: event.target.value })}
                placeholder="Alasan penilaian"
                aria-label={`Alasan ${pedagogicCriterionLabels[item.criterionId]}`}
                className="h-9 text-body-sm"
              />
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body-xs text-muted-foreground">{complete ? `${criteria.filter((item) => item.status === "met").length} dari 8 kriteria terpenuhi.` : "Lengkapi alasan dan bukti untuk seluruh kriteria."}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={saving || !complete} onClick={() => onSubmit({ decision: "changes_requested", criteria })}>Minta revisi</Button>
          <Button type="button" size="sm" variant="destructive" disabled={saving || !complete} onClick={() => onSubmit({ decision: "rejected", criteria })}>Tolak</Button>
          <Button type="button" size="sm" disabled={saving || !allMet} onClick={() => onSubmit({ decision: "approved", criteria })}><Check className="size-3.5" />Setujui</Button>
        </div>
      </div>
    </section>
  );
}

export function ProductBundleReviewDetail({ detailId, courseLabels = {} }: DetailProps) {
  const [payload, setPayload] = useState<ProductDetailPayload | null>(null);
  const [draftProducts, setDraftProducts] = useState<ProductEntity[]>([]);
  const [activeType, setActiveType] = useUrlTab("productType", "all");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [reviewNoteOpen, setReviewNoteOpen] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewDecision, setReviewDecision] = useState<"approved" | "rejected" | "changes_requested" | null>(null);
  const [editing, setEditing] = useState(false);
  const [articleViewMode, setArticleViewMode] = useState<"student" | "blocks">("student");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmActionState>(null);

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
      const existingReview = nextPayload.pedagogicReview;
      setReviewDecision(
        existingReview?.status === "approved" ||
        existingReview?.status === "rejected" ||
        existingReview?.status === "changes_requested"
          ? existingReview.status
          : null
      );
      setReviewNote(existingReview?.notes ?? "");
    } catch (loadError) {
      setError(explainBundleError(loadError instanceof Error ? loadError.message : "PRODUCT_BUNDLE_DETAIL_FAILED"));
    } finally {
      setLoading(false);
    }
  }, [detailId]);

  useEffect(() => { void load(); }, [load]);

  async function decide({ decision, criteria }: ReviewSubmission) {
    if (!payload) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/bundles/product/${encodeURIComponent(payload.bundle.id)}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision,
          policyVersion: payload.revisionFreshness?.policyVersion ?? QUALITY_POLICY_VERSION,
          contentFingerprint: payload.revisionFreshness?.currentFingerprint ?? payload.qualityEvaluation?.contentFingerprint,
          expectedRevision: payload.bundle.checksum,
          criteria,
          exceptions: [],
          notes: reviewNote || undefined,
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "PRODUCT_BUNDLE_REVIEW_FAILED");
      setReviewDecision(decision);
      await load();
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
      const response = await fetch(`/api/admin/bundles/product/${encodeURIComponent(payload.bundle.id)}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ draft: { products: draftProducts }, expectedRevision: payload.bundle.checksum }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "PRODUCT_BUNDLE_UPDATE_FAILED");
      await load();
    } catch (saveError) {
      setError(explainBundleError(saveError instanceof Error ? saveError.message : "PRODUCT_BUNDLE_UPDATE_FAILED"));
    } finally {
      setSaving(false);
    }
  }

  function handleBlockReviewChange(updatedReview: ProductBlockReview) {
    setPayload((current) => {
      if (!current) return current;
      const existingReviews = current.blockReviews ?? [];
      const index = existingReviews.findIndex(
        (r) => r.productId === updatedReview.productId && (r.targetId ?? r.blockId) === (updatedReview.targetId ?? updatedReview.blockId)
      );
      let nextReviews: ProductBlockReview[];
      if (index >= 0) {
        nextReviews = [...existingReviews];
        nextReviews[index] = updatedReview;
      } else {
        nextReviews = [...existingReviews, updatedReview];
      }

      const totalBlocks = current.draft.products.reduce(
        (acc, p) => acc + (p.productType === "article" ? p.blocks.length : 0),
        0
      );
      const approved = nextReviews.filter((r) => r.status === "approved").length;
      const changesRequested = nextReviews.filter((r) => r.status === "changes_requested").length;
      const pending = Math.max(0, totalBlocks - approved - changesRequested);

      return {
        ...current,
        blockReviews: nextReviews,
        blockReviewSummary: {
          total: totalBlocks,
          pending,
          approved,
          changesRequested,
        },
      };
    });
  }

  function handleDiscardClick() {
    setConfirmAction({ type: "discard" });
  }

  function handleWithdrawClick() {
    setConfirmAction({ type: "withdraw" });
  }

  async function handleConfirmDialog() {
    if (!confirmAction) return;
    const action = confirmAction;
    setConfirmAction(null);
    if (action.type === "discard") {
      await mutate("discard");
    } else if (action.type === "withdraw") {
      await mutate("withdraw");
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
  const isStudentArticlePreview = activeDraftProduct?.productType === "article" && articleViewMode === "student" && !editing;

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

      {/* Tabs & Compact Navigator Header (No Select dropdown, Stepper + Searchable Sheet naming active product) */}
      <Tabs value={activeType} onValueChange={handleTypeTabChange}>
        <div className="space-y-2.5">
          <TabsList>
            <TabsTrigger value="all">Semua</TabsTrigger>
            {Object.entries(typeCounts).map(([type]) => (
              <TabsTrigger key={type} value={type}>
                {productLabels[type] ?? type}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Stepper + Active Product Searchable Sheet Toolbar */}
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

            {/* Searchable Sheet Trigger with Active Product Name */}
            <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
              <SheetTrigger asChild>
                <Button type="button" size="sm" variant="outline" className="h-8 min-w-0 max-w-xs sm:max-w-md gap-1.5 text-body-sm justify-between">
                  <div className="flex items-center gap-1.5 truncate">
                    <ListFilter className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{activePreview ? (activePreview.title || activePreview.id) : "Pilih bagian"}</span>
                  </div>
                  <Badge variant="outline" className="ml-1 text-body-xs shrink-0 font-normal">
                    {visiblePreviews.length}
                  </Badge>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="flex flex-col w-full sm:max-w-md p-4">
                <SheetHeader className="pb-3 border-b border-border text-left">
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
                      <span className="text-body-xs text-muted-foreground font-mono">{preview.id}</span>
                    </button>
                  ))}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        <TabsContent value={activeType} className="mt-4">
          {/* 100% Canvas Width for Content Review */}
          {activePreview ? (
            <article key={activePreview.id} className="rounded-xl border border-border bg-card p-5 sm:p-7 shadow-xs space-y-5">
              {!isStudentArticlePreview && <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
                <div>
                  <Badge variant="secondary" className="text-body-xs font-semibold">{productLabels[activePreview.productType] ?? activePreview.productType}</Badge>
                  <h3 className="mt-1.5 font-heading text-body-base font-bold text-foreground">{activePreview.title || "Bagian tanpa judul"}</h3>
                  <span className="text-body-xs text-muted-foreground font-mono">ID: {activePreview.id} · Versi {activePreview.version}</span>
                </div>
                {!editing && payload.bundle.status === "draft" && (
                  <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)} className="h-8 text-body-sm">Edit isi</Button>
                )}
              </div>}

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
                    <ArticleProductView
                      product={activeDraftProduct}
                      viewMode={articleViewMode}
                      onViewModeChange={setArticleViewMode}
                      bundleId={payload.bundle.id}
                      bundleStatus={payload.bundle.status}
                      reviewLocked={Boolean(payload.bundle.currentReview)}
                      blockReviews={payload.blockReviews}
                      onBlockReviewChange={handleBlockReviewChange}
                      dependencies={payload.dependencies}
                      structuredEnabled={payload.structuredReaderEnabled}
                    />
                  )}
                  {activeDraftProduct.productType === "diktat" && (
                    <DiktatProductView
                      product={activeDraftProduct}
                      dependencies={payload.dependencies}
                      bundleId={payload.bundle.id}
                      pdfStatus={payload.pdfStatus}
                      onPdfRendered={load}
                    />
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

                  {!isStudentArticlePreview && activePreview.traceability.ideaIds.length > 0 && (
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
        </TabsContent>
      </Tabs>

      {payload.bundle.status === "draft" && (
        <PedagogicReviewPanel payload={payload} saving={saving} onSubmit={(submission) => void decide(submission)} onRefresh={load} />
      )}

      {/* Review Actions Sticky Footer */}
      <section className="sticky bottom-0 z-50 rounded-xl border border-border bg-card p-3 shadow-lg space-y-2 md:static md:z-auto md:p-4 md:space-y-3">
        {/* Block Review Summary Strip */}
        {payload.blockReviewSummary && payload.blockReviewSummary.total > 0 && (
          <div className="hidden md:flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-2.5 text-body-xs">
            <span className="font-semibold text-foreground">Status review blok artikel:</span>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-status-success font-medium">
                {payload.blockReviewSummary.approved} disetujui
              </Badge>
              {payload.blockReviewSummary.changesRequested > 0 && (
                <Badge variant="outline" className="text-status-warning font-medium">
                  {payload.blockReviewSummary.changesRequested} perlu revisi
                </Badge>
              )}
              {payload.blockReviewSummary.pending > 0 && (
                <Badge variant="outline" className="text-muted-foreground">
                  {payload.blockReviewSummary.pending} menunggu
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Review Notes: Collapsed on Mobile, Visible on Desktop */}
        <div className="hidden md:block space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="product-review-note" className="text-body-sm font-semibold">Catatan Review</Label>
            <span className="text-body-xs text-muted-foreground">Disimpan bersama keputusan</span>
          </div>
          <Textarea
            id="product-review-note"
            value={reviewNote}
            onChange={(event) => setReviewNote(event.target.value)}
            placeholder="Tulis catatan review jika perlu..."
            className="min-h-16 text-body-sm bg-background"
          />
        </div>

        {error && <p className="text-body-xs text-status-error">{error}</p>}

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 md:pt-3">
          <div className="flex flex-wrap gap-2">
            {payload.bundle.status === "draft" && reviewDecision === "approved" && (
              <Button
                type="button"
                size="sm"
                disabled={
                  saving ||
                  payload.publicationBlocked ||
                  !payload.qualityEvaluation?.publicationReady ||
                  !payload.revisionFreshness?.isFresh ||
                  payload.pdfStatus?.status !== "ready"
                }
                onClick={() => void mutate("publish")}
              >
                <FileCheck2 className="size-3.5" />Publikasikan
              </Button>
            )}
            {payload.bundle.status === "published" && (
              <span className="text-body-sm text-status-success font-medium self-center">Telah dipublikasikan</span>
            )}
            <Sheet open={reviewNoteOpen} onOpenChange={setReviewNoteOpen}>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="md:hidden px-2.5"
                  aria-label={reviewNote ? "Ubah catatan review" : "Tambah catatan review"}
                >
                  <MessageSquareText className="size-3.5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="p-4">
                <SheetHeader className="text-left">
                  <SheetTitle className="text-body-base">Catatan review bundle</SheetTitle>
                </SheetHeader>
                <div className="space-y-3 pt-3">
                  <Textarea
                    value={reviewNote}
                    onChange={(event) => setReviewNote(event.target.value)}
                    placeholder="Tulis catatan review jika perlu..."
                    className="min-h-28 text-body-sm bg-background"
                  />
                  <Button type="button" size="sm" onClick={() => setReviewNoteOpen(false)}>
                    Selesai
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
          {(payload.bundle.status === "draft" || payload.bundle.status === "published") && (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button type="button" size="sm" variant="outline" disabled={saving} aria-label="Aksi lainnya" className="absolute bottom-3 right-20 sm:static">
                  <MoreHorizontal className="size-4" />
                  <span className="hidden sm:inline">Aksi lainnya</span>
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={6}
                  className="z-50 min-w-44 rounded-lg border border-border bg-popover p-1 text-body-sm text-popover-foreground shadow-lg"
                >
                  {payload.bundle.status === "draft" && (
                    <DropdownMenu.Item
                      onSelect={handleDiscardClick}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-status-error outline-none focus:bg-muted"
                    >
                      <Trash2 className="size-3.5" /> Hapus draft
                    </DropdownMenu.Item>
                  )}
                  {payload.bundle.status === "published" && (
                    <DropdownMenu.Item
                      onSelect={handleWithdrawClick}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-status-error outline-none focus:bg-muted"
                    >
                      <ArchiveX className="size-3.5" /> Tarik publikasi
                    </DropdownMenu.Item>
                  )}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          )}
        </div>
      </section>

      {/* Confirmation Dialogs */}
      <AdminConfirmDialog
        open={confirmAction !== null}
        onOpenChange={(open) => { if (!open) setConfirmAction(null); }}
        title={
          confirmAction?.type === "withdraw"
            ? "Tarik publikasi Product"
            : "Hapus draft Product"
        }
        description={
          confirmAction?.type === "withdraw"
            ? "Produk tidak lagi terlihat oleh mahasiswa. Riwayat dan audit tetap disimpan."
            : "Draft dan ZIP staging akan dihapus permanen. Tindakan ini tidak memengaruhi produk yang sudah terbit."
        }
        confirmLabel={
          confirmAction?.type === "withdraw"
            ? "Ya, Tarik Publikasi"
            : "Ya, Hapus Draft"
        }
        icon={
          confirmAction?.type === "withdraw"
            ? ArchiveX
            : Trash2
        }
        destructive
        loading={saving}
        onConfirm={() => void handleConfirmDialog()}
      />
    </div>
  );
}
