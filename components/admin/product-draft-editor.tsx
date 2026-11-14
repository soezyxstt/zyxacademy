"use client";

import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslations } from "@/lib/i18n/client";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { previewProduct } from "@/lib/bundle/product-preview";
import type { ProductEntity } from "@/lib/bundle/product-validator";
import type { ProductPreview } from "@/lib/bundle/product-preview";

function productTitle(product: ProductEntity) {
  return "title" in product && typeof product.title === "string" ? product.title : product.id;
}

export function ProductDraftEditor({ product, index, preview, onChange }: { product: ProductEntity; index: number; preview?: ProductPreview; onChange: (product: ProductEntity) => void }) {
  const t = useTranslations("adminAcademic");
  const fieldId = useId();
  const blockT = useTranslations("adminReviewProduct");
  const blockLabel = (type: string) => ["prior_knowledge_activation", "problem_introduction", "explanation", "verbal_representation", "mathematical_representation", "worked_example", "misconception", "application", "cross_idea_synthesis", "summary"].includes(type) ? blockT(`blockTypes.${type}.label`) : t("editor.articleSections");
  const humanProductLabel = (value: string) => t(`editor.productTypes.${value}`);
  const difficultyLabels = { easy: t("editor.difficulty.easy"), medium: t("editor.difficulty.medium"), hard: t("editor.difficulty.hard") };
  const cognitiveLabels = { remember: t("editor.cognitive.remember"), understand: t("editor.cognitive.understand"), apply: t("editor.cognitive.apply"), analyze: t("editor.cognitive.analyze"), evaluate: t("editor.cognitive.evaluate"), create: t("editor.cognitive.create") };
  const ideaRoleLabels = { primary: t("editor.ideaRoles.primary"), supporting: t("editor.ideaRoles.supporting"), required: t("editor.ideaRoles.required") };
  const ideaRelationLabels = { required: t("editor.ideaRelations.required"), prerequisite: t("editor.ideaRelations.prerequisite"), related: t("editor.ideaRelations.related") };
  if ((product.productType === "article" && product.schemaVersion === "article.v4") || (product.productType === "diktat" && product.units)) {
    const readOnlyPreview = preview ?? previewProduct(product);
    return (
      <article aria-label={t("editor.readOnlyV4", { type: humanProductLabel(product.productType) })} className="space-y-4 rounded-xl border border-border bg-card p-4">
        <div className="space-y-1 border-b border-border pb-3">
          <h3 className="font-heading text-body-base font-bold">{readOnlyPreview.title}</h3>
          <p role="status" className="text-body-sm text-muted-foreground">{t("editor.reviseThroughV4", { type: humanProductLabel(product.productType).toLowerCase() })}</p>
        </div>
        {readOnlyPreview.sections.map((section, sectionIndex) => (
          <section key={sectionIndex} className="space-y-2">
            {product.productType === "article" ? <h4 className="font-heading text-body-sm font-bold">{section.label}</h4> : null}
            <MarkdownRenderer content={section.content} density="compact" />
          </section>
        ))}
      </article>
    );
  }
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
        <div className="min-w-0"><p className="text-body-xs font-semibold uppercase tracking-wide text-brand-primary">{t("editor.sectionNumber", { number: index + 1 })}</p><h3 className="mt-1 truncate font-heading text-body-sm text-foreground">{preview?.title ?? productTitle(product)}</h3><p className="mt-1 text-body-sm text-muted-foreground">{humanProductLabel(product.productType)} · {t("editor.version", { version: product.version })}</p></div>
        <Badge variant="outline">{t("editor.ideaCount", { count: product.ideaLinks.length })}</Badge>
      </div>

      {product.productType === "article" && <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2"><div className="space-y-2"><Label htmlFor={`${fieldId}-title`}>{t("editor.articleTitle")}</Label><Input id={`${fieldId}-title`} value={product.title} onChange={(event) => onChange({ ...product, title: event.target.value })} /></div><div className="space-y-2"><Label htmlFor={`${fieldId}-slug`}>{t("editor.slug")}</Label><Input id={`${fieldId}-slug`} value={product.slug} onChange={(event) => onChange({ ...product, slug: event.target.value })} /></div></div>
        <div className="space-y-4"><p className="text-body-sm font-semibold text-foreground">{t("editor.articleSections")}</p>{[...product.blocks].sort((left, right) => left.orderIndex - right.orderIndex).map((block) => <div key={block.id} className="space-y-2 border-l-2 border-primary pl-3"><Label>{block.orderIndex + 1}. {blockLabel(block.blockType)}</Label><Textarea value={block.content} onChange={(event) => onChange({ ...product, blocks: product.blocks.map((item) => item.id === block.id ? { ...item, content: event.target.value } : item) })} className="min-h-28" /><div className="rounded-lg bg-muted p-3 text-body-sm"><MarkdownRenderer content={block.content} /></div></div>)}</div>
      </div>}

      {product.productType === "diktat" && <div className="space-y-4"><div className="space-y-2"><Label>{t("editor.diktatTitle")}</Label><Input value={product.title} onChange={(event) => onChange({ ...product, title: event.target.value })} /></div><div className="space-y-2"><Label>{t("editor.diktatContent")}</Label><Textarea value={product.contentMarkdown} onChange={(event) => onChange({ ...product, contentMarkdown: event.target.value })} className="min-h-72 font-mono" /></div><div className="space-y-2 rounded-lg bg-muted p-4"><p className="text-body-sm font-semibold text-foreground">{t("editor.diktatPreview")}</p><MarkdownRenderer content={product.contentMarkdown} className="text-body-sm text-foreground" /></div><p className="text-body-sm text-muted-foreground">{t("editor.articleDerived")}</p></div>}

      {product.productType === "question" && <div className="space-y-4">
        <div className="space-y-1 rounded-lg border border-border bg-muted p-3"><p className="text-body-sm font-semibold text-foreground">{t("editor.itbSource")}</p><p className="text-body-sm text-foreground">{product.itbSource.eventName}</p><p className="text-body-xs text-muted-foreground">{t("editor.lockedReference", { reference: product.itbSource.referenceId })}</p></div>
        <div className="space-y-2"><Label>{t("editor.question")}</Label><Textarea value={product.prompt} onChange={(event) => onChange({ ...product, prompt: event.target.value })} className="min-h-28" /><div className="rounded-lg bg-muted p-3"><MarkdownRenderer content={product.prompt} /></div></div>
        <div className="grid gap-3 sm:grid-cols-3"><div className="space-y-2"><Label>{t("editor.difficultyLabel")}</Label><Select value={product.difficulty} onValueChange={(value: "easy" | "medium" | "hard") => onChange({ ...product, difficulty: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(difficultyLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>{t("editor.cognitiveLabel")}</Label><Select value={product.cognitiveLevel} onValueChange={(value) => onChange({ ...product, cognitiveLevel: value as typeof product.cognitiveLevel })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(cognitiveLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>{t("editor.reasoningPattern")}</Label><Input value={product.reasoningPattern} onChange={(event) => onChange({ ...product, reasoningPattern: event.target.value })} /></div></div>
        {product.options.length > 0 && <div className="space-y-2"><p className="text-body-sm font-semibold text-foreground">{t("editor.answerOptions")}</p>{product.options.map((option, optionIndex) => <div key={option.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3"><Checkbox checked={option.isCorrect} onCheckedChange={(checked) => onChange({ ...product, options: product.options.map((item) => item.id === option.id ? { ...item, isCorrect: checked === true } : item) })} aria-label={t("editor.correctAnswer", { number: optionIndex + 1 })} /><Input value={option.text} onChange={(event) => onChange({ ...product, options: product.options.map((item) => item.id === option.id ? { ...item, text: event.target.value } : item) })} aria-label={t("editor.answerChoice", { number: optionIndex + 1 })} /></div>)}</div>}
        {product.ideaRelations.length > 0 && <div className="space-y-2"><p className="text-body-sm font-semibold text-foreground">{t("editor.questionIdeaRelations")}</p>{product.ideaRelations.map((relation, relationIndex) => <div key={`${relation.ideaId}:${relationIndex}`} className="grid gap-2 lg:grid-cols-[1fr_180px_2fr]"><p className="text-body-sm font-medium text-foreground">{relation.ideaId}</p><Select value={relation.relationType} onValueChange={(value: "required" | "prerequisite" | "related") => onChange({ ...product, ideaRelations: product.ideaRelations.map((item, itemIndex) => itemIndex === relationIndex ? { ...item, relationType: value } : item) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(ideaRelationLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select><Input value={relation.rationale ?? ""} onChange={(event) => onChange({ ...product, ideaRelations: product.ideaRelations.map((item, itemIndex) => itemIndex === relationIndex ? { ...item, rationale: event.target.value } : item) })} placeholder={t("editor.relationRationalePlaceholder")} /></div>)}</div>}
        <div className="space-y-2"><p className="text-body-sm font-semibold text-foreground">{t("editor.itbCurationNotes")}</p>{product.itbCuration.map((entry, entryIndex) => <div key={entry.referenceId} className="space-y-2 border-l-2 border-border pl-3"><p className="text-body-sm text-muted-foreground">{t("editor.referenceDifficulty", { reference: entry.referenceId, difficulty: entry.dimensions.difficulty })}</p><Textarea value={entry.curatorNote} onChange={(event) => onChange({ ...product, itbCuration: product.itbCuration.map((item, itemIndex) => itemIndex === entryIndex ? { ...item, curatorNote: event.target.value } : item) })} /></div>)}</div>
      </div>}

      {product.productType === "solution" && <div className="space-y-2"><Label>{t("editor.solutionContent")}</Label><Textarea value={product.content} onChange={(event) => onChange({ ...product, content: event.target.value })} className="min-h-36" /><div className="rounded-lg bg-muted p-3"><MarkdownRenderer content={product.content} /></div></div>}
      {product.productType === "flashcard_set" && <div className="space-y-2"><Label>{t("editor.flashcardSetTitle")}</Label><Input value={product.title} onChange={(event) => onChange({ ...product, title: event.target.value })} /><p className="text-body-sm text-muted-foreground">{t("editor.cardCount", { count: product.cards.length })}</p></div>}
      {product.productType === "flashcard" && <div className="grid gap-4 lg:grid-cols-2"><div className="space-y-2"><Label>{t("editor.frontSide")}</Label><Textarea value={product.front} onChange={(event) => onChange({ ...product, front: event.target.value })} /><div className="rounded-lg bg-muted p-3"><MarkdownRenderer content={product.front} /></div></div><div className="space-y-2"><Label>{t("editor.backSide")}</Label><Textarea value={product.back} onChange={(event) => onChange({ ...product, back: event.target.value })} /><div className="rounded-lg bg-muted p-3"><MarkdownRenderer content={product.back} /></div></div><div className="space-y-2 lg:col-span-2"><Label>{t("editor.optionalExplanation")}</Label><Textarea value={product.explanation ?? ""} onChange={(event) => onChange({ ...product, explanation: event.target.value })} /></div></div>}
      {product.productType === "assessment_blueprint" && <div className="space-y-3"><div className="grid gap-4 lg:grid-cols-2"><div className="space-y-2"><Label>{t("editor.assessmentTitle")}</Label><Input value={product.title} onChange={(event) => onChange({ ...product, title: event.target.value })} /></div><div className="space-y-2"><Label>{t("editor.assessmentType")}</Label><Select value={product.assessmentType} onValueChange={(value: "quiz" | "tryout") => onChange({ ...product, assessmentType: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="quiz">{t("editor.quiz")}</SelectItem><SelectItem value="tryout">{t("editor.tryout")}</SelectItem></SelectContent></Select></div></div><p className="text-body-sm text-muted-foreground">{t("editor.blueprintCounts", { chapters: product.chapterIds.length, questions: product.questionIds.length })}</p></div>}

      <div className="space-y-3 border-t border-border pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-body-sm font-semibold text-foreground">{t("editor.ideaLinksTitle")}</p><p className="text-body-sm text-muted-foreground">{t("editor.weightTotal", { total: weightTotal.toFixed(3) })}</p></div><Button type="button" size="sm" variant="outline" onClick={normalizeWeights} disabled={product.ideaLinks.length === 0}>{t("editor.normalizeWeights")}</Button></div>{product.ideaLinks.map((link) => <div key={link.id} className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_140px_180px]"><div><p className="text-body-sm font-medium text-foreground">{link.id}</p><p className="text-body-sm text-muted-foreground">{t("editor.version", { version: link.version })}</p></div><Input type="number" min="0.000001" max="1" step="0.01" value={link.weight} onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value)) updateLink(link.id, { weight: value }); }} aria-label={t("editor.weightFor", { id: link.id })} /><Select value={link.role} onValueChange={(value: "primary" | "supporting" | "required") => updateLink(link.id, { role: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(ideaRoleLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>)}</div>
      <p className="text-body-sm text-muted-foreground">{t("editor.connectedSources", { count: product.sourceRefs.length })}</p>
    </article>
  );
}
