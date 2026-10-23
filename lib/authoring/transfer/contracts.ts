import { createHash } from "node:crypto";
import { z } from "zod";

export const TRANSFER_PROTOCOL = "authoring-transfer.v1";
export const TRANSFER_SCOPES = ["authoring:transfer:source", "authoring:transfer:read", "authoring:transfer:execute"] as const;
export const TRANSFER_LIMITS = { artifacts: 100, entities: 500, artifactBytes: 32 * 1024 * 1024, totalBytes: 512 * 1024 * 1024 } as const;
export const transferId = z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/);
export const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const selectorSchema = z.object({ kind: z.enum(["idea", "product"]), importId: transferId, expectedChecksum: digest }).strict();
export const grantInputSchema = z.object({ targetPeerId: transferId, selector: selectorSchema }).strict();
export const planInputSchema = z.object({ sourcePeerId: transferId, sourceGrant: z.string().min(1).max(16000) }).strict();
export const executeInputSchema = z.object({ planToken: z.string().min(1).max(128000), idempotencyKey: transferId }).strict();
export const entitySchema = z.object({ type: z.enum(["idea", "source_material", "source_chunk", "product", "learning_section"]), id: z.string().min(1).max(300), version: z.number().int().positive(), hash: digest }).strict();
export type TransferEntity = z.infer<typeof entitySchema>;
export const referenceSchema = z.object({ type: z.enum(["source_chunk", "learning_section"]), id: z.string().min(1).max(300) }).strict();
export const artifactSchema = z.object({ id: transferId, kind: z.enum(["idea", "product"]), bundleId: z.string().min(1).max(300), checksum: digest,
  byteHash: digest, byteLength: z.number().int().positive().max(TRANSFER_LIMITS.artifactBytes), courseId: z.string().min(1).max(300),
  schemaVersion: z.string().max(100), entities: z.array(entitySchema).max(TRANSFER_LIMITS.entities), requirements: z.array(entitySchema).max(TRANSFER_LIMITS.entities),
  creators: z.array(z.string().min(1).max(300)).max(TRANSFER_LIMITS.entities), chapters: z.array(z.string().min(1).max(300)).max(TRANSFER_LIMITS.entities),
  references: z.array(referenceSchema).max(TRANSFER_LIMITS.entities).default([]),
  attributionActorId: z.string().optional(),
}).strict();
export type TransferArtifact = z.infer<typeof artifactSchema>;
export const inventorySchema = z.object({ protocol: z.literal(TRANSFER_PROTOCOL), rootId: transferId,
  artifacts: z.array(artifactSchema).min(1).max(TRANSFER_LIMITS.artifacts), closureHash: digest }).strict();
export type TransferInventory = z.infer<typeof inventorySchema>;
export type TransferState = "queued" | "running" | "waiting_prerequisites" | "retry_wait" | "blocked" | "completed" | "cancelled" | "failed";
export type TransferIssue = { code: string; itemId?: string };

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
export function sha256(value: string | Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
export function entityKey(entity: Pick<TransferEntity, "type" | "id">): string { return `${entity.type}:${entity.id}`; }
export function sameEntity(a: TransferEntity, b: TransferEntity): boolean { return a.type === b.type && a.id === b.id && a.version === b.version && a.hash === b.hash; }
export function fail(code: string): never { throw new Error(code); }
export function errorCode(error: unknown): string {
  const code = error instanceof Error ? error.message.split(":")[0] : "TRANSFER_FAILED";
  return /^(TRANSFER_|PLAN_|SOURCE_|DEPENDENCY_|IDENTITY_|GRANT_|CHECKSUM_|ASSET_|PEER_)[A-Z_]+$/.test(code) ? code : "TRANSFER_FAILED";
}
export function validateInventory(value: unknown): TransferInventory {
  const inventory = inventorySchema.parse(value);
  if (!inventory.artifacts.some(a => a.id === inventory.rootId)) fail("TRANSFER_ROOT_MISSING");
  if (new Set(inventory.artifacts.map(a => a.id)).size !== inventory.artifacts.length) fail("TRANSFER_DUPLICATE_ARTIFACT");
  if (inventory.artifacts.reduce((n, a) => n + a.byteLength, 0) > TRANSFER_LIMITS.totalBytes) fail("TRANSFER_LIMIT_EXCEEDED");
  if (inventory.artifacts.reduce((n, a) => n + a.entities.length, 0) > TRANSFER_LIMITS.entities) fail("TRANSFER_LIMIT_EXCEEDED");
  if (sha256(stableJson(inventory.artifacts)) !== inventory.closureHash) fail("CHECKSUM_MISMATCH");
  const entities = new Map<string, TransferEntity>();
  for (const artifact of inventory.artifacts) for (const entity of artifact.entities) {
    const existing = entities.get(entityKey(entity));
    if (existing && !sameEntity(existing, entity)) fail("IDENTITY_CONFLICT");
    entities.set(entityKey(entity), entity);
  }
  for (const artifact of inventory.artifacts) for (const requirement of artifact.requirements) {
    const entity = entities.get(entityKey(requirement));
    if (!entity || !sameEntity(entity, requirement)) fail("DEPENDENCY_REVISION_UNAVAILABLE");
  }
  for (const artifact of inventory.artifacts) for (const reference of artifact.references) if (!entities.has(entityKey(reference))) fail("DEPENDENCY_REVISION_UNAVAILABLE");
  return inventory;
}
