import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { listIdeaBundleImports } from "@/lib/bundle/staging";
import { IdeaBundleV2Panel } from "@/components/admin/idea-bundle-v2-panel";

export const dynamic = "force-dynamic";

export default async function IdeaBundleV2Page() {
  if (env.FEATURE_IDEA_BUNDLE_V2 !== "1") notFound();
  const rows = await listIdeaBundleImports();
  return (
    <IdeaBundleV2Panel
      initialImports={rows.map((row) => ({
        id: row.id,
        bundleId: row.bundleId,
        checksum: row.checksum,
        courseId: row.courseId,
        status: row.status,
        validationReport: row.validationReport,
        createdAt: row.createdAt.toISOString(),
      }))}
    />
  );
}
