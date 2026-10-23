import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { inngest } from "./client";
import { db } from "@/db";
import { authoringTransfer, authoringTransferOutbox } from "@/db/schema";
import { transferConfig } from "@/lib/authoring/transfer/security";
import { processTransfer } from "@/lib/authoring/transfer/execution";
import { cleanupTransfers } from "@/lib/authoring/transfer/cleanup";

export async function dispatchTransferOutbox() {
  const pending = await db.select().from(authoringTransferOutbox).where(eq(authoringTransferOutbox.delivered, false)).limit(100);
  for (const item of pending) {
    await inngest.send({ id: item.id, name: "authoring.transfer.requested", data: { transferId: item.transferId } });
    await db.update(authoringTransferOutbox).set({ delivered: true }).where(eq(authoringTransferOutbox.id, item.id));
  }
  return pending.length;
}
export const authoringTransferWorker = inngest.createFunction({ id: "authoring-transfer", triggers: [{ event: "authoring.transfer.requested" }], retries: 2, concurrency: { limit: 2 } },
  async ({ event, step }) => step.run("transfer", () => processTransfer(transferConfig(), event.data.transferId as string)));

export const authoringTransferMaintenance = inngest.createFunction({ id: "authoring-transfer-maintenance", triggers: [{ cron: "*/1 * * * *" }], retries: 1, concurrency: { limit: 1 } },
  async ({ step }) => {
    if (!process.env.AUTHORING_TRANSFER_IDENTITY) return { configured: false };
    transferConfig();
    return step.run("recover-and-dispatch", async () => {
      const stalled = await db.select({ id: authoringTransfer.id }).from(authoringTransfer).where(and(
        sql`${authoringTransfer.state} IN ('queued','retry_wait','running')`, sql`${authoringTransfer.leaseUntil} <= ${Date.now()}`,
        sql`${authoringTransfer.nextAttemptAt} <= ${Date.now()}`, sql`${authoringTransfer.expiresAt} > ${Date.now()}`)).limit(100);
      for (const row of stalled) await db.insert(authoringTransferOutbox).values({ id: `dispatch-${randomUUID()}`, transferId: row.id });
      const dispatched = await dispatchTransferOutbox();
      await db.update(authoringTransfer).set({ state: "blocked", reasonCode: "GRANT_EXPIRED", leaseUntil: 0, stateVersion: sql`${authoringTransfer.stateVersion} + 1` })
        .where(and(sql`${authoringTransfer.expiresAt} <= ${Date.now()}`, sql`${authoringTransfer.state} NOT IN ('completed','cancelled','blocked','failed')`));
      return { dispatched };
    });
  });

export const authoringTransferCleanup = inngest.createFunction({ id: "authoring-transfer-cleanup", triggers: [{ cron: "17 * * * *" }], retries: 1, concurrency: { limit: 1 } },
  async ({ step }) => {
    if (!process.env.AUTHORING_TRANSFER_IDENTITY) return { configured: false };
    transferConfig();
    return step.run("remove-expired-quarantine", cleanupTransfers);
  });
