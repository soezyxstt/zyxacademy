import { and, eq } from "drizzle-orm";
import type { db } from "@/db";
import { imporBundle } from "@/db/schema";

type Snapshot = Pick<typeof imporBundle.$inferSelect, "id" | "status" | "checksum" | "sourceUriOrKey" | "validationReport">;
/** Claim the unchanged draft inside the transaction before inserting any review decisions. */
export async function claimProductReviewSnapshot(connection: Pick<typeof db, "update">, row: Snapshot, now: Date) {
  const rows = await connection.update(imporBundle).set({ updatedAt: now }).where(and(eq(imporBundle.id, row.id), eq(imporBundle.status, row.status), eq(imporBundle.checksum, row.checksum), eq(imporBundle.sourceUriOrKey, row.sourceUriOrKey), eq(imporBundle.validationReport, row.validationReport))).returning({ id: imporBundle.id });
  if (rows.length !== 1) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
}
