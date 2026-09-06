import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { buktiPdfBundle } from "@/db/schema";

export async function latestReadyProductDiktatEvidence(importId: string) {
  try {
    const [row] = await db
      .select()
      .from(buktiPdfBundle)
      .where(and(eq(buktiPdfBundle.imporBundleId, importId), eq(buktiPdfBundle.status, "ready")))
      .orderBy(desc(buktiPdfBundle.createdAt), desc(buktiPdfBundle.id))
      .limit(1);
    return row ?? null;
  } catch {
    return null;
  }
}
