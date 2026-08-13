import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function fail(code: string, detail: unknown): never {
  process.stderr.write(`${JSON.stringify({ valid: false, code, detail }, null, 2)}\n`);
  process.exit(1);
}

function findRepoRoot(start: string): string {
  let cursor = resolve(start);
  while (true) {
    if (existsSync(join(cursor, "lib/authoring/job-pack.ts"))) return cursor;
    const parent = dirname(cursor);
    if (parent === cursor) fail("ZYX_REPOSITORY_NOT_FOUND", "Run inside the Zyx repository.");
    cursor = parent;
  }
}

const input = process.argv[2];
if (!input) fail("AUTHORING_JOB_PATH_REQUIRED", "Usage: bun scripts/validate-authoring-job.ts <authoring-job.zip>");
const path = resolve(input);
if (!existsSync(path)) fail("AUTHORING_JOB_NOT_FOUND", path);

try {
  const root = findRepoRoot(process.cwd());
  const module = await import(pathToFileURL(join(root, "lib/authoring/job-pack.ts")).href);
  const result = module.validateAuthoringJobPack(new Uint8Array(readFileSync(path)));
  process.stdout.write(`${JSON.stringify({
    valid: true,
    jobId: result.job.jobId,
    sourcePackId: result.job.sourcePack.packId,
    course: result.job.target,
    chapters: result.job.chapters,
    mappedSections: result.job.sectionMappings.length,
    requestedProducts: result.job.requestedProducts,
    jobChecksum: result.manifest.jobChecksum,
  }, null, 2)}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  fail(message.split(":", 1)[0] || "AUTHORING_JOB_INVALID", message);
}
