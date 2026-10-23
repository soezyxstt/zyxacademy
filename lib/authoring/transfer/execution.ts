import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { authoringTransfer, authoringTransferItem, imporBundle } from "@/db/schema";
import { storage } from "@/lib/storage";
import { buildTransferArtifactKey } from "@/lib/storage/keys";
import { deadlineInSeconds } from "@/lib/date-utils";
import { validateIdeaBundleZip, serializeDeterministically } from "@/lib/bundle/idea-bundle-v2";
import { validateProductBundle } from "@/lib/bundle/product-validator";
import { stageIdeaBundle } from "@/lib/bundle/staging";
import { stageProductBundle } from "@/lib/bundle/product-staging";
import { evaluateProductBundleQualityPolicy } from "@/lib/bundle/product-review-gate";
import { artifactMatchesBytes } from "./bundles";
import { fail, sha256, stableJson, validateInventory, type TransferArtifact } from "./contracts";
import { capabilities, peerRequest, PeerUnavailableError, type TransferConfig } from "./security";
import { requireTransferActor } from "./source";
import { auditTransfer } from "./audit";
import { inspectTarget, grantFrom, remoteJson, readBoundedBytes } from "./destination";
type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function stageArtifact(artifact: TransferArtifact, bytes: Uint8Array, actorId: string, runId: string, fence: (tx: DatabaseTransaction) => Promise<void>, afterPersist: (tx: DatabaseTransaction, importId: string) => Promise<void>) {
  if (!artifactMatchesBytes(artifact, bytes)) fail("CHECKSUM_MISMATCH");
  if (artifact.kind === "idea") {
    const parsed = validateIdeaBundleZip(bytes); if (!parsed.success) fail("TRANSFER_BUNDLE_INVALID");
    const entities = parsed.data.entities;
    const items = [
      ...entities.sourceMaterials.map(e => ({ entityType: "source_material", entityId: e.id, entityVersion: e.version, entityHash: sha256(serializeDeterministically(e)) })),
      ...entities.sourceChunks.map(e => ({ entityType: "source_chunk", entityId: e.id, entityVersion: e.sourceVersion, entityHash: sha256(serializeDeterministically(e)) })),
      ...entities.ideas.map(e => ({ entityType: "idea", entityId: e.id, entityVersion: e.version, entityHash: sha256(serializeDeterministically(e)) })),
      ...entities.provenance.map(e => ({ entityType: "provenance", entityId: e.id, entityVersion: 1, entityHash: sha256(serializeDeterministically(e)) })),
      ...entities.relations.map(e => ({ entityType: "relation", entityId: e.id, entityVersion: e.version, entityHash: sha256(serializeDeterministically(e)) })),
      ...entities.learningSections.map(e => ({ entityType: "learning_section", entityId: e.id, entityVersion: 1, entityHash: sha256(serializeDeterministically(e)) })),
    ];
    return stageIdeaBundle({ runId, bundleId: artifact.bundleId, courseId: artifact.courseId, schemaVersion: 3, checksum: artifact.checksum, bytes, requestedBy: actorId,
      items, validationReport: { valid: true, reasonCodes: [], fileCount: parsed.data.files.size, entityCount: items.length, sourceCount: entities.sourceMaterials.length, relationCount: entities.relations.length, warnings: [] }, beforePersist: fence, afterPersist });
  }
  const parsed = validateProductBundle(bytes); if (!parsed.success) fail("TRANSFER_BUNDLE_INVALID");
  // Use the exact same traceability and dependency checks as publication before creating a draft.
  const { validateProductTransferPrerequisites } = await import("./prerequisites");
  await validateProductTransferPrerequisites(parsed.data);
  const quality = await evaluateProductBundleQualityPolicy({ bundle: parsed.data, dependencies: parsed.data.dependencies });
  if (!quality.valid) fail("TRANSFER_QUALITY_REVIEW_REQUIRED");
  return stageProductBundle({ runId, bundleId: artifact.bundleId, courseId: artifact.courseId, checksum: artifact.checksum, bytes, requestedBy: actorId,
    bundle: parsed.data, createOrReuseExact: true, beforePersist: async tx => { await fence(tx); await validateProductTransferPrerequisites(parsed.data, tx); }, afterPersist,
    qualityReport: quality as unknown as Record<string, unknown> });
}

export async function processTransfer(config: TransferConfig, id: string): Promise<void> {
  const rows = await db.update(authoringTransfer).set({ state: "running", stateVersion: sql`${authoringTransfer.stateVersion} + 1`, leaseUntil: deadlineInSeconds(600),
    attempts: sql`${authoringTransfer.attempts} + 1` }).where(and(eq(authoringTransfer.id, id),
    sql`${authoringTransfer.expiresAt} > ${Date.now()}`, sql`${authoringTransfer.leaseUntil} <= ${Date.now()}`,
    sql`${authoringTransfer.nextAttemptAt} <= ${Date.now()}`,
    sql`${authoringTransfer.state} IN ('queued', 'retry_wait', 'running')`)).returning();
  const row = rows[0]; if (!row) return;
  const version = row.stateVersion;
  async function fence(tx: typeof db | DatabaseTransaction = db) {
    const updated = await tx.update(authoringTransfer).set({ leaseUntil: deadlineInSeconds(600) }).where(and(eq(authoringTransfer.id, id), eq(authoringTransfer.stateVersion, version),
      eq(authoringTransfer.state, "running"), sql`${authoringTransfer.leaseUntil} > ${Date.now()}`, sql`${authoringTransfer.expiresAt} > ${Date.now()}`)).returning({ id: authoringTransfer.id });
    if (!updated.length) fail("TRANSFER_LEASE_LOST");
  }
  async function finish(state: string, reasonCode: string | null = null) {
    await db.transaction(async tx => {
      const changed = await tx.update(authoringTransfer).set({ state, reasonCode, leaseUntil: 0 }).where(and(eq(authoringTransfer.id, id), eq(authoringTransfer.stateVersion, version), eq(authoringTransfer.state, "running"))).returning({ id: authoringTransfer.id });
      if (changed.length) await auditTransfer(row.actorId, id, "transfer_checkpoint", { state, reasonCode, stateVersion: version }, tx);
    });
  }
  try {
    await requireTransferActor(row.actorId, row.sessionId);
    if (row.plan.policyHash !== sha256(stableJson(capabilities(config)))) fail("PLAN_STALE");
    const inventory = validateInventory(row.plan.inventory);
    const grant = await grantFrom(config, row.sourcePeerId, row.sealedGrant);
    const snap = await remoteJson(await peerRequest(config, grant.peer, "snapshots", { grantToken: grant.token, transferId: id }));
    if (validateInventory(snap.inventory).closureHash !== inventory.closureHash) fail("CHECKSUM_MISMATCH");
    for (const artifact of inventory.artifacts) {
      await fence();
      const key = buildTransferArtifactKey(id, artifact.byteHash);
      if (!storage.download) fail("TRANSFER_STORAGE_UNAVAILABLE");
      if (await storage.exists(key)) {
        if (sha256(await storage.download(key)) !== artifact.byteHash) fail("CHECKSUM_MISMATCH");
      } else {
        const response = await peerRequest(config, grant.peer, "artifact", { grantToken: grant.token, transferId: id, artifactId: artifact.id });
        const bytes = await readBoundedBytes(response, artifact.byteLength);
        if (bytes.length !== artifact.byteLength || sha256(bytes) !== artifact.byteHash) fail("CHECKSUM_MISMATCH");
        if (!artifactMatchesBytes(artifact, bytes)) fail("CHECKSUM_MISMATCH");
        await storage.upload(bytes, "bundle.zip", "application/zip", { key });
        if (sha256(await storage.download(key)) !== artifact.byteHash) fail("CHECKSUM_MISMATCH");
      }
      await db.update(authoringTransferItem).set({ state: "copied" }).where(and(eq(authoringTransferItem.transferId, id), eq(authoringTransferItem.artifactId, artifact.id), eq(authoringTransferItem.state, "pending")));
    }
    let waiting = false;
    for (const artifact of inventory.artifacts) {
      await requireTransferActor(row.actorId, row.sessionId); await fence();
      await peerRequest(config, grant.peer, "inspect", { grantToken: grant.token, transferId: id });
      const target = await inspectTarget(inventory);
      if (target.issues.length) fail(target.issues[0].code);
      const [item] = await db.select().from(authoringTransferItem).where(and(eq(authoringTransferItem.transferId, id), eq(authoringTransferItem.artifactId, artifact.id))).limit(1);
      const [existing] = await db.select().from(imporBundle).where(eq(imporBundle.bundleId, artifact.bundleId)).limit(1);
      if (existing) {
        if (existing.checksum !== artifact.checksum || ["withdrawn", "discarding", "rejected"].includes(existing.status)) fail("IDENTITY_CONFLICT");
        if (!storage.download || !artifactMatchesBytes(artifact, await storage.download(existing.sourceUriOrKey))) fail("CHECKSUM_MISMATCH");
        if (artifact.attributionActorId && existing.requestedBy !== artifact.attributionActorId) fail("IDENTITY_ATTRIBUTION_MAPPING_REQUIRED");
        await db.update(authoringTransferItem).set({ state: "materialized", targetImportId: existing.id }).where(and(eq(authoringTransferItem.transferId, id), eq(authoringTransferItem.artifactId, artifact.id)));
        continue;
      }
      if (item.state === "materialized") fail("PLAN_STALE");
      try {
        const bytes = await storage.download!(item.quarantineKey);
        const result = await stageArtifact(artifact, bytes, row.actorId, id, async tx => { await fence(tx); const checked = await inspectTarget(inventory, tx); if (checked.issues.length) fail(checked.issues[0].code); }, async (tx, importId) => {
          await tx.update(authoringTransferItem).set({ state: "materialized", targetImportId: importId, owned: true }).where(and(eq(authoringTransferItem.transferId, id), eq(authoringTransferItem.artifactId, artifact.id)));
        });
        // A stager may reuse an exact import created concurrently. Its ownership belongs to that creator.
        if (!result.created) await db.transaction(async tx => {
          await fence(tx);
          await tx.update(authoringTransferItem).set({ state: "materialized", targetImportId: result.importId }).where(and(eq(authoringTransferItem.transferId, id), eq(authoringTransferItem.artifactId, artifact.id)));
        });
      } catch (error) {
        if (error instanceof Error && error.message === "DEPENDENCY_NOT_PUBLISHED") { waiting = true; continue; }
        throw error;
      }
    }
    await fence();
    const items = await db.select().from(authoringTransferItem).where(eq(authoringTransferItem.transferId, id));
    await db.update(authoringTransfer).set({ receipt: { sourceEnvironment: row.sourcePeerId, targetEnvironment: config.identity.id, closureHash: inventory.closureHash,
      rootId: inventory.rootId, mode: "draft_only", checkpointAt: new Date().toISOString(), ...(!waiting ? { completedAt: new Date().toISOString() } : {}), items: items.map(i => ({ artifactId: i.artifactId, targetImportId: i.targetImportId, state: i.state, owned: i.owned })) } })
      .where(and(eq(authoringTransfer.id, id), eq(authoringTransfer.stateVersion, version), eq(authoringTransfer.state, "running")));
    await finish(waiting ? "waiting_prerequisites" : "completed", waiting ? "DEPENDENCY_NOT_PUBLISHED" : null);
  } catch (error) {
    const { errorCode } = await import("./contracts");
    const code = errorCode(error);
    if (code === "TRANSFER_LEASE_LOST") return;
    if (code === "PEER_TEMPORARILY_UNAVAILABLE" && row.attempts < 5) {
      const backoff = Math.min(300, 10 * 2 ** row.attempts + Math.floor(Math.random() * 10));
      await db.update(authoringTransfer).set({ state: "retry_wait", leaseUntil: 0, reasonCode: code, nextAttemptAt: deadlineInSeconds(Math.max(backoff, error instanceof PeerUnavailableError ? error.retryAfter : 0)) })
        .where(and(eq(authoringTransfer.id, id), eq(authoringTransfer.stateVersion, version), eq(authoringTransfer.state, "running")));
    } else await finish(code === "PEER_TEMPORARILY_UNAVAILABLE" ? "failed" : "blocked", code);
  }
}
