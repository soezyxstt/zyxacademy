import { createHash } from "node:crypto";
import { z } from "zod";
import { BundleValidationError, parseSchema, parseStrictJson, sha256Bytes } from "@/lib/bundle/validator";
import { readSecureZip, type SecureZipArchive } from "@/lib/bundle/zip-reader";
import { compileArticleProduct } from "@/lib/materials/compiler";

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
  productType: z.enum(["article", "diktat", "question", "solution", "flashcard_set", "flashcard", "assessment_blueprint"]),
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

export const productEntitySchema = z.discriminatedUnion("productType", [
  commonProduct.extend({ productType: z.literal("article"), slug: id, title: z.string().min(1), blocks: z.array(z.object({ id, blockType: id, orderIndex: z.number().int().nonnegative(), content: z.string().min(1) }).strict()).min(1) }),
  commonProduct.extend({ productType: z.literal("diktat"), title: z.string().min(1), contentMarkdown: z.string().min(1), sourceArticleId: id, sourceArticleVersion: positive, sourceArticleHash: hash }),
  commonProduct.extend({ productType: z.literal("question"), questionType: z.enum(["multiple_choice", "multiple_choices", "short_answer", "essay"]), prompt: z.string().min(1), options: z.array(productQuestionOptionSchema), difficulty: z.enum(["easy", "medium", "hard"]), cognitiveLevel: z.enum(["remember", "understand", "apply", "analyze", "evaluate", "create"]), reasoningPattern: id, relationTypes: z.array(questionRelationTypeSchema).default([]), ideaRelations: z.array(productIdeaRelationSchema).default([]), itbSource: productItbSourceSchema, itbCuration: z.array(productItbCurationSchema).min(1) }),
  commonProduct.extend({ productType: z.literal("solution"), questionId: id, content: z.string().min(1) }),
  commonProduct.extend({ productType: z.literal("flashcard_set"), title: z.string().min(1), cards: z.array(id).min(1) }),
  commonProduct.extend({ productType: z.literal("flashcard"), setId: z.string().min(1).optional(), front: z.string().min(1), back: z.string().min(1), explanation: z.string().optional(), atomic: z.literal(true) }),
  commonProduct.extend({ productType: z.literal("assessment_blueprint"), title: z.string().min(1), assessmentType: z.enum(["quiz", "tryout"]), chapterIds: z.array(id), questionIds: z.array(id).min(1) }),
]);
export type ProductEntity = z.infer<typeof productEntitySchema>;

export const productDependencySchema = z.object({
  id,
  upstreamEntityType: z.enum(["idea", "source_material", "source_chunk", "product"]),
  upstreamEntityId: id,
  upstreamVersion: positive,
  upstreamHash: hash,
  downstreamEntityType: z.enum(["article", "diktat", "question", "solution", "flashcard_set", "flashcard", "assessment_blueprint"]),
  downstreamEntityId: id,
  downstreamVersion: positive,
  downstreamHash: hash,
  freshness: z.enum(["UP_TO_DATE", "NEEDS_REVIEW", "STALE"]),
}).strict();
export type ProductDependency = z.infer<typeof productDependencySchema>;

export const productBundleManifestSchema = z.object({
  bundleId: id,
  bundleType: z.literal("product"),
  schemaVersion: z.literal("product-bundle.v2"),
  courseId: id,
  entityFiles: z.array(z.object({ path: id, entityType: productBundleEntityTypeSchema, checksum: hash, stableIds: z.array(id) }).strict()).length(2),
  creatorId: id,
  curatorId: id.optional(),
  createdAt: timestamp,
  bundleChecksum: hash,
  conflicts: z.array(z.object({ id, entityType: id, stableId: id, reason: id }).strict()).default([]),
}).strict();
export type ProductBundleManifest = z.infer<typeof productBundleManifestSchema>;

export type ProductValidationIssue = { code: string; message: string; path?: string };
export type ProductBundleFiles = ReadonlyMap<string, Uint8Array>;
export type ProductBundleValidation = { success: true; data: { manifest: ProductBundleManifest; products: readonly ProductEntity[]; dependencies: readonly ProductDependency[]; files: ProductBundleFiles; checksum: string; publicationBlocked: boolean; issues: readonly ProductValidationIssue[] } } | { success: false; issues: readonly ProductValidationIssue[] };

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

export function deterministicProductSerialization(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(deterministicProductSerialization).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, nested]) => `${JSON.stringify(key)}:${deterministicProductSerialization(nested)}`).join(",")}}`;
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
    const productKeys = new Set<string>();
    for (const product of products) {
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
      if (product.productType === "article" && new Set(product.blocks.map((block) => block.orderIndex)).size !== product.blocks.length) return { success: false, issues: [issue("PRODUCT_BLOCK_INVALID", `article ${product.id} has duplicate block order`)] };
      if (product.productType === "article") {
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
    for (const product of products) {
      if (product.productType !== "diktat") continue;
      const sourceArticle = products.find((candidate) => candidate.productType === "article" && candidate.id === product.sourceArticleId && candidate.version === product.sourceArticleVersion);
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
    const blocked = dependencies.some((dependency) => dependency.freshness !== "UP_TO_DATE");
    const checksum = computeProductBundleChecksum(manifest, files);
    if (checksum !== manifest.bundleChecksum) return { success: false, issues: [issue("PRODUCT_BUNDLE_CHECKSUM_MISMATCH", "bundle checksum does not match", "manifest.json")] };
    return { success: true, data: { manifest, products, dependencies, files, checksum, publicationBlocked: blocked, issues: blocked ? [issue("PRODUCT_DEPENDENCY_NEEDS_REVIEW", "one or more product dependencies need review")] : [] } };
  } catch (error) {
    const issueValue = error instanceof ProductValidationError ? error.issue : error instanceof BundleValidationError ? issue(error.code, error.message, error.path) : issue("PRODUCT_INVALID", error instanceof Error ? error.message : String(error));
    return { success: false, issues: [issueValue] };
  }
}

export function validateProductBundle(bytes: Uint8Array): ProductBundleValidation {
  try {
    return parseProductBundle(readSecureZip(bytes));
  } catch (error) {
    return { success: false, issues: [issue(error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : "PRODUCT_ZIP_INVALID", error instanceof Error ? error.message : String(error))] };
  }
}
