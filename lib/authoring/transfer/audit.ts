import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { auditMutasi } from "@/db/schema";

export async function auditTransfer(actorId: string, entityId: string, action: string, afterSnapshot: Record<string, unknown>, tx: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0] = db) {
  await tx.insert(auditMutasi).values({ id: `audit-transfer-${randomUUID()}`, actorId, entityType: "authoring_transfer", entityId,
    action, afterSnapshot, correlationId: entityId });
}
