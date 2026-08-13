import { createHash } from "node:crypto";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { buildAuthoringContextPack, serializeAuthoringContextPack } from "@/lib/authoring/context-pack";
import { loadAuthoringContextInput } from "@/lib/authoring/snapshot";
import { assertStagingEnvironment, parseEnvFile } from "@/lib/staging/staging-guard";
import { currentSourceCommit, parseCliArgs, requiredCliArg, writeArtifact } from "@/lib/staging/migration-ledger";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");
  const courseId = typeof args.course === "string" ? args.course : "tutorial-pka";
  const snapshotId = typeof args.snapshot === "string" ? args.snapshot : `staging-${courseId}-snapshot`;
  const createdAt = typeof args["created-at"] === "string" ? args["created-at"] : "2026-08-03T00:00:00.000Z";
  const retentionUntil = typeof args["retention-until"] === "string" ? args["retention-until"] : "2026-08-10T00:00:00.000Z";
  const report: Record<string, unknown> = { planNumber: "007", runId, courseId, status: "blocked" };
  try {
    assertStagingEnvironment({ productionEnv: parseEnvFile(join(process.cwd(), ".env.prod")), requiredResources: ["database", "authUrl"] });
    process.env.FEATURE_AUTHORING_CONTEXT_V1 = "1";
    process.env.STAGING_BUNDLE_WRANGLER_STORAGE = "1";
    const input = await loadAuthoringContextInput({ courseId, snapshotId, createdAt, retentionUntil });
    const first = buildAuthoringContextPack(input);
    const second = buildAuthoringContextPack({ ...input, chapters: [...input.chapters].reverse(), ideas: [...input.ideas].reverse(), benchmarks: [...(input.benchmarks ?? [])].reverse() });
    if (first.checksum !== second.checksum) throw new Error("AUTHORING_CONTEXT_NONDETERMINISTIC");
    const firstBytes = serializeAuthoringContextPack(first);
    const secondBytes = serializeAuthoringContextPack(second);
    if (sha256(firstBytes) !== sha256(secondBytes)) throw new Error("AUTHORING_CONTEXT_ZIP_NONDETERMINISTIC");

    const { exportAuthoringContext } = await import("@/lib/authoring/export");
    const [admin] = await db.select({ id: user.id }).from(user).where(eq(user.role, "admin")).limit(1);
    if (!admin) throw new Error("AUTHORING_CONTEXT_ADMIN_PREREQUISITE_MISSING");
    const result = await exportAuthoringContext({ runId, courseId, actorId: admin.id, snapshotId, createdAt, retentionUntil });
    const { storage } = await import("@/lib/storage");
    if (!storage.download) throw new Error("AUTHORING_CONTEXT_STORAGE_DOWNLOAD_UNAVAILABLE");
    const downloaded = await storage.download(result.objectKey);
    const downloadedChecksum = sha256(downloaded);
    if (downloadedChecksum !== result.artifactChecksum) throw new Error("AUTHORING_CONTEXT_R2_CHECKSUM_MISMATCH");

    report.status = "passed";
    report.sourceCommit = currentSourceCommit();
    report.snapshot = { snapshotId, createdAt, retentionUntil, publishedIdeaCount: first.manifest.files.find((file) => file.path === "entities/ideas.json")?.count ?? 0, sourceCount: first.manifest.files.find((file) => file.path === "entities/sources.json")?.count ?? 0 };
    report.determinism = { packChecksum: first.checksum, secondPackChecksum: second.checksum, zipChecksum: sha256(firstBytes), secondZipChecksum: sha256(secondBytes) };
    report.export = result;
    report.roundTrip = { downloadedChecksum, matches: true };
    report.holdoutExcludedCount = first.holdoutExcludedCount;
    report.featureFlags = { FEATURE_AUTHORING_CONTEXT_V1: process.env.FEATURE_AUTHORING_CONTEXT_V1 };
    report.artifactDeleted = false;
    report.operatorTimestamp = new Date().toISOString();
    await writeArtifact(runId, "plan-007-result.json", report);
    await storage.delete(result.objectKey);
    report.artifactDeleted = true;
    report.operatorTimestamp = new Date().toISOString();
    await writeArtifact(runId, "plan-007-result.json", report);
    console.log(JSON.stringify({ status: report.status, runId, packId: result.packId, holdoutExcludedCount: first.holdoutExcludedCount, artifactDeleted: true }));
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    report.operatorTimestamp = new Date().toISOString();
    await writeArtifact(runId, "plan-007-result.json", report);
    console.error(JSON.stringify({ status: "blocked", runId, error: report.error }));
    process.exitCode = 1;
  }
}

void main();
