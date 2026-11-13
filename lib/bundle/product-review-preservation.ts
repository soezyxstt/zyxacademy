import { deterministicProductSerialization, type ProductBundleValidation } from "@/lib/bundle/product-validator";
import { computePedagogyContentFingerprint } from "@/lib/materials/quality-policy";
import { collectArticleVisualIds } from "@/lib/materials/article-parts";

type ValidProductBundle = Extract<ProductBundleValidation, { success: true }>["data"];
type ArticleProduct = Extract<ValidProductBundle["products"][number], { productType: "article" }>;

export function sectionReviewFingerprint(section: ArticleProduct["sections"][number], visuals: ArticleProduct["visuals"]): string {
  const visualIds = new Set(section.blocks.flatMap((block) => [
    ...(block.visualIds ?? []),
    ...collectArticleVisualIds(block.parts ?? []),
  ]));
  if (section.pedagogy?.visualRequirement.status === "required") {
    for (const id of section.pedagogy.visualRequirement.visualIds) visualIds.add(id);
  }
  const visualRegistry = new Map((visuals ?? []).map((visual) => [visual.id, visual]));
  return deterministicProductSerialization({
    section,
    visuals: [...visualIds].sort().map((id) => ({ id, visual: visualRegistry.get(id) ?? null })),
  });
}

export function unchangedArticleSectionIds(previous: ValidProductBundle, next: ValidProductBundle): Set<string> {
  const previousArticles = new Map(
    previous.products
      .filter((product) => product.productType === "article")
      .map((product) => [product.id, product]),
  );
  const unchanged = new Set<string>();
  for (const product of next.products) {
    if (product.productType !== "article") continue;
    const previousArticle = previousArticles.get(product.id);
    if (!previousArticle || previousArticle.productType !== "article") continue;
    const previousSections = new Map(previousArticle.sections.map((section) => [section.id, section]));
    for (const section of product.sections) {
      const previousSection = previousSections.get(section.id);
      if (previousSection && sectionReviewFingerprint(previousSection, previousArticle.visuals) === sectionReviewFingerprint(section, product.visuals)) {
        unchanged.add(section.id);
      }
    }
  }
  return unchanged;
}

export function canPreservePedagogicReview(previous: ValidProductBundle, next: ValidProductBundle): boolean {
  const previousArticles = previous.products.filter((product) => product.productType === "article");
  const nextArticles = next.products.filter((product) => product.productType === "article");
  if (previousArticles.length !== nextArticles.length) return false;

  const previousDiktats = new Map(
    previous.products
      .filter((product) => product.productType === "diktat")
      .map((product) => [product.id, product]),
  );
  const nextDiktats = new Map(
    next.products
      .filter((product) => product.productType === "diktat")
      .map((product) => [product.id, product]),
  );
  const previousArticleMap = new Map(previousArticles.map((p) => [p.id, p]));

  for (const nextArticle of nextArticles) {
    const prevArticle = previousArticleMap.get(nextArticle.id);
    if (!prevArticle || prevArticle.productType !== "article") return false;

    const nextDiktat = [...nextDiktats.values()].find((d) => d.sourceArticleId === nextArticle.id);
    const prevDiktat = [...previousDiktats.values()].find((d) => d.sourceArticleId === prevArticle.id);

    const prevFingerprint = computePedagogyContentFingerprint({
      article: prevArticle as unknown as Record<string, unknown>,
      diktat: prevDiktat as unknown as Record<string, unknown>,
    });
    const nextFingerprint = computePedagogyContentFingerprint({
      article: nextArticle as unknown as Record<string, unknown>,
      diktat: nextDiktat as unknown as Record<string, unknown>,
    });

    if (prevFingerprint !== nextFingerprint) return false;
  }

  return true;
}

export function findStalePdfEvidenceProductIds(previous: ValidProductBundle, next: ValidProductBundle): Set<string> {
  const stale = new Set<string>();
  const previousById = new Map(previous.products.map((p) => [p.id, p]));

  for (const nextProduct of next.products) {
    if (nextProduct.productType !== "article" && nextProduct.productType !== "diktat") continue;
    const prevProduct = previousById.get(nextProduct.id);
    if (!prevProduct) {
      stale.add(nextProduct.id);
      continue;
    }
    // Legacy generationHash is declarative. Compare the server-parsed content too.
    if (deterministicProductSerialization(prevProduct) !== deterministicProductSerialization(nextProduct)) {
      stale.add(nextProduct.id);
    }
  }

  const nextDiktats = next.products.filter((p) => p.productType === "diktat");
  const linkedDiktats = (bundle: ValidProductBundle, articleId: string) => bundle.products.filter(product => product.productType === "diktat" && product.sourceArticleId === articleId)
    .map(product => ({ id: product.id, version: product.version, hash: product.generationHash })).sort((a, b) => a.id.localeCompare(b.id));
  for (const article of next.products.filter(product => product.productType === "article")) {
    if (deterministicProductSerialization(linkedDiktats(previous, article.id)) !== deterministicProductSerialization(linkedDiktats(next, article.id))) stale.add(article.id);
  }
  for (const diktat of nextDiktats) {
    if (diktat.sourceArticleId && stale.has(diktat.sourceArticleId)) {
      stale.add(diktat.id);
    }
    if (stale.has(diktat.id) && diktat.sourceArticleId) {
      stale.add(diktat.sourceArticleId);
    }
  }

  return stale;
}

export function canPreservePdfEvidence(previous: ValidProductBundle, next: ValidProductBundle, productId: string): boolean {
  return !findStalePdfEvidenceProductIds(previous, next).has(productId);
}
