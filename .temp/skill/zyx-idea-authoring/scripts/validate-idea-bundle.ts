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
    if (existsSync(join(cursor, "lib/bundle/idea-bundle-v2.ts"))) return cursor;
    const parent = dirname(cursor);
    if (parent === cursor) fail("ZYX_REPOSITORY_NOT_FOUND", "Run inside the Zyx repository.");
    cursor = parent;
  }
}

const input = process.argv[2];
if (!input) fail("IDEA_BUNDLE_PATH_REQUIRED", "Usage: bun scripts/validate-idea-bundle.ts <idea-bundle.zip>");
const path = resolve(input);
if (!existsSync(path)) fail("IDEA_BUNDLE_NOT_FOUND", path);

try {
  const root = findRepoRoot(process.cwd());
  const module = await import(pathToFileURL(join(root, "lib/bundle/idea-bundle-v2.ts")).href);
  const result = module.validateIdeaBundleZip(new Uint8Array(readFileSync(path)));
  if (!result.success) fail("IDEA_BUNDLE_INVALID", result.issues);
  process.stdout.write(`${JSON.stringify({
    valid: true,
    bundleId: result.data.manifest.bundleId,
    checksum: result.data.manifest.bundleChecksum,
    counts: {
      sources: result.data.entities.sourceMaterials.length,
      chunks: result.data.entities.sourceChunks.length,
      ideas: result.data.entities.ideas.length,
      provenance: result.data.entities.provenance.length,
      relations: result.data.entities.relations.length,
    },
  }, null, 2)}\n`);
} catch (error) {
  fail("IDEA_BUNDLE_VALIDATION_FAILED", error instanceof Error ? error.message : String(error));
}
