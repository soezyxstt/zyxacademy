import { eq } from "drizzle-orm";
import type { db } from "@/db";
import { imporBundle } from "@/db/schema";
import type { parseStagedProductBundle } from "@/lib/bundle/product-staging";

type ImportRow = typeof imporBundle.$inferSelect;
type Bundle = Awaited<ReturnType<typeof parseStagedProductBundle>>;
export type SolutionImportScope = { revision: string; bundleId: string; sourceUriOrKey: string; storedCourseId: string | null; courseId: string; chapterId: string };

export function assertSolutionImportScope(row: ImportRow, bundle: Bundle | null, scope: SolutionImportScope) {
  if (row.bundleType !== "product" || row.version !== 5 || row.checksum !== scope.revision || row.bundleId !== scope.bundleId || row.sourceUriOrKey !== scope.sourceUriOrKey || row.courseId !== scope.storedCourseId) throw new Error("PRODUCT_BUNDLE_STALE_CONTEXT");
  if (bundle && (bundle.checksum !== scope.revision || bundle.manifest.bundleId !== scope.bundleId || bundle.manifest.schemaVersion !== "product-bundle.v5" || bundle.manifest.courseId !== scope.courseId || bundle.products.length !== 1 || bundle.products[0].productType !== "solution_collection" || bundle.products[0].chapterId !== scope.chapterId)) throw new Error("AUTHORING_MCP_IMPORT_SCOPE_MISMATCH");
}

/** All scoped reads and writes recheck the captured import while holding its row lock. */
export async function lockSolutionImportScope(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], importId: string, scope: SolutionImportScope) {
  const [row] = await tx.select().from(imporBundle).where(eq(imporBundle.id, importId)).limit(1).for("update");
  if (!row) throw new Error("PRODUCT_BUNDLE_NOT_FOUND");
  assertSolutionImportScope(row, null, scope);
  return row;
}
