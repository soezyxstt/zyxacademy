import { createHash } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import { sha256Bytes } from "@/lib/bundle/validator";
import {
  computeProductBundleChecksum,
  deterministicProductSerialization,
  productEntitySchema,
  validateProductBundle,
  type ProductDependency,
  type ProductEntity,
  type ProductBundleValidation,
} from "@/lib/bundle/product-validator";

type ValidProductBundle = Extract<ProductBundleValidation, { success: true }>["data"];
export type ProductBundleDraft = { products: ProductEntity[] };
export type FinalizedProductBundleDraft = { bytes: Uint8Array; bundle: ValidProductBundle };

function hash(value: unknown): string {
  return createHash("sha256").update(deterministicProductSerialization(clean(value)), "utf8").digest("hex");
}

function generationHash(product: ProductEntity): string {
  const { generationHash: _generationHash, ...content } = product;
  return hash(content);
}

function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function mergeIdeaLinks(original: ProductEntity, submitted: ProductEntity) {
  if (original.ideaLinks.length !== submitted.ideaLinks.length) throw new Error("PRODUCT_DRAFT_IDEA_LINK_CHANGED");
  const byId = new Map(submitted.ideaLinks.map((link) => [link.id, link]));
  if (byId.size !== submitted.ideaLinks.length || original.ideaLinks.some((link) => !byId.has(link.id))) throw new Error("PRODUCT_DRAFT_IDEA_LINK_CHANGED");
  return original.ideaLinks.map((link) => ({ ...link, weight: byId.get(link.id)!.weight, role: byId.get(link.id)!.role }));
}

function mergeProduct(original: ProductEntity, submitted: ProductEntity): ProductEntity {
  if (original.productType !== submitted.productType) throw new Error("PRODUCT_DRAFT_IDENTITY_CHANGED");
  const common = { ...original, ideaLinks: mergeIdeaLinks(original, submitted) };
  switch (original.productType) {
    case "article": {
      if (submitted.productType !== "article") throw new Error("PRODUCT_DRAFT_IDENTITY_CHANGED");
      const isV2 = original.blocks.length > 0 && original.sections.length === 0;
      const isV3 = original.blocks.length === 0 && original.sections.length > 0;
      if (isV2) {
        if (submitted.blocks.length !== original.blocks.length) throw new Error("PRODUCT_DRAFT_BLOCK_CHANGED");
        const blocks = new Map(submitted.blocks.map((block) => [block.id, block]));
        if (blocks.size !== submitted.blocks.length || original.blocks.some((block) => !blocks.has(block.id))) {
          throw new Error("PRODUCT_DRAFT_BLOCK_CHANGED");
        }
        return productEntitySchema.parse({
          ...common,
          title: submitted.title.trim(),
          slug: submitted.slug.trim(),
          blocks: original.blocks.map((block) => ({ ...block, content: blocks.get(block.id)!.content.trim() })),
          sections: [],
        });
      }
      if (isV3) {
        if (submitted.sections.length !== original.sections.length) throw new Error("PRODUCT_DRAFT_SECTION_CHANGED");
        const submittedSections = new Map(submitted.sections.map((s) => [s.id, s]));
        if (submittedSections.size !== submitted.sections.length || original.sections.some((s) => !submittedSections.has(s.id))) {
          throw new Error("PRODUCT_DRAFT_SECTION_CHANGED");
        }
        const mergedSections = original.sections.map((originalSection) => {
          const submittedSection = submittedSections.get(originalSection.id)!;
          if (submittedSection.blocks.length !== originalSection.blocks.length) throw new Error("PRODUCT_DRAFT_BLOCK_CHANGED");
          const submittedBlocks = new Map(submittedSection.blocks.map((b) => [b.id, b]));
          if (submittedBlocks.size !== submittedSection.blocks.length || originalSection.blocks.some((b) => !submittedBlocks.has(b.id))) {
            throw new Error("PRODUCT_DRAFT_BLOCK_CHANGED");
          }
          const mergedBlocks = originalSection.blocks.map((originalBlock) => {
            const submittedBlock = submittedBlocks.get(originalBlock.id)!;
            return {
              ...originalBlock,
              title: submittedBlock.title?.trim() || undefined,
              blockType: submittedBlock.blockType,
              orderIndex: submittedBlock.orderIndex,
              contentMarkdown: submittedBlock.contentMarkdown.trim(),
            };
          });
          return {
            ...originalSection,
            title: submittedSection.title.trim(),
            learningObjective: submittedSection.learningObjective.trim(),
            parentSectionId: submittedSection.parentSectionId,
            orderIndex: submittedSection.orderIndex,
            blocks: mergedBlocks,
          };
        });
        return productEntitySchema.parse({
          ...common,
          title: submitted.title.trim(),
          slug: original.slug,
          blocks: [],
          sections: mergedSections,
        });
      }
      throw new Error("PRODUCT_DRAFT_ARTICLE_INVALID");
    }
    case "diktat":
      if (submitted.productType !== "diktat") throw new Error("PRODUCT_DRAFT_IDENTITY_CHANGED");
      return productEntitySchema.parse({ ...common, title: submitted.title.trim(), contentMarkdown: submitted.contentMarkdown.trim() });
    case "question": {
      if (submitted.productType !== "question" || original.options.length !== submitted.options.length) throw new Error("PRODUCT_DRAFT_OPTION_CHANGED");
      const options = new Map(submitted.options.map((option) => [option.id, option]));
      if (options.size !== submitted.options.length || original.options.some((option) => !options.has(option.id))) throw new Error("PRODUCT_DRAFT_OPTION_CHANGED");
      const linkedIdeas = new Set(original.ideaLinks.map((link) => link.id));
      if (submitted.ideaRelations.some((relation) => !linkedIdeas.has(relation.ideaId))) throw new Error("PRODUCT_DRAFT_RELATION_CHANGED");
      return productEntitySchema.parse({
        ...common,
        prompt: submitted.prompt.trim(),
        options: original.options.map((option) => ({ ...option, text: options.get(option.id)!.text.trim(), isCorrect: options.get(option.id)!.isCorrect })),
        difficulty: submitted.difficulty,
        cognitiveLevel: submitted.cognitiveLevel,
        reasoningPattern: submitted.reasoningPattern.trim(),
        relationTypes: submitted.relationTypes,
        ideaRelations: submitted.ideaRelations.map((relation) => ({ ...relation, rationale: relation.rationale?.trim() || undefined })),
        itbCuration: original.itbCuration.map((entry, index) => ({ ...entry, curatorNote: submitted.itbCuration[index]?.curatorNote.trim() || entry.curatorNote })),
      });
    }
    case "solution":
      if (submitted.productType !== "solution") throw new Error("PRODUCT_DRAFT_IDENTITY_CHANGED");
      return productEntitySchema.parse({ ...common, content: submitted.content.trim() });
    case "flashcard_set":
      if (submitted.productType !== "flashcard_set") throw new Error("PRODUCT_DRAFT_IDENTITY_CHANGED");
      return productEntitySchema.parse({ ...common, title: submitted.title.trim() });
    case "flashcard":
      if (submitted.productType !== "flashcard") throw new Error("PRODUCT_DRAFT_IDENTITY_CHANGED");
      return productEntitySchema.parse({ ...common, front: submitted.front.trim(), back: submitted.back.trim(), explanation: submitted.explanation?.trim() || undefined });
    case "assessment_blueprint":
      if (submitted.productType !== "assessment_blueprint") throw new Error("PRODUCT_DRAFT_IDENTITY_CHANGED");
      return productEntitySchema.parse({ ...common, title: submitted.title.trim(), assessmentType: submitted.assessmentType });
  }
}

export function createProductBundleDraft(bundle: ValidProductBundle): ProductBundleDraft {
  return JSON.parse(JSON.stringify({ products: bundle.products })) as ProductBundleDraft;
}

export function refreshDraftDependencies(
  dependencies: readonly ProductDependency[],
  products: readonly ProductEntity[],
  changedArticleIds: ReadonlySet<string>,
): ProductDependency[] {
  const productsById = new Map(products.map((product) => [product.id, product]));
  return dependencies.map((dependency) => {
    const downstream = productsById.get(dependency.downstreamEntityId);
    const articleEditMakesDiktatStale = dependency.upstreamEntityType === "product"
      && changedArticleIds.has(dependency.upstreamEntityId)
      && downstream?.productType === "diktat";
    return {
      ...dependency,
      upstreamHash: dependency.upstreamEntityType === "product" ? productsById.get(dependency.upstreamEntityId)?.generationHash ?? dependency.upstreamHash : dependency.upstreamHash,
      downstreamHash: downstream?.generationHash ?? dependency.downstreamHash,
      freshness: articleEditMakesDiktatStale ? "STALE" : dependency.freshness,
    };
  });
}

export function finalizeProductBundleDraft(original: ValidProductBundle, draft: ProductBundleDraft): FinalizedProductBundleDraft {
  if (original.products.length !== draft.products.length) throw new Error("PRODUCT_DRAFT_IDENTITY_CHANGED");
  const submitted = new Map(draft.products.map((product) => [product.id, product]));
  if (submitted.size !== draft.products.length || original.products.some((product) => !submitted.has(product.id))) throw new Error("PRODUCT_DRAFT_IDENTITY_CHANGED");

  let products = original.products.map((product) => mergeProduct(product, submitted.get(product.id)!));
  const changedArticleIds = new Set(
    products
      .filter((product) => product.productType === "article")
      .filter((product) => productEntityHashForDraft(product) !== productEntityHashForDraft(original.products.find((candidate) => candidate.id === product.id)!))
      .map((product) => product.id),
  );
  products = products.map((product) => product.productType === "diktat" ? product : productEntitySchema.parse({ ...product, generationHash: generationHash(product) }));
  const articles = new Map(products.filter((product) => product.productType === "article").map((product) => [product.id, product]));
  products = products.map((product) => {
    if (product.productType !== "diktat") return product;
    const article = articles.get(product.sourceArticleId);
    const withLineage = article ? { ...product, sourceArticleHash: article.generationHash } : product;
    return productEntitySchema.parse({ ...withLineage, generationHash: generationHash(withLineage) });
  });
  const dependencies = refreshDraftDependencies(original.dependencies, products, changedArticleIds);

  const files = new Map(original.files);
  products = clean(products);
  const cleanDependencies = clean(dependencies);
  const encodedProducts = strToU8(`${deterministicProductSerialization(products)}\n`);
  const encodedDependencies = strToU8(`${deterministicProductSerialization(cleanDependencies)}\n`);
  const entityFiles = original.manifest.entityFiles.map((file) => {
    const bytes = file.entityType === "products" ? encodedProducts : encodedDependencies;
    files.set(file.path, bytes);
    return { ...file, checksum: sha256Bytes(bytes) };
  });
  const manifestBase = { ...original.manifest, entityFiles, bundleChecksum: undefined };
  const bundleChecksum = computeProductBundleChecksum(manifestBase as Omit<typeof original.manifest, "bundleChecksum">, files);
  const manifest = { ...original.manifest, entityFiles, bundleChecksum };
  files.set("manifest.json", strToU8(`${deterministicProductSerialization(manifest)}\n`));
  const entries = Object.fromEntries([...files.entries()].sort(([left], [right]) => left.localeCompare(right)));
  const bytes = zipSync(entries, { level: 6 });
  const validation = validateProductBundle(bytes);
  if (!validation.success) throw new Error(`${validation.issues[0]?.code ?? "PRODUCT_DRAFT_INVALID"}:${validation.issues[0]?.message ?? "Draft tidak valid"}`);
  return { bytes, bundle: validation.data };
}

function productEntityHashForDraft(product: ProductEntity): string {
  return hash(product);
}
