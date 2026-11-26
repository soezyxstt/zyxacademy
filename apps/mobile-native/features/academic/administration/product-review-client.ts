import { z } from "zod";
import { solutionCollectionSchema, type SolutionCollection } from "../../../../../lib/materials/solution-collection";
import type { AcademicTransport } from "../client";
import type { LiveProductBundle } from "../../../../../packages/native-parity/academic/administration/live";

const status = z.enum(["pending", "approved", "changes_requested"]);
const block = z.object({ id: z.string(), title: z.string().optional(), content: z.string().optional(),
  contentMarkdown: z.string().optional(), blockType: z.string(), orderIndex: z.number() }).passthrough();
const section = z.object({ id: z.string(), title: z.string(), orderIndex: z.number(), learningObjective: z.string(),
  blocks: z.array(block) }).passthrough();
const product = z.object({ id: z.string(), productType: z.string(), title: z.string().optional(),
  blocks: z.array(block).optional(), sections: z.array(section).optional(), visuals: z.array(z.object({ id: z.string() }).passthrough()).optional(),
}).passthrough();
export const anchor = z.object({ targetType: z.enum(["document", "section", "block", "visual"]), targetId: z.string() });
export const rubric = z.object({ criterionId: z.string(), reason: z.string(), status: z.enum(["met", "needs_revision", "not_met"]), contentAnchors: z.array(anchor) });
export type RubricItem = z.infer<typeof rubric>;
const ownReview = z.object({ status: z.string(), notes: z.string().nullable() });
const schema = z.object({
  bundle: z.object({ id: z.string(), bundleId: z.string(), courseId: z.string(), checksum: z.string(), status: z.enum(["draft","published","withdrawn"]), currentReview: ownReview.nullable() }),
  manifest: z.object({ schemaVersion: z.string() }), draft: z.object({ products: z.array(product) }),
  previews: z.array(z.object({ id: z.string(), title: z.string(), sections: z.array(z.object({ label: z.string(), content: z.string() })) })),
  blockReviews: z.array(z.object({ productId: z.string().nullable(), targetId: z.string().nullable(), targetType: z.string(), status, notes: z.string().nullable() })),
  publicationBlocked: z.boolean(), qualityEvaluation: z.object({ publicationReady: z.boolean() }),
  blockingIssues: z.array(z.object({ reason: z.string(), remediation: z.string() })).optional(),
  pdfStatuses: z.array(z.object({ productId: z.string().optional(), status: z.string(), revision: z.string().nullish() })).optional(),
  pedagogicReview: ownReview.extend({ criteria: z.array(rubric) }).nullable(),
  v4ReviewContext: z.object({ verificationReady: z.boolean(), verificationPlanHash: z.string().nullable(),
    verificationReceiptSignature: z.string().nullable() }).nullable(),
});
const contextSchema = z.object({ expectedRevision: z.string(), policyVersion: z.string(), contentFingerprint: z.string(),
  sections: z.array(z.object({ productId: z.string(), sectionId: z.string(), title: z.string(), semanticHash: z.string() })) });
export type ProductReviewData = z.infer<typeof schema> & { context: z.infer<typeof contextSchema> | null; solutionCollection?: SolutionCollection };
export type ReviewTarget = { targetType: "article_section" | "article_block"; targetId: string; productId: string; label: string; content: string };

export function reviewTargets(p: z.infer<typeof product>): ReviewTarget[] {
  const blocks = (rows: z.infer<typeof block>[]) => [...rows].sort((a, b) => a.orderIndex - b.orderIndex).map(row => ({
    productId: p.id, targetType: "article_block" as const, targetId: row.id,
    label: row.title ?? row.blockType, content: row.contentMarkdown ?? row.content ?? "",
  }));
  if (p.sections?.length) return [...p.sections].sort((a, b) => a.orderIndex - b.orderIndex).map(s => ({
    productId: p.id, targetType: "article_section", targetId: s.id, label: s.title,
    content: [s.learningObjective, ...blocks(s.blocks).map(b => b.content)].filter(Boolean).join("\n\n"),
  }));
  return blocks(p.blocks ?? []);
}
export function productPath(id: string) { return "/api/admin/bundles/product/" + encodeURIComponent(id); }
export const canPublishProduct = (data: ProductReviewData) => data.bundle.status === "draft"
  && (data.bundle.currentReview?.status ?? data.pedagogicReview?.status) === "approved"
  && !data.publicationBlocked && data.qualityEvaluation.publicationReady
  && !data.pdfStatuses?.some(p => p.revision === data.bundle.checksum && p.status === "pending");

export class ProductReviewError extends Error {
  constructor(readonly status: number) { super("Product review request failed"); }
}
export async function readProductReview(transport: AcademicTransport, scope: LiveProductBundle, signal: AbortSignal): Promise<ProductReviewData> {
  const path = productPath(scope.id);
  const response = await transport.get(path, signal);
  if (!response.ok) throw new ProductReviewError(response.status);
  const data = schema.parse(await response.json());
  if (data.bundle.id !== scope.id || data.bundle.courseId !== scope.courseId) throw new ProductReviewError(404);
  if (data.bundle.checksum !== scope.checksum) throw new ProductReviewError(409);
  if (data.manifest.schemaVersion === "product-bundle.v5") {
    const [product] = data.draft.products;
    const collection = solutionCollectionSchema.safeParse(product?.collection);
    if (data.draft.products.length !== 1 || product?.productType !== "solution_collection" || !collection.success ||
      !collection.data.items.length || collection.data.id !== product.id) throw new ProductReviewError(422);
    return { ...data, context: null, solutionCollection: collection.data };
  }
  const pedagogic = data.manifest.schemaVersion === "product-bundle.v4" || data.draft.products.some(p => p.productType === "article");
  if (!pedagogic) return { ...data, context: null };
  const extra = await transport.get(path + "/review", signal);
  if (!extra.ok) throw new ProductReviewError(extra.status);
  const context = contextSchema.parse(await extra.json());
  if (context.expectedRevision !== scope.checksum) throw new ProductReviewError(409);
  return { ...data, context };
}
