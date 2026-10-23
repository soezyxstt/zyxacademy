import { randomUUID } from "node:crypto";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { authoringTransferGrant, imporBundle, itemImporBundle } from "@/db/schema";
import { storage } from "@/lib/storage";
import { buildTransferArtifactKey } from "@/lib/storage/keys";
import { deadlineInSeconds } from "@/lib/date-utils";
import { resolveMcpAdmin } from "@/lib/authoring/mcp-auth";
import { hasAdminAuthorization } from "@/lib/auth/role-authorization";
import { bindSourceAttribution, describeBundle, resolveClosure } from "./bundles";
import { fail, grantInputSchema, sha256, stableJson, validateInventory, type TransferArtifact, type TransferEntity } from "./contracts";
import { auditTransfer } from "./audit";
import { peerFor, sealFor, signToken, type TransferConfig } from "./security";

export async function requireTransferActor(actorId: string, sessionId: string) {
  try {
    const principal = await resolveMcpAdmin({ userId: actorId, sessionId, scopes: [], authMethod: "session" });
    if (!await hasAdminAuthorization(actorId)) fail("GRANT_REVOKED");
    return principal;
  }
  catch { fail("GRANT_REVOKED"); }
}
export async function readSourceArtifact(id: string, expectedChecksum?: string) {
  const [row] = await db.select().from(imporBundle).where(eq(imporBundle.id, id)).limit(1);
  if (!row || !["idea", "product"].includes(row.bundleType) || ["withdrawn", "discarding", "rejected", "received"].includes(row.status)) fail("SOURCE_ARTIFACT_UNAVAILABLE");
  if (expectedChecksum && row.checksum !== expectedChecksum) fail("SOURCE_REVISION_CHANGED");
  if (!storage.download) fail("TRANSFER_STORAGE_UNAVAILABLE");
  const bytes = await storage.download(row.sourceUriOrKey);
  const artifact = bindSourceAttribution(describeBundle(id, row.bundleType as "idea" | "product", bytes), bytes, row.requestedBy);
  if (row.bundleId !== artifact.bundleId || row.checksum !== artifact.checksum) fail("SOURCE_REVISION_CHANGED");
  return { artifact, bytes };
}
async function producerFor(entity: Pick<TransferEntity, "type" | "id"> & Partial<Pick<TransferEntity, "version" | "hash">>): Promise<TransferArtifact> {
  const rows = await db.select({ importId: itemImporBundle.imporBundleId }).from(itemImporBundle)
    .where(and(entity.type === "product" ? inArray(itemImporBundle.entityType, ["article", "diktat", "flashcard_set", "flashcard"]) : eq(itemImporBundle.entityType, entity.type), eq(itemImporBundle.entityId, entity.id), entity.version ? eq(itemImporBundle.entityVersion, entity.version) : undefined)).limit(101);
  if (rows.length > 100) fail("TRANSFER_LIMIT_EXCEEDED");
  for (const { importId } of rows.sort((a, b) => a.importId.localeCompare(b.importId))) {
    try {
      const { artifact } = await readSourceArtifact(importId);
      if (artifact.entities.some(e => e.type === entity.type && e.id === entity.id && (!entity.version || e.version === entity.version) && (!entity.hash || e.hash === entity.hash))) return artifact;
    } catch (error) { if (error instanceof Error && error.message === "TRANSFER_LIMIT_EXCEEDED") throw error; }
  }
  fail("DEPENDENCY_REVISION_UNAVAILABLE");
}
export async function createSourceGrant(config: TransferConfig, actor: { actorId: string; sessionId: string }, input: unknown) {
  await requireTransferActor(actor.actorId, actor.sessionId);
  const parsed = grantInputSchema.parse(input);
  const peer = peerFor(config, parsed.targetPeerId, "destination");
  const root = await readSourceArtifact(parsed.selector.importId, parsed.selector.expectedChecksum);
  if (root.artifact.kind !== parsed.selector.kind) fail("TRANSFER_SCOPE_MISMATCH");
  const inventory = await resolveClosure(root.artifact, producerFor, producerFor);
  const id = `grant-${randomUUID()}`;
  await db.transaction(async tx => {
    await tx.insert(authoringTransferGrant).values({ id, actorId: actor.actorId, sessionId: actor.sessionId, targetPeerId: peer.id,
      inventory: inventory as unknown as Record<string, unknown>, claimUntil: deadlineInSeconds(900), expiresAt: deadlineInSeconds(86400) });
    await auditTransfer(actor.actorId, id, "source_grant_created", { targetPeerId: peer.id, closureHash: inventory.closureHash, artifactCount: inventory.artifacts.length }, tx);
  });
  const token = await signToken(config, "source-grant", peer.id, { grantId: id, closureHash: inventory.closureHash }, 86400);
  return { grantId: id, sourceGrant: await sealFor(peer, token), claimExpiresAt: deadlineInSeconds(900), artifactCount: inventory.artifacts.length };
}
export async function revokeSourceGrant(id: string, actor: { actorId: string; sessionId: string }) {
  await requireTransferActor(actor.actorId, actor.sessionId);
  await db.transaction(async tx => {
    const rows = await tx.update(authoringTransferGrant).set({ revoked: true }).where(and(eq(authoringTransferGrant.id, id), eq(authoringTransferGrant.actorId, actor.actorId))).returning({ id: authoringTransferGrant.id });
    if (!rows.length) fail("GRANT_NOT_FOUND");
    await auditTransfer(actor.actorId, id, "source_grant_revoked", { revoked: true }, tx);
  });
  return { grantId: id, revoked: true };
}
export async function liveGrant(id: string, peerId: string, transferId?: string) {
  const [row] = await db.select().from(authoringTransferGrant).where(eq(authoringTransferGrant.id, id)).limit(1);
  if (!row || row.revoked || row.targetPeerId !== peerId || row.expiresAt <= Date.now()) fail("GRANT_REVOKED");
  if (!row.claimedTransferId && row.claimUntil <= Date.now()) fail("GRANT_EXPIRED");
  if (row.claimedTransferId && row.claimedTransferId !== transferId) fail("GRANT_ALREADY_CLAIMED");
  await requireTransferActor(row.actorId, row.sessionId);
  return { ...row, inventory: validateInventory(row.inventory) };
}
/** Claim is short. The destination job pins each exact artifact on demand before any content commit. */
export async function claimSnapshot(grantId: string, peerId: string, transferId: string) {
  await liveGrant(grantId, peerId, transferId);
  await db.update(authoringTransferGrant).set({ claimedTransferId: transferId, snapshotReady: true }).where(and(eq(authoringTransferGrant.id, grantId),
    or(sql`${authoringTransferGrant.claimedTransferId} IS NULL`, eq(authoringTransferGrant.claimedTransferId, transferId))));
  const grant = await liveGrant(grantId, peerId, transferId);
  return { inventory: grant.inventory };
}
export async function readSnapshotArtifact(grantId: string, peerId: string, transferId: string, artifactId: string) {
  const grant = await liveGrant(grantId, peerId, transferId);
  if (!grant.snapshotReady) fail("SOURCE_SNAPSHOT_NOT_READY");
  const descriptor = grant.inventory.artifacts.find(a => a.id === artifactId);
  if (!descriptor || !storage.download) fail("SOURCE_ARTIFACT_UNAVAILABLE");
  const key = buildTransferArtifactKey(grantId, descriptor.byteHash);
  if (!await storage.exists(key)) {
    const source = await readSourceArtifact(descriptor.id, descriptor.checksum);
    if (sha256(source.bytes) !== descriptor.byteHash || stableJson(source.artifact) !== stableJson(descriptor)) fail("SOURCE_REVISION_CHANGED");
    await liveGrant(grantId, peerId, transferId);
    await storage.upload(source.bytes, "bundle.zip", "application/zip", { key });
  }
  const bytes = await storage.download(key);
  if (bytes.length !== descriptor.byteLength || sha256(bytes) !== descriptor.byteHash) fail("CHECKSUM_MISMATCH");
  await liveGrant(grantId, peerId, transferId);
  return { descriptor, bytes };
}
