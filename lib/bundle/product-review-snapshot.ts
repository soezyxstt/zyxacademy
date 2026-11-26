import { and, eq, sql } from "drizzle-orm";
import type { db } from "@/db";
import { imporBundle } from "@/db/schema";

type Snapshot = Pick<typeof imporBundle.$inferSelect, "id" | "status" | "checksum" | "sourceUriOrKey" | "validationReport"> & { version?: number };
/** Claim the unchanged draft inside the transaction before inserting any review decisions. */
export async function claimProductReviewSnapshot(connection: Pick<typeof db, "update">, row: Snapshot, now: Date, options: { purpose?: "logic" } = {}) {
  const logic = options.purpose === "logic";
  if (logic && (row.version !== 4 || row.status !== "draft")) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
  const report = { ...row.validationReport };
  if (logic) {
    delete report.productV4PdfGeneration;
    delete report.productV4PdfEvidence;
  }
  // Review writes only its own rows. An independent PDF job may attach while
  // the reviewer checks logic, but every authored field and the logic ref match.
  const reportMatches = logic
    ? sql`(${imporBundle.validationReport} - 'productV4PdfGeneration' - 'productV4PdfEvidence') = ${JSON.stringify(report)}::jsonb`
    : eq(imporBundle.validationReport, row.validationReport);
  const rows = await connection.update(imporBundle).set({ updatedAt: now }).where(and(eq(imporBundle.id, row.id), eq(imporBundle.status, row.status), eq(imporBundle.checksum, row.checksum), eq(imporBundle.sourceUriOrKey, row.sourceUriOrKey), logic ? eq(imporBundle.version, 4) : undefined, reportMatches)).returning({ id: imporBundle.id });
  if (rows.length !== 1) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
}
