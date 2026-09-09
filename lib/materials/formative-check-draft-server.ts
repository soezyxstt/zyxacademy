import {
  getProductBundleImport,
  parseStagedProductBundle,
  productBundleLifecycleStatus,
} from "@/lib/bundle/product-staging";
import {
  formativeCheckPayloadSchema,
  type FormativeCheckPayload,
} from "@/lib/materials/pedagogy-contract";
import type { FormativeCheckLocator } from "@/lib/materials/formative-check-server";

export interface DraftFormativeCheckContext {
  article: {
    id: string;
    courseId: string;
    title: string;
    version: number;
  };
  section: {
    id: string;
    title: string;
    learningObjective: string;
  };
  block: {
    id: string;
    blockType: string;
    content: string;
  };
  formativeCheck: FormativeCheckPayload;
}

export type DraftFormativeCheckResolution =
  | { ok: true; context: DraftFormativeCheckContext }
  | {
      ok: false;
      code:
        | "BUNDLE_NOT_FOUND"
        | "DRAFT_REQUIRED"
        | "ARTICLE_NOT_FOUND"
        | "VERSION_MISMATCH"
        | "SECTION_NOT_FOUND"
        | "BLOCK_NOT_FOUND"
        | "BLOCK_NOT_FORMATIVE"
        | "PAYLOAD_INVALID";
    };

/**
 * Resolves one formative check directly from the validated staged Product Bundle.
 * This path is admin-review only. Learner evaluation continues to resolve only
 * canonical published Articles.
 */
export async function resolveDraftProductFormativeCheck(
  importId: string,
  locator: FormativeCheckLocator,
): Promise<DraftFormativeCheckResolution> {
  const row = await getProductBundleImport(importId);
  if (!row) return { ok: false, code: "BUNDLE_NOT_FOUND" };
  if (productBundleLifecycleStatus(row.status) !== "draft") {
    return { ok: false, code: "DRAFT_REQUIRED" };
  }

  const bundle = await parseStagedProductBundle(importId);
  const article = bundle.products.find(
    (candidate) => candidate.productType === "article" && candidate.id === locator.articleId,
  );
  if (!article || article.productType !== "article" || article.sections.length === 0) {
    return { ok: false, code: "ARTICLE_NOT_FOUND" };
  }
  if (article.version !== locator.articleVersion) {
    return { ok: false, code: "VERSION_MISMATCH" };
  }

  const section = article.sections.find((candidate) => candidate.id === locator.sectionId);
  if (!section) return { ok: false, code: "SECTION_NOT_FOUND" };

  const block = section.blocks.find((candidate) => candidate.id === locator.blockId);
  if (!block) return { ok: false, code: "BLOCK_NOT_FOUND" };
  if (block.blockType !== "retrieval_prompt" && block.blockType !== "retrieval_close") {
    return { ok: false, code: "BLOCK_NOT_FORMATIVE" };
  }

  const formativeCheck = formativeCheckPayloadSchema.safeParse(block.formativeCheckPayload);
  if (!formativeCheck.success) return { ok: false, code: "PAYLOAD_INVALID" };

  return {
    ok: true,
    context: {
      article: {
        id: article.id,
        courseId: article.courseId,
        title: article.title,
        version: article.version,
      },
      section: {
        id: section.id,
        title: section.title,
        learningObjective: section.learningObjective,
      },
      block: {
        id: block.id,
        blockType: block.blockType,
        content: block.contentMarkdown,
      },
      formativeCheck: formativeCheck.data,
    },
  };
}
