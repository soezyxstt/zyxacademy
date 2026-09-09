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

const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.replace("--limit=", ""), 10) : undefined;
const targetCandidates = typeof limit === "number" && limit > 0 ? candidates.slice(0, limit) : candidates;

const concurrencyArg = process.argv.find((a) => a.startsWith("--concurrency="));
const concurrency = concurrencyArg ? parseInt(concurrencyArg.replace("--concurrency=", ""), 10) : 4;

const summary = { mode: apply ? "apply" : "dry-run", candidates: targetCandidates.length, available: 0, missing: 0, unsupported: 0, generated: 0, failed: 0 };
const report: Array<{ table: string; id: string; source: "available" | "missing" | "unsupported"; targetKey: string }> = [];

async function processCandidate(candidate: typeof candidates[number], index: number) {
  const key = storageKey(candidate.fileUrl!);
  const targetKey = buildCourseThumbnailKey({ courseSlug: candidate.courseId, materialId: candidate.id, extension: "webp" });
  if (!key) { summary.unsupported += 1; report.push({ table: candidate.table, id: candidate.id, source: "unsupported", targetKey }); return; }
  if (!(await storage.exists(key))) { summary.missing += 1; report.push({ table: candidate.table, id: candidate.id, source: "missing", targetKey }); return; }
  summary.available += 1;
  report.push({ table: candidate.table, id: candidate.id, source: "available", targetKey });
  if (!apply) return;
  console.log(`[${index}/${targetCandidates.length}] Generating thumbnail for ${candidate.courseId} / ${candidate.id}...`);
  const thumbnailUrl = await generateAndSavePdfThumbnail({ courseSlug: candidate.courseId, materialId: candidate.id, fileKey: key });
  if (!thumbnailUrl) { summary.failed += 1; return; }
  if (candidate.table === "course_materials") await db.update(courseMaterials).set({ thumbnailUrl }).where(eq(courseMaterials.id, candidate.id));
  else await db.update(diktats).set({ thumbnailUrl, updatedAt: new Date() }).where(eq(diktats.id, candidate.id));
  summary.generated += 1;
}

const queue = [...targetCandidates.map((c, i) => ({ c, i: i + 1 }))];
const workers = Array.from({ length: concurrency }, async () => {
  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) break;
    await processCandidate(item.c, item.i).catch((err) => {
      console.error(`Failed for candidate ${item.c.id}:`, err);
      summary.failed += 1;
    });
  }
});
await Promise.all(workers);

console.log(JSON.stringify({ summary, candidates: report }, null, 2));
