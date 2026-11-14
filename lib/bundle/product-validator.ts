import { articlePartsSchema, collectArticleVisualIds, materializeArticleParts, validateArticlePartReferences } from "@/lib/materials/article-parts";
import { authoredDiktatUnitsSchema, materializeAuthoredDiktat, prepareAuthoredDiktatVisuals, validateAuthoredDiktat } from "@/lib/materials/diktat-v4";
import { createHash } from "node:crypto";
import { z } from "zod";
import { BundleValidationError, parseSchema, parseStrictJson, sha256Bytes } from "@/lib/bundle/validator";
import { readSecureZip, type SecureZipArchive } from "@/lib/bundle/zip-reader";
import { compileArticleProduct } from "@/lib/materials/compiler";
import {
  formativeCheckPayloadSchema,
  sectionPedagogyMetadataSchema,
  validateSectionPedagogyReferences,
  workedExamplePayloadSchema,
} from "@/lib/materials/pedagogy-contract";
import { visualSpecSchema } from "@/lib/materials/visual-contract";
import { solutionCollectionSchema } from "@/lib/materials/solution-collection";
import { inspectPayloadSecurity } from "@/lib/materials/visual-contract";
import { parseInteractiveDocumentsInMarkdown } from "@/lib/materials/interactive-document-markdown";
import type { InteractiveDocumentSpec } from "@/lib/materials/interactive-document";

export const productBundleEntityTypeSchema = z.enum(["products", "dependencies"]);
export type ProductBundleEntityType = z.infer<typeof productBundleEntityTypeSchema>;

const id = z.string().min(1);
const hash = z.string().regex(/^[a-f0-9]{64}$/i);
const positive = z.number().int().positive();
const timestamp = z.string().datetime({ offset: true });
const questionRelationTypeSchema = z.enum(["required", "prerequisite", "related"]);

export const productIdeaRelationSchema = z.object({
  ideaId: id,
  relationType: questionRelationTypeSchema,
  rationale: z.string().trim().min(1).optional(),
}).strict();

const itbDifficultyAlignmentSchema = z.enum(["similar", "easier", "harder"]);
const itbStyleAlignmentSchema = z.enum(["similar", "adapted"]);

export const productItbCurationSchema = z.object({
  referenceId: id,
  dimensions: z.object({
    difficulty: itbDifficultyAlignmentSchema,
    format: itbStyleAlignmentSchema,
    terminology: itbStyleAlignmentSchema,
    reasoningPattern: itbStyleAlignmentSchema,
  }).strict(),
  curatorNote: z.string().trim().min(1),
}).strict();

export const productItbSourceSchema = z.object({
  referenceId: id,
  eventName: z.string().trim().min(1),
}).strict();

export const productQuestionOptionSchema = z.object({
  id,
  text: z.string().trim().min(1),
  isCorrect: z.boolean(),
}).strict();

export const productIdeaLinkSchema = z.object({ id: id, version: positive, semanticHash: hash, weight: z.number().finite().positive().max(1), role: z.enum(["primary", "supporting", "required"]).default("supporting") }).strict();
export const productSourceRefSchema = z.object({ sourceId: id, version: positive, checksum: hash, excerptIds: z.array(id).min(1) }).strict();

const commonProduct = z.object({
  id,
  productType: z.enum(["article", "diktat", "question", "solution", "flashcard_set", "flashcard", "assessment_blueprint", "solution_collection"]),
  courseId: id,
  chapterId: id.optional(),
  version: positive,
  status: z.enum(["draft", "published", "withdrawn"]),
  ideaLinks: z.array(productIdeaLinkSchema).min(1),
  sourceRefs: z.array(productSourceRefSchema).min(1),
  schemaVersion: id,
  sourceHash: hash,
  generationHash: hash,
  creatorId: id,
  curatorId: id.optional(),
  ai: z.object({ provider: id, model: id, promptVersion: id }).strict().optional(),
});

export const productArticleV2BlockSchema = z.object({
  id,
  blockType: id,
  orderIndex: z.number().int().nonnegative(),
  content: z.string().min(1),
}).strict();
export type ProductArticleV2Block = z.infer<typeof productArticleV2BlockSchema>;

export const productArticleV3BlockSchema = z.object({
  id,
  blockType: id,
  title: z.string().min(1).optional(),
  orderIndex: z.number().int().nonnegative(),
  contentMarkdown: z.string().default(""),
  parts: articlePartsSchema.optional(),
  ideaIds: z.array(id).min(1),
  sourceRefs: z.array(productSourceRefSchema).min(1),
  visualIds: z.array(id).max(8).optional(),
  workedExamplePayload: workedExamplePayloadSchema.optional(),
  formativeCheckPayload: formativeCheckPayloadSchema.optional(),
}).strict();
export type ProductArticleV3Block = z.infer<typeof productArticleV3BlockSchema>;

export const productArticleV3SectionSchema = z.object({
  id,
  kind: z.enum(["overview", "topic", "summary"]),
  learningSectionId: id.optional(),
  parentSectionId: id.optional(),
  title: z.string().min(1),
  slug: id,
  orderIndex: z.number().int().nonnegative(),
  learningObjective: z.string().min(1),
  ideaIds: z.array(id).min(1),
  sourceRefs: z.array(productSourceRefSchema).min(1),
  blocks: z.array(productArticleV3BlockSchema).min(1),
  pedagogy: sectionPedagogyMetadataSchema.optional(),
}).strict();
export type ProductArticleV3Section = z.infer<typeof productArticleV3SectionSchema>;

export const productEntitySchema = z.discriminatedUnion("productType", [
  commonProduct.extend({
    productType: z.literal("article"),
    slug: id,
    title: z.string().min(1),
    blocks: z.array(productArticleV2BlockSchema).default([]),
    sections: z.array(productArticleV3SectionSchema).default([]),
    visuals: z.array(visualSpecSchema).default([]).optional(),
  }),
  commonProduct.extend({ productType: z.literal("diktat"), title: z.string().min(1), contentMarkdown: z.string().min(1), sourceArticleId: id, sourceArticleVersion: positive, sourceArticleHash: hash, units: authoredDiktatUnitsSchema.optional() }),
  commonProduct.extend({ productType: z.literal("question"), questionType: z.enum(["multiple_choice", "multiple_choices", "short_answer", "essay"]), prompt: z.string().min(1), options: z.array(productQuestionOptionSchema), difficulty: z.enum(["easy", "medium", "hard"]), cognitiveLevel: z.enum(["remember", "understand", "apply", "analyze", "evaluate", "create"]), reasoningPattern: id, relationTypes: z.array(questionRelationTypeSchema).default([]), ideaRelations: z.array(productIdeaRelationSchema).default([]), itbSource: productItbSourceSchema, itbCuration: z.array(productItbCurationSchema).min(1) }),
  commonProduct.extend({ productType: z.literal("solution"), questionId: id, content: z.string().min(1) }),
  commonProduct.extend({ productType: z.literal("flashcard_set"), title: z.string().min(1), cards: z.array(id).min(1) }),
  commonProduct.extend({ productType: z.literal("flashcard"), setId: z.string().min(1).optional(), front: z.string().min(1), back: z.string().min(1), explanation: z.string().optional(), atomic: z.literal(true) }),
  commonProduct.extend({ productType: z.literal("assessment_blueprint"), title: z.string().min(1), assessmentType: z.enum(["quiz", "tryout"]), chapterIds: z.array(id), questionIds: z.array(id).min(1) }),
  commonProduct.extend({ productType: z.literal("solution_collection"), schemaVersion: z.literal("solution_collection.v1"), chapterId: id, title: z.string().trim().min(1), collection: solutionCollectionSchema }).strict(),
]);
export type ProductEntity = z.infer<typeof productEntitySchema>;

export const productDependencySchema = z.object({
  id,
  upstreamEntityType: z.enum(["idea", "source_material", "source_chunk", "product"]),
  upstreamEntityId: id,
  upstreamVersion: positive,
  upstreamHash: hash,
  downstreamEntityType: z.enum(["article", "diktat", "question", "solution", "flashcard_set", "flashcard", "assessment_blueprint", "solution_collection"]),
  downstreamEntityId: id,
  downstreamVersion: positive,
  downstreamHash: hash,
  freshness: z.enum(["UP_TO_DATE", "NEEDS_REVIEW", "STALE"]),
}).strict();
export type ProductDependency = z.infer<typeof productDependencySchema>;

export function findInvalidProductDependency(dependencies: readonly ProductDependency[], products: readonly ProductEntity[]): { dependency: ProductDependency; code: string } | null {
  const byRevision = new Map(products.map(product => [`${product.id}:${product.version}`, product]));
  const localIds = new Set(products.map(product => product.id));
  for (const dependency of dependencies) {
    const downstream = byRevision.get(`${dependency.downstreamEntityId}:${dependency.downstreamVersion}`);
    if (!downstream || downstream.productType !== dependency.downstreamEntityType || downstream.version !== dependency.downstreamVersion || downstream.generationHash !== dependency.downstreamHash) {
      return { dependency, code: "PRODUCT_DEPENDENCY_TARGET_MISMATCH" };
    }
    if (dependency.upstreamEntityType === "product") {
      const upstream = byRevision.get(`${dependency.upstreamEntityId}:${dependency.upstreamVersion}`);
      if (localIds.has(dependency.upstreamEntityId) && (!upstream || upstream.generationHash !== dependency.upstreamHash || (downstream.productType === "diktat" && downstream.sourceArticleId === upstream.id && upstream.productType !== "article"))) {
        return { dependency, code: "PRODUCT_DEPENDENCY_LOCAL_UPSTREAM_MISMATCH" };
      }
    }
  }
  return null;
}

export const productBundleManifestSchema = z.object({
  bundleId: id,
  bundleType: z.literal("product"),
  schemaVersion: z.enum(["product-bundle.v2", "product-bundle.v3", "product-bundle.v4", "product-bundle.v5"]),
  courseId: id,
  entityFiles: z.array(z.object({ path: id, entityType: productBundleEntityTypeSchema, checksum: hash, stableIds: z.array(id) }).strict()).length(2),
  creatorId: id,
  curatorId: id.optional(),
  createdAt: timestamp,
  bundleChecksum: hash,
  visualAssets: z.array(z.object({ path: id, sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: positive }).strict()).max(16).optional(),
  conflicts: z.array(z.object({ id, entityType: id, stableId: id, reason: id }).strict()).default([]),
}).strict();
export type ProductBundleManifest = z.infer<typeof productBundleManifestSchema>;

export type ProductValidationIssue = { code: string; message: string; path?: string };
export type ProductBundleFiles = ReadonlyMap<string, Uint8Array>;
export type ProductBundleValidation = { success: true; data: { manifest: ProductBundleManifest; products: readonly ProductEntity[]; dependencies: readonly ProductDependency[]; files: ProductBundleFiles; checksum: string; publicationBlocked: boolean; issues: readonly ProductValidationIssue[] } } | { success: false; issues: readonly ProductValidationIssue[] };

export function hasProductBundleDependencyBlock(bundle: Pick<Extract<ProductBundleValidation, { success: true }>["data"], "manifest" | "dependencies" | "publicationBlocked">): boolean {
  return bundle.publicationBlocked && (bundle.manifest.schemaVersion !== "product-bundle.v4" || bundle.dependencies.some((dependency) => dependency.freshness !== "UP_TO_DATE"));
}

class ProductValidationError extends Error {
  readonly issue: ProductValidationIssue;

  constructor(value: ProductValidationIssue) {
    super(value.message);
    this.issue = value;
  }
}

function issue(code: string, message: string, path?: string): ProductValidationIssue {
  return { code, message, path };
}

function containsInteractiveDocument(value: unknown): boolean {
  if (typeof value === "string") return value.replace(/\\u([a-f0-9]{4})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16))).includes("interactive_document");
  if (Array.isArray(value)) return value.some(containsInteractiveDocument);
  return value !== null && typeof value === "object" && Object.values(value).some(containsInteractiveDocument);
}

export function productInteractiveDocuments(products: readonly ProductEntity[]): InteractiveDocumentSpec[] {
  return products.flatMap(product => product.productType === "article" ? [
    ...(product.visuals ?? []).filter((visual): visual is InteractiveDocumentSpec => visual.kind === "interactive_document"),
    ...product.sections.flatMap(section => section.blocks.flatMap(block => {
      if (!block.formativeCheckPayload) return [];
      return [
        ...(block.parts ?? []).flatMap(part => part.kind === "markdown" ? parseInteractiveDocumentsInMarkdown(part.markdown) : []),
        ...(block.formativeCheckPayload.options ?? []).flatMap(option => parseInteractiveDocumentsInMarkdown(option.text)),
        ...parseInteractiveDocumentsInMarkdown(block.formativeCheckPayload.answer),
        ...parseInteractiveDocumentsInMarkdown(block.formativeCheckPayload.explanation),
      ];
    })),
  ] : []);
}

export function deterministicProductSerialization(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(deterministicProductSerialization).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${deterministicProductSerialization(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function computeProductBundleChecksum(manifest: Omit<ProductBundleManifest, "bundleChecksum"> | ProductBundleManifest, files: ProductBundleFiles): string {
  const manifestWithoutChecksum = { ...manifest, bundleChecksum: undefined };
  const fileChecksums = [...files.entries()].filter(([path]) => path !== "manifest.json").sort(([left], [right]) => left.localeCompare(right)).map(([path, bytes]) => [path, sha256Bytes(bytes)]);
  return createHash("sha256").update(deterministicProductSerialization({ manifest: manifestWithoutChecksum, files: fileChecksums }), "utf8").digest("hex");
}

export function parseProductBundle(input: SecureZipArchive | ProductBundleFiles): ProductBundleValidation {
  try {
    const files = "files" in input && input.files instanceof Map ? input.files : input instanceof Map ? input : new Map<string, Uint8Array>();
    const manifestBytes = files.get("manifest.json");
    if (!manifestBytes) return { success: false, issues: [issue("PRODUCT_MANIFEST_MISSING", "manifest.json is required", "manifest.json")] };
    const manifest = parseSchema(productBundleManifestSchema, parseStrictJson(manifestBytes, "manifest.json"), "manifest.json");
    if (manifest.conflicts.length > 0) return { success: false, issues: [issue("PRODUCT_UNRESOLVED_CONFLICT", "bundle has unresolved conflicts", "manifest.json")] };
    const declared = new Map(manifest.entityFiles.map((file) => [file.entityType, file]));
    const readEntities = <T>(type: ProductBundleEntityType, schema: z.ZodType<T>): T[] => {
      const file = declared.get(type);
      if (!file) throw new ProductValidationError(issue("PRODUCT_ENTITY_FILE_MISSING", `${type} file is missing`));
      const content = files.get(file.path);
      if (!content) throw new ProductValidationError(issue("PRODUCT_ENTITY_FILE_MISSING", `${file.path} is missing`, file.path));
      if (sha256Bytes(content) !== file.checksum) throw new ProductValidationError(issue("PRODUCT_ENTITY_CHECKSUM_MISMATCH", `${file.path} checksum does not match`, file.path));
      const parsed = parseStrictJson<unknown>(content, file.path);
      if (!Array.isArray(parsed)) throw new ProductValidationError(issue("PRODUCT_ENTITY_INVALID", `${file.path} must contain an array`, file.path));
      const values = parsed.map((value, index) => parseSchema(schema, value, `${file.path}[${index}]`));
      const ids = values.map((value) => String((value as { id: string }).id));
      if (new Set(ids).size !== ids.length || JSON.stringify([...ids].sort()) !== JSON.stringify([...file.stableIds].sort())) throw new ProductValidationError(issue("PRODUCT_STABLE_ID_MISMATCH", `${file.path} stable IDs do not match`, file.path));
      return values;
    };
    const products = readEntities("products", productEntitySchema);
    const dependencies = readEntities("dependencies", productDependencySchema);
    const isV5 = manifest.schemaVersion === "product-bundle.v5";
    if (isV5 ? products.length !== 1 || products[0]?.productType !== "solution_collection" : products.some(product => product.productType === "solution_collection") || dependencies.some(dependency => dependency.downstreamEntityType === "solution_collection")) return { success: false, issues: [issue("PRODUCT_V5_PROFILE_MISMATCH", "V5 contains exactly one standalone solution collection; earlier profiles cannot contain it")] };
    if (manifest.schemaVersion === "product-bundle.v4" && (products.filter(product => product.productType === "article").length !== 1 || products.filter(product => product.productType === "diktat").length > 1)) return { success: false, issues: [issue("PRODUCT_V4_SINGLE_ARTICLE_REQUIRED", "V4 bundles contain one chapter Article and at most one traced Diktat")] };
    const productKeys = new Set<string>();
    const bundleSectionIds = new Set<string>();
    const bundleV3BlockIds = new Set<string>();
    for (const product of products) {
      if ((product.productType === "question" || product.productType === "solution") && containsInteractiveDocument(product)) return { success: false, issues: [issue("PRODUCT_QUESTION_INTERACTIVE_DOCUMENT_UNBOUND", "Product Bundle questions cannot bind interactive document assets")] };
      if (
        manifest.schemaVersion !== "product-bundle.v2"
        && (product.productType === "question" || product.productType === "solution" || product.productType === "assessment_blueprint")
      ) {
        return {
          success: false,
          issues: [issue("PRODUCT_BUNDLE_QUESTION_FORBIDDEN", `product ${product.id} cannot enter a Product Bundle V3; questions and assessment solutions belong to assessment workflows`, declared.get("products")?.path)],
        };
      }
      const key = `${product.id}:${product.version}`;
      if (productKeys.has(key)) return { success: false, issues: [issue("PRODUCT_DUPLICATE_VERSION", `duplicate product version ${key}`)] };
      productKeys.add(key);
      if (product.courseId !== manifest.courseId) return { success: false, issues: [issue("PRODUCT_COURSE_MISMATCH", `product ${product.id} belongs to another course`)] };
      if (product.status === "withdrawn") return { success: false, issues: [issue("PRODUCT_STATUS_WITHDRAWN", `product ${product.id} cannot enter a draft bundle after withdrawal`)] };
      if (product.creatorId !== manifest.creatorId) return { success: false, issues: [issue("PRODUCT_CREATOR_MISMATCH", `product ${product.id} creator must match manifest creatorId`)] };
      if (manifest.curatorId && product.curatorId !== manifest.curatorId) return { success: false, issues: [issue("PRODUCT_CURATOR_MISMATCH", `product ${product.id} curator must match manifest curatorId`)] };
      if (new Set(product.ideaLinks.map((link) => link.id)).size !== product.ideaLinks.length) return { success: false, issues: [issue("PRODUCT_IDEA_LINK_INVALID", `product ${product.id} has duplicate Idea links`)] };
      const weightSum = product.ideaLinks.reduce((sum, link) => sum + link.weight, 0);
      if (Math.abs(weightSum - 1) > 0.000001) return { success: false, issues: [issue("PRODUCT_IDEA_WEIGHT_SUM_INVALID", `product ${product.id} Idea-link weights must sum to 1`)] };
      if (product.productType === "solution_collection") {
        const collection = product.collection;
        if (collection.id !== product.id || collection.title !== product.title || collection.course.id !== product.courseId || collection.chapter.id !== product.chapterId) return { success: false, issues: [issue("PRODUCT_V5_ENVELOPE_MISMATCH", "Collection identity, title, course and chapter must match the Product envelope")] };
        if (!collection.items.length) return { success: false, issues: [issue("PRODUCT_V5_ITEMS_REQUIRED", "A collection must contain at least one item")] };
        if (new Set(product.sourceRefs.map(ref => ref.sourceId)).size !== product.sourceRefs.length) return { success: false, issues: [issue("PRODUCT_V5_SOURCE_DUPLICATE", "Source references must be unique")] };
        if (collection.items.some(item => item.visuals.some(visual => visual.kind === "source_figure"))) return { success: false, issues: [issue("PRODUCT_V5_SOURCE_FIGURE_UNSUPPORTED", "Source figures require a dedicated authorized delivery path")] };
        if (!inspectPayloadSecurity(collection).safe || /data:|!\[[^\]]*\]\(https?:|<script|<iframe/i.test(JSON.stringify(collection))) return { success: false, issues: [issue("PRODUCT_V5_CONTENT_UNSAFE", "Collection contains unsupported executable or external media content")] };
        const { generationHash: _generationHash, ...content } = product;
        const actualHash = createHash("sha256").update(deterministicProductSerialization(content), "utf8").digest("hex");
        if (actualHash !== product.generationHash) return { success: false, issues: [issue("PRODUCT_V5_GENERATION_HASH_MISMATCH", "Collection generation hash does not match its envelope and content")] };
        const edges = dependencies.filter(dep => dep.downstreamEntityType === product.productType && dep.downstreamEntityId === product.id && dep.downstreamVersion === product.version && dep.downstreamHash === product.generationHash);
        if (edges.length !== dependencies.length || edges.some(dep => !(dep.upstreamEntityType === "idea" && product.ideaLinks.some(link => link.id === dep.upstreamEntityId && link.version === dep.upstreamVersion && link.semanticHash === dep.upstreamHash)) && !(dep.upstreamEntityType === "source_material" && product.sourceRefs.some(ref => ref.sourceId === dep.upstreamEntityId && ref.version === dep.upstreamVersion && ref.checksum === dep.upstreamHash)))) return { success: false, issues: [issue("PRODUCT_V5_DEPENDENCY_INVALID", "Every dependency must target this exact collection revision and a declared Idea or source")] };
        const matches = (type: string, entityId: string, version: number, entityHash: string) => edges.some(dep => dep.upstreamEntityType === type && dep.upstreamEntityId === entityId && dep.upstreamVersion === version && dep.upstreamHash === entityHash);
        if (product.ideaLinks.some(link => !matches("idea", link.id, link.version, link.semanticHash)) || product.sourceRefs.some(ref => !matches("source_material", ref.sourceId, ref.version, ref.checksum))) return { success: false, issues: [issue("PRODUCT_V5_DEPENDENCY_MISSING", "Every linked Idea and source must have a locked dependency")] };
      }
      if (product.productType === "article") {
        const isV4 = manifest.schemaVersion === "product-bundle.v4";
        if (product.blocks.some(block => parseInteractiveDocumentsInMarkdown(block.content).length || block.content.includes("<!--__ZYX_V4_"))) return { success: false, issues: [issue("PRODUCT_EMBEDDED_INTERACTIVE_DOCUMENT_UNBOUND", "Legacy Article blocks cannot bind interactive documents")] };
        if (JSON.stringify(product.sections).includes("<!--__ZYX_V4_")) return { success: false, issues: [issue("PRODUCT_EMBEDDED_INTERACTIVE_DOCUMENT_UNBOUND", "Embedded Article payloads are not allowed")] };
        const visible: InteractiveDocumentSpec[] = (product.visuals ?? []).filter((visual): visual is InteractiveDocumentSpec => visual.kind === "interactive_document");
        const hidden: InteractiveDocumentSpec[] = [];
        for (const section of product.sections) {
          const { blocks, ...sectionMetadata } = section;
          if (containsInteractiveDocument(sectionMetadata)) return { success: false, issues: [issue("PRODUCT_EMBEDDED_INTERACTIVE_DOCUMENT_UNBOUND", "Unbound Article document")] };
          for (const block of blocks) {
            const { parts, contentMarkdown, formativeCheckPayload, ...metadata } = block;
            const formative = isV4 && !!formativeCheckPayload && (block.blockType === "retrieval_prompt" || block.blockType === "retrieval_close");
            if (containsInteractiveDocument(metadata) || (!formative && containsInteractiveDocument({ parts, contentMarkdown, formativeCheckPayload }))) return { success: false, issues: [issue("PRODUCT_EMBEDDED_INTERACTIVE_DOCUMENT_UNBOUND", "Unbound Article document")] };
            if (!formative || !formativeCheckPayload) continue;
            const { options, answer, explanation, ...payloadMetadata } = formativeCheckPayload;
            if (containsInteractiveDocument(payloadMetadata) || (options ?? []).some(({ text: _text, ...option }) => containsInteractiveDocument(option)) || (parts ?? []).some(part => part.kind !== "markdown" && containsInteractiveDocument(part))) return { success: false, issues: [issue("PRODUCT_EMBEDDED_INTERACTIVE_DOCUMENT_UNBOUND", "Unbound formative document")] };
            const prompt = (parts ?? []).flatMap(part => part.kind === "markdown" ? [part.markdown] : []);
            const fields = [...prompt, ...(options ?? []).map(option => option.text), answer, explanation];
            if (fields.some(text => text.includes("<!--__ZYX_V4_"))) return { success: false, issues: [issue("PRODUCT_EMBEDDED_INTERACTIVE_DOCUMENT_UNBOUND", "Embedded Article payloads are not allowed in formative fields")] };
            visible.push(...prompt.flatMap(parseInteractiveDocumentsInMarkdown), ...(options ?? []).flatMap(option => parseInteractiveDocumentsInMarkdown(option.text)));
            hidden.push(...parseInteractiveDocumentsInMarkdown(answer), ...parseInteractiveDocumentsInMarkdown(explanation));
          }
        }
        const visibleHashes = new Set(visible.flatMap(spec => [spec.documentSha256, spec.printSha256]));
        if (hidden.some(spec => visibleHashes.has(spec.documentSha256) || visibleHashes.has(spec.printSha256))) return { success: false, issues: [issue("QUESTION_VISUAL_DISCLOSURE", "Visible and hidden formative documents cannot share assets")] };
        if (!isV4 && product.visuals?.some(visual => visual.kind === "geometry_2d" || visual.kind === "source_figure" || visual.kind === "interactive_scene" || visual.kind === "interactive_document")) return { success: false, issues: [issue("PRODUCT_VISUAL_REQUIRES_V4", "This visual requires an explicit V4 bundle")] };
        if (isV4 && (product.blocks.length > 0 || !product.sections.length)) return { success: false, issues: [issue("PRODUCT_ARTICLE_V4_SHAPE_INVALID", "V4 requires sections and ordered parts")] };
        if (isV4 !== (product.schemaVersion === "article.v4")) return { success: false, issues: [issue("PRODUCT_ARTICLE_VERSION_MISMATCH", "V4 Articles require the V4 manifest and article.v4 schema")] };
        const articleParts = product.sections.flatMap((section) => section.blocks.flatMap((block) => block.parts ?? []));
        const partErrors = isV4 ? validateArticlePartReferences(articleParts, (product.visuals ?? []).map(visual => visual.id)) : [];
        if (partErrors.length) return { success: false, issues: partErrors.map(code => issue(code, "V4 Article references must resolve in authoring order")) };
        for (const block of product.sections.flatMap((section) => section.blocks)) {
          if (isV4 && !block.parts) return { success: false, issues: [issue("PRODUCT_ARTICLE_PARTS_REQUIRED", `block ${block.id} requires ordered parts`)] };
          if (!isV4 && !block.contentMarkdown.trim()) return { success: false, issues: [issue("PRODUCT_BLOCK_CONTENT_REQUIRED", `block ${block.id} requires contentMarkdown`)] };
          if (!isV4 && block.parts) return { success: false, issues: [issue("PRODUCT_ARTICLE_PARTS_VERSION_INVALID", "Ordered parts require V4")] };
          if (block.parts) {
            const derived = materializeArticleParts(block.parts);
            if (block.contentMarkdown && block.contentMarkdown !== derived) return { success: false, issues: [issue("PRODUCT_ARTICLE_PROJECTION_MISMATCH", `block ${block.id} contentMarkdown differs from parts`)] };
            block.contentMarkdown = derived;
            if (block.workedExamplePayload && block.parts.some(part => part.kind === "worked_example")) return { success: false, issues: [issue("PRODUCT_WORKED_EXAMPLE_CONFLICT", "V4 worked parts cannot also supply a legacy workedExamplePayload")] };
            const refs = collectArticleVisualIds(block.parts);
            if (refs.some((ref) => !product.visuals?.some((visual) => visual.id === ref))) return { success: false, issues: [issue("PRODUCT_BLOCK_VISUAL_REFERENCE_INVALID", `block ${block.id} references an unknown visual`)] };
            block.visualIds = [...new Set(refs)];
          }
        }
        const isV2 = product.blocks.length > 0 && product.sections.length === 0;
        const isV3 = product.blocks.length === 0 && product.sections.length > 0;
        if (!isV2 && !isV3) {
          return {
            success: false,
            issues: [
              issue(
                "PRODUCT_ARTICLE_SHAPE_INVALID",
                `article ${product.id} must have nonempty blocks and empty sections (V2) or empty blocks and nonempty sections (V3)`,
              ),
            ],
          };
        }

        if (isV2) {
          if (new Set(product.blocks.map((block) => block.orderIndex)).size !== product.blocks.length) {
            return { success: false, issues: [issue("PRODUCT_BLOCK_INVALID", `article ${product.id} has duplicate block order`)] };
          }
          if (new Set(product.blocks.map((block) => block.id)).size !== product.blocks.length) {
            return { success: false, issues: [issue("PRODUCT_BLOCK_INVALID", `article ${product.id} has duplicate block IDs`)] };
          }
        }

        if (isV3) {
          const sectionIds = product.sections.map((s) => s.id);
          if (new Set(sectionIds).size !== sectionIds.length) {
            return { success: false, issues: [issue("PRODUCT_SECTION_INVALID", `article ${product.id} contains duplicate section IDs`)] };
          }
          if (sectionIds.some((sectionId) => bundleSectionIds.has(sectionId))) {
            return { success: false, issues: [issue("PRODUCT_SECTION_INVALID", `article ${product.id} reuses a section ID from another Article`)] };
          }
          sectionIds.forEach((sectionId) => bundleSectionIds.add(sectionId));
          const v3BlockIds = product.sections.flatMap((section) => section.blocks.map((block) => block.id));
          if (new Set(v3BlockIds).size !== v3BlockIds.length || v3BlockIds.some((blockId) => bundleV3BlockIds.has(blockId))) {
            return { success: false, issues: [issue("PRODUCT_BLOCK_INVALID", `article ${product.id} contains a reused V3 block ID`)] };
          }
          v3BlockIds.forEach((blockId) => bundleV3BlockIds.add(blockId));

          const sectionSlugs = product.sections.map((s) => s.slug);
          if (new Set(sectionSlugs).size !== sectionSlugs.length) {
            return { success: false, issues: [issue("PRODUCT_SECTION_INVALID", `article ${product.id} contains duplicate section slugs`)] };
          }

          const siblingsByParent = new Map<string, number[]>();
          for (const s of product.sections) {
            const parentKey = s.parentSectionId ?? "root";
            const currentOrders = siblingsByParent.get(parentKey) ?? [];
            currentOrders.push(s.orderIndex);
            siblingsByParent.set(parentKey, currentOrders);
          }
          for (const orders of siblingsByParent.values()) {
            if (new Set(orders).size !== orders.length) {
              return { success: false, issues: [issue("PRODUCT_SECTION_INVALID", `article ${product.id} contains duplicate sibling section orderIndex`)] };
            }
          }

          const sectionMap = new Map(product.sections.map((s) => [s.id, s]));
          for (const s of product.sections) {
            let depth = 1;
            let curr = s;
            const visited = new Set<string>([curr.id]);
            while (curr.parentSectionId) {
              const parent = sectionMap.get(curr.parentSectionId);
              if (!parent) {
                return { success: false, issues: [issue("PRODUCT_SECTION_INVALID", `section ${curr.id} references missing parentSectionId ${curr.parentSectionId}`)] };
              }
              if (visited.has(parent.id)) {
                return { success: false, issues: [issue("PRODUCT_SECTION_INVALID", `article ${product.id} contains a section parent cycle at ${parent.id}`)] };
              }
              visited.add(parent.id);
              curr = parent;
              depth++;
              if (depth > 3) {
                return { success: false, issues: [issue("PRODUCT_SECTION_INVALID", `article ${product.id} exceeds maximum section hierarchy depth of 3`)] };
              }
            }

            if (s.kind === "topic" && !s.learningSectionId) {
              return { success: false, issues: [issue("PRODUCT_SECTION_INVALID", `topic section ${s.id} requires learningSectionId`)] };
            }
            if (s.kind !== "topic" && s.learningSectionId) {
              return { success: false, issues: [issue("PRODUCT_SECTION_INVALID", `non-topic section ${s.id} cannot have learningSectionId`)] };
            }

            const blockIds = s.blocks.map((b) => b.id);
            if (new Set(blockIds).size !== blockIds.length) {
              return { success: false, issues: [issue("PRODUCT_BLOCK_INVALID", `section ${s.id} has duplicate block IDs`)] };
            }
            const blockOrders = s.blocks.map((b) => b.orderIndex);
            if (new Set(blockOrders).size !== blockOrders.length) {
              return { success: false, issues: [issue("PRODUCT_BLOCK_INVALID", `section ${s.id} has duplicate block orderIndex`)] };
            }
          }

          const productIdeaIds = new Set(product.ideaLinks.map((l) => l.id));
          const topicSections = product.sections.filter((s) => s.kind === "topic");
          const ideaTopicCounts = new Map<string, number>();
          for (const topic of topicSections) {
            for (const ideaId of topic.ideaIds) {
              ideaTopicCounts.set(ideaId, (ideaTopicCounts.get(ideaId) ?? 0) + 1);
            }
          }
          for (const ideaId of productIdeaIds) {
            const count = ideaTopicCounts.get(ideaId) ?? 0;
            if (count !== 1) {
              return { success: false, issues: [issue("PRODUCT_SECTION_IDEA_INVALID", `product Idea ${ideaId} must be assigned to exactly one topic section (found ${count})`)] };
            }
          }

          const productSourceMap = new Map(product.sourceRefs.map((s) => [s.sourceId, s]));
          const availableVisualIds = (product.visuals ?? []).map((v) => v.id);
          for (const s of product.sections) {
            for (const ideaId of s.ideaIds) {
              if (!productIdeaIds.has(ideaId)) {
                return { success: false, issues: [issue("PRODUCT_SECTION_REFERENCE_INVALID", `section ${s.id} references Idea ${ideaId} not in product ideaLinks`)] };
              }
            }
            for (const sRef of s.sourceRefs) {
              const pSource = productSourceMap.get(sRef.sourceId);
              if (!pSource || pSource.version !== sRef.version || pSource.checksum !== sRef.checksum || !sRef.excerptIds.every((e) => pSource.excerptIds.includes(e))) {
                return { success: false, issues: [issue("PRODUCT_SECTION_REFERENCE_INVALID", `section ${s.id} references sourceRef not in product sourceRefs`)] };
              }
            }

            const sectionIdeaIds = new Set(s.ideaIds);
            const sectionSourceMap = new Map(s.sourceRefs.map((sr) => [sr.sourceId, sr]));
            for (const b of s.blocks) {
              for (const bIdea of b.ideaIds) {
                if (!sectionIdeaIds.has(bIdea)) {
                  return { success: false, issues: [issue("PRODUCT_BLOCK_REFERENCE_INVALID", `block ${b.id} references Idea ${bIdea} not in section ideaIds`)] };
                }
              }
              for (const bSource of b.sourceRefs) {
                const sSource = sectionSourceMap.get(bSource.sourceId);
                if (!sSource || sSource.version !== bSource.version || sSource.checksum !== bSource.checksum || !bSource.excerptIds.every((e) => sSource.excerptIds.includes(e))) {
                  return { success: false, issues: [issue("PRODUCT_BLOCK_REFERENCE_INVALID", `block ${b.id} references sourceRef not in section sourceRefs`)] };
                }
              }

              if (b.visualIds) {
                if (new Set(b.visualIds).size !== b.visualIds.length) {
                  return { success: false, issues: [issue("PRODUCT_BLOCK_VISUAL_DUPLICATE", `block ${b.id} contains duplicate visual references`)] };
                }
                for (const visualId of b.visualIds) {
                  if (!availableVisualIds.includes(visualId)) {
                    return { success: false, issues: [issue("PRODUCT_BLOCK_VISUAL_REFERENCE_INVALID", `block ${b.id} references unknown visual ${visualId}`)] };
                  }
                }
              }

              if (b.workedExamplePayload && b.blockType !== "worked_example") {
                return { success: false, issues: [issue("PRODUCT_BLOCK_PAYLOAD_MISMATCH", `block ${b.id} has workedExamplePayload but blockType is ${b.blockType}`)] };
              }
              if (b.formativeCheckPayload && b.blockType !== "retrieval_prompt" && b.blockType !== "retrieval_close") {
                return { success: false, issues: [issue("PRODUCT_BLOCK_PAYLOAD_MISMATCH", `block ${b.id} has formativeCheckPayload but blockType is ${b.blockType}`)] };
              }
            }
          }

          if (product.visuals && product.visuals.length > 0) {
            const visualIds = product.visuals.map((v) => v.id);
            if (new Set(visualIds).size !== visualIds.length) {
              return { success: false, issues: [issue("PRODUCT_VISUAL_DUPLICATE_ID", `article ${product.id} contains duplicate visual IDs`)] };
            }
          }

          const allSectionIds = product.sections.map((sec) => sec.id);
          for (const s of product.sections) {
            if (s.pedagogy) {
              const pedResult = validateSectionPedagogyReferences({
                sectionId: s.id,
                sectionBlocks: s.blocks.map((b) => ({ id: b.id, blockType: b.blockType })),
                pedagogy: s.pedagogy,
                availableSectionIds: allSectionIds,
                availableVisualIds,
              });
              if (!pedResult.valid) {
                return {
                  success: false,
                  issues: [issue("PRODUCT_PEDAGOGY_REFERENCE_INVALID", pedResult.errors.join("; "))],
                };
              }
            }
          }
        }

        try {
          compileArticleProduct(product);
        } catch (error) {
          return { success: false, issues: [issue("PRODUCT_ARTICLE_QUALITY_FAILED", error instanceof Error ? error.message : `article ${product.id} failed quality validation`)] };
        }
      }
      if (product.productType === "flashcard") {
        if (product.ideaLinks.length !== 1) return { success: false, issues: [issue("PRODUCT_FLASHCARD_IDEA_COUNT_INVALID", `flashcard ${product.id} must reference exactly one Idea`)] };
        if (product.front.split("?").length > 2) return { success: false, issues: [issue("PRODUCT_FLASHCARD_NOT_ATOMIC", `flashcard ${product.id} contains multiple prompts`)] };
      }
      if (product.productType === "question") {
        const optionIds = product.options.map((option) => option.id);
        const correctCount = product.options.filter((option) => option.isCorrect).length;
        if (new Set(optionIds).size !== optionIds.length) return { success: false, issues: [issue("PRODUCT_QUESTION_OPTION_DUPLICATE", `question ${product.id} contains duplicate option IDs`)] };
        if (product.questionType === "multiple_choice" && (product.options.length < 2 || correctCount !== 1)) return { success: false, issues: [issue("PRODUCT_QUESTION_GRADING_INVALID", `question ${product.id} requires at least two options and exactly one correct option`)] };
        if (product.questionType === "multiple_choices" && (product.options.length < 2 || correctCount < 1)) return { success: false, issues: [issue("PRODUCT_QUESTION_GRADING_INVALID", `question ${product.id} requires at least two options and one or more correct options`)] };
        if (["short_answer", "essay"].includes(product.questionType) && product.options.length > 0) return { success: false, issues: [issue("PRODUCT_QUESTION_GRADING_INVALID", `question ${product.id} free-response options must be empty`)] };
        const ideaIds = new Set(product.ideaLinks.map((link) => link.id));
        if (ideaIds.size > 1 && !["analyze", "evaluate", "create"].includes(product.cognitiveLevel)) return { success: false, issues: [issue("PRODUCT_QUESTION_MULTI_IDEA_HOT_REQUIRED", `question ${product.id} with multiple Ideas must use analyze, evaluate, or create cognitive level`)] };
        const relationKeys = new Set<string>();
        for (const relation of product.ideaRelations) {
          if (!ideaIds.has(relation.ideaId)) return { success: false, issues: [issue("PRODUCT_QUESTION_RELATION_IDEA_MISSING", `question ${product.id} relation references an unlinked Idea ${relation.ideaId}`)] };
          const relationKey = `${relation.ideaId}:${relation.relationType}`;
          if (relationKeys.has(relationKey)) return { success: false, issues: [issue("PRODUCT_QUESTION_RELATION_DUPLICATE", `question ${product.id} contains a duplicate Idea relation`)] };
          relationKeys.add(relationKey);
        }
        if (ideaIds.size > 1) {
          const coveredIdeaIds = new Set(product.ideaRelations.map((relation) => relation.ideaId));
          const missingIdeaIds = [...ideaIds].filter((ideaId) => !coveredIdeaIds.has(ideaId));
          if (missingIdeaIds.length > 0) return { success: false, issues: [issue("PRODUCT_QUESTION_RELATION_INCOMPLETE", `question ${product.id} requires relation data for every linked Idea: ${missingIdeaIds.join(",")}`)] };
        }
        const curationIds = product.itbCuration.map((entry) => entry.referenceId);
        if (new Set(curationIds).size !== curationIds.length) return { success: false, issues: [issue("PRODUCT_ITB_CURATION_DUPLICATE", `question ${product.id} contains duplicate ITB references`)] };
        if (!curationIds.includes(product.itbSource.referenceId)) return { success: false, issues: [issue("PRODUCT_ITB_SOURCE_NOT_CURATED", `question ${product.id} source reference must be included in ITB curation`)] };
      }
      if (product.productType === "diktat") {
        if (product.sourceArticleId === product.id) return { success: false, issues: [issue("PRODUCT_DIKTAT_LINEAGE_INVALID", `diktat ${product.id} cannot reference itself as its Article`)] };
      }
      if (product.productType === "assessment_blueprint") {
        if ((product.assessmentType === "quiz" && product.chapterIds.length !== 1) || (product.assessmentType === "tryout" && product.chapterIds.length < 1)) return { success: false, issues: [issue("PRODUCT_ASSESSMENT_SCOPE_INVALID", `assessment ${product.id} has invalid chapter scope`)] };
      }
      const serialized = deterministicProductSerialization(product);
      if (/HOLDOUT_CANARY|authoringVisibility\s*[:=]\s*["']holdout|questionSnapshot|answerSnapshot/i.test(serialized)) return { success: false, issues: [issue("PRODUCT_HOLDOUT_LEAK", `product ${product.id} contains holdout content`)] };
    }
    const invalidDependency = findInvalidProductDependency(dependencies, products);
    if (invalidDependency) return { success: false, issues: [issue(invalidDependency.code, `dependency ${invalidDependency.dependency.id} does not match its bundled product revision`, declared.get("dependencies")?.path)] };
    for (const product of products) {
      if (product.productType !== "diktat") continue;
      const sourceArticle = products.find((candidate) => candidate.productType === "article" && candidate.id === product.sourceArticleId && candidate.version === product.sourceArticleVersion);
      if (manifest.schemaVersion === "product-bundle.v4") {
        if (!sourceArticle || sourceArticle.productType !== "article") return { success: false, issues: [issue("DIKTAT_SOURCE_ARTICLE_REQUIRED", "V4 Diktat requires its source Article in the same bundle")] };
        if (product.units) product.units = prepareAuthoredDiktatVisuals(product.units, sourceArticle.visuals ?? []);
        const errors = validateAuthoredDiktat(sourceArticle, product);
        if (errors.length) return { success: false, issues: errors.map((code) => issue(code, `V4 Diktat ${product.id} fails structural coverage`)) };
        if (product.contentMarkdown !== materializeAuthoredDiktat(product.units!)) return { success: false, issues: [issue("DIKTAT_CONTENT_MISMATCH", "V4 Diktat Markdown must match its authored units")] };
      } else if (product.units) return { success: false, issues: [issue("DIKTAT_UNITS_REQUIRE_V4", "Authored Diktat units require Product Bundle V4")] };
      if (sourceArticle && sourceArticle.generationHash !== product.sourceArticleHash) return { success: false, issues: [issue("PRODUCT_DIKTAT_LINEAGE_HASH_MISMATCH", `diktat ${product.id} does not match the referenced Article generation hash`)] };
      const lineageDependency = dependencies.find((dependency) =>
        dependency.upstreamEntityType === "product" &&
        dependency.upstreamEntityId === product.sourceArticleId &&
        dependency.upstreamVersion === product.sourceArticleVersion &&
        dependency.upstreamHash === product.sourceArticleHash &&
        dependency.downstreamEntityType === "diktat" &&
        dependency.downstreamEntityId === product.id &&
        dependency.downstreamVersion === product.version &&
        dependency.downstreamHash === product.generationHash,
      );
      if (!lineageDependency) return { success: false, issues: [issue("PRODUCT_DIKTAT_LINEAGE_DEPENDENCY_MISSING", `diktat ${product.id} must lock its source Article dependency`)] };
    }
    const questionIds = new Set(products.filter((product) => product.productType === "question").map((product) => product.id));
    const solutionQuestionIds = products.filter((product) => product.productType === "solution").map((product) => product.questionId);
    for (const questionId of questionIds) {
      if (solutionQuestionIds.filter((candidate) => candidate === questionId).length !== 1) return { success: false, issues: [issue("PRODUCT_QUESTION_SOLUTION_INVALID", `question ${questionId} requires exactly one solution`)] };
    }
    for (const product of products) if (product.productType === "solution" && !questionIds.has(product.questionId)) return { success: false, issues: [issue("PRODUCT_SOLUTION_QUESTION_MISSING", `solution ${product.id} references a missing question`)] };
    const productById = new Map(products.map((product) => [product.id, product]));
    for (const product of products) {
      if (product.productType === "flashcard_set" && product.cards.some((cardId) => productById.get(cardId)?.productType !== "flashcard")) return { success: false, issues: [issue("PRODUCT_FLASHCARD_LINK_MISSING", `flashcard set ${product.id} references a missing flashcard`)] };
      if (product.productType === "flashcard") {
        const set = product.setId ? productById.get(product.setId) : products.find((candidate) => candidate.productType === "flashcard_set" && candidate.cards.includes(product.id));
        if (!set || set.productType !== "flashcard_set" || !set.cards.includes(product.id)) return { success: false, issues: [issue("PRODUCT_FLASHCARD_SET_MISSING", `flashcard ${product.id} is not linked to a flashcard set`)] };
      }
      if (product.productType === "assessment_blueprint" && product.questionIds.some((questionId) => productById.get(questionId)?.productType !== "question")) return { success: false, issues: [issue("PRODUCT_ASSESSMENT_QUESTION_MISSING", `assessment ${product.id} references a missing question`)] };
    }
    const v4Pilot = manifest.schemaVersion === "product-bundle.v4";
    const blocked = v4Pilot || dependencies.some((dependency) => dependency.freshness !== "UP_TO_DATE");
    const checksum = computeProductBundleChecksum(manifest, files);
    if (checksum !== manifest.bundleChecksum) return { success: false, issues: [issue("PRODUCT_BUNDLE_CHECKSUM_MISMATCH", "bundle checksum does not match", "manifest.json")] };
    return { success: true, data: { manifest, products, dependencies, files, checksum, publicationBlocked: blocked, issues: v4Pilot ? [issue("PRODUCT_V4_VERIFICATION_REQUIRED", "V4 pilot drafts require the authored Diktat and trusted render verification gates before publication")] : blocked ? [issue("PRODUCT_DEPENDENCY_NEEDS_REVIEW", "one or more product dependencies need review")] : [] } };
  } catch (error) {
    const issueValue = error instanceof ProductValidationError ? error.issue : error instanceof BundleValidationError ? issue(error.code, error.message, error.path) : issue("PRODUCT_INVALID", error instanceof Error ? error.message : String(error));
    return { success: false, issues: [issueValue] };
  }
}

export function validateProductBundle(bytes: Uint8Array): ProductBundleValidation {
  try {
    const result = parseProductBundle(readSecureZip(bytes, {}, { allowInteractiveDocuments: true }));
    if (result.success && (result.data.manifest.visualAssets !== undefined || [...result.data.files.keys()].some(path => path.startsWith("visuals/")) || productInteractiveDocuments(result.data.products).length > 0)) {
      return { success: false, issues: [issue("INTERACTIVE_DOCUMENT_ASYNC_VALIDATION_REQUIRED", "Interactive document assets require asynchronous admission")] };
    }
    return result;
  } catch (error) {
    return { success: false, issues: [issue(error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : "PRODUCT_ZIP_INVALID", error instanceof Error ? error.message : String(error))] };
  }
}
