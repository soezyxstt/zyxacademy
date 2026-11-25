import { createHash } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import { z } from "zod";
import {
  computeProductBundleChecksum,
  deterministicProductSerialization,
  parseProductBundle,
  productArticleV3BlockSchema,
  productArticleV3SectionSchema,
  productEntitySchema,
  productIdeaLinkSchema,
  productSourceRefSchema,
  type ProductBundleValidation,
  type ProductDependency,
  type ProductEntity,
  type ProductValidationIssue,
} from "@/lib/bundle/product-validator";
import { sha256Bytes } from "@/lib/bundle/validator";
import { articlePartSchema, articlePartsSchema, collectArticleVisualIds, materializeArticleParts } from "@/lib/materials/article-parts";
import { authoredDiktatUnitsSchema, materializeAuthoredDiktat, prepareAuthoredDiktatVisuals } from "@/lib/materials/diktat-v4";
import { visualSpecSchema } from "@/lib/materials/visual-contract";

export const PRODUCT_DRAFT_LIMITS = { products: 16, requestBytes: 524_288, issues: 40 } as const;
const identifier = z.string().trim().min(1).max(256).regex(/^[^\u0000-\u001f]+$/);
const ids = z.array(identifier).min(1).max(256).refine(value => new Set(value).size === value.length, "Duplicate reference");
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const sourceSelectionSchema = z.object({ sourceId: identifier, excerptIds: ids }).strict();
const sources = z.array(sourceSelectionSchema).min(1).max(256);
const ideaLinkSelectionSchema = productIdeaLinkSchema.omit({ version: true, semanticHash: true }).extend({ id: identifier });

// Only mechanical IDs differ from the canonical part schemas. Their content
// refinements still run, and the complete canonical validator runs after assembly.
const markdown = articlePartSchema.options[0].omit({ id: true }).extend({ id: identifier.optional() });
const canonicalMath = articlePartSchema.options[1];
const math = z.object({ ...canonicalMath.shape,
  id: identifier.optional(),
  relations: canonicalMath.shape.relations.unwrap().element.omit({ id: true }).extend({ id: identifier.optional() }).array().min(1).max(30).optional(),
  symbolDefinitions: canonicalMath.shape.symbolDefinitions.unwrap().element.omit({ id: true }).extend({ id: identifier.optional() }).array().max(50).optional(),
}).strict();
const visual = articlePartSchema.options[2].omit({ id: true }).extend({ id: identifier.optional() });
const leaf = z.discriminatedUnion("kind", [markdown, math, visual]);
const worked = articlePartSchema.options[3].omit({ id: true, steps: true }).extend({
  id: identifier.optional(),
  steps: articlePartSchema.options[3].shape.steps.element.omit({ id: true, parts: true }).extend({
    id: identifier.optional(), parts: z.array(leaf).min(1).max(30),
  }).array().min(1).max(30),
});
const part = z.discriminatedUnion("kind", [markdown, math, visual, worked,
  articlePartSchema.options[4].omit({ id: true }).extend({ id: identifier.optional() }),
  articlePartSchema.options[5].omit({ id: true }).extend({ id: identifier.optional() }),
]);
const printVisual = z.object({ id: identifier.optional(), kind: z.literal("visual_ref"), visualId: identifier, staticMarkdown: z.string().trim().min(1) }).strict();
const printPart = z.discriminatedUnion("kind", [markdown, math, worked, printVisual]);

const authorBlock = productArticleV3BlockSchema.omit({ id: true, orderIndex: true, contentMarkdown: true, parts: true, sourceRefs: true, visualIds: true, ideaIds: true }).extend({
  id: identifier.optional(), parts: z.array(part).min(1).max(100),
  ideaIds: ids.optional(), sourceRefs: sources.optional(),
}).strict();
const authorSection = productArticleV3SectionSchema.omit({ id: true, slug: true, orderIndex: true, sourceRefs: true, blocks: true }).extend({
  id: identifier.optional(), slug: identifier.optional(), sourceRefs: sources.optional(),
  blocks: z.array(authorBlock).min(1).max(100),
}).strict();
const commonInput = {
  id: identifier.optional(), title: z.string().trim().min(1).max(1000),
  ideaIds: ids, sourceRefs: sources,
  // Optional teaching priorities. Identity and revision still come from the server.
  ideaLinks: z.array(ideaLinkSelectionSchema).min(1).max(256).optional(),
  ai: z.object({ provider: identifier, model: identifier, promptVersion: identifier }).strict().optional(),
  visuals: z.array(visualSpecSchema).max(64).optional(),
};
const articleInput = z.object({ ...commonInput, productType: z.literal("article"), slug: identifier.optional(), sections: z.array(authorSection).min(1).max(100) }).strict();
const diktatInput = z.object({ ...commonInput, productType: z.literal("diktat"), sourceArticleId: identifier.optional(),
  units: z.array(z.object({ id: identifier.optional(), ideaIds: ids, sourceElementRefs: z.array(identifier).max(256).optional(), parts: z.array(printPart).min(1).max(100) }).strict()).min(1).max(100),
}).strict();

/** Initial authoring input. Existing publications must use the revision tools. */
export const productDraftInputSchema = z.object({ products: z.array(z.discriminatedUnion("productType", [articleInput, diktatInput])).min(1).max(PRODUCT_DRAFT_LIMITS.products) }).strict();
export type ProductDraftInput = z.input<typeof productDraftInputSchema>;

/** Supplied by the authorized server, never from the author's tool arguments. */
export const productDraftContextSchema = z.object({
  bundleId: identifier, courseId: identifier, chapterId: identifier.optional(), creatorId: identifier,
  createdAt: z.string().datetime({ offset: true }),
  // A scoped lookup may return no matches. Report those as bad author references,
  // not a malformed server context; canonical product references remain required.
  ideas: z.array(z.object({ id: identifier, version: z.number().int().positive(), semanticHash: hashSchema }).strict()).max(256),
  sources: z.array(productSourceRefSchema.extend({ excerptIds: z.array(identifier).max(2048) })).max(256),
  learningSectionIds: z.array(identifier).max(256).optional(),
}).strict();
export type ProductDraftContext = z.input<typeof productDraftContextSchema>;
type ValidBundle = Extract<ProductBundleValidation, { success: true }>["data"];
export type ProductDraftBuildResult =
  | { success: true; bytes: Uint8Array; bundle: ValidBundle }
  | { success: false; issues: readonly ProductValidationIssue[]; issueCount: number };

function contentHash(value: unknown): string {
  return createHash("sha256").update(deterministicProductSerialization(value), "utf8").digest("hex");
}
function generatedId(path: string): string {
  return path.length <= 256 ? path : `draft-node:${contentHash(path)}`;
}
function failed(issues: readonly ProductValidationIssue[]): ProductDraftBuildResult {
  return { success: false, issues: issues.slice(0, PRODUCT_DRAFT_LIMITS.issues), issueCount: issues.length };
}
function zodIssues(error: z.ZodError, prefix: string): ProductValidationIssue[] {
  return error.issues.map(issue => ({ code: "PRODUCT_DRAFT_INPUT_INVALID", path: [prefix, ...issue.path].join("."), message: issue.message }));
}
function assignPartIds(value: unknown, prefix: string): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const result: Record<string, unknown> = { ...(value as Record<string, unknown>), id: (value as { id?: string }).id ?? generatedId(prefix) };
  for (const key of ["steps", "parts", "relations", "symbolDefinitions"] as const) {
    const children = result[key];
    if (Array.isArray(children)) result[key] = children.map((child, index) => assignPartIds(child, `${prefix}:${key}:${index + 1}`));
  }
  return result;
}

/** Pure packaging: does not authorize, stage, render, approve, or publish content. */
export function buildProductDraft(rawInput: unknown, rawContext: ProductDraftContext): ProductDraftBuildResult {
  let requestSize: number;
  try { requestSize = Buffer.byteLength(JSON.stringify(rawInput), "utf8"); }
  catch { return failed([{ code: "PRODUCT_DRAFT_INPUT_INVALID", message: "Input must be JSON data", path: "products" }]); }
  if (requestSize > PRODUCT_DRAFT_LIMITS.requestBytes) return failed([{ code: "PRODUCT_DRAFT_REQUEST_TOO_LARGE", message: "Split the draft into requests within the advertised byte limit", path: "products" }]);
  const inputResult = productDraftInputSchema.safeParse(rawInput);
  const contextResult = productDraftContextSchema.safeParse(rawContext);
  if (!inputResult.success || !contextResult.success) return failed([
    ...(!inputResult.success ? zodIssues(inputResult.error, "input") : []),
    ...(!contextResult.success ? zodIssues(contextResult.error, "context") : []),
  ]);
  const { products: inputs } = inputResult.data;
  const context = contextResult.data;
  const issues: ProductValidationIssue[] = [];
  const ideas = new Map(context.ideas.map(idea => [idea.id, idea]));
  const sourceContext = new Map(context.sources.map(source => [source.sourceId, source]));
  if (ideas.size !== context.ideas.length || sourceContext.size !== context.sources.length) return failed([{ code: "PRODUCT_DRAFT_CONTEXT_AMBIGUOUS", message: "The bound context contains duplicate Idea or source identities", path: "context" }]);

  function bindSources(selections: z.infer<typeof sourceSelectionSchema>[], location: string) {
    if (new Set(selections.map(source => source.sourceId)).size !== selections.length) issues.push({ code: "PRODUCT_DRAFT_SOURCE_DUPLICATE", path: location, message: "Select each source once" });
    return selections.flatMap((selection, index) => {
      const known = sourceContext.get(selection.sourceId);
      if (!known || selection.excerptIds.some(excerpt => !known.excerptIds.includes(excerpt))) {
        issues.push({ code: "PRODUCT_DRAFT_SOURCE_OUT_OF_SCOPE", path: `${location}.${index}`, message: "Use only source and excerpt IDs from the bound authoring context" });
        return [];
      }
      return [{ sourceId: known.sourceId, version: known.version, checksum: known.checksum, excerptIds: selection.excerptIds }];
    });
  }
  function common(product: z.infer<typeof articleInput> | z.infer<typeof diktatInput>, index: number) {
    const sourceRefs = bindSources(product.sourceRefs, `products.${index}.sourceRefs`);
    const priorities = new Map(product.ideaLinks?.map(link => [link.id, link]));
    if (product.ideaLinks) {
      if (priorities.size !== product.ideaLinks.length) issues.push({ code: "PRODUCT_DRAFT_IDEA_LINK_DUPLICATE", path: `products.${index}.ideaLinks`, message: "Supply each Idea priority once" });
      if (priorities.size !== product.ideaIds.length || product.ideaIds.some(id => !priorities.has(id))) issues.push({ code: "PRODUCT_DRAFT_IDEA_LINK_SELECTION_MISMATCH", path: `products.${index}.ideaLinks`, message: "Idea priorities must describe exactly the selected ideaIds" });
    }
    const ideaLinks = product.ideaIds.flatMap((ideaId, ideaIndex) => {
      const known = ideas.get(ideaId);
      if (!known) { issues.push({ code: "PRODUCT_DRAFT_IDEA_OUT_OF_SCOPE", path: `products.${index}.ideaIds.${ideaIndex}`, message: "Use only published Idea IDs from the bound authoring context" }); return []; }
      const priority = priorities.get(ideaId);
      return [{ ...known, weight: priority?.weight ?? 1 / product.ideaIds.length, role: priority?.role ?? "supporting" as const }];
    });
    if (product.visuals?.some(item => item.kind === "interactive_document")) issues.push({ code: "PRODUCT_DRAFT_ASSET_ARCHIVE_REQUIRED", path: `products.${index}.visuals`, message: "Interactive documents require their admitted binary assets; use the existing archive workflow" });
    return {
      id: product.id ?? generatedId(`${context.bundleId}:product:${index + 1}`), courseId: context.courseId, chapterId: context.chapterId,
      version: 1, status: "draft" as const, creatorId: context.creatorId,
      ideaLinks, sourceRefs, sourceHash: contentHash(sourceRefs), generationHash: "0".repeat(64),
      title: product.title, ai: product.ai, visuals: product.visuals,
    };
  }
  const commonValues = inputs.map(common);
  if (new Set(commonValues.map(value => value.id)).size !== commonValues.length) issues.push({ code: "PRODUCT_DRAFT_ID_DUPLICATE", path: "products", message: "Each product must have a unique ID" });
  if (issues.length) return failed(issues);
  const products: ProductEntity[] = [];
  function admit(value: unknown, location: string): ProductEntity | undefined {
    const parsed = productEntitySchema.safeParse(value);
    if (!parsed.success) { issues.push(...zodIssues(parsed.error, location)); return; }
    const { generationHash: _hash, ...content } = parsed.data;
    return { ...parsed.data, generationHash: contentHash(content) };
  }

  // Articles are resolved first so a Diktat can refer to one in any input order.
  for (const [index, product] of inputs.entries()) {
    if (product.productType !== "article") continue;
    const base = commonValues[index];
    const sections = product.sections.map((section, sectionIndex) => {
      const sectionId = section.id ?? generatedId(`${base.id}:section:${sectionIndex + 1}`);
      const sectionSources = section.sourceRefs ?? product.sourceRefs;
      if (section.learningSectionId && context.learningSectionIds && !context.learningSectionIds.includes(section.learningSectionId)) issues.push({ code: "PRODUCT_DRAFT_LEARNING_SECTION_OUT_OF_SCOPE", path: `products.${index}.sections.${sectionIndex}.learningSectionId`, message: "Use a published learning section from the bound context" });
      return { ...section, id: sectionId, slug: section.slug ?? `section-${sectionIndex + 1}`, orderIndex: sectionIndex,
        sourceRefs: bindSources(sectionSources, `products.${index}.sections.${sectionIndex}.sourceRefs`),
        blocks: section.blocks.map((block, blockIndex) => {
          const blockId = block.id ?? generatedId(`${sectionId}:block:${blockIndex + 1}`);
          const parts = articlePartsSchema.safeParse(block.parts.map((value, partIndex) => assignPartIds(value, `${blockId}:part:${partIndex + 1}`)));
          if (!parts.success) { issues.push(...zodIssues(parts.error, `products.${index}.sections.${sectionIndex}.blocks.${blockIndex}.parts`)); return block; }
          return { ...block, id: blockId, orderIndex: blockIndex, ideaIds: block.ideaIds ?? section.ideaIds,
            sourceRefs: bindSources(block.sourceRefs ?? sectionSources, `products.${index}.sections.${sectionIndex}.blocks.${blockIndex}.sourceRefs`),
            parts: parts.data, contentMarkdown: materializeArticleParts(parts.data), visualIds: collectArticleVisualIds(parts.data),
          };
        }),
      };
    });
    const value = admit({ ...base, productType: "article", schemaVersion: "article.v4", slug: product.slug ?? `article-${contentHash(base.id).slice(0,16)}`, sections, blocks: [] }, `products.${index}`);
    if (value) products.push(value);
  }
  for (const [index, product] of inputs.entries()) {
    if (product.productType !== "diktat") continue;
    const base = commonValues[index];
    const article = product.sourceArticleId ? products.find(value => value.id === product.sourceArticleId && value.productType === "article") : undefined;
    if (product.sourceArticleId && !article) { issues.push({ code: "PRODUCT_DRAFT_ARTICLE_NOT_IN_REQUEST", path: `products.${index}.sourceArticleId`, message: "Derived Diktat must refer to an Article in this request; use the existing archive workflow for external lineage" }); continue; }
    const unitResult = authoredDiktatUnitsSchema.safeParse(product.units.map((unit, unitIndex) => ({ ...unit,
      id: unit.id ?? generatedId(`${base.id}:unit:${unitIndex + 1}`),
      parts: unit.parts.map((value, partIndex) => assignPartIds(value, `${base.id}:unit:${unitIndex + 1}:part:${partIndex + 1}`)),
    })));
    if (!unitResult.success) { issues.push(...zodIssues(unitResult.error, `products.${index}.units`)); continue; }
    let units = unitResult.data;
    try { units = prepareAuthoredDiktatVisuals(units, article?.productType === "article" ? article.visuals ?? [] : product.visuals ?? []); }
    catch (error) { issues.push({ code: "PRODUCT_DRAFT_VISUAL_INVALID", path: `products.${index}.units`, message: error instanceof Error ? error.message : "Diktat visual cannot be resolved" }); continue; }
    const value = admit({ ...base, productType: "diktat", schemaVersion: "diktat.v4", units, contentMarkdown: materializeAuthoredDiktat(units),
      ...(article ? { sourceArticleId: article.id, sourceArticleVersion: article.version, sourceArticleHash: article.generationHash } : {}),
    }, `products.${index}`);
    if (value) products.push(value);
  }
  if (issues.length) return failed(issues);
  const order = new Map(commonValues.map((value, index) => [value.id, index]));
  products.sort((left, right) => order.get(left.id)! - order.get(right.id)!);
  const dependencies: ProductDependency[] = [];
  for (const product of products) {
    const upstream = [
      ...product.ideaLinks.map(link => ({ type: "idea" as const, id: link.id, version: link.version, hash: link.semanticHash })),
      ...product.sourceRefs.map(source => ({ type: "source_material" as const, id: source.sourceId, version: source.version, hash: source.checksum })),
      ...(product.productType === "diktat" && product.sourceArticleId ? [{ type: "product" as const, id: product.sourceArticleId, version: product.sourceArticleVersion!, hash: product.sourceArticleHash! }] : []),
    ];
    for (const value of upstream) dependencies.push({ id: `dependency:${contentHash([product.id, value.type, value.id]).slice(0,32)}`,
      upstreamEntityType: value.type, upstreamEntityId: value.id, upstreamVersion: value.version, upstreamHash: value.hash,
      downstreamEntityType: product.productType, downstreamEntityId: product.id, downstreamVersion: product.version, downstreamHash: product.generationHash, freshness: "UP_TO_DATE",
    });
  }
  const encode = (value: unknown) => strToU8(`${deterministicProductSerialization(value)}\n`);
  const files = new Map([ ["entities/products.json", encode(products)], ["entities/dependencies.json", encode(dependencies)] ]);
  const manifestBase = { bundleId: context.bundleId, bundleType: "product" as const, schemaVersion: "product-bundle.v4" as const,
    courseId: context.courseId, creatorId: context.creatorId, createdAt: context.createdAt, conflicts: [],
    entityFiles: [
      { path: "entities/products.json", entityType: "products" as const, checksum: sha256Bytes(files.get("entities/products.json")!), stableIds: products.map(product => product.id) },
      { path: "entities/dependencies.json", entityType: "dependencies" as const, checksum: sha256Bytes(files.get("entities/dependencies.json")!), stableIds: dependencies.map(dependency => dependency.id) },
    ],
  };
  files.set("manifest.json", encode({ ...manifestBase, bundleChecksum: computeProductBundleChecksum(manifestBase, files) }));
  const validation = parseProductBundle(files);
  if (!validation.success) return failed(validation.issues);
  return { success: true, bytes: zipSync(Object.fromEntries(files), { level: 6, mtime: new Date("2000-01-01T00:00:00.000Z") }), bundle: validation.data };
}
