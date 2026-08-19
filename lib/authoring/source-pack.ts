import { createHash } from "node:crypto";
import { z } from "zod";
import { readSecureZip, type SecureZipArchive } from "@/lib/bundle/zip-reader";

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const safePathSchema = z.string().min(1).refine((path) => !path.startsWith("/") && !path.includes("..") && !path.includes("\\"));

const sourcePackDocumentSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  originalFilename: z.string().min(1),
  originalMediaType: z.string().min(1),
  originalSha256: hashSchema,
  role: z.enum(["material", "question", "solution", "mixed", "reference"]),
  unitKind: z.enum(["page", "slide", "sheet", "section"]),
  expectedUnits: z.number().int().positive(),
  markdownPath: safePathSchema.refine((path) => path.startsWith("documents/") && path.endsWith(".md")),
  coveragePath: safePathSchema.refine((path) => path.startsWith("coverage/") && path.endsWith(".json")),
  markdownSha256: hashSchema,
}).strict();

export const sourcePackManifestSchema = z.object({
  schemaVersion: z.literal("zyx-source-pack.v1"),
  packId: z.string().min(1),
  name: z.string().min(1),
  language: z.string().min(1),
  createdAt: z.string().datetime({ offset: true }),
  generator: z.object({ provider: z.literal("google"), model: z.string().min(1), promptVersion: z.string().min(1) }).strict(),
  documents: z.array(sourcePackDocumentSchema).min(1),
}).strict();
export type SourcePackManifest = z.infer<typeof sourcePackManifestSchema>;

const sourceCountsSchema = z.object({
  headings: z.number().int().nonnegative(),
  formulas: z.number().int().nonnegative(),
  tables: z.number().int().nonnegative(),
  examples: z.number().int().nonnegative(),
  applications: z.number().int().nonnegative(),
  visuals: z.number().int().nonnegative(),
  questions: z.number().int().nonnegative(),
  solutions: z.number().int().nonnegative(),
}).strict();

const outputCountsSchema = sourceCountsSchema.omit({ visuals: true }).extend({ visualExplanations: z.number().int().nonnegative() }).strict();

const sourceCoverageSchema = z.object({
  documentId: z.string().min(1),
  status: z.literal("complete"),
  expectedUnits: z.number().int().positive(),
  processedUnits: z.array(z.number().int().positive()),
  inventory: sourceCountsSchema,
  outputCounts: outputCountsSchema,
  unresolved: z.array(z.unknown()).max(0),
  reviewPasses: z.array(z.enum(["inventory", "transcription", "visual", "reconciliation"])),
}).strict();

export type SourcePackSection = {
  id: string;
  title: string;
  startUnit: number;
  endUnit: number;
};

export type SourcePackDocumentAnalysis = {
  id: string;
  title: string;
  role: SourcePackManifest["documents"][number]["role"];
  unitKind: SourcePackManifest["documents"][number]["unitKind"];
  expectedUnits: number;
  markdownPath: string;
  counts: z.infer<typeof sourceCountsSchema>;
  sections: SourcePackSection[];
};

export type ValidatedSourcePack = {
  archive: SecureZipArchive;
  manifest: SourcePackManifest;
  documents: SourcePackDocumentAnalysis[];
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function decode(bytes: Uint8Array, path: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replaceAll("\r\n", "\n");
  } catch {
    throw new Error(`SOURCE_PACK_INVALID_UTF8:${path}`);
  }
}

function parseJson(bytes: Uint8Array, path: string): unknown {
  try {
    return JSON.parse(decode(bytes, path));
  } catch {
    throw new Error(`SOURCE_PACK_INVALID_JSON:${path}`);
  }
}

function exactUnitSequence(expectedUnits: number): number[] {
  return Array.from({ length: expectedUnits }, (_, index) => index + 1);
}

function sameNumbers(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function analyzeSections(markdown: string, documentId: string, documentTitle: string, expectedUnits: number): SourcePackSection[] {
  const anchors = [...markdown.matchAll(/<!--\s*source-unit:\s*(\d+)\s*-->/g)];
  const units = anchors.map((anchor, index) => ({
    unit: Number(anchor[1]),
    content: markdown.slice((anchor.index ?? 0) + anchor[0].length, anchors[index + 1]?.index ?? markdown.length),
  }));
  if (!sameNumbers(units.map((unit) => unit.unit), exactUnitSequence(expectedUnits))) throw new Error(`SOURCE_PACK_UNIT_SEQUENCE_INVALID:${documentId}`);

  const grouped: Array<{ title: string; startUnit: number; endUnit: number }> = [];
  let currentTitle = documentTitle;
  for (const unit of units) {
    const heading = unit.content.match(/^#{1,2}\s+(.+)$/m)?.[1]?.trim();
    if (heading) currentTitle = heading;
    const previous = grouped.at(-1);
    if (previous?.title === currentTitle && previous.endUnit === unit.unit - 1) previous.endUnit = unit.unit;
    else grouped.push({ title: currentTitle, startUnit: unit.unit, endUnit: unit.unit });
  }
  return grouped.map((section, index) => ({ id: `${documentId}:section:${String(index + 1).padStart(3, "0")}`, ...section }));
}

export function validateSourcePack(bytes: Uint8Array): ValidatedSourcePack {
  const archive = readSecureZip(bytes, {
    maxArchiveBytes: 64 * 1024 * 1024,
    maxEntries: 1024,
    maxFileBytes: 32 * 1024 * 1024,
    maxUncompressedBytes: 128 * 1024 * 1024,
  });
  const manifestBytes = archive.files.get("manifest.json");
  if (!manifestBytes) throw new Error("SOURCE_PACK_MANIFEST_MISSING");
  const parsedManifest = sourcePackManifestSchema.safeParse(parseJson(manifestBytes, "manifest.json"));
  if (!parsedManifest.success) throw new Error(`SOURCE_PACK_MANIFEST_INVALID:${parsedManifest.error.issues[0]?.message ?? "invalid manifest"}`);
  const manifest = parsedManifest.data;
  const ids = new Set<string>();
  const declaredPaths = new Set(["manifest.json"]);
  const documents: SourcePackDocumentAnalysis[] = [];

  for (const document of manifest.documents) {
    if (ids.has(document.id)) throw new Error(`SOURCE_PACK_DUPLICATE_DOCUMENT:${document.id}`);
    ids.add(document.id);
    for (const path of [document.markdownPath, document.coveragePath]) {
      if (declaredPaths.has(path)) throw new Error(`SOURCE_PACK_DUPLICATE_PATH:${path}`);
      declaredPaths.add(path);
    }
    const markdownBytes = archive.files.get(document.markdownPath);
    const coverageBytes = archive.files.get(document.coveragePath);
    if (!markdownBytes) throw new Error(`SOURCE_PACK_MARKDOWN_MISSING:${document.markdownPath}`);
    if (!coverageBytes) throw new Error(`SOURCE_PACK_COVERAGE_MISSING:${document.coveragePath}`);
    if (sha256(markdownBytes) !== document.markdownSha256) throw new Error(`SOURCE_PACK_MARKDOWN_CHECKSUM_MISMATCH:${document.markdownPath}`);
    const markdown = decode(markdownBytes, document.markdownPath);
    if (/\[UNRESOLVED\b/i.test(markdown)) throw new Error(`SOURCE_PACK_UNRESOLVED:${document.markdownPath}`);
    if (/!\[[^\]]*\]\s*\(|<img\b/i.test(markdown)) throw new Error(`SOURCE_PACK_VISUAL_BINARY_REFERENCE:${document.markdownPath}`);
    const coverageResult = sourceCoverageSchema.safeParse(parseJson(coverageBytes, document.coveragePath));
    if (!coverageResult.success) throw new Error(`SOURCE_PACK_COVERAGE_INVALID:${document.coveragePath}`);
    const coverage = coverageResult.data;
    const expectedSequence = exactUnitSequence(document.expectedUnits);
    if (coverage.documentId !== document.id || coverage.expectedUnits !== document.expectedUnits || !sameNumbers(coverage.processedUnits, expectedSequence)) throw new Error(`SOURCE_PACK_COVERAGE_IDENTITY_INVALID:${document.id}`);
    if (new Set(coverage.reviewPasses).size !== 4) throw new Error(`SOURCE_PACK_REVIEW_PASS_MISSING:${document.id}`);
    const countKeys = ["headings", "formulas", "tables", "examples", "applications", "questions", "solutions"] as const;
    for (const key of countKeys) if (coverage.inventory[key] !== coverage.outputCounts[key]) throw new Error(`SOURCE_PACK_COUNT_MISMATCH:${document.id}:${key}`);
    if (coverage.inventory.visuals !== coverage.outputCounts.visualExplanations) throw new Error(`SOURCE_PACK_COUNT_MISMATCH:${document.id}:visuals`);
    const visualCount = [...markdown.matchAll(/^:::visual-explanation\s*$/gm)].length;
    if (visualCount !== coverage.outputCounts.visualExplanations) throw new Error(`SOURCE_PACK_VISUAL_COUNT_MISMATCH:${document.id}`);
    documents.push({
      id: document.id,
      title: document.title,
      role: document.role,
      unitKind: document.unitKind,
      expectedUnits: document.expectedUnits,
      markdownPath: document.markdownPath,
      counts: coverage.inventory,
      sections: analyzeSections(markdown, document.id, document.title, document.expectedUnits),
    });
  }

  const undeclared = [...archive.files.keys()].filter((path) => !declaredPaths.has(path));
  if (undeclared.length > 0) throw new Error(`SOURCE_PACK_UNDECLARED_FILE:${undeclared[0]}`);
  return { archive, manifest, documents };
}
