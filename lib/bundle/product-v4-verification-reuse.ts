import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { buildProductVerificationReuseKey } from "@/lib/storage/keys";
import { deterministicProductSerialization } from "./product-validator";
import { formativeDocumentFields, type ProductV4ObservedCheck, type ProductV4VerificationAuthority, type ProductV4VerificationPlan, type ProductV4VerificationRequirement } from "./product-v4-verification";
import { productV4VerificationBatchKey, readProductV4VerificationCheckpoint, type ProductV4VerificationBatchScope } from "./product-v4-verification-checkpoint";
import type { ProductV4VerificationSnapshot } from "./product-v4-verification-core";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const scopeSchema = z.object({
  origin: z.enum(["https://staging.zyxacademy.com", "https://www.zyxacademy.com", "https://zyxacademy.com"]),
  courseId: z.string().min(1).max(500), rootImportId: z.string().min(1).max(500),
  inputHash: hash, runtimeHash: hash, checkId: hash,
  captureOffset: z.number().int().min(0).max(299), captureLimit: z.number().int().min(1).max(300).nullable(),
}).strict();
type ReuseScope = z.infer<typeof scopeSchema>;
const sourceScopeSchema = z.object({ planHash: hash, stagingAuditId: z.string().min(1).max(500), checkId: hash, captureOffset: z.number().int().min(0).max(299), captureLimit: z.number().int().min(1).max(300).nullable() }).strict();
const proofSchema = z.object({ schema: z.literal("product-v4-reuse-proof.v1"), scope: scopeSchema, sourceScope: sourceScopeSchema, checkpoint: z.unknown(), executorId: z.string().min(1).max(500), signature: hash }).strict();
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const digest = (value: unknown) => createHash("sha256").update(deterministicProductSerialization(value)).digest("hex");

/** The signed observation binds the complete PDF bytes and bounded page count. */
export function hasCompleteProductV4PrintCapture(proof: ProductV4ObservedCheck | null): proof is ProductV4ObservedCheck {
  if (!proof || proof.status !== "PASS" || !proof.pageCount || !Number.isInteger(proof.pageCount) || proof.pageCount < 1 || proof.pageCount > 4) return false;
  const pdfs = proof.artifacts.filter(artifact => artifact.mediaType === "application/pdf");
  return pdfs.length === 1 && pdfs[0].bytes.byteLength > 5 && Buffer.from(pdfs[0].bytes.subarray(0, 5)).toString() === "%PDF-";
}

/** Structure and dependency admission always run against the complete current bundle. */
export function productV4ReuseScope(snapshot: ProductV4VerificationSnapshot, plan: ProductV4VerificationPlan, requirement: ProductV4VerificationRequirement, captureOffset: number, captureLimit: number | null): ReuseScope | null {
  if (requirement.layer === "structure" || !plan.binding.executionOrigin || !plan.binding.targetInputHashes) return null;
  if (plan.binding.purpose === "pdf" && (!plan.binding.browserProvider || !plan.binding.browserVersion)) return null;
  if ((plan.binding.purpose ?? "logic") === "logic" && !plan.binding.logicChecksum) return null;
  const candidates = snapshot.bundle.products.filter(product => (product.productType === "article" || product.productType === "diktat") &&
    (product.id === requirement.target || (product.visuals ?? []).some(visual => `${product.id}/${visual.id}` === requirement.target) || formativeDocumentFields([product]).some(field => field.target === requirement.target)));
  if (candidates.length !== 1) return null;
  const inputHash = plan.binding.targetInputHashes[candidates[0].id];
  if (!inputHash) return null;
  const lineage = snapshot.importState.validationReport.revisionLineage as { schema?: unknown; rootImportId?: unknown } | undefined;
  const rootImportId = lineage?.schema === "authoring-revision.v1" && typeof lineage.rootImportId === "string" ? lineage.rootImportId : snapshot.importId;
  const { importId: _import, runId: _run, revision: _revision, dependencyChecksum: _dependencies, assetChecksum: _assets, targetInputHashes: _targets, ...runtime } = plan.binding;
  const result = scopeSchema.safeParse({ origin: plan.binding.executionOrigin, courseId: plan.binding.courseId, rootImportId, inputHash, runtimeHash: digest(runtime), checkId: requirement.id, captureOffset, captureLimit });
  return result.success ? result.data : null;
}

export function productV4ReuseKey(scope: ReuseScope) {
  return buildProductVerificationReuseKey(digest(scopeSchema.parse(scope)));
}

function sign(body: unknown, authority: ProductV4VerificationAuthority) {
  if (Buffer.byteLength(authority.signingKey) < 32) throw new Error("PRODUCT_V4_VERIFICATION_KEY_INVALID");
  return createHmac("sha256", authority.signingKey).update("zyx-product-v4-reuse-proof\n").update(deterministicProductSerialization(body)).digest("hex");
}

/** Only the application executor calls this after persisting an actual passing check. */
export function issueProductV4ReuseProof(scope: ReuseScope, sourceScope: ProductV4VerificationBatchScope, checkpoint: Uint8Array, authority: ProductV4VerificationAuthority): Uint8Array {
  const body = { schema: "product-v4-reuse-proof.v1" as const, scope: scopeSchema.parse(scope), sourceScope: sourceScopeSchema.parse(sourceScope), checkpoint: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(checkpoint)), executorId: authority.executorId };
  return encode({ ...body, signature: sign(body, authority) });
}

export async function readProductV4ReuseProof(input: { scope: ReuseScope; requirement: ProductV4VerificationRequirement; authority: ProductV4VerificationAuthority; read(key: string): Promise<Uint8Array | null> }) {
  const bytes = await input.read(productV4ReuseKey(input.scope));
  if (!bytes || bytes.byteLength > 5 * 1024 * 1024) return null;
  let proof: z.infer<typeof proofSchema>;
  try { proof = proofSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))); }
  catch { return null; }
  const { signature, ...body } = proof;
  if (body.executorId !== input.authority.executorId || digest(body.scope) !== digest(input.scope) ||
    body.sourceScope.checkId !== input.scope.checkId || body.sourceScope.captureOffset !== input.scope.captureOffset || body.sourceScope.captureLimit !== input.scope.captureLimit ||
    !timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(sign(body, input.authority), "hex"))) return null;
  const checkpointKey = productV4VerificationBatchKey(body.sourceScope);
  // The original signed checkpoint validates exact artifact names, complete capture
  // batches, PASS status, and reads and hashes every artifact before reuse.
  return readProductV4VerificationCheckpoint({ scope: body.sourceScope, requirement: input.requirement, authority: input.authority,
    read: key => key === checkpointKey ? Promise.resolve(encode(body.checkpoint)) : input.read(key) });
}
