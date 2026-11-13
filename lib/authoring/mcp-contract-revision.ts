import { z } from "zod";
import { createHash } from "node:crypto";
import { articlePartsSchema } from "@/lib/materials/article-parts";
import { authoredDiktatUnitsSchema } from "@/lib/materials/diktat-v4";
import { solutionCollectionSchema } from "@/lib/materials/solution-collection";
import { solutionReviewSchema } from "@/lib/solutions/review-contract";
import { solutionReviewRequestSchema } from "@/lib/authoring/solution-review-request";
import { visualSpecSchema } from "@/lib/materials/visual-contract";
import { productV4ReviewContextShape } from "@/lib/bundle/product-v4-review";
import { V4_SCIENTIFIC_PROSE_POLICY } from "@/lib/math/unmarked-scientific";
import { sourcePackManifestSchema } from "@/lib/authoring/source-pack";
import { ideaBundleManifestSchema, learningSectionSchema } from "@/lib/bundle/idea-bundle-v2";
import { ideaSchema, ideaProvenanceSchema, ideaRelationSchema } from "@/lib/ide/contracts";
import { sourceMaterialSchema, sourceChunkSchema } from "@/lib/sumber/contracts";
import { productBundleManifestSchema, productEntitySchema, productDependencySchema } from "@/lib/bundle/product-validator";
import { articleDocumentSchema } from "@/lib/materials/article-contract";
import { questionBankDraftSchema } from "@/lib/authoring/question-bank-draft";
import { referenceQuestionDraftSchema } from "@/lib/authoring/reference-question-draft";
import { pedagogicReviewDecisionSchema, QUALITY_POLICY_VERSION } from "@/lib/materials/quality-policy";
import { pdfArtifactEvidenceSchema } from "@/lib/materials/pdf-artifact-contract";

export const PRODUCT_V4_SCHEMA_NAMES = [
  "productBundleManifest", "product", "dependency", "articleParts", "diktatUnits",
  "visual", "pedagogicReview", "v4ReviewContext", "pdfEvidence",
] as const;

export function productV4SchemaDocuments() {
  const { schemas } = authoringValidationSnapshot();
  return PRODUCT_V4_SCHEMA_NAMES.map((name) => {
    const body = JSON.stringify(schemas[name]);
    const sha256 = createHash("sha256").update(body).digest("hex");
    return { name, body, sha256, bytes: Buffer.byteLength(body),
      path: `/api/authoring/contracts/product-v4?schema=${name}&sha256=${sha256}` };
  });
}

export const PRODUCT_V5_SCHEMA_NAMES = [
  "productBundleManifest", "product", "dependency", "solutionCollection", "solutionReview", "solutionReviewRequest", "articleParts", "visual",
] as const;

export function productV5SchemaDocuments() {
  const { schemas } = authoringValidationSnapshot();
  return PRODUCT_V5_SCHEMA_NAMES.map((name) => {
    const body = JSON.stringify(schemas[name]);
    const sha256 = createHash("sha256").update(body).digest("hex");
    return { name, body, sha256, bytes: Buffer.byteLength(body),
      path: `/api/authoring/contracts/product-v5?schema=${name}&sha256=${sha256}` };
  });
}

export function authoringValidationSnapshot() {
  const schemas = {
    sourcePackManifest: sourcePackManifestSchema,
    ideaBundleManifest: ideaBundleManifestSchema,
    learningSection: learningSectionSchema,
    idea: ideaSchema,
    provenance: ideaProvenanceSchema,
    relation: ideaRelationSchema,
    sourceMaterial: sourceMaterialSchema,
    sourceChunk: sourceChunkSchema,
    productBundleManifest: productBundleManifestSchema,
    product: productEntitySchema,
    dependency: productDependencySchema,
    article: articleDocumentSchema,
    quizDraft: questionBankDraftSchema,
    referenceDraft: referenceQuestionDraftSchema,
    pedagogicReview: pedagogicReviewDecisionSchema,
    pdfEvidence: pdfArtifactEvidenceSchema,
    articleParts: articlePartsSchema,
    diktatUnits: authoredDiktatUnitsSchema,
    solutionCollection: solutionCollectionSchema,
    solutionReview: solutionReviewSchema,
    solutionReviewRequest: solutionReviewRequestSchema,
    visual: visualSpecSchema,
    v4ReviewContext: z.object(productV4ReviewContextShape).strict(),
  };
  return {
    // shortcut: custom refinements are not representable in JSON Schema, bump the policy version when changing semantic validation.
    qualityPolicyVersion: QUALITY_POLICY_VERSION,
    v4ScientificProsePolicy: V4_SCIENTIFIC_PROSE_POLICY,
    schemas: Object.fromEntries(Object.entries(schemas).map(([key, schema]) => [
      key, z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }),
    ])),
  };
}
