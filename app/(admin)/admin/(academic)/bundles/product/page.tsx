import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { listProductBundleImports, productBundleLifecycleStatus } from "@/lib/bundle/product-staging";
import { ProductBundleV2Panel } from "@/components/admin/product-bundle-v2-panel";

export const dynamic = "force-dynamic";

export default async function ProductBundleV2Page() {
  if (env.FEATURE_PRODUCT_BUNDLE_V2 !== "1") notFound();
  const rows = await listProductBundleImports();
  return <ProductBundleV2Panel initialImports={rows.map((row) => ({ id: row.id, bundleId: row.bundleId, checksum: row.checksum, courseId: row.courseId, status: productBundleLifecycleStatus(row.status), validationReport: row.validationReport, createdAt: row.createdAt.toISOString() }))} />;
}
