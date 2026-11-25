import { createHash } from "node:crypto";
import { z } from "zod";
import { buildPublicArticleReadModel, type PublicArticleReadModel } from "@/lib/articles/structured-read-model";
import { productDraftInputSchema, PRODUCT_DRAFT_LIMITS } from "./product-draft-builder";
import { articlePartsSchema, collectArticlePartIds, flattenArticleParts, materializeArticleParts } from "@/lib/materials/article-parts";
import { authoredDiktatUnitsSchema, materializeAuthoredDiktat, prepareAuthoredDiktatVisuals, validateAuthoredDiktat } from "@/lib/materials/diktat-v4";
import type { ProductDiktatRenderSource } from "@/lib/bundle/product-diktat-pdf";
import { inspectInteractiveDocumentsInMarkdown } from "@/lib/materials/interactive-document-markdown";

export interface DraftPreviewIssue { code: string; path: string; message: string; severity: "error" | "warning" }
export type DraftPreviewProduct =
  | { id: string; productType: "article"; article: PublicArticleReadModel }
  | { id: string; productType: "diktat"; source: ProductDiktatRenderSource };
export interface DraftPreviewOutline {
  id: string; title: string; productType: "article" | "diktat"; ideaIds: string[];
  units: Array<{ id: string; title?: string; kind?: string; learningObjective?: string; ideaIds: string[]; parts: Array<{ id: string; kind: string }> }>;
}
export interface ProductDraftPreview {
  schemaVersion: "product-draft-preview.v1";
  inputHash: string;
  checks: { structure: "passed" | "failed"; references: "not_checked"; publication: "not_evaluated"; visualReview: "not_performed" };
  products: DraftPreviewProduct[];
  outline: DraftPreviewOutline[];
  issues: DraftPreviewIssue[];
}

/** Render-only IDs. No source versions, source hashes, or publication state are invented. */
function assignIds(value: unknown, prefix: string): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const result: Record<string, unknown> = { ...(value as Record<string, unknown>), id: (value as { id?: string }).id ?? prefix };
  for (const key of ["steps", "parts", "relations", "symbolDefinitions"]) {
    if (Array.isArray(result[key])) result[key] = result[key].map((child, index) => assignIds(child, `${prefix}:${key}:${index + 1}`));
  }
  return result;
}

export function draftPreviewFailure(error: unknown, path = "products"): DraftPreviewIssue[] {
  if (error instanceof z.ZodError) return error.issues.slice(0, PRODUCT_DRAFT_LIMITS.issues).map(issue => ({ code: "PREVIEW_CONTENT_INVALID", path: [path, ...issue.path].join("."), message: issue.message.slice(0, 400), severity: "error" }));
  return [{ code: "PREVIEW_CONTENT_INVALID", path, message: error instanceof Error ? error.message.slice(0, 400) : "Draft could not be read", severity: "error" }];
}

/** Local content projection only. It never produces an admissible bundle or a release receipt. */
export function prepareProductDraftPreview(raw: unknown): ProductDraftPreview {
  let serialized: string;
  try { serialized = JSON.stringify(raw); if (typeof serialized !== "string") throw new Error("PREVIEW_JSON_REQUIRED"); }
  catch { return { schemaVersion: "product-draft-preview.v1", inputHash: "", checks: { structure: "failed", references: "not_checked", publication: "not_evaluated", visualReview: "not_performed" }, products: [], outline: [], issues: [{ code: "PREVIEW_JSON_REQUIRED", path: "products", message: "Input must be JSON data", severity: "error" }] }; }
  const inputHash = createHash("sha256").update(serialized).digest("hex");
  const result: ProductDraftPreview = { schemaVersion: "product-draft-preview.v1", inputHash,
    checks: { structure: "failed", references: "not_checked", publication: "not_evaluated", visualReview: "not_performed" }, products: [], outline: [], issues: [] };
  let input: z.output<typeof productDraftInputSchema>;
  try {
    if (Buffer.byteLength(serialized) > PRODUCT_DRAFT_LIMITS.requestBytes) throw new Error("PREVIEW_INPUT_TOO_LARGE");
    input = productDraftInputSchema.parse(raw);
  } catch (error) { result.issues = draftPreviewFailure(error); return result; }
  const idFor = (index: number) => input.products[index].id ?? `preview:product:${index + 1}`;
  if (new Set(input.products.map((_, index) => idFor(index))).size !== input.products.length) {
    result.issues.push({ code: "PREVIEW_PRODUCT_ID_DUPLICATE", path: "products", message: "Each product needs a unique ID", severity: "error" });
    return result;
  }
  const articles = new Map<string, NonNullable<ProductDiktatRenderSource["article"]>>();
  function hasDocument(value: unknown): boolean {
    if (typeof value === "string") { const parsed = inspectInteractiveDocumentsInMarkdown(value); return parsed.invalid || parsed.specs.length > 0; }
    if (Array.isArray(value)) return value.some(hasDocument);
    if (value && typeof value === "object") return Object.values(value).some(hasDocument);
    return false;
  }
  for (const [index, product] of input.products.entries()) {
    if (hasDocument(product) || product.visuals?.some(visual => visual.kind === "interactive_document" || visual.kind === "source_figure")) {
      result.issues.push({ code: "PREVIEW_BINARY_ASSET_REQUIRED", path: `products.${index}.visuals`, message: "This local preview supports typed visuals. Use the admitted-asset verification workflow for source figures and HTML documents.", severity: "error" });
    }
  }
  if (result.issues.length) return result;
  for (const [index, product] of input.products.entries()) {
    if (product.productType !== "article") continue;
    const id = idFor(index);
    try {
      const sections = product.sections.map((section, sectionIndex) => {
        const sectionId = section.id ?? `${id}:section:${sectionIndex + 1}`;
        return { ...section, id: sectionId, slug: section.slug ?? `section-${sectionIndex + 1}`, sectionKind: section.kind, orderIndex: sectionIndex,
          blocks: section.blocks.map((block, blockIndex) => {
            const blockId = block.id ?? `${sectionId}:block:${blockIndex + 1}`;
            const parts = articlePartsSchema.parse(block.parts.map((part, partIndex) => assignIds(part, `${blockId}:part:${partIndex + 1}`)));
            return { ...block, id: blockId, bagianArtikelId: sectionId, orderIndex: blockIndex, parts, content: materializeArticleParts(parts) };
          }),
        };
      });
      const nodeIds = sections.flatMap(section => [section.id, ...section.blocks.flatMap(block => [block.id, ...collectArticlePartIds(block.parts)])]);
      if (new Set(nodeIds).size !== nodeIds.length) throw new Error("PREVIEW_CONTENT_ID_DUPLICATE");
      if (sections.some(section => section.ideaIds.some(ideaId => !product.ideaIds.includes(ideaId)) || section.blocks.some(block => block.ideaIds?.some(ideaId => !section.ideaIds.includes(ideaId))))) throw new Error("PREVIEW_IDEA_REFERENCE_OUTSIDE_PARENT");
      const article = buildPublicArticleReadModel({ id, slug: product.slug ?? `article-${index + 1}`, title: product.title, version: 1, visuals: product.visuals }, sections, sections.flatMap(section => section.blocks));
      const localContentHash = createHash("sha256").update(JSON.stringify(product)).digest("hex");
      articles.set(id, { id, version: 1, generationHash: localContentHash, schemaVersion: "article.v4", sections, ideaLinks: product.ideaIds.map(id => ({ id })), visuals: product.visuals });
      result.products.push({ id, productType: "article", article });
      result.outline.push({ id, title: product.title, productType: "article", ideaIds: product.ideaIds, units: sections.map(section => ({ id: section.id, title: section.title, kind: section.kind, learningObjective: section.learningObjective, ideaIds: section.ideaIds, parts: section.blocks.flatMap(block => flattenArticleParts(block.parts).map(part => ({ id: part.id, kind: part.kind }))) })) });
      if (sections.some(section => section.blocks.some(block => block.formativeCheckPayload || flattenArticleParts(block.parts).some(part => part.kind === "coding_exercise" || part.kind === "code_example" && part.runnable)))) {
        result.issues.push({ code: "PREVIEW_SERVER_INTERACTIONS_NOT_TESTED", path: `products.${index}`, message: "The reader shows questions and static code. Answer grading, coding execution, and saved progress need hosted verification.", severity: "warning" });
      }
    } catch (error) { result.issues.push(...draftPreviewFailure(error, `products.${index}`)); }
  }
  for (const [index, product] of input.products.entries()) {
    if (product.productType !== "diktat") continue;
    const id = idFor(index);
    try {
      const article = product.sourceArticleId ? articles.get(product.sourceArticleId) : undefined;
      if (product.sourceArticleId && !article) throw new Error("PREVIEW_SOURCE_ARTICLE_NOT_IN_INPUT");
      const units = prepareAuthoredDiktatVisuals(authoredDiktatUnitsSchema.parse(product.units.map((unit, unitIndex) => ({ ...unit, id: unit.id ?? `${id}:unit:${unitIndex + 1}`, parts: unit.parts.map((part, partIndex) => assignIds(part, `${id}:unit:${unitIndex + 1}:part:${partIndex + 1}`)) }))), article?.visuals ?? product.visuals ?? []);
      const source: ProductDiktatRenderSource = { article, diktat: { title: product.title, units, contentMarkdown: materializeAuthoredDiktat(units), ideaLinks: product.ideaIds.map(id => ({ id })), visuals: product.visuals,
        ...(article ? { sourceArticleId: article.id, sourceArticleVersion: article.version, sourceArticleHash: article.generationHash } : {}),
      } };
      const failures = validateAuthoredDiktat(article, source.diktat);
      if (failures.length) throw new Error(failures.join(", "));
      result.products.push({ id, productType: "diktat", source });
      result.outline.push({ id, title: product.title, productType: "diktat", ideaIds: product.ideaIds, units: units.map(unit => ({ id: unit.id, ideaIds: unit.ideaIds, parts: flattenArticleParts(unit.parts).map(part => ({ id: part.id, kind: part.kind })) })) });
    } catch (error) { result.issues.push(...draftPreviewFailure(error, `products.${index}`)); }
  }
  result.products.sort((left, right) => input.products.findIndex((_, index) => idFor(index) === left.id) - input.products.findIndex((_, index) => idFor(index) === right.id));
  result.checks.structure = result.issues.some(issue => issue.severity === "error") ? "failed" : "passed";
  return result;
}
