import { createHash } from "node:crypto";
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
    if (existsSync(join(cursor, "lib/authoring/context-pack.ts"))) return cursor;
    const parent = dirname(cursor);
    if (parent === cursor) fail("ZYX_REPOSITORY_NOT_FOUND", "Run inside the Zyx repository.");
    cursor = parent;
  }
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function parseJson(bytes: Uint8Array | undefined, path: string): unknown {
  if (!bytes) fail("AUTHORING_CONTEXT_FILE_MISSING", path);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    fail("AUTHORING_CONTEXT_INVALID_JSON", path);
  }
}

const input = process.argv[2];
if (!input) fail("AUTHORING_CONTEXT_PATH_REQUIRED", "Usage: bun scripts/validate-authoring-context.ts <authoring-context.zip>");
const path = resolve(input);
if (!existsSync(path)) fail("AUTHORING_CONTEXT_NOT_FOUND", path);

try {
  const root = findRepoRoot(process.cwd());
  const zipModule = await import(pathToFileURL(join(root, "lib/bundle/zip-reader.ts")).href);
  const redactionModule = await import(pathToFileURL(join(root, "lib/authoring/redaction.ts")).href);
  const archive = zipModule.readSecureZip(new Uint8Array(readFileSync(path)), {
    maxArchiveBytes: 128 * 1024 * 1024,
    maxEntries: 2048,
    maxFileBytes: 32 * 1024 * 1024,
    maxUncompressedBytes: 192 * 1024 * 1024,
  });
  const manifest = parseJson(archive.files.get("manifest.json"), "manifest.json") as {
    schemaVersion: string;
    packId: string;
    snapshotId: string;
    courseId: string;
    files: Array<{ path: string; checksum: string; count: number }>;
    holdoutExcludedCount: number;
    packChecksum: string;
  };
  if (manifest.schemaVersion !== "authoring-context.v1" || !manifest.packId || !manifest.snapshotId || !manifest.courseId || !Array.isArray(manifest.files)) {
    fail("AUTHORING_CONTEXT_MANIFEST_INVALID", manifest);
  }

  const declared = new Set<string>();
  for (const file of manifest.files) {
    if (!file.path || declared.has(file.path) || file.path === "manifest.json") fail("AUTHORING_CONTEXT_FILE_DECLARATION_INVALID", file.path);
    declared.add(file.path);
    const bytes = archive.files.get(file.path);
    if (!bytes) fail("AUTHORING_CONTEXT_FILE_MISSING", file.path);
    if (sha256(bytes) !== file.checksum) fail("AUTHORING_CONTEXT_FILE_CHECKSUM_MISMATCH", file.path);
    const value = parseJson(bytes, file.path);
    const count = Array.isArray(value) ? value.length : 1;
    if (count !== file.count) fail("AUTHORING_CONTEXT_FILE_COUNT_MISMATCH", file.path);
  }
  const undeclared = [...archive.files.keys()].filter((filePath) => filePath !== "manifest.json" && !declared.has(filePath));
  if (undeclared.length > 0 || archive.files.size !== declared.size + 1) fail("AUTHORING_CONTEXT_UNDECLARED_FILE", undeclared[0] ?? "unknown");

  const { packChecksum: _packChecksum, ...manifestBase } = manifest;
  if (sha256(stable(manifestBase)) !== manifest.packChecksum) fail("AUTHORING_CONTEXT_CHECKSUM_MISMATCH", manifest.packId);

  const findings = redactionModule.scanAuthoringContext({ manifest, files: Object.fromEntries(archive.files) });
  if (findings.length > 0) fail("AUTHORING_CONTEXT_REDACTION_FAILED", findings);

  const course = parseJson(archive.files.get("entities/course.json"), "entities/course.json") as { id?: string; title?: string };
  const chapters = parseJson(archive.files.get("entities/chapters.json"), "entities/chapters.json") as unknown[];
  const ideas = parseJson(archive.files.get("entities/ideas.json"), "entities/ideas.json") as Array<{ id?: string; status?: string }>;
  const sources = parseJson(archive.files.get("entities/sources.json"), "entities/sources.json") as unknown[];
  const excerpts = parseJson(archive.files.get("entities/excerpts.json"), "entities/excerpts.json") as unknown[];
  const benchmarks = parseJson(archive.files.get("entities/benchmark-summaries.json"), "entities/benchmark-summaries.json") as Array<{ id?: string; referenceId?: string | null; sourceLabel?: string | null }>;
  if (course.id !== manifest.courseId) fail("AUTHORING_CONTEXT_COURSE_MISMATCH", { manifest: manifest.courseId, course: course.id });
  if (ideas.some((idea) => idea.status !== "published")) fail("AUTHORING_CONTEXT_IDEA_STATUS_INVALID", ideas.filter((idea) => idea.status !== "published").map((idea) => idea.id));

  process.stdout.write(`${JSON.stringify({
    valid: true,
    packId: manifest.packId,
    snapshotId: manifest.snapshotId,
    course: { id: course.id, title: course.title },
    counts: { chapters: chapters.length, ideas: ideas.length, sources: sources.length, excerpts: excerpts.length, allowedBenchmarks: benchmarks.length },
    usableItbReferences: benchmarks.filter((benchmark) => Boolean(benchmark.referenceId && benchmark.sourceLabel)).map((benchmark) => ({
      benchmarkId: benchmark.id,
      referenceId: benchmark.referenceId,
      sourceLabel: benchmark.sourceLabel,
    })),
    holdoutExcludedCount: manifest.holdoutExcludedCount,
    packChecksum: manifest.packChecksum,
  }, null, 2)}\n`);
} catch (error) {
  fail("AUTHORING_CONTEXT_VALIDATION_FAILED", error instanceof Error ? error.message : String(error));
}
