import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { auditMutasi } from "@/db/schema";
import { revisionOf } from "@/lib/admin-mcp/revision";
import { assertNativeAdminTransaction, postgresCode, type NativeAdminViewer } from "./admin-transaction";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Commit the business write and its receipt together. Only a fresh commit schedules post-commit work. */
export async function runAdminCommand<T extends { action: string }>(entityType: string, command: T, requestId: string,
  viewer: NativeAdminViewer, execute: (tx: Transaction) => Promise<string>) {
  const actorId = viewer.user.id;
  const receiptId = entityType + "_" + revisionOf({ actorId, sessionId: viewer.session.id, requestId });
  const inputHash = revisionOf(command);
  const run = () => db.transaction(async tx => {
    await assertNativeAdminTransaction(tx, viewer, "update");
    const [receipt] = await tx.select().from(auditMutasi).where(eq(auditMutasi.id, receiptId)).limit(1);
    if (receipt) {
      if (receipt.entityType !== entityType || receipt.actorId !== actorId || receipt.action !== command.action
        || receipt.afterSnapshot?.inputHash !== inputHash || !receipt.entityId) throw new Error("REQUEST_CONFLICT");
      return { id: receipt.entityId, replay: true };
    }
    const id = await execute(tx);
    await tx.insert(auditMutasi).values({ id: receiptId, entityType, entityId: id, action: command.action, actorId,
      correlationId: requestId, outcome: "success", afterSnapshot: { inputHash } });
    return { id, replay: false };
  });
  return run().catch((error: unknown) => {
    const code = postgresCode(error);
    if (code !== "40001" && code !== "40P01") throw error;
    return run();
  });
}
