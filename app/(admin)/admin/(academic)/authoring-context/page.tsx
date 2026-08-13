import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { listAuthoringCourseOptions } from "@/lib/authoring/catalog";
import { listAuthoringContextExports } from "@/lib/authoring/export";
import { AuthoringContextPanel } from "@/components/admin/authoring-context-panel";

export const dynamic = "force-dynamic";

export default async function AuthoringContextPage() {
  if (env.FEATURE_AUTHORING_CONTEXT_V1 !== "1") notFound();
  const [rows, courses] = await Promise.all([listAuthoringContextExports(), listAuthoringCourseOptions()]);
  return (
    <AuthoringContextPanel
      courses={courses}
      initialExports={rows.map((row) => ({
        id: row.id,
        packId: row.entityId,
        action: row.action,
        correlationId: row.correlationId,
        createdAt: row.createdAt.toISOString(),
        artifactChecksum: typeof row.afterSnapshot?.artifactChecksum === "string" ? row.afterSnapshot.artifactChecksum : null,
        courseId: typeof row.afterSnapshot?.courseId === "string" ? row.afterSnapshot.courseId : null,
        retentionUntil: typeof row.afterSnapshot?.retentionUntil === "string" ? row.afterSnapshot.retentionUntil : null,
        byteLength: typeof row.afterSnapshot?.byteLength === "number" ? row.afterSnapshot.byteLength : null,
      }))}
    />
  );
}
