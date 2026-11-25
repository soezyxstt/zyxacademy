import type { ProductDraftInput } from "@/lib/authoring/product-draft-builder";
import { buildLocalVerificationFixture } from "./local-verification-fixture";
import { machine } from "../../tests/visual/fixtures/interactive-scene-data";
import { visualSpecSchema } from "@/lib/materials/visual-contract";

/** Synthetic, source-controlled content. Never loads a course or learner account. */
export function createDraftPreviewExample(long = false): ProductDraftInput {
  const result: ProductDraftInput = { products: buildLocalVerificationFixture().bundle.products.flatMap<ProductDraftInput["products"][number]>(product => {
    if (product.productType !== "article" && product.productType !== "diktat") return [];
    const common = { id: product.id, title: "title" in product ? product.title : "", ideaIds: product.ideaLinks.map(idea => idea.id), sourceRefs: product.sourceRefs.map(({ sourceId, excerptIds }) => ({ sourceId, excerptIds })), visuals: product.visuals };
    if (product.productType === "article") return [{ ...common, productType: "article", slug: product.slug,
      sections: product.sections.map(({ orderIndex: _order, sourceRefs: _sources, ...section }) => ({ ...section,
        blocks: section.blocks.map(({ orderIndex: _index, contentMarkdown: _markdown, visualIds: _visuals, sourceRefs: _blockSources, ideaIds: _ideas, ...block }) => ({ ...block,
          parts: block.parts!.map(part => long && part.kind === "markdown" && block.blockType === "explanation" ? { ...part, markdown: Array.from({ length: 8 }, () => part.markdown).join("\n\n") } : part),
        })),
      })),
    }];
    if (product.productType === "diktat") return [{ ...common, productType: "diktat", sourceArticleId: product.sourceArticleId,
      units: product.units!.map(unit => ({ ...unit, parts: unit.parts.map(part => {
        if (part.kind !== "visual_ref") return part;
        const { staticSnapshot: _snapshot, ...editable } = part;
        return editable;
      }) })),
    }];
    return [];
  }) };
  if (long) {
    const article = result.products.find(product => product.productType === "article");
    if (article?.productType === "article") {
      const visual = visualSpecSchema.parse(machine("preview_offscreen_scene", "Susunan persegi"));
      article.visuals = [...article.visuals ?? [], visual];
      article.sections.at(-1)!.blocks.at(-1)!.parts.push({ id: "preview-offscreen-part", kind: "visual_ref", visualId: visual.id });
    }
  }
  return result;
}
