import { db } from "@/db";
import { verifyDependencies, verifyTraceability } from "@/lib/bundle/product-publication";
import type { ProductBundleValidation } from "@/lib/bundle/product-validator";
import { fail } from "./contracts";
import { eq } from "drizzle-orm";
import { bagianPembelajaran } from "@/db/schema";

/** Publication's exact source/Idea/dependency checks also guard transfer draft materialization. */
export async function validateProductTransferPrerequisites(bundle: Extract<ProductBundleValidation, { success: true }>["data"], tx: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0] = db) {
  try {
    for (const product of bundle.products) {
      if (product.productType !== "article") continue;
      for (const section of product.sections) if (section.learningSectionId) {
        const [row] = await tx.select({ status: bagianPembelajaran.status }).from(bagianPembelajaran).where(eq(bagianPembelajaran.id, section.learningSectionId)).limit(1);
        if (!row || row.status !== "published") fail("DEPENDENCY_NOT_PUBLISHED");
      }
    }
    await verifyTraceability(tx, bundle.products);
    await verifyDependencies(tx, bundle.dependencies, bundle.products, { distinguishMissingProduct: true });
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith("PRODUCT_BUNDLE_IDEA_NOT_PUBLISHED:") || error.message.startsWith("PRODUCT_BUNDLE_DEPENDENCY_NOT_PUBLISHED:") || error.message === "DEPENDENCY_NOT_PUBLISHED")) fail("DEPENDENCY_NOT_PUBLISHED");
    fail("DEPENDENCY_REVISION_UNAVAILABLE");
  }
}
