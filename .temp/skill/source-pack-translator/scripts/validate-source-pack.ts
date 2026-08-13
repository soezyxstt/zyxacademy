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
    if (existsSync(join(cursor, "lib/authoring/source-pack.ts"))) return cursor;
    const parent = dirname(cursor);
    if (parent === cursor) fail("ZYX_REPOSITORY_NOT_FOUND", "Run inside the Zyx repository.");
    cursor = parent;
  }
}

const input = process.argv[2];
if (!input) fail("SOURCE_PACK_PATH_REQUIRED", "Usage: bun scripts/validate-source-pack.ts <source-pack.zip>");
const path = resolve(input);
if (!existsSync(path)) fail("SOURCE_PACK_NOT_FOUND", path);

try {
  const root = findRepoRoot(process.cwd());
  const module = await import(pathToFileURL(join(root, "lib/authoring/source-pack.ts")).href);
  const result = module.validateSourcePack(new Uint8Array(readFileSync(path)));
  process.stdout.write(`${JSON.stringify({
    valid: true,
    packId: result.manifest.packId,
    name: result.manifest.name,
    language: result.manifest.language,
    archiveChecksum: result.archive.checksum,
    documents: result.documents.map((document: {
      id: string;
      title: string;
      role: string;
      expectedUnits: number;
      counts: Record<string, number>;
      sections: unknown[];
    }) => ({
      id: document.id,
      title: document.title,
      role: document.role,
      expectedUnits: document.expectedUnits,
      sections: document.sections.length,
      counts: document.counts,
    })),
  }, null, 2)}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  fail(message.split(":", 1)[0] || "SOURCE_PACK_INVALID", message);
}
