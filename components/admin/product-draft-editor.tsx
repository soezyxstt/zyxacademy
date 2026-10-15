"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MathText } from "@/components/course/math-text";
import type { ProductEntity } from "@/lib/bundle/product-validator";
import type { ProductPreview } from "@/lib/bundle/product-preview";

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
    <article className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div className="min-w-0"><p className="text-body-xs font-semibold uppercase tracking-wide text-brand-primary">Bagian {index + 1}</p><h3 className="mt-1 truncate font-heading text-body-sm text-foreground">{preview?.title ?? productTitle(product)}</h3><p className="mt-1 text-body-sm text-muted-foreground">{humanProductLabel(product.productType)} · versi {product.version}</p></div>
        <Badge variant="outline">{product.ideaLinks.length} Idea</Badge>
      </div>

      {product.productType === "article" && <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2"><div className="space-y-2"><Label>Judul artikel</Label><Input value={product.title} onChange={(event) => onChange({ ...product, title: event.target.value })} /></div><div className="space-y-2"><Label>Slug</Label><Input value={product.slug} onChange={(event) => onChange({ ...product, slug: event.target.value })} /></div></div>
        <div className="space-y-4"><p className="text-body-sm font-semibold text-foreground">Bagian artikel</p>{[...product.blocks].sort((left, right) => left.orderIndex - right.orderIndex).map((block) => <div key={block.id} className="space-y-2 border-l-2 border-primary pl-3"><Label>{block.orderIndex + 1}. {block.blockType.replaceAll("_", " ")}</Label><Textarea value={block.content} onChange={(event) => onChange({ ...product, blocks: product.blocks.map((item) => item.id === block.id ? { ...item, content: event.target.value } : item) })} className="min-h-28" /><div className="rounded-lg bg-muted p-3 text-body-sm"><MathText as="div">{block.content}</MathText></div></div>)}</div>
      </div>}

      {product.productType === "diktat" && <div className="space-y-4"><div className="space-y-2"><Label>Judul diktat</Label><Input value={product.title} onChange={(event) => onChange({ ...product, title: event.target.value })} /></div><div className="space-y-2"><Label>Isi diktat</Label><Textarea value={product.contentMarkdown} onChange={(event) => onChange({ ...product, contentMarkdown: event.target.value })} className="min-h-72 font-mono" /></div><div className="space-y-2 rounded-lg bg-muted p-4"><p className="text-body-sm font-semibold text-foreground">Preview isi diktat</p><MathText as="div" className="whitespace-pre-wrap text-body-sm text-foreground">{product.contentMarkdown}</MathText></div><p className="text-body-sm text-muted-foreground">Turunan artikel. Lineage divalidasi saat disimpan.</p></div>}

      {product.productType === "question" && <div className="space-y-4">
        <div className="space-y-1 rounded-lg border border-border bg-muted p-3"><p className="text-body-sm font-semibold text-foreground">Sumber contoh soal ITB</p><p className="text-body-sm text-foreground">{product.itbSource.eventName}</p><p className="text-body-xs text-muted-foreground">Referensi: {product.itbSource.referenceId}. Identitas sumber dikunci dari bundle.</p></div>
        <div className="space-y-2"><Label>Pertanyaan</Label><Textarea value={product.prompt} onChange={(event) => onChange({ ...product, prompt: event.target.value })} className="min-h-28" /><div className="rounded-lg bg-muted p-3"><MathText as="div">{product.prompt}</MathText></div></div>
        <div className="grid gap-3 sm:grid-cols-3"><div className="space-y-2"><Label>Kesulitan</Label><Select value={product.difficulty} onValueChange={(value: "easy" | "medium" | "hard") => onChange({ ...product, difficulty: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(difficultyLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Level berpikir</Label><Select value={product.cognitiveLevel} onValueChange={(value) => onChange({ ...product, cognitiveLevel: value as typeof product.cognitiveLevel })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(cognitiveLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Pola penalaran</Label><Input value={product.reasoningPattern} onChange={(event) => onChange({ ...product, reasoningPattern: event.target.value })} /></div></div>
        {product.options.length > 0 && <div className="space-y-2"><p className="text-body-sm font-semibold text-foreground">Pilihan jawaban</p>{product.options.map((option, optionIndex) => <div key={option.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3"><Checkbox checked={option.isCorrect} onCheckedChange={(checked) => onChange({ ...product, options: product.options.map((item) => item.id === option.id ? { ...item, isCorrect: checked === true } : item) })} aria-label={`Jawaban ${optionIndex + 1} benar`} /><Input value={option.text} onChange={(event) => onChange({ ...product, options: product.options.map((item) => item.id === option.id ? { ...item, text: event.target.value } : item) })} aria-label={`Teks pilihan jawaban ${optionIndex + 1}`} /></div>)}</div>}
        {product.ideaRelations.length > 0 && <div className="space-y-2"><p className="text-body-sm font-semibold text-foreground">Hubungan soal dengan Idea</p>{product.ideaRelations.map((relation, relationIndex) => <div key={`${relation.ideaId}:${relationIndex}`} className="grid gap-2 lg:grid-cols-[1fr_180px_2fr]"><p className="text-body-sm font-medium text-foreground">{relation.ideaId}</p><Select value={relation.relationType} onValueChange={(value: "required" | "prerequisite" | "related") => onChange({ ...product, ideaRelations: product.ideaRelations.map((item, itemIndex) => itemIndex === relationIndex ? { ...item, relationType: value } : item) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(ideaRelationLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select><Input value={relation.rationale ?? ""} onChange={(event) => onChange({ ...product, ideaRelations: product.ideaRelations.map((item, itemIndex) => itemIndex === relationIndex ? { ...item, rationale: event.target.value } : item) })} placeholder="Mengapa Idea ini diperlukan" /></div>)}</div>}
        <div className="space-y-2"><p className="text-body-sm font-semibold text-foreground">Catatan kurasi referensi ITB</p>{product.itbCuration.map((entry, entryIndex) => <div key={entry.referenceId} className="space-y-2 border-l-2 border-border pl-3"><p className="text-body-sm text-muted-foreground">{entry.referenceId} · tingkat {entry.dimensions.difficulty}</p><Textarea value={entry.curatorNote} onChange={(event) => onChange({ ...product, itbCuration: product.itbCuration.map((item, itemIndex) => itemIndex === entryIndex ? { ...item, curatorNote: event.target.value } : item) })} /></div>)}</div>
      </div>}

      {product.productType === "solution" && <div className="space-y-2"><Label>Pembahasan soal</Label><Textarea value={product.content} onChange={(event) => onChange({ ...product, content: event.target.value })} className="min-h-36" /><div className="rounded-lg bg-muted p-3"><MathText as="div">{product.content}</MathText></div></div>}
      {product.productType === "flashcard_set" && <div className="space-y-2"><Label>Judul set flashcard</Label><Input value={product.title} onChange={(event) => onChange({ ...product, title: event.target.value })} /><p className="text-body-sm text-muted-foreground">{product.cards.length} kartu</p></div>}
      {product.productType === "flashcard" && <div className="grid gap-4 lg:grid-cols-2"><div className="space-y-2"><Label>Sisi depan</Label><Textarea value={product.front} onChange={(event) => onChange({ ...product, front: event.target.value })} /><div className="rounded-lg bg-muted p-3"><MathText as="div">{product.front}</MathText></div></div><div className="space-y-2"><Label>Sisi belakang</Label><Textarea value={product.back} onChange={(event) => onChange({ ...product, back: event.target.value })} /><div className="rounded-lg bg-muted p-3"><MathText as="div">{product.back}</MathText></div></div><div className="space-y-2 lg:col-span-2"><Label>Penjelasan opsional</Label><Textarea value={product.explanation ?? ""} onChange={(event) => onChange({ ...product, explanation: event.target.value })} /></div></div>}
      {product.productType === "assessment_blueprint" && <div className="space-y-3"><div className="grid gap-4 lg:grid-cols-2"><div className="space-y-2"><Label>Judul asesmen</Label><Input value={product.title} onChange={(event) => onChange({ ...product, title: event.target.value })} /></div><div className="space-y-2"><Label>Jenis asesmen</Label><Select value={product.assessmentType} onValueChange={(value: "quiz" | "tryout") => onChange({ ...product, assessmentType: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="quiz">Kuis</SelectItem><SelectItem value="tryout">Tryout</SelectItem></SelectContent></Select></div></div><p className="text-body-sm text-muted-foreground">Bab: {product.chapterIds.length} · soal: {product.questionIds.length}</p></div>}

      <div className="space-y-3 border-t border-border pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-body-sm font-semibold text-foreground">Hubungan dengan Idea</p><p className="text-body-sm text-muted-foreground">Total bobot harus 1. Saat ini {weightTotal.toFixed(3)}.</p></div><Button type="button" size="sm" variant="outline" onClick={normalizeWeights} disabled={product.ideaLinks.length === 0}>Bagi bobot rata</Button></div>{product.ideaLinks.map((link) => <div key={link.id} className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_140px_180px]"><div><p className="text-body-sm font-medium text-foreground">{link.id}</p><p className="text-body-sm text-muted-foreground">Versi {link.version}</p></div><Input type="number" min="0.000001" max="1" step="0.01" value={link.weight} onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value)) updateLink(link.id, { weight: value }); }} aria-label={`Bobot ${link.id}`} /><Select value={link.role} onValueChange={(value: "primary" | "supporting" | "required") => updateLink(link.id, { role: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(ideaRoleLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>)}</div>
      <p className="text-body-sm text-muted-foreground">Sumber terhubung: {product.sourceRefs.length}</p>
    </article>
  );
}
