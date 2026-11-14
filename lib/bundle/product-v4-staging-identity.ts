import { and, desc, eq, inArray } from "drizzle-orm";
import type { db } from "@/db";
import { auditMutasi, imporBundle } from "@/db/schema";
import { deterministicProductSerialization } from "./product-validator";

type ImportRow = typeof imporBundle.$inferSelect;
export type ProductV4ImportState = Pick<ImportRow, "bundleType" | "bundleId" | "courseId" | "version" | "status" | "validationReport">;
export type ProductV4StagingSnapshot = {
  importId: string; checksum: string; sourceUriOrKey: string;
  stagingAuditId: string; stagingRunId: string; importState: ProductV4ImportState;
};

export async function latestProductV4StagingAudit(connection: Pick<typeof db, "select">, importId: string) {
  const [audit] = await connection.select({ id: auditMutasi.id, correlationId: auditMutasi.correlationId, afterSnapshot: auditMutasi.afterSnapshot, action: auditMutasi.action }).from(auditMutasi).where(and(
    eq(auditMutasi.entityType, "product_bundle"), eq(auditMutasi.entityId, importId), inArray(auditMutasi.action, ["draft_created", "draft_replaced"]),
  )).orderBy(desc(auditMutasi.createdAt), desc(auditMutasi.id)).limit(1);
  return audit;
}

export function matchesProductV4StagingSnapshot(row: ImportRow | undefined, audit: Awaited<ReturnType<typeof latestProductV4StagingAudit>>, snapshot: ProductV4StagingSnapshot) {
  const original = snapshot.importState;
  return Boolean(row && row.id === snapshot.importId && row.bundleType === "product" && row.bundleType === original.bundleType && row.bundleId === original.bundleId && row.courseId === original.courseId && row.version === 4 && row.version === original.version && row.status === original.status && row.checksum === snapshot.checksum && row.sourceUriOrKey === snapshot.sourceUriOrKey && deterministicProductSerialization(row.validationReport) === deterministicProductSerialization(original.validationReport) && audit?.id === snapshot.stagingAuditId && audit.correlationId === snapshot.stagingRunId && audit.afterSnapshot?.checksum === snapshot.checksum);
}

/** Old references without an audit identity must be verified again. */
export function currentProductV4VerificationRef(report: Record<string, unknown>, stagingAuditId: string, runId: string) {
  const ref = report.productV4Verification as { attemptId?: unknown; planHash?: unknown; runId?: unknown; stagingAuditId?: unknown } | undefined;
  return ref?.stagingAuditId === stagingAuditId && ref.runId === runId ? ref : undefined;
}

/** The import lock serializes this comparison with staging and run adoption. */
export async function attachProductV4VerificationSnapshot(connection: typeof db, snapshot: ProductV4StagingSnapshot, planHash: string, attemptId: string, expectedAttemptId: string | null) {
  return connection.transaction(async tx => {
    const [row] = await tx.select().from(imporBundle).where(eq(imporBundle.id, snapshot.importId)).limit(1).for("update");
    const audit = await latestProductV4StagingAudit(tx, snapshot.importId);
    if (!matchesProductV4StagingSnapshot(row, audit, snapshot) || row!.status !== "draft") return false;
    const current = currentProductV4VerificationRef(row!.validationReport, snapshot.stagingAuditId, snapshot.stagingRunId);
    if ((typeof current?.attemptId === "string" ? current.attemptId : null) !== expectedAttemptId) return false;
    await tx.update(imporBundle).set({ validationReport: { ...row!.validationReport, productV4Verification: { planHash, runId: snapshot.stagingRunId, stagingAuditId: snapshot.stagingAuditId, attemptId } }, updatedAt: new Date() }).where(eq(imporBundle.id, snapshot.importId));
    return true;
  });
}
