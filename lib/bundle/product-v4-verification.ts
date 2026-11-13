import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { deterministicProductSerialization, type ProductBundleManifest, type ProductDependency, type ProductEntity } from "./product-validator";
import { parseInteractiveDocumentsInMarkdown } from "@/lib/materials/interactive-document-markdown";
import { formativeAnswerForReveal } from "@/lib/materials/formative-check-answer";

export const PRODUCT_V4_VERIFICATION_POLICY = "product-v4-verification.v2";
export { CLOUDFLARE_VERIFICATION_BROWSER_VERSION as PRODUCT_V4_DEPLOYED_BROWSER_VERSION } from "@/lib/compute/product-v4-browser-config";
export const PRODUCT_V4_VIEWPORTS = [{ width: 380, height: 844 }, { width: 1536, height: 864 }] as const;
const digest = (value: unknown) => createHash("sha256").update(deterministicProductSerialization(value)).digest("hex");
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const name = z.string().trim().min(1).max(500);

export function formativeDocumentFields(products: readonly ProductEntity[]) {
  return products.flatMap(article => article.productType !== "article" ? [] : article.sections.flatMap(section => section.blocks.flatMap(block => {
    const payload = block.formativeCheckPayload;
    if (!payload) return [];
    const fields = [
      ...(block.parts ?? []).flatMap(part => part.kind === "markdown" ? [{ field: `prompt:${part.id}`, value: part.markdown }] : []),
      ...(payload.options ?? []).map((option, index) => ({ field: `option:${index}`, value: option.text })),
      { field: "answer", value: formativeAnswerForReveal(payload) },
      { field: "explanation", value: payload.explanation },
    ];
    return fields.flatMap(({ field, value }) => parseInteractiveDocumentsInMarkdown(value).map((spec, index) => ({
      target: `formative-document/${digest({ articleId: article.id, sectionId: section.id, blockId: block.id, field, index, spec })}`,
      article, section, block, field, value, spec, index,
    })));
  })));
}

export interface ProductV4VerificationBinding {
  importId: string;
  courseId: string;
  runId: string;
  revision: number;
  rendererChecksum: string;
  dependencyChecksum: string;
  contractChecksum: string;
  playbookChecksum: string;
  fontChecksum: string;
  assetChecksum: string;
  printProfile: string;
  policyRevision: string;
  browserVersion?: string;
  browserProvider?: "cloudflare" | "steel" | "local_playwright";
}
export interface ProductV4VerificationRequirement {
  id: string;
  target: string;
  layer: "structure" | "model" | "web" | "print";
  state: string;
  viewport: { width: number; height: number } | null;
  artifactType: "application/json" | "image/png" | "application/pdf";
}
export interface ProductV4VerificationPlan {
  schemaVersion: "product-v4-verification-plan.v1";
  binding: ProductV4VerificationBinding;
  contentHash: string;
  requirements: ProductV4VerificationRequirement[];
  planHash: string;
}

export function computeProductV4VerificationContentHash(bundle: {
  manifest: ProductBundleManifest; products: readonly ProductEntity[]; dependencies: readonly ProductDependency[];
}): string {
  return digest({ manifest: bundle.manifest, products: bundle.products, dependencies: bundle.dependencies });
}

/** Called with the server-loaded bundle and dependency closure, never a caller's matrix. */
export function deriveProductV4VerificationPlan(input: {
  bundle: { manifest: ProductBundleManifest; products: readonly ProductEntity[]; dependencies: readonly ProductDependency[] };
  binding: ProductV4VerificationBinding;
}): ProductV4VerificationPlan {
  const { bundle, binding } = input;
  if (bundle.manifest.schemaVersion !== "product-bundle.v4") throw new Error("PRODUCT_V4_REQUIRED");
  if (bundle.manifest.courseId !== binding.courseId) throw new Error("PRODUCT_V4_VERIFICATION_SCOPE_MISMATCH");
  z.object({ importId: name, courseId: name, runId: name, revision: z.number().int().positive(), rendererChecksum: sha256, dependencyChecksum: sha256, contractChecksum: sha256, playbookChecksum: sha256, fontChecksum: sha256, assetChecksum: sha256, printProfile: name, policyRevision: name, browserProvider: z.enum(["cloudflare", "steel", "local_playwright"]).optional(), browserVersion: z.string().regex(/^\d+\.\d+\.\d+\.\d+$/).optional() }).strict().parse(binding);
  const requirements: ProductV4VerificationRequirement[] = [];
  const add = (target: string, layer: ProductV4VerificationRequirement["layer"], state: string, viewport: ProductV4VerificationRequirement["viewport"], artifactType: ProductV4VerificationRequirement["artifactType"]) => {
    const check = { target, layer, state, viewport, artifactType };
    requirements.push({ id: digest(check), ...check });
  };
  add(bundle.manifest.bundleId, "structure", "contract-and-dependency-closure", null, "application/json");
  for (const product of bundle.products) {
    if (product.productType === "article") {
      for (const viewport of PRODUCT_V4_VIEWPORTS) {
        add(product.id, "web", "reading-order-and-math", viewport, "image/png");
        add(product.id, "web", "keyboard-and-text-zoom", viewport, "image/png");
      }
      for (const visual of product.visuals ?? []) {
        add(`${product.id}/${visual.id}`, "model", visual.kind === "interactive_document" ? "document-metadata-only-scientific-review-required" : "domain-units-and-model", null, "application/json");
        for (const viewport of PRODUCT_V4_VIEWPORTS) {
          add(`${product.id}/${visual.id}`, "web", "visual-smoke", viewport, "image/png");
        }
      }
      for (const field of formativeDocumentFields([product])) for (const viewport of PRODUCT_V4_VIEWPORTS) add(field.target, "web", "formative-document-field", viewport, "image/png");
    }
    if (product.productType === "diktat") {
      add(product.id, "print", "pdf-fonts-assets-lineage-and-pages", null, "application/pdf");
      add(product.id, "print", "every-page-rendering-and-overflow", null, "image/png");
    }
  }
  const contentHash = computeProductV4VerificationContentHash(bundle);
  const body = { schemaVersion: "product-v4-verification-plan.v1" as const, binding: { ...binding }, contentHash, requirements };
  return { ...body, planHash: digest(body) };
}

const artifactSchema = z.object({ id: name, checksum: sha256, mediaType: z.enum(["application/json", "image/png", "application/pdf"]), byteLength: z.number().int().positive(), pageNumber: z.number().int().min(1).max(4).optional() }).strict();
const resultSchema = z.object({ checkId: sha256, status: z.enum(["PASS", "FAIL", "NOT_TESTED"]), expected: name, observed: name, artifacts: z.array(artifactSchema).max(300), pageCount: z.number().int().min(1).max(4).optional() }).strict();
const receiptBodySchema = z.object({
  schemaVersion: z.literal("product-v4-verification-receipt.v1"),
  planHash: sha256,
  executorId: name,
  origin: z.enum(["server_observed", "local_runner_reported", "agent_asserted"]),
  results: z.array(resultSchema).max(10000),
}).strict();
const receiptSchema = receiptBodySchema.extend({ signature: sha256 }).strict();
export type ProductV4VerificationReceipt = z.infer<typeof receiptSchema>;
export function parseProductV4VerificationReceipt(value: unknown): ProductV4VerificationReceipt { return receiptSchema.parse(value); }
export function getProductV4VerificationReceiptSignature(value: unknown): string | null {
  const parsed = receiptSchema.safeParse(value);
  return parsed.success ? parsed.data.signature : null;
}
export type ProductV4VerificationResult = z.infer<typeof resultSchema> & { captureTotal?: number };
export interface ProductV4ObservedArtifact { id: string; mediaType: z.infer<typeof artifactSchema>["mediaType"]; bytes: Uint8Array; pageNumber?: number }
export interface ProductV4ObservedCheck {
  checkId: string;
  status: "PASS" | "FAIL" | "NOT_TESTED";
  expected: string;
  observed: string;
  artifacts: ProductV4ObservedArtifact[];
  pageCount?: number;
  captureTotal?: number;
}
export interface ProductV4VerificationAuthority { signingKey: string; executorId: string }

function sign(body: unknown, authority: ProductV4VerificationAuthority): string {
  if (Buffer.byteLength(authority.signingKey) < 32) throw new Error("PRODUCT_V4_VERIFICATION_KEY_INVALID");
  return createHmac("sha256", authority.signingKey).update("zyx-product-v4-verification\n").update(deterministicProductSerialization(body)).digest("hex");
}

function issue(plan: ProductV4VerificationPlan, checks: readonly (ProductV4ObservedCheck | ProductV4VerificationResult)[], origin: ProductV4VerificationReceipt["origin"], authority: ProductV4VerificationAuthority): ProductV4VerificationReceipt {
  assertPlanIntegrity(plan);
  const ids = new Set<string>();
  const results = checks.map(({ captureTotal: _captureTotal, ...check }) => {
    if (ids.has(check.checkId) || !plan.requirements.some((required) => required.id === check.checkId)) throw new Error("PRODUCT_V4_VERIFICATION_CHECK_INVALID");
    ids.add(check.checkId);
    return { ...check, artifacts: check.artifacts.map(artifact => {
      if (!("bytes" in artifact)) return artifactSchema.parse(artifact);
      const { id, mediaType, bytes, pageNumber } = artifact;
      if (bytes.length === 0 || bytes.length > 50 * 1024 * 1024) throw new Error("PRODUCT_V4_VERIFICATION_ARTIFACT_INVALID");
      if (mediaType === "image/png" && !Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error("PRODUCT_V4_VERIFICATION_ARTIFACT_INVALID");
      if (mediaType === "application/pdf" && Buffer.from(bytes.subarray(0, 5)).toString() !== "%PDF-") throw new Error("PRODUCT_V4_VERIFICATION_ARTIFACT_INVALID");
      if (mediaType === "application/json") {
        try { JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
        catch { throw new Error("PRODUCT_V4_VERIFICATION_ARTIFACT_INVALID"); }
      }
      return { id, mediaType, byteLength: bytes.length, checksum: createHash("sha256").update(bytes).digest("hex"), ...(pageNumber === undefined ? {} : { pageNumber }) };
    }) };
  });
  const body = receiptBodySchema.parse({ schemaVersion: "product-v4-verification-receipt.v1", planHash: plan.planHash, executorId: authority.executorId, origin, results });
  return { ...body, signature: sign(body, authority) };
}

/** The executor is application-owned. No MCP input may supply this callback or authority. */
export async function runProductV4Verification(plan: ProductV4VerificationPlan, authority: ProductV4VerificationAuthority, execute: (requirement: ProductV4VerificationRequirement) => Promise<ProductV4ObservedCheck | ProductV4VerificationResult>): Promise<ProductV4VerificationReceipt> {
  const checks: (ProductV4ObservedCheck | ProductV4VerificationResult)[] = [];
  for (const requirement of plan.requirements) {
    const observed = await execute(requirement);
    if (observed.checkId !== requirement.id) throw new Error("PRODUCT_V4_VERIFICATION_CHECK_INVALID");
    checks.push(observed);
  }
  return issue(plan, checks, "server_observed", authority);
}

/** Uploaded reports remain reported evidence even if their bytes and hashes are verified. */
export function recordProductV4VerificationReport(plan: ProductV4VerificationPlan, checks: readonly ProductV4ObservedCheck[], authority: ProductV4VerificationAuthority): ProductV4VerificationReceipt {
  return issue(plan, checks, "local_runner_reported", authority);
}

export function assertProductV4VerificationCurrent(expected: ProductV4VerificationPlan, current: ProductV4VerificationPlan): void {
  assertPlanIntegrity(expected);
  assertPlanIntegrity(current);
  if (expected.planHash !== current.planHash) throw new Error("PRODUCT_V4_VERIFICATION_CONFLICT");
}

function assertPlanIntegrity(plan: ProductV4VerificationPlan): void {
  const { planHash, ...body } = plan;
  if (digest(body) !== planHash) throw new Error("PRODUCT_V4_VERIFICATION_PLAN_INVALID");
}

export function evaluateProductV4Verification(plan: ProductV4VerificationPlan, receipts: readonly unknown[], authority: ProductV4VerificationAuthority): { ready: boolean; missingCheckIds: string[]; invalidReceiptCount: number } {
  assertPlanIntegrity(plan);
  const satisfied = new Set<string>();
  let invalidReceiptCount = 0;
  let trustedReceiptCount = 0;
  for (const input of receipts) {
    const parsed = receiptSchema.safeParse(input);
    if (!parsed.success) { invalidReceiptCount++; continue; }
    const { signature, ...body } = parsed.data;
    const signatureValid = timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(sign(body, authority), "hex"));
    if (!signatureValid || body.planHash !== plan.planHash || body.executorId !== authority.executorId) { invalidReceiptCount++; continue; }
    if (body.origin !== "server_observed") continue;
    trustedReceiptCount++;
    const ids = new Set<string>();
    let valid = true;
    for (const check of body.results) {
      if (ids.has(check.checkId) || !plan.requirements.some((required) => required.id === check.checkId)) valid = false;
      ids.add(check.checkId);
    }
    if (!valid) { invalidReceiptCount++; continue; }
    const printPageCounts = new Map<string, number>();
    for (const check of body.results) {
      const required = plan.requirements.find((requirement) => requirement.id === check.checkId)!;
      if (required.artifactType === "application/pdf" && check.pageCount) printPageCounts.set(required.target, check.pageCount);
    }
    for (const check of body.results) {
      const required = plan.requirements.find((requirement) => requirement.id === check.checkId)!;
      const pdfCount = required.artifactType !== "application/pdf" || Boolean(check.pageCount);
      const allPages = required.state !== "every-page-rendering-and-overflow" || Boolean(check.pageCount && check.pageCount === printPageCounts.get(required.target) && Array.from({ length: check.pageCount }, (_, index) => index + 1).every((page) => check.artifacts.some((artifact) => artifact.mediaType === "image/png" && artifact.pageNumber === page)));
      if (check.status === "PASS" && pdfCount && allPages && check.artifacts.some((artifact) => artifact.mediaType === required.artifactType)) satisfied.add(check.checkId);
    }
  }
  const missingCheckIds = plan.requirements.filter((check) => !satisfied.has(check.id)).map((check) => check.id);
  return { ready: trustedReceiptCount === 1 && invalidReceiptCount === 0 && missingCheckIds.length === 0, missingCheckIds, invalidReceiptCount };
}
