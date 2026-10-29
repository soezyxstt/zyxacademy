import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { authoringTransfer, authoringTransferGrant } from "@/db/schema";
import { storage } from "@/lib/storage";
import { buildTransferArtifactKey } from "@/lib/storage/keys";
import { deadlineInSeconds } from "@/lib/date-utils";
import { validateInventory } from "./contracts";

// A durable claim keeps cleanup retryable if object deletion is interrupted.
export const CLEANUP_CLAIM = "cleanup-in-progress";

/** Bounded, repeatable cleanup of transfer-owned objects. Normal bundle objects are never selected. */
export async function cleanupTransfers() {
  const quarantineCutoff = deadlineInSeconds(-7 * 86400);
  const metadataCutoff = deadlineInSeconds(-90 * 86400);
  const grants = await db.select().from(authoringTransferGrant).where(and(sql`${authoringTransferGrant.expiresAt} < ${deadlineInSeconds(-300)}`, eq(authoringTransferGrant.artifactsCleaned, false))).limit(100);
  for (const grant of grants) {
    for (const artifact of validateInventory(grant.inventory).artifacts) await storage.delete(buildTransferArtifactKey(grant.id, artifact.byteHash));
    await db.update(authoringTransferGrant).set({ snapshotReady: false, revoked: true, artifactsCleaned: true }).where(eq(authoringTransferGrant.id, grant.id));
  }
  const transfers = await db.select().from(authoringTransfer).where(and(sql`${authoringTransfer.expiresAt} < ${quarantineCutoff}`, sql`${authoringTransfer.state} IN ('completed','cancelled','blocked','failed')`, sql`${authoringTransfer.sealedGrant} != ''`)).limit(100);
  for (const transfer of transfers) {
    const claimed = await db.update(authoringTransfer).set({ sealedGrant: CLEANUP_CLAIM, stateVersion: sql`${authoringTransfer.stateVersion} + 1` })
      .where(and(eq(authoringTransfer.id, transfer.id), eq(authoringTransfer.stateVersion, transfer.stateVersion),
        eq(authoringTransfer.expiresAt, transfer.expiresAt), sql`${authoringTransfer.expiresAt} < ${quarantineCutoff}`,
        sql`${authoringTransfer.state} IN ('completed','cancelled','blocked','failed')`)).returning({ stateVersion: authoringTransfer.stateVersion });
    if (!claimed.length) continue;
    // Derive keys from validated descriptors, never trust a stored arbitrary path during deletion.
    for (const artifact of validateInventory(transfer.plan.inventory).artifacts) await storage.delete(buildTransferArtifactKey(transfer.id, artifact.byteHash));
    await db.update(authoringTransfer).set({ sealedGrant: "" }).where(and(eq(authoringTransfer.id, transfer.id), eq(authoringTransfer.stateVersion, claimed[0].stateVersion), eq(authoringTransfer.sealedGrant, CLEANUP_CLAIM)));
  }
  // Recheck all lifecycle predicates at delete time. Resume can renew a job between selection and deletion.
  const terminal = and(sql`${authoringTransfer.expiresAt} < ${metadataCutoff}`, sql`${authoringTransfer.state} IN ('completed','cancelled','blocked','failed')`, eq(authoringTransfer.sealedGrant, ""));
  const oldTransfers = await db.select({ id: authoringTransfer.id }).from(authoringTransfer).where(terminal).limit(100);
  const removedTransfers = await db.delete(authoringTransfer).where(and(terminal, inArray(authoringTransfer.id, oldTransfers.map(row => row.id))))
    .returning({ id: authoringTransfer.id });
  const expired = and(sql`${authoringTransferGrant.expiresAt} < ${metadataCutoff}`, eq(authoringTransferGrant.artifactsCleaned, true));
  const oldGrants = await db.select({ id: authoringTransferGrant.id }).from(authoringTransferGrant).where(expired).limit(100);
  const removedGrants = await db.delete(authoringTransferGrant).where(and(expired, inArray(authoringTransferGrant.id, oldGrants.map(row => row.id))))
    .returning({ id: authoringTransferGrant.id });
  return { grants: grants.length, transfers: transfers.length, prunedGrants: removedGrants.length, prunedTransfers: removedTransfers.length };
}
