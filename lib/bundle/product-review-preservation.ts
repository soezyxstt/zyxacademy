import { deterministicProductSerialization, type ProductBundleValidation } from "@/lib/bundle/product-validator";

type ValidProductBundle = Extract<ProductBundleValidation, { success: true }>["data"];

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
      if (previousSection && deterministicProductSerialization(previousSection) === deterministicProductSerialization(section)) {
        unchanged.add(section.id);
      }
    }
  }
  return unchanged;
}
