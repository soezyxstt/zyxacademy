import { buildProductVerificationKey } from "@/lib/storage/keys";
import { PRODUCT_DIKTAT_PRINT_PROFILE } from "@/lib/materials/diktat-renderer-policy";
import type { PdfArtifactEvidence } from "@/lib/materials/pdf-artifact-contract";
import { parseProductV4VerificationReceipt, type ProductV4VerificationPlan } from "./product-v4-verification";

export interface ProductV4PdfBinding {
  storageKey: string;
  printProfile: string;
  pageCount: number;
  checksum?: string;
  byteLength?: number;
}

type Verification = {
  plan: ProductV4VerificationPlan;
  attemptId?: string;
  stagingAuditId?: string;
  receipt?: unknown;
  evaluation: { ready: boolean };
};

/** The attachment is part of the import snapshot claimed by review and publication. */
export function isCurrentProductV4PdfAttachment(attachment: unknown, planHash: string, attemptId: string, receiptSignature: string): boolean {
  if (!attachment || typeof attachment !== "object" || !/^[a-f0-9]{64}$/.test(receiptSignature)) return false;
  const value = attachment as Record<string, unknown>;
  return value.planHash === planHash && value.attemptId === attemptId && value.receiptSignature === receiptSignature;
}

/** Resolve the one PDF artifact for this Diktat from the current trusted receipt. */
export function resolveProductV4PdfBinding(input: {
  importId: string;
  diktatId: string;
  validationReport: Record<string, unknown> | null | undefined;
  verification: Verification | null | undefined;
}): ProductV4PdfBinding | null {
  const { verification } = input;
  if (!verification?.evaluation.ready || !verification.attemptId) return null;
  const { plan, attemptId } = verification;
  const ref = input.validationReport?.productV4Verification as Record<string, unknown> | undefined;
  if (plan.binding.importId !== input.importId || !verification.stagingAuditId || ref?.stagingAuditId !== verification.stagingAuditId || ref.planHash !== plan.planHash || ref.attemptId !== attemptId || ref.runId !== plan.binding.runId) return null;
  try {
    const receipt = parseProductV4VerificationReceipt(verification.receipt);
    if (receipt.planHash !== plan.planHash || !isCurrentProductV4PdfAttachment(input.validationReport?.productV4PdfEvidence, plan.planHash, attemptId, receipt.signature)) return null;
    const requirements = plan.requirements.filter(check => check.layer === "print" && check.artifactType === "application/pdf" && check.target === input.diktatId);
    if (requirements.length !== 1) return null;
    const results = receipt.results.filter(result => result.checkId === requirements[0].id);
    const result = results[0];
    const artifacts = result?.artifacts.filter(artifact => artifact.mediaType === "application/pdf") ?? [];
    if (results.length !== 1 || result.status !== "PASS" || !result.pageCount || artifacts.length !== 1 || !artifacts[0].id.startsWith(`artifact-${attemptId}-`)) return null;
    return { storageKey: buildProductVerificationKey(plan.planHash, artifacts[0].id), printProfile: plan.binding.printProfile, pageCount: result.pageCount, checksum: artifacts[0].checksum, byteLength: artifacts[0].byteLength };
  } catch {
    return null;
  }
}

export interface ProductPdfSelectionInput {
  rows: readonly PdfArtifactEvidence[];
  imporBundleId?: string;
  articleId: string;
  diktatId?: string | null;
  articleVersion?: number | null;
  articleHash?: string | null;
  diktatHash?: string | null;
  /** Undefined is legacy; null means the required V4 receipt binding is absent. */
  v4Binding?: ProductV4PdfBinding | null;
}

/** Select one deterministic diagnostic candidate. The gate decides whether it passes. */
export function selectProductPdfEvidence(input: ProductPdfSelectionInput): PdfArtifactEvidence | null {
  const expectedDiktatHash = input.diktatId ? input.diktatHash : input.articleHash;
  const target = input.diktatId || input.articleId;
  const rows = input.rows.filter(row => (!input.imporBundleId || row.imporBundleId === input.imporBundleId));
  const owned = rows.filter(row => row.productId === target);
  // Legacy Article-owned evidence is allowed only if no Diktat-owned row exists.
  let candidates = owned.length || !input.diktatId || input.v4Binding !== undefined
    ? owned
    : rows.filter(row => row.productId === input.articleId);
  if (!input.diktatId) candidates = expectedDiktatHash ? candidates.filter(row => row.diktatHash === expectedDiktatHash) : [];
  if (input.v4Binding === undefined) {
    // Prefer the currently generated legacy profile once it has current-lineage
    // evidence. Its pending or failed retry must not be hidden by an older profile.
    // Imports that have never used this profile keep their legacy fallback.
    const currentProfile = candidates.filter(row => row.printProfile === PRODUCT_DIKTAT_PRINT_PROFILE
      && (!input.articleHash || row.articleHash === input.articleHash)
      && (!expectedDiktatHash || row.diktatHash === expectedDiktatHash)
      && (!input.articleVersion || row.articleVersion === input.articleVersion));
    if (currentProfile.length) candidates = currentProfile;
  }
  const score = (row: PdfArtifactEvidence) => {
    const article = !input.articleHash || row.articleHash === input.articleHash;
    const diktat = !expectedDiktatHash || row.diktatHash === expectedDiktatHash;
    const version = !input.articleVersion || row.articleVersion === input.articleVersion;
    const binding = input.v4Binding && row.storageKey === input.v4Binding.storageKey && row.printProfile === input.v4Binding.printProfile && row.pageCount === input.v4Binding.pageCount;
    return (article && diktat && version ? 32 : 0) + (binding ? 16 : 0) + (row.status === "ready" ? 8 : 0) + (article ? 4 : 0) + (diktat ? 2 : 0) + (version ? 1 : 0);
  };
  return [...candidates].sort((left, right) => score(right) - score(left) || left.printProfile.localeCompare(right.printProfile) || left.id.localeCompare(right.id))[0] ?? null;
}
