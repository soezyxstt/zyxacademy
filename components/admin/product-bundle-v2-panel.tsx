"use client";

import { useEffect, useMemo, useState } from "react";
import { ArchiveX, Eye, FileCheck2, Package, Search, Trash2, Upload } from "lucide-react";
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
import { StatusBadge } from "@/components/admin/status-badges";
import { AdminTable } from "@/components/admin/table";
import type { ProductDependency, ProductEntity } from "@/lib/bundle/product-validator";
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

type ProductPreview = {
  id: string;
  productType: string;
  version: number;
  title: string;
  traceability: { ideaIds: string[]; sourceIds: string[] };
  sections: { label: string; content: string }[];
};

type Props = { initialImports: BundleRow[] };

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

function ProductDraftEditor({ product, index, preview, onChange }: { product: ProductEntity; index: number; preview?: ProductPreview; onChange: (product: ProductEntity) => void }) {
  const updateLink = (ideaId: string, changes: Partial<ProductEntity["ideaLinks"][number]>) => onChange({ ...product, ideaLinks: product.ideaLinks.map((link) => link.id === ideaId ? { ...link, ...changes } : link) } as ProductEntity);
  const normalizeWeights = () => {
    const weight = 1 / product.ideaLinks.length;
    onChange({ ...product, ideaLinks: product.ideaLinks.map((link) => ({ ...link, weight })) } as ProductEntity);
  };
  const weightTotal = product.ideaLinks.reduce((total, link) => total + link.weight, 0);

  return (
    <article className="space-y-5 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="font-heading text-h6 text-foreground">{index + 1}. {preview?.title ?? product.id}</p><p className="text-body-sm text-muted-foreground">{productLabels[product.productType]} ; {product.id} ; versi {product.version}</p></div>
        <Badge variant="outline">{product.ideaLinks.length} Idea</Badge>
      </div>

      {product.productType === "article" && <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2"><div className="space-y-2"><Label>Judul artikel</Label><Input value={product.title} onChange={(event) => onChange({ ...product, title: event.target.value })} /></div><div className="space-y-2"><Label>Slug</Label><Input value={product.slug} onChange={(event) => onChange({ ...product, slug: event.target.value })} /></div></div>
        <div className="space-y-4"><p className="text-body-sm font-semibold text-foreground">Urutan konten artikel</p>{[...product.blocks].sort((left, right) => left.orderIndex - right.orderIndex).map((block) => <div key={block.id} className="space-y-2 border-l-2 border-primary pl-3"><Label>{block.orderIndex + 1}. {block.blockType.replaceAll("_", " ")}</Label><Textarea value={block.content} onChange={(event) => onChange({ ...product, blocks: product.blocks.map((item) => item.id === block.id ? { ...item, content: event.target.value } : item) })} className="min-h-28" /><div className="rounded-lg bg-muted p-3 text-body-sm"><MathText>{block.content}</MathText></div></div>)}</div>
      </div>}

      {product.productType === "diktat" && <div className="space-y-4"><div className="space-y-2"><Label>Judul diktat</Label><Input value={product.title} onChange={(event) => onChange({ ...product, title: event.target.value })} /></div><div className="space-y-2"><Label>Isi diktat</Label><Textarea value={product.contentMarkdown} onChange={(event) => onChange({ ...product, contentMarkdown: event.target.value })} className="min-h-72 font-mono" /></div><div className="space-y-2 rounded-lg bg-muted p-4"><p className="text-body-sm font-semibold text-foreground">Preview konten</p><div className="whitespace-pre-wrap text-body-sm text-foreground"><MathText>{product.contentMarkdown}</MathText></div></div><p className="text-body-sm text-muted-foreground">Diturunkan dari Artikel {product.sourceArticleId} versi {product.sourceArticleVersion}. Lineage diperbarui otomatis saat disimpan.</p></div>}

      {product.productType === "question" && <div className="space-y-4">
        <div className="space-y-1 rounded-lg border border-border bg-muted p-3">
          <p className="text-body-sm font-semibold text-foreground">Sumber contoh soal ITB</p>
          <p className="text-body-sm text-foreground">{product.itbSource.eventName}</p>
          <p className="text-body-xs text-muted-foreground">ID referensi: {product.itbSource.referenceId}. Identitas sumber dikunci dari Product Bundle.</p>
        </div>
        <div className="space-y-2"><Label>Pertanyaan</Label><Textarea value={product.prompt} onChange={(event) => onChange({ ...product, prompt: event.target.value })} className="min-h-28" /><div className="rounded-lg bg-muted p-3"><MathText>{product.prompt}</MathText></div></div>
        <div className="grid gap-3 sm:grid-cols-3"><div className="space-y-2"><Label>Kesulitan</Label><Select value={product.difficulty} onValueChange={(value: "easy" | "medium" | "hard") => onChange({ ...product, difficulty: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["easy", "medium", "hard"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Level kognitif</Label><Select value={product.cognitiveLevel} onValueChange={(value) => onChange({ ...product, cognitiveLevel: value as typeof product.cognitiveLevel })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["remember", "understand", "apply", "analyze", "evaluate", "create"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Pola penalaran</Label><Input value={product.reasoningPattern} onChange={(event) => onChange({ ...product, reasoningPattern: event.target.value })} /></div></div>
        {product.options.length > 0 && <div className="space-y-2"><p className="text-body-sm font-semibold text-foreground">Pilihan jawaban</p>{product.options.map((option) => <div key={option.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3"><Checkbox checked={option.isCorrect} onCheckedChange={(checked) => onChange({ ...product, options: product.options.map((item) => item.id === option.id ? { ...item, isCorrect: checked === true } : item) })} aria-label={`Jawaban ${option.id} benar`} /><Input value={option.text} onChange={(event) => onChange({ ...product, options: product.options.map((item) => item.id === option.id ? { ...item, text: event.target.value } : item) })} /></div>)}</div>}
        {product.ideaRelations.length > 0 && <div className="space-y-2"><p className="text-body-sm font-semibold text-foreground">Makna relasi Idea untuk soal</p>{product.ideaRelations.map((relation, relationIndex) => <div key={`${relation.ideaId}:${relationIndex}`} className="grid gap-2 lg:grid-cols-[1fr_180px_2fr]"><p className="text-body-sm font-medium text-foreground">{relation.ideaId}</p><Select value={relation.relationType} onValueChange={(value: "required" | "prerequisite" | "related") => onChange({ ...product, ideaRelations: product.ideaRelations.map((item, itemIndex) => itemIndex === relationIndex ? { ...item, relationType: value } : item) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["required", "prerequisite", "related"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select><Input value={relation.rationale ?? ""} onChange={(event) => onChange({ ...product, ideaRelations: product.ideaRelations.map((item, itemIndex) => itemIndex === relationIndex ? { ...item, rationale: event.target.value } : item) })} placeholder="Mengapa Idea ini diperlukan" /></div>)}</div>}
        <div className="space-y-2"><p className="text-body-sm font-semibold text-foreground">Catatan kurasi referensi ITB</p>{product.itbCuration.map((entry, entryIndex) => <div key={entry.referenceId} className="space-y-2 border-l-2 border-border pl-3"><p className="text-body-sm text-muted-foreground">{entry.referenceId} ; tingkat {entry.dimensions.difficulty}</p><Textarea value={entry.curatorNote} onChange={(event) => onChange({ ...product, itbCuration: product.itbCuration.map((item, itemIndex) => itemIndex === entryIndex ? { ...item, curatorNote: event.target.value } : item) })} /></div>)}</div>
      </div>}

      {product.productType === "solution" && <div className="space-y-2"><Label>Pembahasan untuk {product.questionId}</Label><Textarea value={product.content} onChange={(event) => onChange({ ...product, content: event.target.value })} className="min-h-36" /><div className="rounded-lg bg-muted p-3"><MathText>{product.content}</MathText></div></div>}
      {product.productType === "flashcard_set" && <div className="space-y-2"><Label>Judul set</Label><Input value={product.title} onChange={(event) => onChange({ ...product, title: event.target.value })} /><p className="text-body-sm text-muted-foreground">Berisi {product.cards.length} flashcard: {product.cards.join(", ")}</p></div>}
      {product.productType === "flashcard" && <div className="grid gap-4 lg:grid-cols-2"><div className="space-y-2"><Label>Sisi depan</Label><Textarea value={product.front} onChange={(event) => onChange({ ...product, front: event.target.value })} /></div><div className="space-y-2"><Label>Sisi belakang</Label><Textarea value={product.back} onChange={(event) => onChange({ ...product, back: event.target.value })} /></div><div className="space-y-2 lg:col-span-2"><Label>Penjelasan opsional</Label><Textarea value={product.explanation ?? ""} onChange={(event) => onChange({ ...product, explanation: event.target.value })} /></div></div>}
      {product.productType === "assessment_blueprint" && <div className="space-y-3"><div className="grid gap-4 lg:grid-cols-2"><div className="space-y-2"><Label>Judul asesmen</Label><Input value={product.title} onChange={(event) => onChange({ ...product, title: event.target.value })} /></div><div className="space-y-2"><Label>Jenis asesmen</Label><Select value={product.assessmentType} onValueChange={(value: "quiz" | "tryout") => onChange({ ...product, assessmentType: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="quiz">Quiz</SelectItem><SelectItem value="tryout">Tryout</SelectItem></SelectContent></Select></div></div><p className="text-body-sm text-muted-foreground">Bab: {product.chapterIds.join(", ")} ; soal: {product.questionIds.join(", ")}</p></div>}

      <div className="space-y-3 border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-body-sm font-semibold text-foreground">Relasi dengan Idea</p><p className="text-body-sm text-muted-foreground">Bobot total harus tepat 1. Saat ini {weightTotal.toFixed(3)}.</p></div><Button type="button" size="sm" variant="outline" onClick={normalizeWeights}>Bagi bobot rata</Button></div>
        {product.ideaLinks.map((link) => <div key={link.id} className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_140px_180px]"><div><p className="text-body-sm font-medium text-foreground">{link.id}</p><p className="text-body-sm text-muted-foreground">Idea versi {link.version}</p></div><Input type="number" min="0.000001" max="1" step="0.01" value={link.weight} onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value)) updateLink(link.id, { weight: value }); }} aria-label={`Bobot ${link.id}`} /><Select value={link.role} onValueChange={(value: "primary" | "supporting" | "required") => updateLink(link.id, { role: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["primary", "supporting", "required"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>)}
      </div>
      <div className="text-body-sm text-muted-foreground">Sumber: {product.sourceRefs.map((source) => `${source.sourceId} v${source.version}`).join(", ")}</div>
    </article>
  );
}

export function ProductBundleV2Panel({ initialImports }: Props) {
  const [imports, setImports] = useState(initialImports);
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<ProductAnalysis | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selected, setSelected] = useState<{ id: string; status: string; previews: ProductPreview[]; blocked: boolean } | null>(null);
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
      return (typeFilter === "all" || product.productType === typeFilter) && (!needle || `${product.id} ${preview?.title ?? ""} ${product.productType}`.toLowerCase().includes(needle));
    });
  }, [analysis, query, typeFilter]);
  const draftIssues = useMemo(() => analysis?.draft.products.flatMap((product) => {
    const issues: string[] = [];
    const title = analysis.previews.find((preview) => preview.id === product.id)?.title ?? product.id;
    const weight = product.ideaLinks.reduce((total, link) => total + link.weight, 0);
    if (Math.abs(weight - 1) > 0.000001) issues.push(`${title}: bobot Idea berjumlah ${weight.toFixed(3)}, harus 1`);
    if (product.productType === "article" && (!product.title.trim() || product.blocks.some((block) => !block.content.trim()))) issues.push(`${title}: judul atau blok artikel masih kosong`);
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

  function updateProduct(id: string, updater: (product: ProductEntity) => ProductEntity) {
    setAnalysis((current) => current ? { ...current, draft: { products: current.draft.products.map((product) => product.id === id ? updater(product) : product) } } : current);
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
      setMessage(`Draft ${payload.result?.bundleId ?? ""} ${payload.result?.replaced ? "diperbarui" : "disimpan"}.`);
      setAnalysis(null);
      setFile(null);
      setQuery("");
      setTypeFilter("all");
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
      const payload = (await response.json()) as { bundle?: { id: string; status: string }; previews?: ProductPreview[]; publicationBlocked?: boolean; error?: string };
      if (!response.ok || !payload.bundle) throw new Error(payload.error || "PRODUCT_BUNDLE_DETAIL_FAILED");
      setSelected({ id: payload.bundle.id, status: payload.bundle.status, previews: payload.previews ?? [], blocked: payload.publicationBlocked ?? false });
    } catch (inspectError) {
      setError(inspectError instanceof Error ? inspectError.message : "PRODUCT_BUNDLE_DETAIL_FAILED");
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
      setMessage("Product Bundle dipublikasikan secara atomik.");
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
      setMessage("Product Bundle ditarik dari publikasi.");
      setConfirmation(null);
      await refresh();
      setSelected((current) => current?.id === id ? { ...current, status: "withdrawn" } : current);
    } catch (withdrawError) {
      setError(withdrawError instanceof Error ? withdrawError.message : "PRODUCT_BUNDLE_WITHDRAW_FAILED");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <AdminPageHeader
        icon={Package}
        title="Product Bundle"
        description="Analisis ZIP, edit produk, simpan sebagai draft, lalu publikasikan saat sudah siap."
      />

      <section className="space-y-3">
        <AdminSectionTitle as="h2" size="h6" title="1. Pilih dan analisis ZIP" />
        <form className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center" onSubmit={(event) => { event.preventDefault(); void analyze(); }}>
          <Input type="file" accept=".zip,application/zip" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setAnalysis(null); }} />
          <Button type="submit" disabled={!file || loading} isLoading={loading}><Upload className="size-4" />Analisis ZIP</Button>
        </form>
        {message && <p className="text-body-sm text-status-success">{message}</p>}
        {error && <p className="text-body-sm text-status-error">{error}</p>}
      </section>

      {analysis && (
        <section className="space-y-5 border-t border-border pt-6">
          <AdminSectionTitle as="h2" size="h6" title="2. Periksa dan edit Product" description="Konten dan pemetaan Idea dapat diedit di sini. Identitas, sumber, dan versi tetap dikunci." right={<Badge variant="outline">Belum disimpan</Badge>} />
          <div className="grid gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
            <div><p className="text-body-sm text-muted-foreground">Bundle</p><p className="truncate font-semibold text-foreground">{analysis.manifest.bundleId}</p></div>
            <div><p className="text-body-sm text-muted-foreground">Course</p><p className="truncate font-semibold text-foreground">{analysis.manifest.courseId}</p></div>
            <div><p className="text-body-sm text-muted-foreground">Produk</p><p className="font-semibold text-foreground">{analysis.summary.total} item</p></div>
            <div><p className="text-body-sm text-muted-foreground">Dependency</p><p className="font-semibold text-foreground">{analysis.summary.dependencyCount} hubungan</p></div>
          </div>
          <div className="flex flex-wrap gap-2">{Object.entries(analysis.summary.counts).map(([type, count]) => <Badge key={type} variant="outline">{productLabels[type as ProductEntity["productType"]] ?? type}: {count}</Badge>)}</div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari judul, ID, atau tipe produk" className="pl-9" /></div>
            <Select value={typeFilter} onValueChange={setTypeFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Semua tipe</SelectItem>{Object.entries(productLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="divide-y divide-border border-y border-border">
            {visibleProducts.map((product, index) => {
              const preview = analysis.previews.find((item) => item.id === product.id);
              return <ProductDraftEditor key={product.id} product={product} index={index} preview={preview} onChange={(next) => updateProduct(product.id, () => next)} />;
            })}
          </div>
          <div className="space-y-3"><AdminSectionTitle as="h3" size="lg" title="Peta dependency" description="Pemetaan ini memperlihatkan produk mana yang bergantung pada Idea, sumber, atau produk lain." />{analysis.dependencies.length === 0 ? <p className="text-body-sm text-muted-foreground">Tidak ada dependency eksplisit.</p> : <AdminTable className="divide-y divide-border">{analysis.dependencies.map((dependency) => <div key={dependency.id} className="grid gap-2 px-4 py-3 text-body-sm lg:grid-cols-[1fr_auto_1fr_auto]"><p><span className="font-medium text-foreground">{dependency.upstreamEntityType}</span><br /><span className="text-muted-foreground">{dependency.upstreamEntityId}</span></p><span className="text-muted-foreground">menjadi sumber untuk</span><p><span className="font-medium text-foreground">{productLabels[dependency.downstreamEntityType]}</span><br /><span className="text-muted-foreground">{dependency.downstreamEntityId}</span></p><Badge variant="outline">{dependency.freshness}</Badge></div>)}</AdminTable>}</div>
          {draftIssues.length > 0 && <div className="rounded-lg border border-status-warning bg-status-warning/10 p-4"><p className="text-body-sm font-semibold text-foreground">Lengkapi {draftIssues.length} bagian sebelum menyimpan</p><ul className="mt-2 list-disc space-y-1 pl-5 text-body-sm text-muted-foreground">{draftIssues.slice(0, 10).map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-foreground">Simpan sebagai draft?</p><p className="text-body-sm text-muted-foreground">Server memvalidasi kualitas, memperbarui lineage dan hash, lalu menyimpan ZIP. Draft belum terlihat oleh mahasiswa.</p></div><div className="flex gap-2"><Button type="button" variant="outline" onClick={() => setAnalysis(null)} disabled={loading}>Batalkan</Button><Button type="button" onClick={() => void stageDraft()} disabled={loading || draftIssues.length > 0} isLoading={loading}><FileCheck2 className="size-4" />Simpan draft</Button></div></div>
        </section>
      )}

      <section className="space-y-3">
        <AdminSectionTitle
          as="h2"
          size="h6"
          border
          title="Product Bundle tersimpan"
          right={<span className="text-body-sm text-muted-foreground">{imports.length} bundle</span>}
        />
        <AdminTable className="divide-y divide-border">
          {imports.length === 0 && <p className="px-4 py-6 text-body-sm text-muted-foreground">Belum ada Product Bundle.</p>}
          {imports.map((item) => (
            <div key={item.id} className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="min-w-0 space-y-1">
                <p className="truncate font-semibold text-foreground">{item.bundleId}</p>
                <p className="break-all font-mono text-body-sm text-muted-foreground">{item.checksum}</p>
                <div className="flex flex-wrap items-center gap-2"><p className="text-body-sm text-muted-foreground">Course {item.courseId ?? "tidak tercatat"}</p><StatusBadge tone={item.status === "published" ? "success" : item.status === "withdrawn" ? "muted" : "info"}>{item.status}</StatusBadge></div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => void inspect(item.id)}><Eye className="size-4" />Tinjau isi</Button>
              </div>
            </div>
          ))}
        </AdminTable>
      </section>

      {selected && (
        <section className="space-y-4 border-t border-border pt-6">
          <div className="flex items-center justify-between gap-4">
            <AdminSectionTitle as="h2" size="h6" title="Preview dan traceability" />
            <div className="flex items-center gap-2"><StatusBadge tone={selected.status === "published" ? "success" : selected.status === "withdrawn" ? "muted" : "info"}>{selected.status}</StatusBadge><Button type="button" size="sm" variant="ghost" onClick={() => setSelected(null)}>Tutup</Button></div>
          </div>
          {selected.blocked && <p className="text-body-sm text-status-warning">Publikasi tertahan karena dependency memerlukan review.</p>}
          <div className="divide-y divide-border">
            {selected.previews.map((preview) => (
              <article key={`${preview.id}:${preview.version}`} className="space-y-2 py-4">
                <p className="font-semibold text-foreground">{preview.title} <span className="font-normal text-muted-foreground">({preview.productType} v{preview.version})</span></p>
                <p className="text-body-sm text-muted-foreground">Ideas: {preview.traceability.ideaIds.join(", ")} ; sumber: {preview.traceability.sourceIds.join(", ")}</p>
                {preview.sections.map((section) => <p key={section.label} className="whitespace-pre-wrap text-body-sm text-muted-foreground"><span className="font-medium text-foreground">{section.label}:</span> <MathText as="span">{section.content}</MathText></p>)}
              </article>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            {selected.status === "draft" && <>
              <Button type="button" size="sm" disabled={loading || selected.blocked} onClick={() => void publish(selected.id)}>Publikasikan</Button>
              <Button type="button" size="sm" variant="destructive" disabled={loading} onClick={() => setConfirmation({ id: selected.id, action: "discard" })}><Trash2 className="size-4" />Hapus draft</Button>
            </>}
            {selected.status === "published" && <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => setConfirmation({ id: selected.id, action: "withdraw" })}><ArchiveX className="size-4" />Tarik publikasi</Button>}
          </div>
        </section>
      )}

      <AdminConfirmDialog
        open={confirmation !== null}
        onOpenChange={(open) => { if (!open) setConfirmation(null); }}
        title={confirmation?.action === "withdraw" ? "Tarik Product Bundle" : "Hapus draft"}
        description={confirmation?.action === "withdraw" ? "Produk tidak lagi terlihat oleh mahasiswa. Riwayat dan audit tetap disimpan." : "Draft dan ZIP staging akan dihapus. Tindakan ini tidak memengaruhi produk yang sudah dipublikasikan."}
        confirmLabel={confirmation?.action === "withdraw" ? "Tarik publikasi" : "Hapus draft"}
        icon={confirmation?.action === "withdraw" ? ArchiveX : Trash2}
        loading={loading}
        onConfirm={() => { if (!confirmation) return; void (confirmation.action === "withdraw" ? withdraw(confirmation.id) : discard(confirmation.id)); }}
      />
    </div>
  );
}
