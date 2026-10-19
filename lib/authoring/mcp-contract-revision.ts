import { z } from "zod";
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
  };
  return {
    // shortcut: custom refinements are not representable in JSON Schema, bump the policy version when changing semantic validation.
    qualityPolicyVersion: QUALITY_POLICY_VERSION,
    schemas: Object.fromEntries(Object.entries(schemas).map(([key, schema]) => [
      key, z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }),
    ])),
  };
}
