import type { ProductEntity } from "./product-validator";

export type ProductPreview = {
  id: string;
  productType: ProductEntity["productType"];
  version: number;
  status: string;
  title: string;
  traceability: {
    ideaIds: readonly string[];
    sourceIds: readonly string[];
  };
  sections: readonly { label: string; content: string }[];
};

function titleOf(product: ProductEntity): string {
  if ("title" in product) return product.title;
  if (product.productType === "question") return product.prompt.slice(0, 80);
  if (product.productType === "solution") return `Solution for ${product.questionId}`;
  return product.front.slice(0, 80);
}

function unwrapText(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as { content?: unknown };
      if (typeof parsed.content === "string") return parsed.content;
    } catch {
      // Keep raw string on JSON parse error
    }
  }
  return raw;
}

function sectionsOf(product: ProductEntity): ProductPreview["sections"] {
  switch (product.productType) {
    case "article":
      return [...product.blocks]
        .sort((left, right) => left.orderIndex - right.orderIndex)
        .map((block) => ({ label: block.blockType, content: unwrapText(block.content) }));
    case "diktat":
      return [{ label: "content", content: unwrapText(product.contentMarkdown) }];
    case "question":
      return [
        { label: "prompt", content: unwrapText(product.prompt) },
        { label: "options", content: JSON.stringify(product.options) },
        { label: "reasoning", content: product.reasoningPattern },
        { label: "ITB source", content: `${product.itbSource.eventName} (${product.itbSource.referenceId})` },
        { label: "Idea relations", content: product.ideaRelations.map((relation) => `${relation.ideaId}: ${relation.relationType}${relation.rationale ? ` (${relation.rationale})` : ""}`).join("\n") || "none" },
        { label: "ITB curation", content: product.itbCuration.map((entry) => `${entry.referenceId}: ${entry.curatorNote}`).join("\n") },
      ];
    case "solution":
      return [{ label: "solution", content: unwrapText(product.content) }];
    case "flashcard_set":
      return [{ label: "cards", content: product.cards.join(", ") }];
    case "flashcard":
      return [
        { label: "front", content: unwrapText(product.front) },
        { label: "back", content: unwrapText(product.back) },
        ...(product.explanation ? [{ label: "explanation", content: unwrapText(product.explanation) }] : []),
      ];
    case "assessment_blueprint":
      return [
        { label: "scope", content: `${product.assessmentType}: ${product.chapterIds.join(", ")}` },
        { label: "questions", content: product.questionIds.join(", ") },
      ];
  }
}

export function previewProduct(product: ProductEntity): ProductPreview {
  return {
    id: product.id,
    productType: product.productType,
    version: product.version,
    status: product.status,
    title: titleOf(product),
    traceability: { ideaIds: product.ideaLinks.map((link) => link.id), sourceIds: product.sourceRefs.map((source) => source.sourceId) },
    sections: sectionsOf(product),
  };
}

export function previewProducts(products: readonly ProductEntity[]): readonly ProductPreview[] {
  return [...products].sort((left, right) => left.id.localeCompare(right.id) || left.version - right.version).map(previewProduct);
}
