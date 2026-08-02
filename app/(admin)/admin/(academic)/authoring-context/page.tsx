import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { listAuthoringContextExports } from "@/lib/authoring/export";
import { AuthoringContextPanel } from "@/components/admin/authoring-context-panel";

export const dynamic = "force-dynamic";

export default async function AuthoringContextPage() {
  if (env.FEATURE_AUTHORING_CONTEXT_V1 !== "1") notFound();
  const rows = await listAuthoringContextExports();
  return (
    <AuthoringContextPanel
      initialExports={rows.map((row) => ({
        id: row.id,
        packId: row.entityId,
        action: row.action,
        correlationId: row.correlationId,
        createdAt: row.createdAt.toISOString(),
        metadata: row.afterSnapshot,
      }))}
    />
  );
}
