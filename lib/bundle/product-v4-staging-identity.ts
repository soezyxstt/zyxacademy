import { and, desc, eq, inArray } from "drizzle-orm";
import type { db } from "@/db";
import { auditMutasi, imporBundle } from "@/db/schema";
import { deterministicProductSerialization } from "./product-validator";
import type { ProductV4VerificationPurpose } from "./product-v4-verification";

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

function reportForPurpose(report: Record<string, unknown>, purpose?: ProductV4VerificationPurpose) {
  if (!purpose) return report;
  const current = { ...report };
  // A separate job may finish against the same staged content. Its receipt does
  // not revoke this purpose's attempt; authored state and its own ref still match.
  if (purpose === "logic") {
    delete current.productV4PdfGeneration;
    delete current.productV4PdfEvidence;
  } else delete current.productV4Verification;
  return current;
}

export function matchesProductV4StagingSnapshot(row: ImportRow | undefined, audit: Awaited<ReturnType<typeof latestProductV4StagingAudit>>, snapshot: ProductV4StagingSnapshot, purpose?: ProductV4VerificationPurpose) {
  const original = snapshot.importState;
  return Boolean(row && row.id === snapshot.importId && row.bundleType === "product" && row.bundleType === original.bundleType && row.bundleId === original.bundleId && row.courseId === original.courseId && row.version === 4 && row.version === original.version && row.status === original.status && row.checksum === snapshot.checksum && row.sourceUriOrKey === snapshot.sourceUriOrKey && deterministicProductSerialization(reportForPurpose(row.validationReport, purpose)) === deterministicProductSerialization(reportForPurpose(original.validationReport, purpose)) && audit?.id === snapshot.stagingAuditId && audit.correlationId === snapshot.stagingRunId && audit.afterSnapshot?.checksum === snapshot.checksum);
}

/** Old references without an audit identity must be verified again. */
export function currentProductV4VerificationRef(report: Record<string, unknown>, stagingAuditId: string, runId: string, purpose: ProductV4VerificationPurpose = "logic") {
  const ref = report[purpose === "pdf" ? "productV4PdfGeneration" : "productV4Verification"] as { attemptId?: unknown; planHash?: unknown; runId?: unknown; stagingAuditId?: unknown } | undefined;
  return ref?.stagingAuditId === stagingAuditId && ref.runId === runId ? ref : undefined;
}

/** The import lock serializes this comparison with staging and run adoption. */
export async function attachProductV4VerificationSnapshot(connection: typeof db, snapshot: ProductV4StagingSnapshot, planHash: string, attemptId: string, expectedAttemptId: string | null, purpose: ProductV4VerificationPurpose = "logic") {
  return connection.transaction(async tx => {
    const [row] = await tx.select().from(imporBundle).where(eq(imporBundle.id, snapshot.importId)).limit(1).for("update");
    const audit = await latestProductV4StagingAudit(tx, snapshot.importId);
    if (!matchesProductV4StagingSnapshot(row, audit, snapshot, purpose) || row!.status !== "draft") return false;
    const current = currentProductV4VerificationRef(row!.validationReport, snapshot.stagingAuditId, snapshot.stagingRunId, purpose);
    if ((typeof current?.attemptId === "string" ? current.attemptId : null) !== expectedAttemptId) return false;
    const key = purpose === "pdf" ? "productV4PdfGeneration" : "productV4Verification";
    await tx.update(imporBundle).set({ validationReport: { ...row!.validationReport, [key]: { planHash, runId: snapshot.stagingRunId, stagingAuditId: snapshot.stagingAuditId, attemptId } }, updatedAt: new Date() }).where(eq(imporBundle.id, snapshot.importId));
    return true;
  });
}
