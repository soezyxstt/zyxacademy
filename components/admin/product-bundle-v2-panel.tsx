"use client";

import { useEffect, useMemo, useState } from "react";
import { ArchiveX, FileCheck2, Package, Search, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MathText } from "@/components/course/math-text";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { AdminSectionTitle } from "@/components/admin/section-title";
import { AdminTable } from "@/components/admin/table";
import { AdminTabs, AdminTabsContent, AdminTabsList, AdminTabsTrigger } from "@/components/admin/tabs";
import type { ProductDependency, ProductEntity } from "@/lib/bundle/product-validator";
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

export type ProductPreview = {
  id: string;
  productType: string;
  version: number;
  title: string;
  traceability: { ideaIds: string[]; sourceIds: string[] };
  sections: { label: string; content: string }[];
};

type ProductAnalysis = {
  filename: string;
  manifest: { bundleId: string; courseId: string; schemaVersion: string };
  summary: { total: number; counts: Record<string, number>; dependencyCount: number };
  previews: ProductPreview[];
  dependencies: ProductDependency[];
  draft: { products: ProductEntity[] };
};

const productLabels: Record<ProductEntity["productType"], string> = {
  article: "Artikel",
  diktat: "Diktat",
  question: "Soal",
  solution: "Pembahasan",
  flashcard_set: "Set flashcard",
  flashcard: "Flashcard",
  assessment_blueprint: "Blueprint asesmen",
};

const difficultyLabels = { easy: "Mudah", medium: "Sedang", hard: "Sulit" };
const cognitiveLabels = { remember: "Mengingat", understand: "Memahami", apply: "Menerapkan", analyze: "Menganalisis", evaluate: "Mengevaluasi", create: "Mencipta" };
const ideaRoleLabels = { primary: "Utama", supporting: "Pendukung", required: "Wajib" };
const ideaRelationLabels = { required: "Diperlukan", prerequisite: "Prasyarat", related: "Berkaitan" };

const productSteps = [
  { number: 1, title: "Upload hasil MCP", description: "Pilih ZIP yang akan diperiksa" },
  { number: 2, title: "Review isi", description: "Periksa produk dan traceability" },
  { number: 3, title: "Simpan hasil", description: "Simpan draft atau publikasikan" },
];

function humanProductLabel(value: string) {
  return productLabels[value as ProductEntity["productType"]] ?? value.replaceAll("_", " ");
}

function productTitle(product: ProductEntity) {
  return "title" in product && typeof product.title === "string" ? product.title : product.id;
}

export function ProductDraftEditor({ product, index, preview, onChange }: { product: ProductEntity; index: number; preview?: ProductPreview; onChange: (product: ProductEntity) => void }) {
  const updateLink = (linkId: string, changes: Partial<ProductEntity["ideaLinks"][number]>) => onChange({ ...product, ideaLinks: product.ideaLinks.map((link) => link.id === linkId ? { ...link, ...changes } : link) } as ProductEntity);
  const normalizeWeights = () => {
    if (product.ideaLinks.length === 0) return;
    const weight = 1 / product.ideaLinks.length;
    onChange({ ...product, ideaLinks: product.ideaLinks.map((link) => ({ ...link, weight })) } as ProductEntity);
  };
  const weightTotal = product.ideaLinks.reduce((total, link) => total + link.weight, 0);

  return (
    <article className="space-y-5 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div className="min-w-0"><p className="text-body-xs font-semibold uppercase tracking-wide text-brand-primary">Bagian {index + 1}</p><h3 className="mt-1 truncate font-heading text-h6 text-foreground">{preview?.title ?? productTitle(product)}</h3><p className="mt-1 text-body-sm text-muted-foreground">{humanProductLabel(product.productType)} · versi {product.version}</p></div>
        <Badge variant="outline">{product.ideaLinks.length} Idea</Badge>
      </div>

      {product.productType === "article" && <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2"><div className="space-y-2"><Label>Judul artikel</Label><Input value={product.title} onChange={(event) => onChange({ ...product, title: event.target.value })} /></div><div className="space-y-2"><Label>Slug</Label><Input value={product.slug} onChange={(event) => onChange({ ...product, slug: event.target.value })} /></div></div>
        <div className="space-y-4"><p className="text-body-sm font-semibold text-foreground">Bagian artikel</p>{[...product.blocks].sort((left, right) => left.orderIndex - right.orderIndex).map((block) => <div key={block.id} className="space-y-2 border-l-2 border-primary pl-3"><Label>{block.orderIndex + 1}. {block.blockType.replaceAll("_", " ")}</Label><Textarea value={block.content} onChange={(event) => onChange({ ...product, blocks: product.blocks.map((item) => item.id === block.id ? { ...item, content: event.target.value } : item) })} className="min-h-28" /><div className="rounded-lg bg-muted p-3 text-body-sm"><MathText as="div">{block.content}</MathText></div></div>)}</div>
      </div>}

      {product.productType === "diktat" && <div className="space-y-4"><div className="space-y-2"><Label>Judul diktat</Label><Input value={product.title} onChange={(event) => onChange({ ...product, title: event.target.value })} /></div><div className="space-y-2"><Label>Isi diktat</Label><Textarea value={product.contentMarkdown} onChange={(event) => onChange({ ...product, contentMarkdown: event.target.value })} className="min-h-72 font-mono" /></div><div className="space-y-2 rounded-lg bg-muted p-4"><p className="text-body-sm font-semibold text-foreground">Preview isi diktat</p><MathText as="div" className="whitespace-pre-wrap text-body-sm text-foreground">{product.contentMarkdown}</MathText></div><p className="text-body-sm text-muted-foreground">Diturunkan dari artikel sumber. Hubungan lineage akan divalidasi saat disimpan.</p></div>}

      {product.productType === "question" && <div className="space-y-4">
        <div className="space-y-1 rounded-lg border border-border bg-muted p-3"><p className="text-body-sm font-semibold text-foreground">Sumber contoh soal ITB</p><p className="text-body-sm text-foreground">{product.itbSource.eventName}</p><p className="text-body-xs text-muted-foreground">Referensi: {product.itbSource.referenceId}. Identitas sumber dikunci dari bundle.</p></div>
        <div className="space-y-2"><Label>Pertanyaan</Label><Textarea value={product.prompt} onChange={(event) => onChange({ ...product, prompt: event.target.value })} className="min-h-28" /><div className="rounded-lg bg-muted p-3"><MathText as="div">{product.prompt}</MathText></div></div>
        <div className="grid gap-3 sm:grid-cols-3"><div className="space-y-2"><Label>Kesulitan</Label><Select value={product.difficulty} onValueChange={(value: "easy" | "medium" | "hard") => onChange({ ...product, difficulty: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(difficultyLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Level berpikir</Label><Select value={product.cognitiveLevel} onValueChange={(value) => onChange({ ...product, cognitiveLevel: value as typeof product.cognitiveLevel })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(cognitiveLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Pola penalaran</Label><Input value={product.reasoningPattern} onChange={(event) => onChange({ ...product, reasoningPattern: event.target.value })} /></div></div>
        {product.options.length > 0 && <div className="space-y-2"><p className="text-body-sm font-semibold text-foreground">Pilihan jawaban</p>{product.options.map((option, optionIndex) => <div key={option.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3"><Checkbox checked={option.isCorrect} onCheckedChange={(checked) => onChange({ ...product, options: product.options.map((item) => item.id === option.id ? { ...item, isCorrect: checked === true } : item) })} aria-label={`Jawaban ${optionIndex + 1} benar`} /><Input value={option.text} onChange={(event) => onChange({ ...product, options: product.options.map((item) => item.id === option.id ? { ...item, text: event.target.value } : item) })} aria-label={`Teks pilihan jawaban ${optionIndex + 1}`} /></div>)}</div>}
        {product.ideaRelations.length > 0 && <div className="space-y-2"><p className="text-body-sm font-semibold text-foreground">Hubungan soal dengan Idea</p>{product.ideaRelations.map((relation, relationIndex) => <div key={`${relation.ideaId}:${relationIndex}`} className="grid gap-2 lg:grid-cols-[1fr_180px_2fr]"><p className="text-body-sm font-medium text-foreground">{relation.ideaId}</p><Select value={relation.relationType} onValueChange={(value: "required" | "prerequisite" | "related") => onChange({ ...product, ideaRelations: product.ideaRelations.map((item, itemIndex) => itemIndex === relationIndex ? { ...item, relationType: value } : item) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(ideaRelationLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select><Input value={relation.rationale ?? ""} onChange={(event) => onChange({ ...product, ideaRelations: product.ideaRelations.map((item, itemIndex) => itemIndex === relationIndex ? { ...item, rationale: event.target.value } : item) })} placeholder="Mengapa Idea ini diperlukan" /></div>)}</div>}
        <div className="space-y-2"><p className="text-body-sm font-semibold text-foreground">Catatan kurasi referensi ITB</p>{product.itbCuration.map((entry, entryIndex) => <div key={entry.referenceId} className="space-y-2 border-l-2 border-border pl-3"><p className="text-body-sm text-muted-foreground">{entry.referenceId} · tingkat {entry.dimensions.difficulty}</p><Textarea value={entry.curatorNote} onChange={(event) => onChange({ ...product, itbCuration: product.itbCuration.map((item, itemIndex) => itemIndex === entryIndex ? { ...item, curatorNote: event.target.value } : item) })} /></div>)}</div>
      </div>}

      {product.productType === "solution" && <div className="space-y-2"><Label>Pembahasan soal</Label><Textarea value={product.content} onChange={(event) => onChange({ ...product, content: event.target.value })} className="min-h-36" /><div className="rounded-lg bg-muted p-3"><MathText as="div">{product.content}</MathText></div></div>}
      {product.productType === "flashcard_set" && <div className="space-y-2"><Label>Judul set flashcard</Label><Input value={product.title} onChange={(event) => onChange({ ...product, title: event.target.value })} /><p className="text-body-sm text-muted-foreground">Berisi {product.cards.length} flashcard.</p></div>}
      {product.productType === "flashcard" && <div className="grid gap-4 lg:grid-cols-2"><div className="space-y-2"><Label>Sisi depan</Label><Textarea value={product.front} onChange={(event) => onChange({ ...product, front: event.target.value })} /><div className="rounded-lg bg-muted p-3"><MathText as="div">{product.front}</MathText></div></div><div className="space-y-2"><Label>Sisi belakang</Label><Textarea value={product.back} onChange={(event) => onChange({ ...product, back: event.target.value })} /><div className="rounded-lg bg-muted p-3"><MathText as="div">{product.back}</MathText></div></div><div className="space-y-2 lg:col-span-2"><Label>Penjelasan opsional</Label><Textarea value={product.explanation ?? ""} onChange={(event) => onChange({ ...product, explanation: event.target.value })} /></div></div>}
      {product.productType === "assessment_blueprint" && <div className="space-y-3"><div className="grid gap-4 lg:grid-cols-2"><div className="space-y-2"><Label>Judul asesmen</Label><Input value={product.title} onChange={(event) => onChange({ ...product, title: event.target.value })} /></div><div className="space-y-2"><Label>Jenis asesmen</Label><Select value={product.assessmentType} onValueChange={(value: "quiz" | "tryout") => onChange({ ...product, assessmentType: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="quiz">Kuis</SelectItem><SelectItem value="tryout">Tryout</SelectItem></SelectContent></Select></div></div><p className="text-body-sm text-muted-foreground">Bab: {product.chapterIds.length} · soal: {product.questionIds.length}</p></div>}

      <div className="space-y-3 border-t border-border pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-body-sm font-semibold text-foreground">Hubungan dengan Idea</p><p className="text-body-sm text-muted-foreground">Total bobot harus 1. Saat ini {weightTotal.toFixed(3)}.</p></div><Button type="button" size="sm" variant="outline" onClick={normalizeWeights} disabled={product.ideaLinks.length === 0}>Bagi bobot rata</Button></div>{product.ideaLinks.map((link) => <div key={link.id} className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_140px_180px]"><div><p className="text-body-sm font-medium text-foreground">{link.id}</p><p className="text-body-sm text-muted-foreground">Versi {link.version}</p></div><Input type="number" min="0.000001" max="1" step="0.01" value={link.weight} onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value)) updateLink(link.id, { weight: value }); }} aria-label={`Bobot ${link.id}`} /><Select value={link.role} onValueChange={(value: "primary" | "supporting" | "required") => updateLink(link.id, { role: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(ideaRoleLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>)}</div>
      <p className="text-body-sm text-muted-foreground">Sumber terhubung: {product.sourceRefs.length}</p>
    </article>
  );
}

export function ProductBundleV2Panel({ initialImports, courseLabels = {}, authorLabels = {}, embedded = false }: Props) {
  const [imports, setImports] = useState(initialImports);
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<ProductAnalysis | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [reviewTab, setReviewTab] = useState<"products" | "dependencies">("products");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ id: string; status: string; previews: ProductPreview[]; blocked: boolean; dependencies: ProductDependency[] } | null>(null);
  const [previewTypeFilter, setPreviewTypeFilter] = useState("all");
  const [selectedPreviewId, setSelectedPreviewId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ id: string; action: "discard" | "withdraw" } | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const response = await fetch("/api/admin/bundles/product", { cache: "no-store" });
    if (!response.ok) throw new Error("PRODUCT_BUNDLE_LIST_FAILED");
    const payload = (await response.json()) as { imports: BundleRow[] };
    setImports(payload.imports);
  }

  const visibleProducts = useMemo(() => {
    if (!analysis) return [];
    const needle = query.trim().toLowerCase();
    return analysis.draft.products.filter((product) => {
      const preview = analysis.previews.find((item) => item.id === product.id);
      return (typeFilter === "all" || product.productType === typeFilter) && (!needle || `${product.id} ${productTitle(product)} ${preview?.title ?? ""} ${product.productType}`.toLowerCase().includes(needle));
    });
  }, [analysis, query, typeFilter]);

  const activeProduct = visibleProducts.find((product) => product.id === selectedProductId) ?? visibleProducts[0] ?? null;
  const visiblePreviewProducts = selected?.previews.filter((preview) => previewTypeFilter === "all" || preview.productType === previewTypeFilter) ?? [];
  const activePreview = visiblePreviewProducts.find((preview) => preview.id === selectedPreviewId) ?? visiblePreviewProducts[0] ?? null;
  const draftIssues = useMemo(() => analysis?.draft.products.flatMap((product) => {
    const issues: string[] = [];
    const title = analysis.previews.find((preview) => preview.id === product.id)?.title ?? productTitle(product);
    const weight = product.ideaLinks.reduce((total, link) => total + link.weight, 0);
    if (Math.abs(weight - 1) > 0.000001) issues.push(`${title}: bobot Idea berjumlah ${weight.toFixed(3)}, harus 1`);
    if (product.productType === "article" && (!product.title.trim() || product.blocks.some((block) => !block.content.trim()))) issues.push(`${title}: judul atau bagian artikel masih kosong`);
    if (product.productType === "diktat" && (!product.title.trim() || !product.contentMarkdown.trim())) issues.push(`${title}: judul atau isi diktat masih kosong`);
    if (product.productType === "question") {
      if (!product.prompt.trim()) issues.push(`${title}: pertanyaan masih kosong`);
      if (!product.itbSource.eventName.trim()) issues.push(`${title}: nama event sumber ITB masih kosong`);
      const correct = product.options.filter((option) => option.isCorrect).length;
      if (product.questionType === "multiple_choice" && correct !== 1) issues.push(`${title}: pilih tepat satu jawaban benar`);
      if (product.questionType === "multiple_choices" && correct < 1) issues.push(`${title}: pilih minimal satu jawaban benar`);
    }
    if (product.productType === "solution" && !product.content.trim()) issues.push(`${title}: pembahasan masih kosong`);
    if (product.productType === "flashcard" && (!product.front.trim() || !product.back.trim())) issues.push(`${title}: sisi depan atau belakang masih kosong`);
    return issues;
  }) ?? [], [analysis]);

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
    setTypeFilter("all");
    setSelectedProductId(null);
    setReviewTab("products");
  }

  function updateProduct(id: string, updater: (product: ProductEntity) => ProductEntity) {
    setAnalysis((current) => current ? { ...current, draft: { products: current.draft.products.map((product) => product.id === id ? updater(product) : product) } } : current);
  }

  function selectProductType(value: string) {
    setTypeFilter(value);
    const first = analysis?.draft.products.find((product) => value === "all" || product.productType === value);
    setSelectedProductId(first?.id ?? null);
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
      const response = await fetch("/api/admin/bundles/product", { method: "POST", body: form });
      const payload = (await response.json()) as ProductAnalysis & { error?: string; reasonCodes?: string[] };
      if (!response.ok) throw new Error(payload.reasonCodes?.join(", ") || payload.error || "PRODUCT_BUNDLE_UPLOAD_FAILED");
      setAnalysis(payload);
      setSelectedProductId(payload.draft.products[0]?.id ?? null);
      setReviewTab("products");
      setTypeFilter("all");
      setMessage("ZIP lolos pemeriksaan awal. Belum ada data yang disimpan.");
    } catch (uploadError) {
      setError(explainBundleError(uploadError instanceof Error ? uploadError.message : "PRODUCT_BUNDLE_UPLOAD_FAILED"));
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
      const response = await fetch("/api/admin/bundles/product", { method: "POST", body: form });
      const payload = (await response.json()) as { result?: { status: string; bundleId: string; replaced?: boolean }; error?: string; reasonCodes?: string[] };
      if (!response.ok) throw new Error(payload.reasonCodes?.join(", ") || payload.error || "PRODUCT_BUNDLE_STAGE_FAILED");
      setMessage(`Hasil review ${payload.result?.bundleId ?? ""} ${payload.result?.replaced ? "diperbarui" : "disimpan"}.`);
      resetAnalysis();
      await refresh();
    } catch (stageError) {
      setError(explainBundleError(stageError instanceof Error ? stageError.message : "PRODUCT_BUNDLE_STAGE_FAILED"));
    } finally {
      setLoading(false);
    }
  }

  async function inspect(id: string) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/bundles/product/${id}`, { cache: "no-store" });
      const payload = (await response.json()) as { bundle?: { id: string; status: string }; previews?: ProductPreview[]; publicationBlocked?: boolean; dependencies?: ProductDependency[]; error?: string };
      if (!response.ok || !payload.bundle) throw new Error(payload.error || "PRODUCT_BUNDLE_DETAIL_FAILED");
      const previews = payload.previews ?? [];
      setSelected({ id: payload.bundle.id, status: payload.bundle.status, previews, blocked: payload.publicationBlocked ?? false, dependencies: payload.dependencies ?? [] });
      setPreviewTypeFilter("all");
      setSelectedPreviewId(previews[0]?.id ?? null);
    } catch (inspectError) {
      setError(explainBundleError(inspectError instanceof Error ? inspectError.message : "PRODUCT_BUNDLE_DETAIL_FAILED"));
    } finally {
      setLoading(false);
    }
  }

  async function publish(id: string) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/bundles/product/${id}/publish`, { method: "POST" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "PRODUCT_BUNDLE_PUBLISH_FAILED");
      setMessage("Product dipublikasikan.");
      await refresh();
      setSelected((current) => current?.id === id ? { ...current, status: "published" } : current);
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "PRODUCT_BUNDLE_PUBLISH_FAILED");
    } finally {
      setLoading(false);
    }
  }

  async function discard(id: string) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/bundles/product/${id}`, { method: "DELETE" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "PRODUCT_BUNDLE_DISCARD_FAILED");
      setMessage("Draft dihapus.");
      setSelected(null);
      setConfirmation(null);
      await refresh();
    } catch (discardError) {
      setError(discardError instanceof Error ? discardError.message : "PRODUCT_BUNDLE_DISCARD_FAILED");
    } finally {
      setLoading(false);
    }
  }

  async function withdraw(id: string) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/bundles/product/${id}/withdraw`, { method: "POST" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "PRODUCT_BUNDLE_WITHDRAW_FAILED");
      setMessage("Product ditarik dari publikasi.");
      setConfirmation(null);
      await refresh();
      setSelected((current) => current?.id === id ? { ...current, status: "withdrawn" } : current);
    } catch (withdrawError) {
      setError(withdrawError instanceof Error ? withdrawError.message : "PRODUCT_BUNDLE_WITHDRAW_FAILED");
    } finally {
      setLoading(false);
    }
  }

  const typeCounts = analysis ? Object.entries(analysis.summary.counts) : [];
  const previewTypeCounts = selected ? Object.entries(selected.previews.reduce<Record<string, number>>((counts, preview) => { counts[preview.productType] = (counts[preview.productType] ?? 0) + 1; return counts; }, {})) : [];

  return (
    <div className={embedded ? "space-y-6" : "space-y-8"}>
      {!embedded && <AdminPageHeader icon={Package} title="Product" description="Upload hasil MCP, periksa satu bagian pada satu waktu, lalu simpan draft atau publikasikan." />}

      <WorkflowStepBar steps={productSteps} currentStep={analysis ? 2 : 1} />

      {!analysis ? (
        <section className="space-y-4"><AdminSectionTitle as="h2" size="h6" icon={Upload} title="Upload hasil generasi MCP" description="ZIP hanya dibaca untuk pemeriksaan awal. Belum ada data yang disimpan sampai Anda menekan tombol simpan." /><form className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center" onSubmit={(event) => { event.preventDefault(); void analyze(); }}><Label htmlFor="product-bundle-file" className="sr-only">Pilih ZIP hasil generasi MCP</Label><Input id="product-bundle-file" type="file" accept=".zip,application/zip" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setMessage(null); setError(null); }} /><Button type="submit" disabled={!file || loading} isLoading={loading}><Upload className="size-4" />Periksa ZIP</Button></form></section>
      ) : (
        <section className="space-y-5">
          <AdminSectionTitle as="h2" size="h6" title="Review isi Product" description="Gunakan tab bagian untuk berpindah antara produk dan hubungan dependencynya." right={<Badge variant="outline">Belum disimpan</Badge>} />
          <div className="grid gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4"><div><p className="text-body-sm text-muted-foreground">Mata kuliah</p><p className="truncate font-semibold text-foreground">{courseLabels[analysis.manifest.courseId] ?? analysis.manifest.courseId}</p></div><div><p className="text-body-sm text-muted-foreground">Total produk</p><p className="font-semibold text-foreground">{analysis.summary.total} produk</p></div><div><p className="text-body-sm text-muted-foreground">Jenis produk</p><p className="font-semibold text-foreground">{typeCounts.length} jenis</p></div><div><p className="text-body-sm text-muted-foreground">Hubungan</p><p className="font-semibold text-foreground">{analysis.summary.dependencyCount} dependency</p></div></div>

          <AdminTabs value={reviewTab} onValueChange={(value) => setReviewTab(value as "products" | "dependencies")}>
            <AdminTabsList><AdminTabsTrigger value="products">Produk ({analysis.summary.total})</AdminTabsTrigger><AdminTabsTrigger value="dependencies">Hubungan ({analysis.dependencies.length})</AdminTabsTrigger></AdminTabsList>
            <AdminTabsContent value="products" className="space-y-4">
              <AdminTabs value={typeFilter} onValueChange={selectProductType}>
                <AdminTabsList className="max-w-full overflow-x-auto"><AdminTabsTrigger value="all">Semua ({analysis.summary.total})</AdminTabsTrigger>{typeCounts.map(([type, count]) => <AdminTabsTrigger key={type} value={type}>{humanProductLabel(type)} ({count})</AdminTabsTrigger>)}</AdminTabsList>
                <AdminTabsContent value={typeFilter} className="space-y-4">
                  <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari judul, isi, atau jenis produk" className="pl-9" /></div>
                  <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]"><div className="rounded-xl border border-border bg-card p-2 shadow-sm"><p className="px-2 pb-2 pt-1 text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">Daftar produk</p><div className="space-y-1">{visibleProducts.map((product) => { const preview = analysis.previews.find((item) => item.id === product.id); return <Button key={product.id} type="button" variant={activeProduct?.id === product.id ? "secondary" : "ghost"} className="h-auto w-full justify-start whitespace-normal px-2.5 py-2 text-left" onClick={() => setSelectedProductId(product.id)}><span className="min-w-0 flex-1"><span className="block truncate text-body-sm font-semibold">{preview?.title ?? productTitle(product)}</span><span className="mt-0.5 block text-body-xs font-normal text-muted-foreground">{humanProductLabel(product.productType)}</span></span></Button>; })}{visibleProducts.length === 0 && <p className="px-2 py-4 text-body-sm text-muted-foreground">Produk tidak ditemukan.</p>}</div></div>{activeProduct && <ProductDraftEditor product={activeProduct} index={analysis.draft.products.findIndex((product) => product.id === activeProduct.id)} preview={analysis.previews.find((item) => item.id === activeProduct.id)} onChange={(next) => updateProduct(activeProduct.id, () => next)} />}</div>
                </AdminTabsContent>
              </AdminTabs>
            </AdminTabsContent>
            <AdminTabsContent value="dependencies" className="space-y-4"><AdminSectionTitle as="h3" size="lg" title="Hubungan antar bagian" description="Periksa apakah setiap produk masih terhubung ke Idea dan sumber yang benar." />{analysis.dependencies.length === 0 ? <p className="text-body-sm text-muted-foreground">Tidak ada dependency eksplisit.</p> : <AdminTable className="divide-y divide-border">{analysis.dependencies.map((dependency) => <div key={dependency.id} className="grid gap-2 px-4 py-3 text-body-sm lg:grid-cols-[1fr_auto_1fr_auto]"><p><span className="font-medium text-foreground">{humanProductLabel(dependency.upstreamEntityType)}</span><br /><span className="text-muted-foreground">{dependency.upstreamEntityId}</span></p><span className="text-muted-foreground">menjadi sumber untuk</span><p><span className="font-medium text-foreground">{humanProductLabel(dependency.downstreamEntityType)}</span><br /><span className="text-muted-foreground">{dependency.downstreamEntityId}</span></p><Badge variant="outline">{dependency.freshness}</Badge></div>)}</AdminTable>}</AdminTabsContent>
          </AdminTabs>

          {draftIssues.length > 0 && <div className="rounded-lg border border-status-warning bg-status-warning/10 p-4"><p className="text-body-sm font-semibold text-foreground">Lengkapi {draftIssues.length} bagian sebelum menyimpan</p><ul className="mt-2 list-disc space-y-1 pl-5 text-body-sm text-muted-foreground">{draftIssues.slice(0, 10).map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
          <WorkflowFooter onBack={resetAnalysis} onNext={() => void stageDraft()} backDisabled={loading} nextDisabled={loading || draftIssues.length > 0} nextLabel="Simpan hasil review" />
        </section>
      )}

      {message && <p className="text-body-sm text-status-success">{message}</p>}
      {error && <p className="text-body-sm text-status-error">{error}</p>}

      <section className="space-y-3"><AdminSectionTitle as="h2" size="h6" border title="Artifact tersimpan" right={<span className="text-body-sm text-muted-foreground">{imports.length} artifact</span>} /><AdminTable className="divide-y divide-border">{imports.length === 0 && <p className="px-4 py-6 text-body-sm text-muted-foreground">Belum ada hasil Product.</p>}{imports.map((item) => <MaterialArtifactCard key={item.id} row={item} kind="product" courseLabel={item.courseId ? courseLabels[item.courseId] : undefined} authorLabel={item.requestedBy ? authorLabels[item.requestedBy] : undefined} onInspect={() => void inspect(item.id)} loading={loading} />)}</AdminTable></section>

      {selected && <section className="space-y-4 border-t border-border pt-6"><div className="flex flex-wrap items-start justify-between gap-3"><AdminSectionTitle as="h2" size="h6" title="Review artifact tersimpan" description="Pilih satu bagian dari daftar di kiri. Artikel, soal, diktat, dan pembahasan memiliki section yang terpisah." /><Button type="button" size="sm" variant="ghost" onClick={() => setSelected(null)}>Tutup</Button></div>{selected.blocked && <p className="rounded-lg border border-status-warning bg-status-warning/10 p-3 text-body-sm text-status-warning">Publikasi tertahan karena ada hubungan yang perlu diperiksa.</p>}<AdminTabs value={previewTypeFilter} onValueChange={(value) => { setPreviewTypeFilter(value); const first = selected.previews.find((preview) => value === "all" || preview.productType === value); setSelectedPreviewId(first?.id ?? null); }}><AdminTabsList className="max-w-full overflow-x-auto"><AdminTabsTrigger value="all">Semua ({selected.previews.length})</AdminTabsTrigger>{previewTypeCounts.map(([type, count]) => <AdminTabsTrigger key={type} value={type}>{humanProductLabel(type)} ({count})</AdminTabsTrigger>)}</AdminTabsList><AdminTabsContent value={previewTypeFilter} className="space-y-4"><div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]"><div className="rounded-xl border border-border bg-card p-2 shadow-sm"><p className="px-2 pb-2 pt-1 text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">Daftar bagian</p><div className="space-y-1">{visiblePreviewProducts.map((preview, index) => <Button key={preview.id} type="button" variant={activePreview?.id === preview.id ? "secondary" : "ghost"} className="h-auto w-full justify-start whitespace-normal px-2.5 py-2 text-left" onClick={() => setSelectedPreviewId(preview.id)}><span className="min-w-0 flex-1"><span className="block truncate text-body-sm font-semibold">{preview.title || `Bagian ${index + 1}`}</span><span className="mt-0.5 block text-body-xs font-normal text-muted-foreground">{humanProductLabel(preview.productType)} · versi {preview.version}</span></span></Button>)}</div></div>{activePreview && <article className="min-w-0 space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5"><div className="border-b border-border pb-4"><p className="text-body-xs font-semibold uppercase tracking-wide text-brand-primary">{humanProductLabel(activePreview.productType)}</p><h3 className="mt-1 font-heading text-h6 text-foreground">{activePreview.title}</h3><p className="mt-1 text-body-sm text-muted-foreground">Versi {activePreview.version}</p></div>{activePreview.sections.map((section) => <div key={section.label} className="space-y-2 border-b border-border pb-4 last:border-0 last:pb-0"><p className="text-body-sm font-semibold text-foreground">{section.label}</p><MathText as="div" className="whitespace-pre-wrap text-body-sm text-muted-foreground">{section.content}</MathText></div>)}<div className="space-y-2 border-t border-border pt-4"><p className="text-body-sm font-semibold text-foreground">Jejak sumber</p><p className="text-body-sm text-muted-foreground">{activePreview.traceability.ideaIds.length} Idea · {activePreview.traceability.sourceIds.length} sumber</p></div></article>}</div></AdminTabsContent></AdminTabs><div className="flex flex-wrap gap-2 border-t border-border pt-4">{selected.status === "draft" && <><Button type="button" size="sm" disabled={loading || selected.blocked} onClick={() => void publish(selected.id)}><FileCheck2 className="size-4" />Publikasikan</Button><Button type="button" size="sm" variant="destructive" disabled={loading} onClick={() => setConfirmation({ id: selected.id, action: "discard" })}><Trash2 className="size-4" />Hapus draft</Button></>}{selected.status === "published" && <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => setConfirmation({ id: selected.id, action: "withdraw" })}><ArchiveX className="size-4" />Tarik publikasi</Button>}</div></section>}

      <AdminConfirmDialog open={confirmation !== null} onOpenChange={(open) => { if (!open) setConfirmation(null); }} title={confirmation?.action === "withdraw" ? "Tarik Product" : "Hapus draft"} description={confirmation?.action === "withdraw" ? "Produk tidak lagi terlihat oleh mahasiswa. Riwayat dan audit tetap disimpan." : "Draft dan ZIP staging akan dihapus. Tindakan ini tidak memengaruhi produk yang sudah dipublikasikan."} confirmLabel={confirmation?.action === "withdraw" ? "Tarik publikasi" : "Hapus draft"} icon={confirmation?.action === "withdraw" ? ArchiveX : Trash2} loading={loading} onConfirm={() => { if (!confirmation) return; void (confirmation.action === "withdraw" ? withdraw(confirmation.id) : discard(confirmation.id)); }} />
    </div>
  );
}
