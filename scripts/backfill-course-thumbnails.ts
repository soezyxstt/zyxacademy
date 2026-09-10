import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { courseMaterials, diktats } from "@/db/schema";
import { storage } from "@/lib/storage";
import { inngest } from "@/lib/inngest";
import { buildCourseThumbnailKey } from "@/lib/storage/keys";

const apply = process.argv.includes("--apply");
if (apply && process.env.ALLOW_THUMBNAIL_BACKFILL !== "1") {
  throw new Error("Set ALLOW_THUMBNAIL_BACKFILL=1 to confirm --apply");
}

function storageKey(value: string): string | null {
  if (!value.startsWith("http://") && !value.startsWith("https://")) return value;
  if (value.includes("/api/storage/file/")) return value.split("/api/storage/file/").pop() || null;
  if (value.includes("/f/")) return value.split("/f/").pop() || null;
  const publicBase = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
  if (publicBase && value.startsWith(`${publicBase}/`)) return value.slice(publicBase.length + 1);
  return null;
}

const manual = await db
  .select({ id: courseMaterials.id, courseId: courseMaterials.courseId, fileUrl: courseMaterials.fileUrl })
  .from(courseMaterials)
  .where(and(isNull(courseMaterials.thumbnailUrl), isNotNull(courseMaterials.fileUrl)));
const compiled = await db
  .select({ id: diktats.id, courseId: diktats.courseId, fileUrl: diktats.fileUrl })
  .from(diktats)
  .where(and(isNull(diktats.thumbnailUrl), isNotNull(diktats.fileUrl), eq(diktats.status, "ready")));
const candidates = [
  ...manual.map((row) => ({ ...row, sourceType: "course_material" as const })),
  ...compiled.map((row) => ({ ...row, sourceType: "diktat" as const })),
];

const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.replace("--limit=", ""), 10) : undefined;
const targetCandidates = typeof limit === "number" && limit > 0 ? candidates.slice(0, limit) : candidates;

const summary = {
  mode: apply ? "apply" : "dry-run",
  candidates: targetCandidates.length,
  available: 0,
  missing: 0,
  unsupported: 0,
  queued: 0,
  failed: 0,
};
const report: Array<{ sourceType: string; id: string; source: "available" | "missing" | "unsupported"; targetKey: string }> = [];

for (const candidate of targetCandidates) {
  const key = storageKey(candidate.fileUrl!);
  const targetKey = buildCourseThumbnailKey({ courseSlug: candidate.courseId, materialId: candidate.id, extension: "png" });
  if (!key) {
    summary.unsupported += 1;
    report.push({ sourceType: candidate.sourceType, id: candidate.id, source: "unsupported", targetKey });
    continue;
  }
  if (!(await storage.exists(key))) {
    summary.missing += 1;
    report.push({ sourceType: candidate.sourceType, id: candidate.id, source: "missing", targetKey });
    continue;
  }

  summary.available += 1;
  report.push({ sourceType: candidate.sourceType, id: candidate.id, source: "available", targetKey });
  if (!apply) continue;

  try {
    await inngest.send({
      id: `thumbnail-backfill-${candidate.sourceType}-${candidate.id}-${encodeURIComponent(key).slice(-96)}`,
      name: "pdf/thumbnail.requested",
      data: { materialId: candidate.id, sourceType: candidate.sourceType, sourceVersion: key },
    });
    summary.queued += 1;
  } catch (error) {
    console.error(`Failed to enqueue thumbnail for ${candidate.id}:`, error);
    summary.failed += 1;
  }
}

console.log(JSON.stringify({ summary, candidates: report }, null, 2));
