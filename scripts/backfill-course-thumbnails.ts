import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { courseMaterials, diktats } from "@/db/schema";
import { storage } from "@/lib/storage";
import { generateAndSavePdfThumbnail } from "@/lib/thumbnail";
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

const manual = await db.select({ id: courseMaterials.id, courseId: courseMaterials.courseId, fileUrl: courseMaterials.fileUrl })
  .from(courseMaterials).where(and(isNull(courseMaterials.thumbnailUrl), isNotNull(courseMaterials.fileUrl)));
const compiled = await db.select({ id: diktats.id, courseId: diktats.courseId, fileUrl: diktats.fileUrl })
  .from(diktats).where(and(isNull(diktats.thumbnailUrl), isNotNull(diktats.fileUrl), eq(diktats.status, "ready")));
const candidates = [
  ...manual.map((row) => ({ ...row, table: "course_materials" as const })),
  ...compiled.map((row) => ({ ...row, table: "diktats" as const })),
];

const summary = { mode: apply ? "apply" : "dry-run", candidates: candidates.length, available: 0, missing: 0, unsupported: 0, generated: 0, failed: 0 };
const report: Array<{ table: string; id: string; source: "available" | "missing" | "unsupported"; targetKey: string }> = [];
for (const candidate of candidates) {
  const key = storageKey(candidate.fileUrl!);
  const targetKey = buildCourseThumbnailKey({ courseSlug: candidate.courseId, materialId: candidate.id, extension: "webp" });
  if (!key) { summary.unsupported += 1; report.push({ table: candidate.table, id: candidate.id, source: "unsupported", targetKey }); continue; }
  if (!(await storage.exists(key))) { summary.missing += 1; report.push({ table: candidate.table, id: candidate.id, source: "missing", targetKey }); continue; }
  summary.available += 1;
  report.push({ table: candidate.table, id: candidate.id, source: "available", targetKey });
  if (!apply) continue;
  const thumbnailUrl = await generateAndSavePdfThumbnail({ courseSlug: candidate.courseId, materialId: candidate.id, fileKey: key });
  if (!thumbnailUrl) { summary.failed += 1; continue; }
  if (candidate.table === "course_materials") await db.update(courseMaterials).set({ thumbnailUrl }).where(eq(courseMaterials.id, candidate.id));
  else await db.update(diktats).set({ thumbnailUrl, updatedAt: new Date() }).where(eq(diktats.id, candidate.id));
  summary.generated += 1;
}

console.log(JSON.stringify({ summary, candidates: report }, null, 2));
