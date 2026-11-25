import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { buildProductVerificationCheckpointKey, buildProductVerificationKey } from "@/lib/storage/keys";
import { deterministicProductSerialization } from "./product-validator";
import { parseProductV4VerificationResult, type ProductV4ObservedCheck, type ProductV4VerificationAuthority, type ProductV4VerificationRequirement, type ProductV4VerificationResult } from "./product-v4-verification";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const scopeSchema = z.object({
  planHash: hash, stagingAuditId: z.string().min(1).max(500), checkId: hash,
  captureOffset: z.number().int().min(0).max(299), captureLimit: z.number().int().min(1).max(300).nullable(),
}).strict();
export type ProductV4VerificationBatchScope = z.infer<typeof scopeSchema>;
const checkpointSchema = scopeSchema.extend({
  schemaVersion: z.literal("product-v4-verification-checkpoint.v1"),
  sourceAttemptId: z.string().uuid(), executorId: z.string().min(1).max(500),
  result: z.unknown(), captureTotal: z.number().int().min(1).max(300).optional(), signature: hash,
}).strict();
interface CheckpointBody extends ProductV4VerificationBatchScope {
  schemaVersion: "product-v4-verification-checkpoint.v1";
  sourceAttemptId: string;
  executorId: string;
  result: ProductV4VerificationResult;
  captureTotal?: number;
}

function signature(body: CheckpointBody, authority: ProductV4VerificationAuthority): string {
  if (Buffer.byteLength(authority.signingKey) < 32) throw new Error("PRODUCT_V4_VERIFICATION_KEY_INVALID");
  return createHmac("sha256", authority.signingKey).update("zyx-product-v4-verification-checkpoint\n")
    .update(deterministicProductSerialization(body)).digest("hex");
}

export function productV4VerificationBatchKey(scope: ProductV4VerificationBatchScope): string {
  const valid = scopeSchema.parse(scope);
  const identity = createHash("sha256").update(deterministicProductSerialization(valid)).digest("hex");
  return buildProductVerificationCheckpointKey(valid.planHash, identity);
}

function reusable(body: CheckpointBody, requirement: ProductV4VerificationRequirement): boolean {
  const { result, captureOffset, captureLimit, captureTotal } = body;
  if (body.checkId !== requirement.id || result.checkId !== requirement.id || result.status !== "PASS" ||
    !result.artifacts.some(artifact => artifact.mediaType === requirement.artifactType)) return false;
  if (result.artifacts.some((artifact, index) => {
    const extension = artifact.mediaType === "image/png" ? "png" : artifact.mediaType === "application/pdf" ? "pdf" : "json";
    return artifact.id !== `artifact-${body.sourceAttemptId}-${requirement.id}-${captureOffset + index}.${extension}` || artifact.byteLength > 50 * 1024 * 1024;
  })) return false;
  if (requirement.layer === "web") {
    if (!captureLimit || result.artifacts.some(artifact => artifact.mediaType !== "image/png" && artifact.mediaType !== "application/json")) return false;
    // The browser runner also supports a complete capture with PNGs and JSON observations.
    // Only a declared captureTotal makes captureLimit a batch-size bound.
    if (captureTotal === undefined ? captureOffset !== 0 : result.artifacts.length > captureLimit || captureOffset + result.artifacts.length > captureTotal) return false;
  } else if (captureOffset !== 0 || captureLimit !== null || captureTotal !== undefined) return false;
  if (requirement.layer === "print") {
    if (!result.pageCount) return false;
    const pages = result.artifacts.filter(artifact => artifact.mediaType === "image/png");
    if ((requirement.artifactType === "image/png" || pages.length > 0) &&
      (pages.length !== result.pageCount || !Array.from({ length: result.pageCount }, (_, index) => index + 1).every(page => pages.some(artifact => artifact.pageNumber === page)))) return false;
    if (requirement.artifactType === "application/pdf" && result.artifacts.filter(artifact => artifact.mediaType === "application/pdf").length !== 1) return false;
  }
  return true;
}

/** Only call after an app-owned executor result has been persisted under its current attempt. */
export function issueProductV4VerificationCheckpoint(input: {
  scope: ProductV4VerificationBatchScope; requirement: ProductV4VerificationRequirement;
  sourceAttemptId: string; result: ProductV4VerificationResult;
}, authority: ProductV4VerificationAuthority): Uint8Array | null {
  const { captureTotal, ...result } = input.result;
  const candidate = checkpointSchema.safeParse({
    ...input.scope, schemaVersion: "product-v4-verification-checkpoint.v1", sourceAttemptId: input.sourceAttemptId,
    executorId: authority.executorId, result, ...(captureTotal === undefined ? {} : { captureTotal }), signature: "0".repeat(64),
  });
  if (!candidate.success) return null;
  const { signature: _signature, ...metadata } = candidate.data;
  const body: CheckpointBody = { ...metadata, result: parseProductV4VerificationResult(result) };
  if (!reusable(body, input.requirement)) return null;
  return new TextEncoder().encode(JSON.stringify({ ...body, signature: signature(body, authority) }));
}

/** Missing or damaged cache is a miss. Transport failures still fail the operation. */
export async function readProductV4VerificationCheckpoint(input: {
  scope: ProductV4VerificationBatchScope; requirement: ProductV4VerificationRequirement;
  authority: ProductV4VerificationAuthority; read(key: string): Promise<Uint8Array | null>;
}): Promise<ProductV4ObservedCheck | null> {
  const bytes = await input.read(productV4VerificationBatchKey(input.scope));
  if (!bytes || bytes.byteLength > 5 * 1024 * 1024) return null;
  let body: CheckpointBody;
  let storedSignature: string;
  try {
    const { signature: provided, ...metadata } = checkpointSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
    body = { ...metadata, result: parseProductV4VerificationResult(metadata.result) };
    storedSignature = provided;
  } catch { return null; }
  if (body.executorId !== input.authority.executorId ||
    Object.entries(input.scope).some(([key, value]) => body[key as keyof ProductV4VerificationBatchScope] !== value) ||
    !timingSafeEqual(Buffer.from(storedSignature, "hex"), Buffer.from(signature(body, input.authority), "hex")) ||
    !reusable(body, input.requirement)) return null;
  const artifacts: ProductV4ObservedCheck["artifacts"] = [];
  for (let start = 0; start < body.result.artifacts.length; start += 8) {
    const batch = await Promise.all(body.result.artifacts.slice(start, start + 8).map(async artifact => {
      const stored = await input.read(buildProductVerificationKey(body.planHash, artifact.id));
      if (!stored || stored.byteLength !== artifact.byteLength || createHash("sha256").update(stored).digest("hex") !== artifact.checksum) return null;
      return { id: artifact.id, mediaType: artifact.mediaType, bytes: stored, ...(artifact.pageNumber === undefined ? {} : { pageNumber: artifact.pageNumber }) };
    }));
    if (batch.some(artifact => artifact === null)) return null;
    artifacts.push(...batch as ProductV4ObservedCheck["artifacts"]);
  }
  return { ...body.result, artifacts, ...(body.captureTotal === undefined ? {} : { captureTotal: body.captureTotal }) };
}
